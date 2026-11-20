"""Compare independent graph/case checking with actual serialized veriss IR."""
import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from relational import run, create_cert

checker = sys.argv[1]
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
# Use the production constructor, not a hand-written copy of its case logic.
js = """
import {createStateIR,createEnvironmentIR,createEvidenceIR,createRelationalContractIR,createRelationalObligationIR}
 from '../../packages/veriss/src/relational-contract.mjs';
const state=createStateIR({initial:'a',states:['a','b','c','dead'],transitions:[
 {from:'a',event:'open',to:'b'}, {from:'b',event:'close',to:'a'},
 {from:'a',event:'open',to:'c',profiles:['mobile']}, {from:'b',event:'stay',to:'b'}]});
const environment=createEnvironmentIR(['desktop','mobile'].map(id=>({id,viewport:{min:320,max:1920,height:{min:320,max:1080}}})));
const a=(x,y,c)=>({coefficient:String(x),heightCoefficient:String(y),constant:String(c)});
const evidence=createEvidenceIR(['a','b','c'].flatMap(state=>['desktop','mobile'].map(profile=>({
 state,profile,target:'pane',source:'dom',assumptions:[],
 rows:[{rect:{inlineStart:a(0,0,0),blockStart:a(0,0,0),inlineSize:a(1,0,0),blockSize:a(0,1,0)},constraints:[]}]
}))));
const s={id:'static',kind:'within-viewport',target:'pane'};
const ev={id:'event',kind:'stable',target:'pane',event:'open'};
const make=contracts=>createRelationalObligationIR(createRelationalContractIR({component:'fixture',profile:'relational/1',contracts}),{state,environment,evidence});
console.log(JSON.stringify({all:make([s,ev]),static:make([s])}));
"""
data = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", js], text=True))
def write(name, x):
    p = out / (name + ".json")
    p.write_text(json.dumps(x))
    return p

def check(name, ob, wanted, certs=None):
    args = ["state-cases", write(name, ob)] if certs is None else ["state-proofs", write(name, ob), write(name+"-proofs", certs)]
    q = run(checker, *args)
    assert q.returncode == wanted, (name, q.returncode, q.stdout, q.stderr)
    print(name, q.stdout.strip() or q.stderr.strip(), flush=True)

all_cases = data["all"]
assert len(all_cases["cases"]) == 8
check("all", all_cases, 0)
bad = deepcopy(all_cases); bad["cases"].pop()
check("missing", bad, 2)
bad = deepcopy(all_cases); bad["cases"].append(bad["cases"][0])
check("duplicate", bad, 2)
bad = deepcopy(all_cases); bad["cases"][0]["transition"]["from"] = "dead"
check("unreachable", bad, 2)
bad = deepcopy(all_cases); bad["cases"][-1]["profile"] = "desktop"
check("profile-substitution", bad, 2)
bad = deepcopy(all_cases); bad["implementation"]["state"]["transitions"].append({"from":"a","event":"go","to":"dead"})
check("new-reachable-state", bad, 2)
bad = deepcopy(all_cases); bad["implementation"]["state"]["transitions"][0]["profiles"] = ["unknown"]
check("invalid-profile", bad, 2)
ob = data["static"]
assert len(ob["cases"]) == 5
rep = write("source", {"report":{"environment":ob["implementation"]["environment"],"contract":ob["contract"]},"evidence":ob["implementation"]["evidence"]["entries"]})
proofs = []
reqs = [dict(mode="plan",report=str(rep),state=k["transition"]["from"],profile=k["profile"],contract=k["contract"]) for k in ob["cases"]]
q = run(checker, "batch", write("requests",reqs))
assert q.returncode == 0, (q.stdout,q.stderr)
plans = json.loads(q.stdout)
for k,p in zip(ob["cases"],plans,strict=True):
    assert p["code"] == 0
    proofs.append(dict(key=dict(contract=k["contract"],profile=k["profile"],**{"from":k["transition"]["from"]}),certificate=create_cert(p["result"])))
check("static-bundle",ob,0,proofs)
check("missing-proof",ob,2,proofs[:-1])
check("duplicate-proof",ob,2,proofs+[proofs[0]])
bad=deepcopy(proofs);bad[0]["certificate"]["goals"]=[]
check("bad-proof",ob,2,bad)
bad=deepcopy(ob)
bad["implementation"]["evidence"]["entries"][0]["rows"][0]["rect"]["inlineSize"]["constant"]="1"
check("altered-geometry",bad,2,proofs)
print("12 state/certificate integration cases passed")

# Mixed static/event obligations must be planned from the original IR.
def case_key(k):
    return dict(contract=k["contract"],profile=k["profile"],**{x:k["transition"][x] for x in ("from","event","to") if x in k["transition"]})
def plan_cases(ob):
    q=run(checker,"state-plan",write("mixed-source",ob))
    assert q.returncode==0,(q.stdout,q.stderr)
    rows=json.loads(q.stdout)
    return {json.dumps({**dict(event=None,to=None),**r["key"]},sort_keys=True):r["result"] for r in rows}
kernel=[]
def make_proofs(ob):
    plans=plan_cases(ob)
    proofs=[]
    for k in ob["cases"]:
        key=case_key(k)
        # Lean JSON encodes absent optional keys as null.
        plan=plans[json.dumps({**dict(event=None,to=None),**key},sort_keys=True)]
        cert=create_cert(plan)
        proofs.append(dict(key=key,certificate=cert))
        kernel.append(dict(problem=plan["problem"],certificate=cert,status="verified"))
    return proofs
mixed=make_proofs(all_cases)
check("mixed-bundle",all_cases,0,mixed)
bad=deepcopy(all_cases)
next(e for e in bad["implementation"]["evidence"]["entries"] if e["state"]=="c" and e["profile"]=="mobile")["rows"][0]["rect"]["inlineStart"]["constant"]="1"
check("different-after",bad,2,mixed)

# Generate distinct before/after cases using the real producer. A narrow
# viewport interval moves pane by one px; event "close" requires a nonempty path.
more_js=js.replace("createRelationalObligationIR}", "createRelationalObligationIR,verifyRelationalObligation}")
more_js=more_js.replace("console.log(JSON.stringify({all:make([s,ev]),static:make([s])}));", """
const cmp=(relation,left,right)=>({op:'compare',relation,left,right});
const ref=(field,endpoint)=>({target:'pane',field,endpoint});
const self={id:'self',kind:'stable',target:'pane',event:'stay'};
const event={id:'relative',kind:'predicate',event:'open',predicate:cmp('eq',ref('inlineEnd','before'),ref('inlineEnd','after'))};
const close={id:'close',kind:'stable',target:'pane',event:'close'};
const action={id:'action',kind:'action',event:'open'};
const narrow=structuredClone(evidence.entries);
const row=narrow.find(e=>e.state==='b'&&e.profile==='desktop');
const original=row.rows[0].rect;
const g=(x,y,c,strict)=>({...a(x,y,c),strict});
// Continuous triangular displacement only at 601<W<603; exact fractional
// counterexample at 1203/2. Adjacent rows agree at their shared boundaries.
row.rows=[
 {rect:original,constraints:[g(-1,0,601,false)]},
 {rect:{...original,inlineStart:a(1,0,-601)},constraints:[g(1,0,-601,true),g(-1,0,602,false)]},
 {rect:{...original,inlineStart:a(-1,0,603)},constraints:[g(1,0,-602,true),g(-1,0,603,true)]},
 {rect:original,constraints:[g(1,0,-603,false)]}
];
const build=contracts=>createRelationalObligationIR(createRelationalContractIR({component:'fixture',profile:'relational/1',contracts}),{state,environment,evidence:createEvidenceIR(narrow)});
const stable=make([self,event,close]);
const broken=build([close,action]);
const direction=build([{id:'direction',kind:'predicate',event:'close',predicate:cmp('le',ref('inlineStart','after'),ref('inlineStart','before'))}]);
const results=Object.fromEntries([['good',stable],['broken',broken],['direction',direction]].map(([k,v])=>[k,{ob:v,report:verifyRelationalObligation(v)}]));
console.log(JSON.stringify(results));
""")
more=json.loads(subprocess.check_output(["node","--input-type=module","-e",more_js],text=True))
good=more["good"]["ob"]
assert all(c["status"]=="verified" for c in more["good"]["report"]["contracts"])
good_proofs=make_proofs(good)
check("self-loop-and-event-predicate",good,0,good_proofs)

broken=more["broken"]["ob"]
assert next(c for c in more["broken"]["report"]["contracts"] if c["id"]=="close")["status"]=="violated"
q=run(checker,"state-plan",write("broken-plan-source",broken))
assert q.returncode==2,(q.stdout,q.stderr)
rows=json.loads(q.stdout)
plan=next(r for r in rows if r["key"]["contract"]=="close" and r["key"]["profile"]=="desktop")
assert plan["code"]==0
key=plan["key"]
assert key["from"]=="b" and key["to"]=="a"
violation=create_cert(plan["result"],{"width":"1203/2","height":"400"})
kernel.append(dict(problem=plan["result"]["problem"],certificate=violation,status="violated"))
entry=dict(key=key,violation=violation,path=[{"from":"a","event":"open","to":"b"}])
check("reachable-fractional-counterexample-with-other-unknown",broken,1,[entry])
bad=deepcopy(entry);bad["path"]=[]
check("missing-path",broken,2,[bad])
bad=deepcopy(entry);bad["path"][0]["event"]="close"
check("wrong-path-event",broken,2,[bad])
bad=deepcopy(entry);bad["path"][0]["to"]="c";bad["path"][0]["profiles"]=["mobile"]
check("wrong-path-profile",broken,2,[bad])
bad=deepcopy(entry);bad["violation"]["point"]={"x":601,"y":400,"den":1}
check("non-violating-boundary",broken,2,[bad])
bad=deepcopy(entry);bad["key"]["to"]="c"
check("extraneous-destination",broken,2,[bad])
bad=deepcopy(broken)
next(c for c in bad["cases"] if c["contract"]=="close" and c["profile"]=="desktop")["targets"].pop()
check("omitted-target",bad,2,[entry])
bad=deepcopy(broken)
next(c for c in bad["cases"] if c["contract"]=="close" and c["profile"]=="desktop")["targets"][0]["state"]="a"
check("swapped-before-binding",bad,2,[entry])
bad=deepcopy(broken)
e=next(e for e in bad["implementation"]["evidence"]["entries"] if e["state"]=="a" and e["profile"]=="desktop")
e["axes"]=["inline"]
for row in e["rows"]:
    row["rect"]={k:v for k,v in row["rect"].items() if k.startswith("inline")}
check("missing-after-axis",bad,2,[entry])
check("duplicate-violation",broken,2,[entry,entry])
check("empty-bundle",broken,2,[])
direction=more["direction"]["ob"]
assert all(c["status"]=="verified" for c in more["direction"]["report"]["contracts"])
dir_proofs=make_proofs(direction)
check("directional-before-after",direction,0,dir_proofs)
bad=deepcopy(direction)
pred=bad["contract"]["contracts"][0]["predicate"]
pred["left"]["endpoint"],pred["right"]["endpoint"]=pred["right"]["endpoint"],pred["left"]["endpoint"]
check("reversed-direction",bad,2,dir_proofs)
(out/"transition-kernel-input.json").write_text(json.dumps(kernel))
print("28 state/certificate integration cases passed",flush=True)
