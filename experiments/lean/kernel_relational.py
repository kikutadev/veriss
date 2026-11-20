#!/usr/bin/env python3
"""Generate concrete Lean reduction checks for normalized problems/certificates."""
from pathlib import Path
import json,sys
from kernelize import seq,num,tup,affine,atom,tree
def scaled(a):return tup(affine(a["affine"]),num(a["den"]))
def axis(a):return tup(scaled(a["start"]),scaled(a["size"]))
def formula(f):
    k,v=next(iter(f.items()))
    if k=="atom":return "(.atom "+atom(v["a"])+")"
    if k=="not":return "(.not "+formula(v["a"])+")"
    if k not in ("both","either"):raise ValueError("unsupported formula")
    return "(."+k+" "+formula(v["a"])+" "+formula(v["b"])+")"
def piece(p):return tup(seq(p["guard"],atom),seq(p["axes"],axis),formula(p["goal"]))
def problem(p):return tup(seq(p["domain"],atom),seq(p["pieces"],piece))
def weights(w):return seq(w,num)
def model(m):return tup(tree(m["coverage"]),seq(m["dimensions"],weights),seq(m["agreement"],weights))
def truth(t):
    if t=="known":return ".known"
    if "empty" in t:return "(.empty "+weights(t["empty"]["weights"])+")"
    v=t["split"];return "(.split "+atom(v["atom"])+" "+truth(v["yes"])+" "+truth(v["no"])+")"
def cert(c,status):
    payload=tup(*(num(c["point"][k]) for k in ("x","y","den"))) if status=="violated" else seq(c["goals"],truth)
    return tup(model(c["model"]),payload)
print("import VerissLeanRelation\nopen VerissLean VerissLean.Relation\nset_option maxRecDepth 20000\nset_option maxHeartbeats 10000000")
i=0
for path in sys.argv[1:]:
    for r in json.loads(Path(path).read_text()):
        print("-- instance "+str(i))
        print(f"def problem_{i} : Problem := "+problem(r["problem"]))
        cls="ViolationCertificate" if r["status"]=="violated" else "VerifiedCertificate"
        method="checkViolated" if r["status"]=="violated" else "checkVerified"
        print(f"def certificate_{i} : {cls} := "+cert(r["certificate"],r["status"]))
        print(f"theorem concrete_{i} : problem_{i}.{method} certificate_{i} = true := by decide")
        print(f"#print axioms concrete_{i}")
        i+=1
