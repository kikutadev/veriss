"""Test shared-progress viewport-fit certificates against real veriss IR."""
import json, subprocess, sys
from copy import deepcopy
from pathlib import Path
from relational import run, create_cert

checker=sys.argv[1]
out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
js="""
import {analyzeHTML} from '../../packages/veriss/src/html.mjs';
import {createLayoutIR,layoutGeometry} from '../../packages/veriss/src/layout-contract.mjs';
import {createStateIR,createEnvironmentIR,createEvidenceIR,createRelationalContractIR,createRelationalObligationIR} from '../../packages/veriss/src/relational-contract.mjs';
const profile={id:'p',viewport:{min:320,max:1200,height:{min:320,max:900}}};
const html='<div id="root"><div id="pane"></div></div>';
const states=['closed','opened'];
const evidence=states.flatMap((state,i)=>{
 const css='*{margin:0;padding:0;box-sizing:border-box}#root{position:relative;width:100%;height:100vh}#pane{position:absolute;left:'+ (i?40:10)+'px;top:'+(i?50:20)+'px;width:'+(i?50:30)+'%;height:'+(i?90:60)+'px}';
 const r=analyzeHTML(html,{css,viewport:profile.viewport});
 if(r.status!=='verified')throw Error(JSON.stringify(r.diagnostics));
 return layoutGeometry({state,profile,layout:createLayoutIR(r),targets:['pane']});
});
const state=createStateIR({initial:'closed',states,transitions:[{from:'closed',event:'open',to:'opened'}]});
const obligation=createRelationalObligationIR(createRelationalContractIR({component:'Motion',profile:'relational/1',
 contracts:[{id:'event',kind:'stable',target:'pane',event:'open'}]}),{state,environment:createEnvironmentIR([profile]),evidence:createEvidenceIR(evidence)});
console.log(JSON.stringify(obligation));
"""
ob=json.loads(subprocess.check_output(["node","--input-type=module","-e",js],text=True))
req=dict(obligation=ob,key={"contract":"event","profile":"p","from":"closed","event":"open","to":"opened"},
 target="pane",trace={"duration":200,"knots":[{"time":0,"num":0,"den":1},{"time":100,"num":1,"den":3},{"time":200,"num":1,"den":1}]})
def write(name,v):
 p=out/(name+".json");p.write_text(json.dumps(v));return p
p=run(checker,"motion-plan",write("input",req))
assert p.returncode==0,(p.stdout,p.stderr)
plans=json.loads(p.stdout)
write("normalized-endpoints",{k:v["problem"] for k,v in plans.items()})
cert={k:create_cert(plans[k]) for k in ("before","after")}
def check(name,r,c,wanted):
 q=run(checker,"motion-check",write(name+"-input",r),write(name+"-cert",c))
 assert q.returncode==wanted,(name,q.stdout,q.stderr)
 print(name,q.stdout.strip() or q.stderr.strip(),flush=True)
check("moving-resizing",req,cert,0)
bad=deepcopy(req);bad["trace"]["knots"][1]["num"]=4
check("overshoot",bad,cert,2)
bad=deepcopy(req);bad["trace"]["knots"][-1]["time"]=199
check("uncovered-time",bad,cert,2)
bad=deepcopy(req);bad["trace"]["knots"][1]["time"]=0
check("duplicate-time",bad,cert,2)
bad=deepcopy(req);bad["trace"]["easing"]="cubic-bezier(0,2,1,2)"
check("unmodeled-easing",bad,cert,2)
bad=deepcopy(req);bad["key"]["event"]="close"
check("undeclared-event",bad,cert,2)
bad=deepcopy(req);bad["key"]["to"]="closed"
check("wrong-destination",bad,cert,2)
bad=deepcopy(req);bad["target"]="other"
check("missing-target",bad,cert,2)
bad=deepcopy(req);bad["obligation"]["implementation"]["evidence"]["entries"]=[e for e in bad["obligation"]["implementation"]["evidence"]["entries"] if e["state"]=="closed"]
check("missing-endpoint",bad,cert,2)
bad=deepcopy(req)
for e in bad["obligation"]["implementation"]["evidence"]["entries"]:
 if e["state"]=="opened":
    for r in e["rows"]:r["rect"]["inlineStart"]["constant"]="10000"
check("outside-viewport",bad,cert,2)
bad=deepcopy(cert);bad["after"]["goals"]=[]
check("missing-motion-proof",req,bad,2)
print("11 motion tests passed",flush=True)
