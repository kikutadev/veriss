"""Closed source cascade: compare Lean with real veriss piecewise geometry."""
import json, subprocess, sys
from copy import deepcopy
from pathlib import Path
from relational import run, create_model, prove

checker=sys.argv[1]
out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
def length(px=0,percent=0):return dict(px=px,vw=0,vh=0,percent=percent,den=1)
def axis(off,size):return dict(offset=length(px=off),size=size,padBefore=length(px=2),padAfter=length(px=2),borderBefore=length(px=1),borderAfter=length(px=1))
base=dict(version=1,kind="viewport-anchored-computed-style",position="absolute",borderBox=False,
          inline=axis(10,length(percent=40)),block=axis(20,length(px=60)))
html='<!doctype html><html lang="en"><head><title>Layout</title></head><body><div id="root"><div id="target" class="panel"></div></div></body></html>'
css='*{margin:0;padding:0;border:0;box-sizing:border-box}#root{position:relative;width:100%;height:100vh}#target{position:absolute;left:10px;top:20px;width:40%;height:60px;padding-top:2px;padding-right:2px;padding-bottom:2px;padding-left:2px;border-style:solid;border-top-width:1px;border-right-width:1px;border-bottom-width:1px;border-left-width:1px;box-sizing:content-box}'
def rule(prop,value,*,id=None,cls=None,tag=False,important=False,media=None):
    return dict(selector=dict(id=id,cls=cls,tag=tag),property=prop,value=value,important=important,media=media)
def media(axis,min,bound):return dict(horizontal=axis,minimum=min,bound=bound)
# CSS written independently from checker renderer, including ties and narrow
# media intersections. Nonmatching selector has higher specificity but no effect.
rules=[rule("width",length(percent=55),cls="panel"),
       rule("width",length(percent=99),id="missing",cls="panel"),
       rule("width",length(percent=30),id="target",cls="panel"),
       rule("width",length(percent=80),id="target"),
       rule("width",length(percent=35),id="target",cls="panel"),
       rule("left",length(px=12),cls="panel",important=True),
       rule("left",length(px=90),id="target"),
       rule("height",length(px=95),id="target",media=media(True,True,601)),
       rule("height",length(px=60),id="target",media=media(True,True,603))]
extra='.panel{width:55%}#missing.panel{width:99%}#target.panel{width:30%}#target{width:80%}#target.panel{width:35%}.panel{left:12px!important}#target{left:90px}@media (min-width:601px){#target{height:95px}}@media (min-width:603px){#target{height:60px}}'
src=dict(version=1,root="root",target="target",cls="panel",html=html,css=css+extra,base=base,rules=rules)
js="""
import {analyzeHTML} from '../../packages/veriss/src/html.mjs';
import {createLayoutIR,layoutGeometry} from '../../packages/veriss/src/layout-contract.mjs';
let x='';for await(const c of process.stdin)x+=c;
const {source:f,profile}=JSON.parse(x);
const r=analyzeHTML(f.html,{css:f.css,viewport:profile.viewport,mediaFeatures:profile.mediaFeatures});
console.log(JSON.stringify({status:r.status,diagnostics:r.diagnostics,report:{environment:{profiles:[profile]}},evidence:layoutGeometry({state:'s',profile,layout:createLayoutIR(r),targets:[f.target]})}));
"""
def producer(source,profile=None):
    if profile is None:profile=dict(id="p",viewport=dict(min=320,max=1200,height=dict(min=320,max=900)))
    return json.loads(subprocess.check_output(["node","--input-type=module","-e",js],input=json.dumps(dict(source=source,profile=profile)),text=True))
def write(name,v):
    p=out/(name+".json");p.write_text(json.dumps(v));return p
def make(name,s,r):
    q=run(checker,"cascade-plan",write(name+"-source",s),write(name+"-report",r),"s","p")
    assert q.returncode==0,(name,q.stdout,q.stderr)
    p=json.loads(q.stdout);write(name+"-plan",p)
    return dict(model=create_model(p["plan"]),admissibility=[prove(c) for c in p["admissibility"]],agreement=[prove(c) for c in p["agreement"]])
def check(name,s,r,c,wanted):
    q=run(checker,"cascade-check",write(name+"-source",s),write(name+"-report",r),"s","p",write(name+"-cert",c))
    assert q.returncode==wanted,(name,q.returncode,q.stdout,q.stderr)
    print(name,q.stdout.strip() or q.stderr.strip(),flush=True)
raw=producer(src)
assert raw["status"]=="verified",raw["diagnostics"]
c=make("cascade",src,raw)
check("cascade",src,raw,c,0)
bad=deepcopy(src);bad["rules"][0]["selector"]["cls"]="elsewhere"
check("selector-hint",bad,raw,c,2)
bad=deepcopy(src);bad["rules"][4],bad["rules"][2]=bad["rules"][2],bad["rules"][4]
check("source-order-hint",bad,raw,c,2)
bad=deepcopy(src);bad["css"]+="#target{width:50%}"
check("extra-declaration",bad,raw,c,2)
bad=deepcopy(src);bad["rules"][5]["important"]=False
check("importance-hint",bad,raw,c,2)
bad=deepcopy(src);bad["rules"][7]["media"]["bound"]=602
check("breakpoint-hint",bad,raw,c,2)
bad=deepcopy(raw);bad["evidence"][0]["rows"][0]["rect"]["inlineSize"]["constant"]="0"
check("incorrect-geometry",src,bad,c,2)
bad=deepcopy(c);bad["agreement"].pop()
check("omitted-agreement",src,raw,bad,2)
bad=deepcopy(c);bad["admissibility"].pop()
check("omitted-admissibility",src,raw,bad,2)
bad=deepcopy(src);bad["rules"].append(rule("width",length(percent=1),id="root"));bad["css"]+="#root{width:1%}"
check("root-override",bad,raw,c,2)
bad=deepcopy(src);bad["rules"][0]["value"]["px"]=-1;bad["rules"][0]["value"]["percent"]=0;bad["css"]=bad["css"].replace(".panel{width:55%}",".panel{width:-1px}")
check("invalid-size",bad,raw,c,2)
# Geometry from a different, individually valid source cannot be
# used to prove the narrow branch, even with a newly generated model cert.
wrong=deepcopy(src);wrong["css"]=wrong["css"].replace("min-width:601px","min-width:602px")
wrong_raw=producer(wrong)
assert wrong_raw["status"]=="verified"
try:
    make("shifted-breakpoint",src,wrong_raw)
except ValueError as e:
    assert "satisfiable obligation" in str(e)
    print("shifted-breakpoint rejected by exact agreement obligations",flush=True)
else:
    raise AssertionError("incorrect source binding certifiable")
# Height and max-width boundaries, including their exact intersection.
second=deepcopy(src)
second["rules"]=[rule("top",length(px=40),id="target",tag=True,media=media(False,False,500)),
                 rule("width",length(percent=25),id="target",media=media(True,False,600))]
second["css"]=css+"@media (max-height:500px){div#target{top:40px}}@media (max-width:600px){#target{width:25%}}"
profile=dict(id="p",viewport=dict(min=320,max=1200,height=dict(min=320,max=900)),
             mediaFeatures={"pointer":"fine","hover":"hover","prefers-reduced-motion":"reduce"},ua="firefox",dpr=1.25,
             safeArea=dict(top=1,right=2,bottom=3,left=4),input="mouse",fontProfile="system",assumptions=["closed fixture"])
raw2=producer(second,profile)
assert raw2["status"]=="verified",raw2["diagnostics"]
c2=make("two-axis-media",second,raw2)
check("two-axis-media",second,raw2,c2,0)
for field,value in [("ua","webkit"),("dpr",2),("mediaFeatures",{"pointer":"coarse"}),("fontProfile","other"),("safeArea",{"top":0,"right":2,"bottom":3,"left":4}),("assumptions",[])]:
    bad=deepcopy(raw2);bad["report"]["environment"]["profiles"][0][field]=value
    check("profile-"+field,second,bad,c2,2)
bad=deepcopy(raw2);del bad["evidence"][0]["profileKey"]
check("missing-profile-key",second,bad,c2,2)
bad=deepcopy(raw2);bad["evidence"][0]["profileKey"]="not json"
check("malformed-profile-key",second,bad,c2,2)
# A real producer profileKey with reversed object order remains equivalent.
bad=deepcopy(raw2);p=bad["report"]["environment"]["profiles"][0];p["mediaFeatures"]=dict(reversed(list(p["mediaFeatures"].items())))
check("media-order-independent",second,bad,c2,0)
# The ordinary relational path shares the profile identity validator.
rel=deepcopy(raw2);rel["report"]["contract"]={"contracts":[{"id":"fit","kind":"within-viewport","target":"target"}]}
def relation_plan(name,r,want):
    q=run(checker,"plan",write(name+"-report",r),"s","p","fit")
    assert q.returncode==want,(name,q.stdout,q.stderr)
    print(name,"planned" if want==0 else q.stderr.strip(),flush=True)
relation_plan("relational-profile",rel,0)
bad=deepcopy(rel);bad["report"]["environment"]["profiles"][0]["ua"]="webkit"
relation_plan("relational-profile-mismatch",bad,2)
bad=deepcopy(rel);del bad["evidence"][0]["profileKey"]
relation_plan("relational-media-without-key",bad,2)
print("25 cascade/profile tests passed",flush=True)
