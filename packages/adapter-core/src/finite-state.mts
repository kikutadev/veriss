// Deliberately closed boolean fragment. No JavaScript evaluation. Framework
// adapters validate the entire component and hand us literal assignments.
import {parseFragment, type DefaultTreeAdapterTypes as Tree} from 'parse5';
import {createStateIR, type StateIR, type StateInput, type EnvironmentProfile, type Relation, type Observation, type RelationalProofSession, type RelationalProof} from '@mizchi/veriss/contracts';
import {domGeometry,verifyUI,type GeometryInput} from './ui-contracts.mjs';
import type {Choices} from './noshift.mjs';

type Framework = 'react'|'vue'|'svelte';
type BooleanValues = Record<string,boolean>;
type Condition = {variable:string;negate:boolean};
export type FiniteExpression = {value:boolean;variable?:never} | (Condition & {value?:never});
export interface FiniteHandler {variable:string;expression:FiniteExpression}
export interface FiniteVariant {id:string;values:BooleanValues;html:string}
interface FiniteExpansion {states:{html:string;choices:Choices}[];unknowns:readonly unknown[];assumptions:readonly string[];css:string}
export interface FiniteDerived {status:'derived';framework:Framework;scopedCSS:boolean;state:StateIR;variants:FiniteVariant[];css:string;assumptions:string[];reason?:string}
export interface FiniteUnknown {status:'unknown';reason:string;scopedCSS?:boolean}
export type FiniteAnalysis = FiniteDerived|FiniteUnknown;
export interface FiniteUIOptions {
  profiles: readonly EnvironmentProfile[];
  contracts: readonly Relation[];
  targets: readonly string[];
  css?:string;
  geometrySession?:{domGeometry:typeof domGeometry};
  proofSession?:Pick<RelationalProofSession,'verifyUI'>;
  boxes?:GeometryInput['boxes']; knownFonts?:GeometryInput['knownFonts']; defaultFontSize?:number;
  observations?:readonly Observation[];
}
type UnknownProof = {status:'unknown';outcome:'unknown';reason:string};
const record = (n:unknown): n is Record<string,unknown> => n!==null&&typeof n==='object';


export function requireFinite(condition:unknown,message:string):asserts condition {if(!condition)throw Error(message)};
const need: typeof requireFinite=requireFinite;
export const finiteName=(n:unknown):boolean=>typeof n==='string'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)&&!Object.hasOwn(Object.prototype,n);
export const finiteBool=(n:unknown):n is {type:'BooleanLiteral'|'Literal';value:boolean}=>record(n)&&typeof n.type==='string'&&['BooleanLiteral','Literal'].includes(n.type)&&typeof n.value==='boolean';
export const finiteString=(n:unknown):n is {type:'StringLiteral'|'Literal';value:string}=>record(n)&&typeof n.type==='string'&&['StringLiteral','Literal'].includes(n.type)&&typeof n.value==='string';
export const finiteCondition=(n:unknown,vars:ReadonlyMap<string,boolean>):Condition=>{
 if(record(n)&&n.type==='Identifier'&&typeof n.name==='string'&&vars.has(n.name))return {variable:n.name,negate:false};
 if(record(n)&&n.type==='UnaryExpression'&&n.operator==='!'&&record(n.argument)&&n.argument.type==='Identifier'&&typeof n.argument.name==='string'&&vars.has(n.argument.name))return {variable:n.argument.name,negate:true};
 throw Error('Condition must be a declared boolean or its negation');
};
export const finiteUpdate=(n:unknown,vars:ReadonlyMap<string,boolean>):FiniteExpression=>finiteBool(n)?{value:n.value}:finiteCondition(n,vars);
export function finiteTag(tag:string,ancestorTags:readonly string[]){
 need(['div','main','section','header','footer','nav','aside','article','span','p','button'].includes(tag),'Unsupported element '+tag);
 need(!ancestorTags.includes('button')||['span'].includes(tag),'Invalid nested button content');
 need(!ancestorTags.some(t=>t==='p'||t==='span')||['span'].includes(tag),'Unsupported phrasing nesting');
}
export function finiteAttribute(name:string,value:unknown):asserts value is string{
 need(/^(?:id|class|className|role|title|aria-label|data-[a-z0-9_-]+|type)$/.test(name)&&typeof value==='string','Unsupported attribute '+name);
 if(name==='type')need(value==='button','Only button type is supported');
 if(name==='id')need(value!=='app'&&/^[A-Za-z_][A-Za-z0-9_-]{0,100}$/.test(value),'Static unique id required (app is the mount root)');
}
export const finiteAttempt=<T,>(fn:()=>T):T|FiniteUnknown=>{try{return fn()}catch(e){return {status:'unknown',reason:e instanceof Error?e.message:String(e)}}};
export function buildFiniteState(expanded:FiniteExpansion,variables:ReadonlyMap<string,boolean>,handlers:ReadonlyMap<string,FiniteHandler>,{framework,scopedCSS=false}:{framework:Framework;scopedCSS?:boolean}):FiniteDerived{
 need(variables.size>0&&variables.size<=6&&handlers.size<=128,'Finite state variable or handler limit');
 need(!expanded.unknowns.length&&!expanded.assumptions.length&&expanded.states.length>0,'Template expansion is incomplete or uses placeholder values');
 for(const v of expanded.states)need(Object.entries(v.choices).every(([k,val])=>variables.has(k)&&typeof val==='boolean'),'Unsupported render choice');
 const names=[...variables.keys()],initial=Object.fromEntries(variables),states:string[]=[],variants:FiniteVariant[]=[],transitions:StateInput["transitions"][number][]=[],ids=new Map<string,string>();
 const intern=(values:BooleanValues):string=>{
  const k=JSON.stringify(names.map(n=>values[n]));
  const existing=ids.get(k);if(existing!==undefined)return existing;
  need(states.length<64,'Finite state limit');
  const id='s'+states.length;ids.set(k,id);states.push(id);variants.push({id,values,html:''});return id;
 };
 intern(initial);
 for(const variant of variants){
  const matches=expanded.states.filter(v=>Object.entries(v.choices).every(([k,val])=>variant.values[k]===val));
  need(matches.length===1&&matches[0],'Render variants do not uniquely cover reachable value');
  variant.html=matches[0].html;
  const nodes=new Map<string,Tree.Element>(),walk=(n:Tree.Node)=>{if('tagName' in n){const id=n.attrs.find(a=>a.name==='id')?.value;if(id){need(!nodes.has(id),'Duplicate rendered id');nodes.set(id,n)}}if('childNodes' in n)for(const c of n.childNodes)walk(c)};
  walk(parseFragment(variant.html));
  for(const [target,update] of handlers){
   const node=nodes.get(target);if(!node)continue;
   need(node.tagName==='button','Click target must remain a button');
   const value=update.expression.variable===undefined?update.expression.value:variant.values[update.expression.variable]!==update.expression.negate;
   const to=intern({...variant.values,[update.variable]:value});
   transitions.push({from:variant.id,event:'click:'+target,to});
   need(transitions.length<=256,'Finite transition limit');
  }
 }
 return {status:'derived',framework,scopedCSS,state:createStateIR({initial:'s0',states,transitions}),variants,css:expanded.css,
  assumptions:['Closed standalone component, stable render between single dispatched button clicks; no external props, remounts, effects, event batching, arbitrary callbacks or asynchronous writes. Click dispatch is modeled, not visibility, hit testing or browser action success.']};
}
export function verifyFiniteUI(analysis:FiniteAnalysis,{profiles,contracts,targets,css='',geometrySession,proofSession,boxes,knownFonts,defaultFontSize,observations=[]}:FiniteUIOptions):RelationalProof|UnknownProof{
 if(analysis.status!=='derived'||analysis.scopedCSS)return {status:'unknown',outcome:'unknown',reason:analysis.reason??(analysis.scopedCSS?'Scoped component CSS requires a compiled geometry snapshot':'Finite state graph unavailable')};
 // Keep the derivation assumptions visible in every environment; use the
 // same profile for evidence and validation. Caller supplies CSS environment.
 const scoped=profiles.map(p=>({...p,assumptions:[...(p.assumptions??[]),...analysis.assumptions,'Geometry is for the standalone #app mount and closed supplied CSS, not caller-specific wrappers or inherited context.']}));
 const {initial,states,transitions}=analysis.state;
 const mount='<div id="app"'+(analysis.framework==='vue'?' data-v-app=""':'')+'>';
 const evidence=analysis.variants.flatMap(v=>scoped.flatMap(profile=>(geometrySession?.domGeometry??domGeometry)({
  state:v.id,profile,targets,html:'<!doctype html><html lang="en"><head><title>Component</title></head><body>'+mount+v.html+'</div></body></html>',css:css+'\n'+analysis.css,...(boxes===undefined?{}:{boxes}),...(knownFonts===undefined?{}:{knownFonts}),...(defaultFontSize===undefined?{}:{defaultFontSize})
 })));
 return (proofSession?.verifyUI??verifyUI)({model:{version:1,initial,states,transitions,profiles:scoped,contracts},evidence,observations});
}
