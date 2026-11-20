// CLI JSON boundary. The core remains the authority for model/evidence
// semantics, limits and coverage; this module checks values the CLI reads.
import {createEnvironmentIR} from '../packages/veriss/src/layout-contract.mjs';
import type {EnvironmentProfile,UIModel} from '../packages/veriss/src/layout-contract.mjs';

export function isRecord(value:unknown):value is Record<string,unknown>{
  return typeof value==='object'&&value!==null&&!Array.isArray(value);
}
export function record(value:unknown,label:string):Record<string,unknown>{
  if(!isRecord(value))throw new TypeError('Invalid '+label);
  return value;
}
export function array(value:unknown,label:string):unknown[]{
  if(!Array.isArray(value))throw new TypeError('Invalid '+label);
  return value;
}
export function string(value:unknown,label:string):string{
  if(typeof value!=='string')throw new TypeError('Invalid '+label);
  return value;
}
export function strings(value:unknown,label:string):string[]{
  return array(value,label).map(v=>string(v,label));
}
export function stringRecord(value:unknown,label:string):Record<string,string>{
  return Object.fromEntries(Object.entries(record(value,label)).map(([k,v])=>[k,string(v,label)]));
}
export function objectRecord(value:unknown,label:string):Record<string,object>{
  return Object.fromEntries(Object.entries(record(value,label)).map(([k,v])=>[k,record(v,label)]));
}
export function profiles(value:unknown):EnvironmentProfile[]{
  // createEnvironmentIR validates every field before constructing the IR.
  // This assertion is confined to its serialized-input boundary.
  const input=array(value,'profiles') as EnvironmentProfile[];
  createEnvironmentIR(input);
  return input;
}
export function uiModel(value:unknown):UIModel{
  const input=record(value,'UI model');
  if(input.version!==1)throw new TypeError('Invalid UI model version/fields');
  string(input.initial,'initial state');strings(input.states,'states');
  array(input.transitions,'transitions');array(input.contracts,'contracts');
  profiles(input.profiles);
  // State/contract/predicate validation is performed by verifyUI. Do not
  // normalize or discard fields, including unknown fields, before that call.
  return value as UIModel;
}
