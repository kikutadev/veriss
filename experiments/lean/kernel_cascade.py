"""Generate kernel reduction checks for the concrete typed cascade certificates."""
import json,sys
from pathlib import Path
from kernel_research import s,opt,length,style
from kernel_relational import problem,model,weights
from kernelize import num,b,seq,tup

root=Path(sys.argv[1])
def read(name,kind):return json.loads((root/(name+"-"+kind+".json")).read_text())
def selector(v):return tup(opt(v["id"],s),opt(v["cls"],s),b(v["tag"]))
def media(v):return tup(b(v["horizontal"]),b(v["minimum"]),num(v["bound"]))
def rule(v):return tup(selector(v["selector"]),"."+v["property"],length(v["value"]),
                       b(v["important"]),opt(v["media"],media))
print("""import VerissLeanCascade
open VerissLean VerissLean.Relation
set_option maxRecDepth 30000
set_option maxHeartbeats 30000000""")
for i,name in enumerate(("cascade","two-axis-media")):
    v=read(name,"source");p=read(name,"plan")["plan"]["problem"];c=read(name,"cert")
    print(f"def source_{i} : Cascade.Source := "+tup(*(s(v[k]) for k in ("root","target","cls","html","css")),style(v["base"]),seq(v["rules"],rule)))
    print(f"def geometry_{i} : Problem := "+problem(p))
    print(f"def certificate_{i} : Cascade.Certificate := "+tup(model(c["model"]),seq(c["admissibility"],weights),seq(c["agreement"],weights)))
    print(f"theorem cascade_{i} : source_{i}.check geometry_{i} certificate_{i} = true := by decide")
    print(f"#print axioms cascade_{i}")
for n in ("Media.atom_sound","winner_spec","best_later_tie","branches_cover","Source.exact"):
    print("#print axioms VerissLean.Cascade."+n)
