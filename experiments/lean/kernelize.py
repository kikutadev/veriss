#!/usr/bin/env python3
"""Emit a concrete Lean certificate for independent kernel reduction."""
import json,sys
from pathlib import Path
def seq(a,f):return "["+",".join(map(f,a))+"]"
def num(n):
    if type(n) is not int:raise ValueError("integer required")
    return str(n) if n>=0 else f"({n})"
def b(v):
    if type(v) is not bool:raise ValueError("boolean required")
    return str(v).lower()
def tup(*a):return "⟨"+",".join(a)+"⟩"
def affine(a):return tup(*(num(a[k]) for k in ("x","y","c")))
def atom(a):return tup(affine(a["affine"]),b(a["strict"]))
def row(r):return tup(seq(r["guard"],atom),affine(r["start"]),affine(r["size"]))
def tree(t):
    if list(t)==["row"]:return "(.row "+seq(t["row"]["guard"],atom)+")"
    if list(t)==["empty"]:return "(.empty "+seq(t["empty"]["weights"],num)+")"
    if list(t)==["split"]:
        s=t["split"];return "(.split "+atom(s["atom"])+" "+tree(s["yes"])+" "+tree(s["no"])+")"
    raise ValueError("coverage tree")
def produce(c):
    p=c["profile"]
    return """import VerissLean
open VerissLean
set_option maxRecDepth 20000
set_option maxHeartbeats 5000000
def concrete : Certificate := {
  version := """+num(c["version"])+"\n  profile := "+tup(*(num(p[k]) for k in ("widthMin","widthMax","heightMin","heightMax","safeLeft","safeRight")))+"\n  scale := "+num(c["scale"])+"\n  rows := "+seq(c["rows"],row)+"\n  coverage := "+tree(c["coverage"])+"\n  safety := "+seq(c["safety"],lambda x:seq(x,num))+"\n  agreement := "+seq(c["agreement"],lambda x:seq(x,num))+"\n}\ntheorem concreteChecked : concrete.check = true := by decide\n#print axioms concreteChecked\n"
if __name__=="__main__":print(produce(json.loads(Path(sys.argv[1]).read_text())))
