"""Red-stage regression for the new proof protocol."""
import json,sys,subprocess
from relational import evaluate,create_cert,run
from pathlib import Path
from copy import deepcopy
def a(x=0,y=0,c=0):return dict(coefficient=str(x),heightCoefficient=str(y),constant=str(c))
def box(x,y,w,h,guards=None):
 return dict(rect=dict(inlineStart=x,blockStart=y,inlineSize=w,blockSize=h),constraints=guards or [])
p=dict(id="web",viewport=dict(min=320,max=1920,height=dict(min=320,max=1080)),safeArea=dict(left=0,right=0,top=0,bottom=0))
def report(kind,rows,**kwargs):
 c=dict(id="test",kind=kind,**kwargs)
 return dict(evidence=[dict(state="s",profile="web",target=id,rows=rs) for id,rs in rows.items()],report=dict(environment=dict(profiles=[p]),contract=dict(contracts=[c])))
def ref(t,f):return dict(target=t,field=f)
def cmp(relation,left,right):return dict(op="compare",relation=relation,left=left,right=right)
def mk(op,*items):return dict(op=op,items=list(items))
base=box(a(),a(),a(1),a(0,1))
left=box(a(),a(),a(c=100),a(c=100))
right=box(a(c=100),a(),a(c=100),a(c=100))
bad=box(a(),a(),a(1),a(c=400))
def with_axes(r,ax):
 r=deepcopy(r)
 r["evidence"][0]["axes"]=[ax]
 for v in r["evidence"][0]["rows"]:
  v["rect"]={k:x for k,x in v["rect"].items() if k.startswith(ax)}
 return r

# Continuous piecewise coordinates across the strict/non-strict split.
moving_a=box(a(),a(),a(c=100),a(c=100),[{**a(-1,0,600),"strict":False}])
moving_b=box(a(1,0,-600),a(),a(c=100),a(c=100),[{**a(1,0,-600),"strict":True}])
vertical=with_axes(report("predicate",{"a":[base]},predicate=cmp("le",ref("a","blockEnd"),dict(environment="safeBottom"))),"block")
tests=[
 ("within",report("within-viewport",{"a":[base]},target="a"),"verified",None),
 ("overflow",report("within-viewport",{"a":[bad]},target="a"),"violated",{"width":"320","height":"360"}),
 ("contains",report("contains",{"a":[base],"b":[left]},target="a",other="b"),"verified",None),
 ("disjoint-touch",report("disjoint",{"a":[left],"b":[right]},target="a",other="b"),"verified",None),
 ("disjoint-overlap",report("disjoint",{"a":[left],"b":[left]},target="a",other="b"),"violated",{"width":"320","height":"320"}),
 ("min-size",report("min-size",{"a":[left]},target="a",width=100,height=100),"verified",None),
 ("strict-internal",report("predicate",{"a":[base]},predicate=cmp("gt",ref("a","inlineSize"),"320")),"violated",{"width":"320","height":"400"}),
 ("not-eq",report("predicate",{"a":[base]},predicate=dict(op="not",item=cmp("eq",ref("a","inlineSize"),"0"))),"verified",None),
 ("boolean-or",report("predicate",{"a":[base]},predicate=mk("any",cmp("lt",ref("a","inlineSize"),"600"),cmp("ge",ref("a","inlineSize"),"600"))),"verified",None),
 ("block-only",vertical,"verified",None),
 ("fractional-witness",report("predicate",{"a":[base]},predicate=cmp("ge",ref("a","inlineSize"),"641/2")),"violated",{"width":"1281/4","height":"400"}),
 ("piecewise",report("predicate",{"a":[moving_a,moving_b]},predicate=cmp("le",ref("a","inlineEnd"),dict(environment="width"))),"verified",None),
 ("zero-size-disjoint",report("disjoint",{"a":[box(a(c=10),a(c=10),a(),a(c=100))],"b":[left]},target="a",other="b"),"verified",None),
 ("scale-add",report("predicate",{"a":[base]},predicate=cmp("eq",dict(op="scale",factor="1/2",item=dict(op="add",items=[ref("a","inlineEnd"),ref("a","inlineSize")])),dict(environment="width"))),"verified",None),
]
out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
if __name__=="__main__":
 kernel=[]
 for name,r,status,w in tests:
  f=out/(name+".json");f.write_text(json.dumps(r))
  cp=out/(name+"-cert.json")
  actual,msg,plan=evaluate(sys.argv[1],f,"s","web","test",cp,w)
  assert actual==status,(name,actual,status,msg)
  kernel.append(dict(problem=plan["problem"],certificate=json.loads(cp.read_text()),status=status,id=name))
  print(name,actual,flush=True)
 (out/"kernel-input.json").write_text(json.dumps(kernel))
 print(len(tests),"cases passed",flush=True)
 # Untrusted certificates cannot substitute a weaker contract or a different
 # source, remove obligations, use a non-counterexample, or ignore a hole.
 def ck(name,mode,report,cert,expected=2):
  rp=out/(name+"-source.json");cp=out/(name+"-payload.json")
  rp.write_text(json.dumps(report));cp.write_text(json.dumps(cert))
  q=run(sys.argv[1],mode,rp,"s","web","test",cp)
  assert q.returncode==expected,(name,q.returncode,q.stdout,q.stderr)
  print(name,q.stdout.strip() or q.stderr.strip(),flush=True)
 yes=json.loads((out/"within-cert.json").read_text())
 no=json.loads((out/"overflow-cert.json").read_text())
 good=tests[0][1];badreport=tests[1][1]
 v=deepcopy(yes);v["goals"]=[]
 ck("omitted-goal","verify",good,v)
 v=deepcopy(yes);v["model"]["dimensions"]=[]
 ck("omitted-dimension","verify",good,v)
 v=deepcopy(yes);v["model"]["agreement"]=[]
 ck("omitted-agreement","verify",good,v)
 ck("different-source","verify",badreport,yes)
 v=deepcopy(no);v["point"]["y"]=800
 ck("non-violating-point","violate",badreport,v)
 v=deepcopy(no);v["point"]["den"]=0
 ck("zero-denominator","violate",badreport,v)
 v=deepcopy(no);v["point"]["x"]=100
 ck("out-of-domain-point","violate",badreport,v)
 v=deepcopy(good);v["evidence"].append(deepcopy(v["evidence"][0]))
 ck("ambiguous-source","verify",v,yes)
 v=with_axes(good,"inline")
 ck("missing-block-axis","verify",v,yes)
 v=deepcopy(good);v["report"]["contract"]["contracts"][0]["profiles"]=["other"]
 ck("wrong-profile","verify",v,yes)
 v=deepcopy(good);v["report"]["contract"]["contracts"][0]["states"]=["other"]
 ck("wrong-state","verify",v,yes)
 v=deepcopy(good);v["evidence"][0]["rows"][0]["constraints"]=[{**a(1,0,-320),"strict":True}]
 ck("strict-boundary-hole","verify",v,yes)
 v=deepcopy(good);v["evidence"][0]["rows"][0]["rect"]["inlineSize"]=a(c=-1)
 ck("negative-dimension","verify",v,yes)
 v=deepcopy(good);v["evidence"][0]["rows"].append(left)
 ck("contradictory-overlap","verify",v,yes)
 v=deepcopy(good);v["report"]["contract"]["contracts"][0]["kind"]="stable";v["report"]["contract"]["contracts"][0]["event"]="go"
 ck("unsupported-event","verify",v,yes)
 print("15 negative certificate/source tests passed",flush=True)
