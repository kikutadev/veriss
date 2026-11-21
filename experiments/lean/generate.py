#!/usr/bin/env python3
"""Untrusted certificate producer. Lean independently reconstructs all goals."""
from fractions import Fraction
from functools import reduce
from math import gcd, lcm, prod
from pathlib import Path
import argparse, hashlib, json, re

def atom(x,y,c,strict=False):
    return {"affine":{"x":x,"y":y,"c":c},"strict":strict}
def triple(a):
    return tuple(a["affine"][k] for k in ("x","y","c"))
def negate(a):
    return atom(*(-v for v in triple(a)),not a["strict"])
def key(a):
    return (*triple(a),a["strict"])
def frac(v):
    if not isinstance(v,str) or not re.fullmatch(r"-?\d+(?:/[1-9]\d*)?",v) or len(v)>128:
        raise ValueError("invalid exact rational")
    return Fraction(v)
def aff(v):
    return (frac(v["coefficient"]),frac(v.get("heightCoefficient","0")),frac(v["constant"]))
def integer_atom(v):
    f=aff(v); den=prod(int(v.get(k,"0").split("/")[1]) if "/" in v.get(k,"0") else 1 for k in ("coefficient","heightCoefficient","constant"))
    if type(v["strict"]) is not bool: raise ValueError("invalid strict flag")
    return atom(*(int(x*den) for x in f),v["strict"])
def add(a,b): return {k:a[k]+b[k] for k in ("x","y","c")}
def neg(a): return {k:-v for k,v in a.items()}
def ga(a): return {"affine":a,"strict":False}

def refute(ctx):
    """Fourier-Motzkin elimination with nonnegative integer provenance."""
    n=len(ctx)
    rows=[(triple(a),a["strict"],tuple(int(i==j) for i in range(n))) for j,a in enumerate(ctx)]
    def simplified(rows):
        kept={}
        for abc,strict,ws in rows:
            x,y,c=abc
            if x==y==0:
                if c<0 or (c==0 and strict): return list(ws),[]
                continue
            # Divide only when exact in provenance and coefficients.
            g=reduce(gcd, (abs(v) for v in (*abc,*ws))) or 1
            abc=tuple(v//g for v in abc); ws=tuple(v//g for v in ws)
            old=kept.get(abc)
            if old is None or strict and not old[1]:
                kept[abc]=(abc,strict,ws)
        return None,list(kept.values())
    result,rows=simplified(rows)
    if result is not None: return result
    for axis in (0,1):
        pos=[r for r in rows if r[0][axis]>0]
        negs=[r for r in rows if r[0][axis]<0]
        zero=[r for r in rows if r[0][axis]==0]
        if len(pos)*len(negs)>20000: raise ValueError("elimination budget")
        for a in pos:
            for b in negs:
                m=-b[0][axis]; k=a[0][axis]; g=gcd(m,k);m//=g;k//=g
                abc=tuple(m*x+k*y for x,y in zip(a[0],b[0]))
                ws=tuple(m*x+k*y for x,y in zip(a[2],b[2]))
                zero.append((abc,a[1] or b[1],ws))
        result,rows=simplified(zero)
        if result is not None: return result
    return None

def prove(ctx):
    result=refute(ctx)
    if result is None: raise ValueError("satisfiable obligation (no certificate)")
    return result

def coverage(domain,rows):
    guards=[r["guard"] for r in rows]
    budget=10000
    def visit(ctx):
        nonlocal budget
        budget-=1
        if budget<0: raise ValueError("coverage tree budget")
        ws=refute(ctx)
        if ws is not None: return {"empty":{"weights":ws}}
        known={key(a) for a in ctx}
        for guard in guards:
            if all(key(a) in known for a in guard):
                return {"row":{"guard":guard}}
        for guard in guards:
            if any(key(negate(a)) in known for a in guard): continue
            a=next(a for a in guard if key(a) not in known)
            return {"split":{"atom":a,"yes":visit([a]+ctx),"no":visit([negate(a)]+ctx)}}
        raise ValueError("uncovered real viewport (no certificate)")
    return visit(domain)

def certificate(profile, rows):
    vals=profile["viewport"]; env=profile.get("safeArea",{})
    p={"widthMin":vals["min"],"widthMax":vals["max"],"heightMin":vals["height"]["min"],"heightMax":vals["height"]["max"],"safeLeft":env.get("left",0),"safeRight":env.get("right",0)}
    if not all(type(v) is int for v in p.values()): raise ValueError("integer environment bounds required")
    if len(rows)==0 or len(rows)>128: raise ValueError("row count")
    scale=lcm(*(v.denominator for r in rows for k in ("inlineStart","inlineSize") for v in aff(r["rect"][k])))
    rr=[]
    for r in rows:
        if len(r.get("constraints",[]))>64: raise ValueError("constraint limit")
        guard=[integer_atom(a) for a in r.get("constraints",[])]
        rr.append({"guard":guard,**{name:dict(zip(("x","y","c"),(int(v*scale) for v in aff(r["rect"][k])))) for name,k in (("start","inlineStart"),("size","inlineSize"))}})
    domain=[atom(1,0,-p["widthMin"]),atom(-1,0,p["widthMax"]),atom(0,1,-p["heightMin"]),atom(0,-1,p["heightMax"])]
    cov=coverage(domain,rr)
    safety=[]
    agreement=[]
    for r in rr:
        goals=[ga(add(r["start"],{"x":0,"y":0,"c":-scale*p["safeLeft"]})),ga(r["size"]),ga(add({"x":scale,"y":0,"c":-scale*p["safeRight"]},neg(add(r["start"],r["size"]))))]
        for g in goals: safety.append(prove(domain+r["guard"]+[negate(g)]))
    for a in rr:
        for b in rr:
            for u,v in ((a["start"],b["start"]),(b["start"],a["start"]),(a["size"],b["size"]),(b["size"],a["size"])):
                g=ga(add(u,neg(v)))
                agreement.append(prove(domain+a["guard"]+b["guard"]+[negate(g)]))
    return dict(version=1,profile=p,scale=scale,rows=rr,coverage=cov,safety=safety,agreement=agreement)

def generate(report_path,output):
    data=report_path.read_bytes()
    r=json.JSONDecoder().raw_decode(data.decode())[0] # supervisor trailer is not part of the report
    profiles={p["id"]:p for p in r["report"]["environment"]["profiles"]}
    output.mkdir(parents=True,exist_ok=True)
    records=[]
    for e in r["evidence"]:
        identity={k:e[k] for k in ("profile","state","target")}
        if not e.get("rows") or e.get("reason"):
            records.append({**identity,"status":"skipped","reason":"no geometry evidence"})
            continue
        if e.get("axes") not in (None,["inline"]):
            records.append({**identity,"status":"skipped","reason":"inline geometry not available"})
            continue
        try:
            c=certificate(profiles[e["profile"]],e["rows"])
        except (ValueError,KeyError) as ex:
            records.append({**identity,"status":"unknown","reason":str(ex)})
            continue
        tag=hashlib.sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest()[:16]
        path=output/(report_path.stem+"-"+tag+".json")
        payload=json.dumps(c,separators=(",",":")).encode()
        path.write_bytes(payload)
        records.append({**identity,"status":"certificate-generated","rows":len(c["rows"]),"file":path.name,"sha256":hashlib.sha256(payload).hexdigest()})
    manifest={"input":report_path.name,"sha256":hashlib.sha256(data).hexdigest(),"records":records}
    (output/(report_path.stem+"-manifest.json")).write_text(json.dumps(manifest,indent=2))
    print(report_path.name,[(x["target"],x["profile"],x["status"]) for x in records])

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("report",type=Path,nargs="+")
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    for path in args.report: generate(path,args.output)
