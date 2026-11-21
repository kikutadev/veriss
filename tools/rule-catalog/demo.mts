// Static-site demo: execute the same TypeScript-origin veriss core used by the
// example generator, bundled into a browser ESM module during page build.
import {run} from './run.mjs';
import {examples, sides} from './examples.mjs';
import type {CatalogInput,CatalogExample} from './examples.mjs';

const node = <T extends HTMLElement>(id:string):T => {
  const el=document.getElementById(id);
  if(!el) throw new Error(`Missing demo element: ${id}`);
  return el as T;
};
const picker=node<HTMLSelectElement>('demo-case');
const htmlEditor=node<HTMLTextAreaElement>('demo-html');
const cssEditor=node<HTMLTextAreaElement>('demo-css');
const caption=node<HTMLElement>('demo-caption');
const status=node<HTMLOutputElement>('demo-status');
const findings=node<HTMLUListElement>('demo-findings');
const preview=node<HTMLIFrameElement>('demo-preview');
const ng=node<HTMLButtonElement>('demo-ng');
const ok=node<HTMLButtonElement>('demo-ok');
const runButton=node<HTMLButtonElement>('demo-run');

// A few of the F116–F133 rules added in the upstream sync. Unlike the
// image gallery, these are fed directly into the current TypeScript verifier.
const recent:CatalogExample[]=[
  {id:'f116',html:'<main><div class="x"></div></main>',css:'.x{height:30px;background:#cce0ff}',shot:375,mark:'.x',accessibility:false,
    ng:{css:'.x{will-change:transform opacity}',caption:'F116: カンマのない will-change は無効。ブラウザーはその宣言を捨てます。'},
    ok:{css:'.x{will-change:transform, opacity}',caption:'F116: カンマ区切りにすると警告はなくなります。'}},
  {id:'f129',html:'<main><dialog open><p>Dialog</p></dialog></main>',css:'dialog{padding:10px;border:1px solid #d1d5db}',shot:375,mark:'dialog',accessibility:false,
    ng:{caption:'F129: 全要素のmarginを0にするとdialogの中央寄せが失われます。ダイアログ自体の配置モデルはUnknownです。'},
    ok:{css:'dialog{margin:auto}',caption:'F129: dialogのmarginをautoに戻すと警告は消えます。UAによる配置は引き続きUnknownです。'}},
  {id:'f133',html:'<main><div class="a"></div></main>',css:'.a{height:60px;background:#cce0ff}',shot:375,mark:'.a',accessibility:false,
    ng:{css:'.a{width:50cqw}',caption:'F133: 祖先にcontainer-typeがないので50cqwはコンテナ幅ではなく小ビューポート幅を参照します。'},
    ok:{css:'.a{width:50svw}',caption:'F133: ビューポート幅を意図するなら50svwと書けば明示できます。'}},
];
const allExamples=[...recent,...examples];
const labels:Record<string,string>={f116:'F116 · will-change',f129:'F129 · dialogの中央寄せ',f133:'F133 · コンテナ単位',syntax:'CSSの書き間違い',inert:'効かない宣言',atrule:'@media構文',selector:'セレクタとDOM',state:'フォーカス',html:'HTMLの組み替え',overflow:'画面のはみ出し',occluded:'ボタンの覆い',contrast:'文字のコントラスト',focus:'フォーカス表示',target:'タップ領域',shift:'hoverによるレイアウトシフト',browser:'ブラウザー差',unknown:'Unknownの扱い',aria:'ARIA属性'};
for(const example of allExamples){
  const option=document.createElement('option');
  option.value=example.id;
  option.textContent=labels[example.id] ?? example.id;
  picker.append(option);
}
let selected:CatalogInput|null=null;
let side:'ng'|'ok'='ng';
let modified=false;

function markStale():void{
  modified=true;
  status.textContent='未検査の変更があります';
  status.dataset.status='unknown';
  findings.replaceChildren();
}
function renderPreview():void{
  const html=htmlEditor.value;
  const css=cssEditor.value.replace(/<\/style/gi,'<\\/style');
  preview.srcdoc=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}html,body{margin:0}${css}</style><body>${html}</body></html>`;
}
function inspect():void{
  status.textContent='解析中…';
  status.dataset.status='';
  findings.replaceChildren();
  renderPreview();
  try {
    const result=run({html:htmlEditor.value,css:cssEditor.value,vw:[375,1280],accessibility:modified ? true : selected?.accessibility ?? true,...(!modified && selected?.boxes ? {boxes:selected.boxes} : {})});
    const count=result.findings.length;
    const warnings=result.findings.filter(d=>d.code.startsWith('W_')).length;
    const unknowns=result.findings.filter(d=>d.code.startsWith('U_')).length;
    status.dataset.status=result.status==='verified' && warnings>0 ? 'warning' : result.status;
    status.textContent=`${result.status.toUpperCase()} · 警告${warnings}件 / Unknown${unknowns}件`;
    if(count===0){
      const li=document.createElement('li');
      li.textContent='この入力で報告する診断はありません。';
      findings.append(li);
    }
    for(const issue of result.findings.slice(0,35)){
      const li=document.createElement('li');
      const code=document.createElement('span');
      code.className='code';
      code.textContent=`${issue.code}${issue.severity ? ' · '+issue.severity : ''}${issue.box ? ' · '+issue.box : ''}`;
      const explanation=document.createElement('span');
      explanation.className='desc';
      explanation.textContent=issue.message ?? '';
      li.append(code,explanation);
      findings.append(li);
    }
    if(count>35){
      const more=document.createElement('li');
      more.textContent=`ほか ${count-35} 件。入力を絞って再検査してください。`;
      findings.append(more);
    }
  } catch(err){
    status.textContent='この入力は解析できません';
    status.dataset.status='unknown';
    const li=document.createElement('li');
    li.textContent=err instanceof Error?err.message:String(err);
    findings.append(li);
  }
}
function loadPreset():void{
  const ex=allExamples.find(e=>e.id===picker.value);
  if(!ex)return;
  selected=sides(ex)[side==='ng'?0:1] ?? null;
  if(!selected)return;
  ng.setAttribute('aria-pressed',String(side==='ng'));
  ok.setAttribute('aria-pressed',String(side==='ok'));
  htmlEditor.value=selected.html;
  cssEditor.value=selected.css;
  caption.textContent=selected.caption;
  modified=false;
  inspect();
}
picker.addEventListener('change',()=>{side='ng';loadPreset();});
ng.addEventListener('click',()=>{side='ng';loadPreset();});
ok.addEventListener('click',()=>{side='ok';loadPreset();});
htmlEditor.addEventListener('input',markStale);
cssEditor.addEventListener('input',markStale);
runButton.addEventListener('click',inspect);
picker.value='f116';
loadPreset();
