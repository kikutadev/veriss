// Normalize thrown values at the engine boundary, retaining only valid diagnostic evidence.
import type {Rational} from './linear.mjs';
import type {Point,Affine2,HalfPlane,Region} from './region.mjs';
import type {NormalizedBox} from '../tree.mjs';
import type {Axis} from './engine-types.mjs';
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null;
const str=(v:unknown)=>typeof v==='string'?v:undefined;
const num=(v:unknown)=>typeof v==='number'?v:undefined;
const rational=(v:unknown):v is Rational=>record(v)&&typeof v.n==='bigint'&&typeof v.d==='bigint'&&v.d>0n;
const point=(v:unknown):v is Point=>record(v)&&rational(v.x)&&rational(v.y);
const affine=(v:unknown):v is Affine2=>record(v)&&rational(v.x)&&rational(v.y)&&rational(v.b);
const halfPlane=(v:unknown):v is HalfPlane=>record(v)&&affine(v.slack)&&typeof v.strict==='boolean';
const region=(v:unknown):v is Region=>record(v)&&Array.isArray(v.vertices)&&v.vertices.length>0&&v.vertices.every(point)&&Array.isArray(v.constraints)&&v.constraints.every(halfPlane);
interface ErrorBox {label:string;path:string;source?:NormalizedBox['source']}
function box(v:unknown):ErrorBox|undefined {
  if(!record(v)||typeof v.label!=='string'||typeof v.path!=='string')return undefined;
  const source=v.source;
  return {label:v.label,path:v.path,...(record(source)&&typeof source.start==='number'&&typeof source.end==='number'?{source:{start:source.start,end:source.end}}:{})};
}
export function layoutError(value:unknown) {
  const v=record(value)?value:{}, css=record(v.css)?v.css:{};
  const axis:Axis|undefined=v.axis==='inline'||v.axis==='block'?v.axis:undefined;
  return {code:str(v.code),message:str(v.message)??String(value),box:box(v.box),region:region(v.region)?v.region:undefined,axis,line:num(css.line),file:str(css.file),ancestor:str(v.ancestor),ancestorPath:str(v.ancestorPath),property:str(v.property)};
}
