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
