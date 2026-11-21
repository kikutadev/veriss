#!/usr/bin/env python3
"""Untrusted certificate producer for Lean's source-derived relational plans."""
from fractions import Fraction
from math import lcm
from pathlib import Path
import argparse,json,subprocess,time
from generate import coverage,refute,prove,negate,key

def atoms(f):
    kind, data = next(iter(f.items()))
    if kind=="atom":return [data["a"]]
    if kind=="not":return atoms(data["a"])
    return atoms(data["a"])+atoms(data["b"])

def known(f,ctx,want):
    kind,data=next(iter(f.items()))
    if kind=="atom":return key(data["a"] if want else negate(data["a"])) in ctx
    if kind=="not":return known(data["a"],ctx,not want)
    vals=[known(data[k],ctx,want) for k in ("a","b")]
    return all(vals) if (kind=="both")==want else any(vals)

def truth(ctx,f):
    budget=10000
    candidates=atoms(f)
    def go(ctx):
        nonlocal budget
        budget-=1
        if budget<0:raise ValueError("truth tree budget")
        keys=set(map(key,ctx))
        if known(f,keys,True):return "known"
        ws=refute(ctx)
        if ws is not None:return {"empty":{"weights":ws}}
        if known(f,keys,False):raise ValueError("counterexample exists; a witness is needed")
        a=next((a for a in candidates if key(a) not in keys and key(negate(a)) not in keys),None)
        if a is None:raise ValueError("unresolved formula")
        return {"split":{"atom":a,"yes":go([a]+ctx),"no":go([negate(a)]+ctx)}}
    return go(ctx)

def create_model(plan):
    p=plan["problem"]
    return dict(coverage=coverage(p["domain"],p["pieces"]),
                dimensions=[prove(c) for c in plan["dimensions"]],
                agreement=[prove(c) for c in plan["agreement"]])

def create_cert(plan,witness=None):
    model=create_model(plan)
    if witness is not None:
        w,h=(Fraction(witness[k]) for k in ("width","height"))
        d=lcm(w.denominator,h.denominator)
        return {"model":model,"point":{"x":int(w*d),"y":int(h*d),"den":d}}
    p=plan["problem"]
    return dict(model=model,goals=[truth(p["domain"]+r["guard"],r["goal"]) for r in p["pieces"]])

def run(checker,*args):
    return subprocess.run([checker,*map(str,args)],capture_output=True,text=True,timeout=180)

def evaluate(checker,report,state,profile,contract,out,witness=None):
    identity=(str(report),state,profile,contract)
    plan=run(checker,"plan",*identity)
    if plan.returncode==2:return "unknown",plan.stderr.strip(),None
    if plan.returncode!=0:raise RuntimeError(plan.stderr or plan.stdout)
    p=json.loads(plan.stdout)
    try:cert=create_cert(p,witness)
    except ValueError as e:return "unknown",str(e),None
    out.write_text(json.dumps(cert,separators=(",",":")))
    result=run(checker,"violate" if witness is not None else "verify",*identity,out)
    if result.returncode not in (0,1,2):raise RuntimeError(result.stderr or result.stdout)
    status={0:"verified",1:"violated",2:"unknown"}[result.returncode]
    return status,result.stdout.strip() or result.stderr.strip(),p

def batch_requests(checker,requests,file):
    if not requests:return []
    result=[]
    for i in range(0,len(requests),128):
        chunk=requests[i:i+128]
        file.write_text(json.dumps(chunk,separators=(",",":")))
        q=run(checker,"batch",file)
        if q.returncode not in (0,1,2):raise RuntimeError(q.stderr or q.stdout)
        rs=json.loads(q.stdout)
        if len(rs)!=len(chunk):raise ValueError("incomplete batch result")
        if q.returncode != (2 if any(r["code"]==2 for r in rs) else 1 if any(r["code"]==1 for r in rs) else 0):
            raise ValueError("inconsistent batch exit code")
        result.extend(rs)
    return result

def saved_cases(checker,reports,out):
    start=time.monotonic()
    out.mkdir(parents=True,exist_ok=True)
    entries=[]
    for report in reports:
        raw=json.JSONDecoder().raw_decode(report.read_text())[0]
        for c in raw["report"]["contracts"]:
            for case in c["cases"]:
                state,profile=case.get("state"),case["profile"]
                entry=dict(index=len(entries),report=report,contract=c["id"],profile=profile,expected=case["status"],status="unknown",msg="unsupported case kind")
                if state and c["kind"] not in ("action","stable","max-occupancy"):
                    entry.update(request=dict(mode="plan",report=str(report),state=state,profile=profile,contract=c["id"]),witness=case.get("witness") if case["status"]=="violated" else None)
                entries.append(entry)
    planned=[e for e in entries if "request" in e]
    for e,r in zip(planned,batch_requests(checker,[e["request"] for e in planned],out/"requests-plan.json")):
        if r["code"]!=0:
            e["msg"]=r["result"]
            continue
        e["plan"]=r["result"]
        try:c=create_cert(e["plan"],e["witness"])
        except ValueError as ex:
            e["msg"]=str(ex);continue
        e["payload"]=c
        # Each entry has an independent immutable certificate path.
        path=out/("case-"+str(e["index"])+".json")
        path.write_text(json.dumps(c,separators=(",",":")))
        e["check"]={**e["request"],"mode":"violate" if e["witness"] is not None else "verify","certificate":str(path)}
    checks=[e for e in entries if "check" in e]
    for e,r in zip(checks,batch_requests(checker,[e["check"] for e in checks],out/"requests-check.json")):
        e["status"]={0:"verified",1:"violated",2:"unknown"}[r["code"]]
        e["msg"]=r["result"]
    summary={"verified":0,"violated":0,"unknown":0,"mismatches":0}
    kernel=[]
    for e in entries:
        status=e["status"];summary[status]+=1
        if status!=e["expected"]:summary["mismatches"]+=1
        if status in ("verified","violated"):
            kernel.append(dict(problem=e["plan"]["problem"],certificate=e["payload"],status=status,id=e["report"].stem+":"+e["contract"]+":"+e["profile"]))
        print(e["report"].stem,e["contract"],e["profile"],e["expected"],status,e["msg"],flush=True)
    (out/"kernel-input.json").write_text(json.dumps(kernel))
    summary["seconds"]=round(time.monotonic()-start,2)
    print(json.dumps(summary),flush=True)
    return 2 if summary["unknown"] or summary["mismatches"] or not entries else 1 if summary["violated"] else 0

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("checker")
    parser.add_argument("reports",type=Path,nargs="+")
    parser.add_argument("--output",type=Path,required=True)
    a=parser.parse_args()
    raise SystemExit(saved_cases(a.checker,a.reports,a.output))
