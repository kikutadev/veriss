"""Emit typed concrete checks for accepted CSS, composition, finite and motion fixtures."""
import json,sys
from pathlib import Path
from kernel_relational import scaled,problem,model,cert,truth,weights
from kernelize import num,b,seq,tup

def read(sub,name):return json.loads((root/sub/(name+".json")).read_text())
def s(x):return json.dumps(x,ensure_ascii=False)
def opt(v,f):return "none" if v is None else "(some "+f(v)+")"
def length(l):return tup(*(num(l[k]) for k in ("px","vw","vh","percent","den")))
def axis(a):return tup(*(length(a[k]) for k in ("offset","size","padBefore","padAfter","borderBefore","borderAfter")))
def style(v):return tup(axis(v["inline"]),axis(v["block"]),b(v["borderBox"]))
def edge(e):return tup(s(e["from"]),s(e["event"]),s(e["to"]),opt(e.get("profiles"),lambda a:seq(a,s)))
def graph(g):return tup(s(g["initial"]),seq(g["states"],s),seq(g["profiles"],s),seq(g["edges"],edge))
def expr(e):return tup(opt(e.get("variable"),num),b(e["negate"]),opt(e.get("value"),b))
def handler(h):return tup(s(h["target"]),num(h["variable"]),expr(h["expression"]))
def render(r):return tup(s(r["id"]),seq(r["choices"],lambda x:tup(num(x[0]),b(x[1]))),seq(r["buttons"],s))
def variant(v):return tup(s(v["id"]),seq(v["values"],b),s(v["render"]))
def machine(m):return tup(seq(m["variables"],s),seq(m["initial"],b),seq(m["handlers"],handler),seq(m["renders"],render))
def transfer(t):return tup(*(scaled(t[k]) for k in ("width","height","inlineStart","blockStart")))
def point(p):return tup(num(p["x"]),num(p["y"]),num(p["den"]))
def comp_cert(c):return tup(cert(c["child"],"verified"),model(c["parentModel"]),
   seq(c["allocation"],weights),seq(c["binding"],weights),seq(c["implication"],truth))
def trace(t):return tup(num(t["duration"]),seq(t["knots"],lambda p:tup(num(p["time"]),num(p["num"]),num(p["den"]))))
if __name__ == "__main__":
    root=Path(sys.argv[1])
    print("""import VerissLeanCSS
import VerissLeanComposition
import VerissLeanFinite
import VerissLeanMotion
open VerissLean VerissLean.Relation
set_option maxRecDepth 30000
set_option maxHeartbeats 20000000""")
    v=read("css","closed-source-source")
    p=read("css","closed-normalized-problem")
    c=read("css","closed-source-source-cert")
    print("def source : CSS.SourceFragment := "+tup(s(v["root"]),s(v["target"]),s(v["html"]),s(v["css"]),style(v["style"])))
    print("def geometry : Problem := "+problem(p))
    print("def cssCertificate : CSS.ExtractionCertificate := "+tup(model(c["model"]),seq(c["admissibility"],weights)))
    print("theorem cssChecked : source.check geometry cssCertificate = true := by decide")
    i=read("composition","affine-transfer-input");c=read("composition","affine-transfer-cert")
    print("def composition : Composition.CompositionInput := "+tup(transfer(i["transfer"]),problem(i["parent"]),problem(i["child"]),point(i["parentPoint"])))
    print("def compositionCert : Composition.CompositionCertificate := "+comp_cert(c))
    print("theorem compositionChecked : composition.check compositionCert = true := by decide")
    i=read("finite","react")
    print("def finite : Finite.Input := "+tup(machine(i["machine"]),graph(i["graph"]),seq(i["variants"],variant)))
    print("theorem finiteChecked : finite.check = true := by decide")
    i=read("motion","moving-resizing-input");c=read("motion","moving-resizing-cert");p=read("motion","normalized-endpoints")
    bounds=tup(*(scaled(dict(affine=dict(x=x,y=y,c=0),den=1)) for x,y in [(0,0),(1,0),(0,0),(0,1)]))
    print("def motion : Motion.Model := "+tup(trace(i["trace"]),bounds,problem(p["before"]),problem(p["after"])))
    print("def motionCert : Motion.Certificate := "+tup(cert(c["before"],"verified"),cert(c["after"],"verified")))
    print("theorem motionChecked : motion.check motionCert = true := by decide")
    for name in ("cssChecked","compositionChecked","finiteChecked","motionChecked",
     "CSS.AnchoredStyle.extraction_exact","CSS.SourceFragment.exact",
     "Composition.Transfer.substitute_sound","Composition.Transfer.transportAxis_sound",
     "Composition.Transfer.formula_sound","Composition.Transfer.binding_sound",
     "Composition.Transfer.composition_sound","Composition.CompositionInput.nonempty",
     "Finite.Machine.reach_refines","Finite.Machine.edge_sound","Motion.Model.continuous_fit"):
     print("#print axioms "+name)
