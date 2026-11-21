"""Compare independent finite-machine semantics with all three adapter outputs."""
import json, subprocess, sys
from copy import deepcopy
from html.parser import HTMLParser
from pathlib import Path
from relational import run

checker=sys.argv[1]
out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
js="""
import {deriveReactState} from '../../packages/react-adapter/src/index.mjs';
import {deriveVueState} from '../../packages/vue-adapter/src/index.mjs';
import {deriveSvelteState} from '../../packages/svelte-adapter/src/index.mjs';
console.log(JSON.stringify([
deriveReactState('import {useState} from "react"; export default function C(){const [open,setOpen]=useState(false);return <div><button id="toggle" onClick={()=>setOpen(!open)}>Toggle</button>{open&&<button id="close" onClick={()=>setOpen(false)}>Close</button>}</div>}'),
deriveVueState('<script setup>import {ref} from "vue";const open=ref(false)</script><template><div><button id="toggle" @click="open = !open">Toggle</button><button v-if="open" id="close" @click="open = false">Close</button></div></template>'),
deriveSvelteState('<script>let open=$state(false)</script><div><button id="toggle" onclick={()=>open=!open}>Toggle</button>{#if open}<button id="close" onclick={()=>open=false}>Close</button>{/if}</div>')
]));
"""
adapters=json.loads(subprocess.check_output(["node","--input-type=module","-e",js],text=True))
class Buttons(HTMLParser):
 def __init__(self):
    super().__init__();self.ids=[]
 def handle_starttag(self,tag,attrs):
    if tag=="button":self.ids.append(dict(attrs)["id"])
machine=dict(variables=["open"],initial=[False],
 handlers=[dict(target="toggle",variable=0,expression=dict(variable=0,negate=True)),
           dict(target="close",variable=0,expression=dict(value=False,negate=False))],
 renders=[dict(id="closed",choices=[[0,False]],buttons=["toggle"]),
          dict(id="open",choices=[[0,True]],buttons=["toggle","close"])])
def check(name,i,wanted):
 p=out/(name+".json");p.write_text(json.dumps(i))
 q=run(checker,"finite-check",p)
 assert q.returncode==wanted,(name,q.stdout,q.stderr)
 print(name,q.stdout.strip() or q.stderr.strip(),flush=True)
for a in adapters:
 assert a["status"]=="derived",a
 vs=[]
 for v in a["variants"]:
    val=v["values"]["open"];r=machine["renders"][int(val)]
    b=Buttons();b.feed(v["html"]);assert b.ids==r["buttons"]
    vs.append(dict(id=v["id"],values=[val],render=r["id"]))
 i=dict(machine=machine,graph=dict(initial=a["state"]["initial"],states=a["state"]["states"],
    profiles=["web","touch"],edges=a["state"]["transitions"]),variants=vs)
 check(a["framework"],i,0)
bad=deepcopy(i);bad["graph"]["edges"].pop()
check("missing-dispatch",bad,2)
bad=deepcopy(i);bad["graph"]["edges"][0]["to"]="s0"
check("wrong-toggle",bad,2)
bad=deepcopy(i);bad["graph"]["edges"].append(dict(**{"from":"s0","event":"click:close","to":"s0"}))
check("invented-hidden-button",bad,2)
bad=deepcopy(i);bad["variants"][1]["render"]="closed"
check("wrong-render",bad,2)
bad=deepcopy(i);bad["machine"]["renders"][1]["choices"]=[]
check("ambiguous-render",bad,2)
bad=deepcopy(i);bad["machine"]["initial"]=[True]
check("wrong-initial",bad,2)
bad=deepcopy(i);bad["graph"]["edges"][0]["profiles"]=["web"]
check("profile-restriction",bad,2)
bad=deepcopy(i);bad["variants"].pop()
check("missing-valuation",bad,2)
bad=deepcopy(i);bad["machine"]["handlers"][0]["expression"]={"variable":0,"value":True,"negate":False}
check("ambiguous-assignment",bad,2)
bad=deepcopy(i);bad["machine"]["effect"]="external"
check("unknown-effect",bad,2)
print("13 finite-state tests passed",flush=True)
