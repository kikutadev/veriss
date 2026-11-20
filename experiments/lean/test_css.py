"""Check computed anchored style against actual veriss LayoutIR, not sampled boxes."""
import json, subprocess, sys
from copy import deepcopy
from pathlib import Path
from relational import run, create_model, prove

checker=sys.argv[1]
out=Path(sys.argv[2]).resolve(); out.mkdir(parents=True,exist_ok=True)
js="""
import {analyzeHTML} from '../../packages/veriss/src/html.mjs';
import {createLayoutIR,layoutGeometry} from '../../packages/veriss/src/layout-contract.mjs';
const profile={id:'p',viewport:{min:320,max:1200,height:{min:320,max:900}}};
const html='<div id="root"><div id="target"></div></div>';
const base='*{margin:0;padding:0;box-sizing:border-box}#root{position:relative;width:100%;height:100vh}';
const fixtures=[
 ['content','absolute','left:10px;top:20px;width:40%;height:60px;padding:2px;border:1px solid black;box-sizing:content-box'],
 ['border','absolute','left:10px;top:20px;width:40%;height:60px;padding:2px;border:1px solid black;box-sizing:border-box'],
 ['viewport','absolute','left:5vw;top:5vh;width:40vw;height:20vh;padding:0;border:0;box-sizing:border-box'],
 ['fixed','fixed','left:10px;top:20px;width:40%;height:60px;padding:2px;border:1px solid black;box-sizing:content-box']
];
const result={};
for(const [id,pos,decl] of fixtures){
 const r=analyzeHTML(html,{css:base+'#target{position:'+pos+';'+decl+'}',viewport:profile.viewport});
 result[id]={status:r.status,report:{environment:{profiles:[profile]}},evidence:layoutGeometry({state:'s',profile,layout:createLayoutIR(r),targets:['target']})};
}
console.log(JSON.stringify(result));
"""
fixtures=json.loads(subprocess.check_output(["node","--input-type=module","-e",js],text=True))
def l(px=0,vw=0,vh=0,percent=0,den=1):return dict(px=px,vw=vw,vh=vh,percent=percent,den=den)
def axis(offset,size,pad=l(),border=l()):return dict(offset=offset,size=size,padBefore=pad,padAfter=pad,borderBefore=border,borderAfter=border)
style=dict(version=1,kind="viewport-anchored-computed-style",position="absolute",borderBox=False,
           inline=axis(l(px=10),l(percent=40),l(px=2),l(px=1)),
           block=axis(l(px=20),l(px=60),l(px=2),l(px=1)))
def write(name,v):
    p=out/(name+".json");p.write_text(json.dumps(v));return p
def plan(name,s,r):
    sf,rf=write(name+"-style",s),write(name+"-report",r)
    q=run(checker,"css-plan",sf,rf,"s","p","target")
    return q,sf,rf
def check(name,s,r,c,want):
    sf,rf,cf=write(name+"-style",s),write(name+"-report",r),write(name+"-cert",c)
    q=run(checker,"css-check",sf,rf,"s","p","target",cf)
    assert q.returncode==want,(name,q.returncode,q.stdout,q.stderr)
    print(name,q.stdout.strip() or q.stderr.strip(),flush=True)
def cert_for(name,s,r):
    q,_,_=plan(name,s,r)
    assert q.returncode==0,(name,q.stdout,q.stderr)
    p=json.loads(q.stdout)
    return dict(model=create_model(p["plan"]),admissibility=[prove(c) for c in p["admissibility"]])
for name,s in [("content",style),("border",{**style,"borderBox":True}),
               ("viewport",{**style,"borderBox":True,"inline":axis(l(vw=5),l(vw=40)),"block":axis(l(vh=5),l(vh=20))})]:
    r=fixtures[name]
    if name=="viewport" and r["status"]=="unknown":
        q,_,_=plan(name,s,r)
        assert q.returncode==2,(name,q.stdout,q.stderr)
        print("viewport-unit-producer-unknown",q.stderr.strip(),flush=True)
        continue
    assert r["status"]=="verified",(name,r)
    c=cert_for(name,s,r)
    check(name,s,r,c,0)
r=fixtures["content"];c=cert_for("original",style,r)
bad=deepcopy(style);bad["inline"]["size"]["percent"]=41
check("wrong-width",bad,r,c,2)
bad=deepcopy(style);bad["borderBox"]=True
check("wrong-box-sizing",bad,r,c,2)
bad=deepcopy(style);bad["block"]["borderBefore"]["den"]=0
check("zero-denominator",bad,r,c,2)
bad=deepcopy(style);bad["block"]["borderBefore"]["percent"]=1
check("invalid-border-percentage",bad,r,c,2)
bad=deepcopy(style);bad["transform"]="translateX(10px)"
check("unknown-style-field",bad,r,c,2)
bad=deepcopy(c);bad["admissibility"].pop()
check("missing-domain-proof",style,r,bad,2)
bad=deepcopy(r);bad["evidence"][0]["rows"][0]["rect"]["blockSize"]["constant"]="67"
check("wrong-evidence",style,bad,c,2)
bad=deepcopy(r);bad["evidence"][0]["rows"][0]["constraints"][0]["constant"]="-321"
check("missing-region",style,bad,c,2)
bad=deepcopy(r);bad["report"]["environment"]["profiles"][0]["scrollbar"]={"name":"classic","inlineSize":15,"blockSize":15}
check("unsupported-scrollbar",style,bad,c,2)
check("fixed-producer-unknown",{**style,"position":"fixed"},fixtures["fixed"],c,2)
print("13 CSS computed-style extraction tests passed",flush=True)

# The complete actual HTML/CSS strings, including longhands, are independent
# test inputs, not copied out of the Lean renderer.
html='<!doctype html><html lang="en"><head><title>Layout</title></head><body><div id="root"><div id="target"></div></div></body></html>'
css='*{margin:0;padding:0;border:0;box-sizing:border-box}#root{position:relative;width:100%;height:100vh}#target{position:absolute;left:10px;top:20px;width:40%;height:60px;padding-top:2px;padding-right:2px;padding-bottom:2px;padding-left:2px;border-style:solid;border-top-width:1px;border-right-width:1px;border-bottom-width:1px;border-left-width:1px;box-sizing:content-box}'
frag=dict(version=1,root="root",target="target",html=html,css=css,style=style)
srcjs="""
import {analyzeHTML} from '../../packages/veriss/src/html.mjs';
import {createLayoutIR,layoutGeometry} from '../../packages/veriss/src/layout-contract.mjs';
let text='';for await(const c of process.stdin)text+=c;
const f=JSON.parse(text),profile={id:'p',viewport:{min:320,max:1200,height:{min:320,max:900}}};
const r=analyzeHTML(f.html,{css:f.css,viewport:profile.viewport});
if(r.status!=='verified')throw Error(JSON.stringify(r.diagnostics));
console.log(JSON.stringify({report:{environment:{profiles:[profile]}},evidence:layoutGeometry({state:'s',profile,layout:createLayoutIR(r),targets:[f.target]})}));
"""
raw=json.loads(subprocess.check_output(["node","--input-type=module","-e",srcjs],input=json.dumps(frag),text=True))
q=run(checker,"css-source-plan",write("closed-fragment",frag),write("closed-report",raw),"s","p")
assert q.returncode==0,(q.stdout,q.stderr)
p=json.loads(q.stdout)
write("closed-normalized-problem",p["plan"]["problem"])
fc=dict(model=create_model(p["plan"]),admissibility=[prove(c) for c in p["admissibility"]])
def source_check(name,s,r,c,want):
 q=run(checker,"css-source-check",write(name+"-source",s),write(name+"-source-report",r),"s","p",write(name+"-source-cert",c))
 assert q.returncode==want,(name,q.stdout,q.stderr)
 print(name,q.stdout.strip() or q.stderr.strip(),flush=True)
source_check("closed-source",frag,raw,fc,0)
bad=deepcopy(frag);bad["css"]+="#target{width:99%}"
source_check("appended-cascade",bad,raw,fc,2)
bad=deepcopy(frag);bad["css"]=css.replace("width:40%","width:41%")
source_check("changed-source-length",bad,raw,fc,2)
bad=deepcopy(frag);bad["html"]=html.replace("</body>","<script>0</script></body>")
source_check("external-script",bad,raw,fc,2)
bad=deepcopy(frag);bad["html"]=html.replace('id="root"','id="other"')
source_check("changed-containing-block",bad,raw,fc,2)
bad=deepcopy(frag);bad["style"]["inline"]["padAfter"]["px"]=3
source_check("changed-style-hint",bad,raw,fc,2)
bad=deepcopy(raw);bad["evidence"][0]["target"]="other"
source_check("wrong-target-binding",frag,bad,fc,2)
print("7 canonical-source tests passed",flush=True)
