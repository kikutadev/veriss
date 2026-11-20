"""Exercise normalized composition with plans derived from real veriss geometry."""
import json, subprocess, sys
from copy import deepcopy
from pathlib import Path
from relational import run, create_cert, create_model, prove, truth
checker=sys.argv[1]
out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
js="""
import {analyzeHTML} from '../../packages/veriss/src/html.mjs';
import {createLayoutIR,layoutGeometry} from '../../packages/veriss/src/layout-contract.mjs';
const html='<div id="root"><div id="target"></div></div>';
function make(min,max,left,top,width){
 const profile={id:'p',viewport:{min,max,height:{min:320,max:900}}};
 const css='*{margin:0;padding:0;box-sizing:border-box}#root{position:relative;width:100%;height:100vh}#target{position:absolute;left:'+left+'px;top:'+top+'px;width:'+width+'%;height:60px}';
 const r=analyzeHTML(html,{css,viewport:profile.viewport});
 if(r.status!=='verified')throw Error(JSON.stringify(r.diagnostics));
 return {report:{environment:{profiles:[profile]},contract:{contracts:[{id:'fit',kind:'within-viewport',target:'target'}]}},
 evidence:layoutGeometry({state:'s',profile,layout:createLayoutIR(r),targets:['target']})};
}
console.log(JSON.stringify({parent:make(320,1200,30,50,20),child:make(160,600,10,20,40)}));
"""
raw=json.loads(subprocess.check_output(["node","--input-type=module","-e",js],text=True))
def write(name,v):
 p=out/(name+".json");p.write_text(json.dumps(v));return p
def scaled(x=0,y=0,c=0,d=1):return dict(affine=dict(x=x,y=y,c=c),den=d)
plans={}
for name,r in raw.items():
 q=run(checker,"plan",write(name+"-report",r),"s","p","fit")
 assert q.returncode==0,(q.stdout,q.stderr)
 plans[name]=json.loads(q.stdout)
i=dict(transfer=dict(width=scaled(x=1,d=2),height=scaled(y=1),inlineStart=scaled(c=20),blockStart=scaled(c=30)),
       parent=plans["parent"]["problem"],child=plans["child"]["problem"],parentPoint=dict(x=320,y=400,den=1))
def make_cert(i):
 q=run(checker,"composition-plan",write("input",i))
 assert q.returncode==0,(q.stdout,q.stderr)
 p=json.loads(q.stdout)
 return dict(child=create_cert(p["child"]),parentModel=create_model(p["parent"]),
     allocation=[prove(c) for c in p["allocation"]],binding=[prove(c) for c in p["binding"]],
     implication=[truth(i["parent"]["domain"]+r["guard"],r["goal"]) for r in p["implication"]])
def check(name,i,c,wanted):
 q=run(checker,"composition-check",write(name+"-input",i),write(name+"-cert",c))
 assert q.returncode==wanted,(name,q.returncode,q.stdout,q.stderr)
 print(name,q.stdout.strip() or q.stderr.strip(),flush=True)
c=make_cert(i)
check("affine-transfer",i,c,0)
identity=dict(transfer=dict(width=scaled(x=1),height=scaled(y=1),inlineStart=scaled(),blockStart=scaled()),parent=i["child"],child=i["child"],parentPoint=dict(x=160,y=400,den=1))
check("identity",identity,make_cert(identity),0)
for k in ("allocation","binding","implication"):
 bad=deepcopy(c);bad[k].pop()
 check("omitted-"+k,i,bad,2)
bad=deepcopy(c);bad["child"]["goals"]=[]
check("unverified-child",i,bad,2)
bad=deepcopy(i);bad["transfer"]["inlineStart"]["affine"]["c"]=21
check("wrong-origin",bad,c,2)
bad=deepcopy(i);bad["transfer"]["width"]["den"]=1
check("out-of-child-domain",bad,c,2)
bad=deepcopy(i);bad["transfer"]["height"]["den"]=0
check("zero-scale",bad,c,2)
bad=deepcopy(i);bad["parent"]["pieces"][0]["axes"][0]["size"]["affine"]["c"]+=1
check("changed-parent-box",bad,c,2)
bad=deepcopy(i);bad["child"]["pieces"][0]["axes"].pop()
check("partial-axis",bad,c,2)
# Inconsistent parent contract cannot be certified even with the same child.
bad=deepcopy(i);bad["parent"]["pieces"][0]["goal"]={"not":{"a":bad["parent"]["pieces"][0]["goal"]}}
check("false-parent-goal",bad,c,2)
bad=deepcopy(i);bad["parentPoint"]["x"]=1
check("outside-parent-domain-witness",bad,c,2)
bad=deepcopy(i);bad["parent"]["domain"].append({"affine":{"x":0,"y":0,"c":-1},"strict":False})
check("empty-parent-domain",bad,c,2)
print("14 composition tests passed",flush=True)
