#!/usr/bin/env python3
"""Adversarial regression cases for generation and independently executing Lean."""
from copy import deepcopy
from pathlib import Path
import json, subprocess, sys
from generate import certificate
def expr(x=0,y=0,c=0):
    return {"coefficient":str(x),"heightCoefficient":str(y),"constant":str(c)}
def guard(x=0,y=0,c=0,strict=False): return {**expr(x,y,c),"strict":strict}
def row(start,size,conditions=()):
    return {"rect":{"inlineStart":start,"inlineSize":size},"constraints":list(conditions)}
profile={"viewport":{"min":320,"max":1920,"height":{"min":320,"max":1080}}}
rows=[row(expr(),expr(1),[guard(-1,0,800)]),row(expr('1/2',0,-400),expr(c=800),[guard(1,0,-800,True)])]
valid=certificate(profile,rows)
def reject_generation(name,rs):
    try: certificate(profile,rs)
    except ValueError: print(name,"producer rejected")
    else: raise AssertionError(name+" producer accepted invalid input")
reject_generation('strict boundary hole',[row(expr(),expr(1),[guard(-1,0,800,True)]),rows[1]])
reject_generation('narrow strip hole',[rows[0],row(expr('1/2',0,-400),expr(c=800),[guard(1,0,'-8000001/10000',True)])])
reject_generation('overlap disagreement',[rows[0],row(expr(c=1),expr(c=100),[guard(1,0,-700)])])
reject_generation('negative size',[row(expr(),expr(c=-1))])
reject_generation('overflow',[row(expr(),expr(1,0,1))])
# Degenerate line and strict complement handling.
point=deepcopy(profile);point["viewport"]["min"]=point["viewport"]["max"]=800
validpoint=certificate(point,rows)
height_split=[row(expr(),expr(1),[guard(0,-1,600)]),row(expr(),expr(1),[guard(0,1,-600,True)])]
validheight=certificate(profile,height_split)
tests=[('valid-piecewise',valid,0),('valid-degenerate',validpoint,0),('valid-height-split',validheight,0)]
def altered(name,edit):
    a=deepcopy(valid);edit(a);tests.append((name,a,2))
altered('missing-safety-proof',lambda a:a["safety"].pop())
altered('missing-agreement-proof',lambda a:a["agreement"].pop())
altered('wrong-weight',lambda a:a["safety"][0].__setitem__(-1,0))
altered('negative-weight',lambda a:a["safety"][0].__setitem__(0,-1))
altered('changed-width',lambda a:a["rows"][0]["size"].__setitem__("c",1))
limited=certificate(profile,[row(expr(),expr(1),[guard(1,0,-320)])])
limited['profile']['widthMin']=319
tests.append(('widened-domain-with-gap',limited,2))
altered('zero-scale',lambda a:a.__setitem__("scale",0))
altered('empty-rows',lambda a:a.__setitem__("rows",[]))
altered('dropped-coverage',lambda a:a.__setitem__("coverage",{"row":{"guard":[]}}))
altered('removed-branch',lambda a:a.__setitem__("coverage",a["coverage"]["split"]["yes"]))
altered('changed-strictness',lambda a:a["rows"][0]["guard"][0].__setitem__("strict",True))
altered('larger-safe-area',lambda a:a["profile"].__setitem__("safeLeft",1))
altered('invalid-domain',lambda a:a["profile"].__setitem__("heightMax",1))
out=Path(sys.argv[2])
out.mkdir(parents=True,exist_ok=True)
checker=sys.argv[1]
for name,data,expected in tests:
    path=out/(name+".json")
    path.write_text(json.dumps(data))
    if checker!='--generate-only':
        p=subprocess.run([checker,str(path)],capture_output=True,text=True,timeout=30)
        assert p.returncode==expected,(name,p.returncode,expected,p.stdout,p.stderr)
        print(name,p.stdout.strip() or p.stderr.strip())
print(len(tests),"certificate cases", "generated" if checker=='--generate-only' else "passed")


# Test source binding against another independently valid certificate, not just
# a corrupted proof. Exact equivalent rational literals are admitted.
rp={"id":"web",**profile}
ev={"state":"screen","profile":"web","target":"panel","axes":["inline"],"rows":rows}
report={"evidence":[ev],"report":{"environment":{"profiles":[rp]}}}
alternative=certificate(profile,[row(expr(),expr(c=100))])
cases=[("matching-source",report,valid,0),("valid-but-unrelated",report,alternative,2)]
def modified(name,edit,expected=2,regenerate=False):
    r=deepcopy(report);edit(r)
    c=certificate(r["report"]["environment"]["profiles"][0],r["evidence"][0]["rows"]) if regenerate else valid
    cases.append((name,r,c,expected))
modified("source-row-changed",lambda r:r["evidence"][0]["rows"][0]["rect"]["inlineSize"].__setitem__("constant","1"))
modified("source-row-deleted",lambda r:r["evidence"][0]["rows"].pop())
modified("source-strictness-changed",lambda r:r["evidence"][0]["rows"][0]["constraints"][0].__setitem__("strict",True))
modified("source-domain-changed",lambda r:r["report"]["environment"]["profiles"][0]["viewport"].__setitem__("min",321))
modified("source-duplicate-entry",lambda r:r["evidence"].append(deepcopy(r["evidence"][0])))
modified("source-unknown",lambda r:r["evidence"][0].__setitem__("reason","unresolved"))
modified("source-exact-equivalent",lambda r:r["evidence"][0]["rows"][0]["rect"]["inlineSize"].__setitem__("coefficient","2/2"),0)
modified("source-unreduced-guard",lambda r:r["evidence"][0]["rows"][0]["constraints"][0].__setitem__("coefficient","-2/2"),0,True)
for name,report_data,cert,expected in cases:
    rp=out/(name+"-report.json"); cp=out/(name+"-certificate.json")
    rp.write_text(json.dumps(report_data));cp.write_text(json.dumps(cert))
    if checker!="--generate-only":
        p=subprocess.run([checker,"report",str(rp),"screen","web","panel",str(cp)],capture_output=True,text=True,timeout=30)
        assert p.returncode==expected,(name,p.returncode,expected,p.stdout,p.stderr)
        print(name,p.stdout.strip() or p.stderr.strip(),flush=True)
print(len(cases),"source-binding cases", "generated" if checker=="--generate-only" else "passed")
