/// <reference path="./variables-tokenizer.d.ts" />
export interface VariableToken {
  type: number; raw: string;
  children?: VariableToken[]; close?: ')' | ']' | '}';
  variable?: string; fallback?: VariableToken[];
}
type GroupToken = VariableToken & {children: VariableToken[]; close: ')' | ']' | '}'};
export interface VariableExpression {nodes: VariableToken[]; references: string[]; fallbackReferences: string[]}
export interface VariableDeclaration {expression: VariableExpression}
export interface PropertyRegistration {inherits: boolean; initial: string | null; syntax?: string}
export type VariableResult = {status: 'resolved'; tokens: string[]} | {status: 'invalid' | 'unknown'; message: string; code: string};
export interface VariableEnvironment {closed: boolean; lookup: (name: string) => VariableResult}
type Spend = (n?: number) => void;
type Cycle = {members: string[]; conditional: boolean};
function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing variable graph entry');
  return value;
}
import {tokenize,tokenTypes as T} from 'css-tree/tokenizer';

const namePattern=/^--[A-Za-z_][\w-]*$/;
const defaults=new Set(['initial','inherit','unset','revert','revert-layer']);
function fail(message: string,code='U_LAYOUT_VARIABLE'): never {throw Object.assign(new Error(message),{code});}
const limit=(message: string): never=>fail(message,'U_LAYOUT_LIMIT');
export const customName=(name: string)=>namePattern.test(name);

/** Parse token boundaries, including fallback edges; never replace raw substrings. */
export function variableValue(source: string): VariableExpression {
  if(source.length>65536) limit('CSS variable value exceeds 65536 UTF-16 units');
  const nodes: VariableToken[]=[],stack: {parent: VariableToken[]; node: GroupToken; close: number}[]=[],references=new Set<string>(),fallbackReferences=new Set<string>();let current=nodes,count=0;
  tokenize(source,(type,start,end)=>{
    if(++count>4096) limit('CSS variable value exceeds 4096 tokens');
    if(type===T.WhiteSpace || type===T.Comment) return;
    if(type===T.BadString || type===T.BadUrl) fail('Malformed CSS variable value');
    const raw=source.slice(start,end);
    const close=type===T.Function || type===T.LeftParenthesis ? T.RightParenthesis : type===T.LeftSquareBracket ? T.RightSquareBracket : type===T.LeftCurlyBracket ? T.RightCurlyBracket : undefined;
    if(close) {
      if(stack.length>=32) limit('CSS variable function nesting exceeds 32');
      const node: GroupToken={raw,type,children:[],close:close===T.RightParenthesis ? ')' : close===T.RightSquareBracket ? ']' : '}'};
      current.push(node);stack.push({parent:current,node,close});current=node.children;
    } else if([T.RightParenthesis,T.RightSquareBracket,T.RightCurlyBracket].includes(type)) {
      const frame=stack.pop();if(!frame || frame.close!==type) fail('Unbalanced CSS variable value');
      const node=frame.node;current=frame.parent;
      if(node.type===T.Function && node.raw.slice(0,-1).toLowerCase()==='var') {
        const comma=node.children.findIndex(child=>child.type===T.Comma),args=comma<0 ? node.children : node.children.slice(0,comma); const arg = args[0];
        if(args.length!==1 || !arg || arg.type!==T.Ident || !customName(arg.raw)) fail('var() requires an unescaped ASCII custom-property name');
        node.variable=arg.raw;
        if(comma>=0) node.fallback=node.children.slice(comma+1);
      }
    } else current.push({type,raw});
  });
  if(stack.length) fail('Unbalanced CSS variable value');
  const collect=(nodes: VariableToken[],fallback=false): void=>{for(const node of nodes) {
    if(node.variable) {references.add(node.variable);if(fallback) fallbackReferences.add(node.variable);if(node.fallback) collect(node.fallback,true);}
    else if(node.children) collect(node.children,fallback);
  }};
  collect(nodes);
  return {nodes,references:[...references],fallbackReferences:[...fallbackReferences]};
}

const wide=(nodes: VariableToken[])=>{const node=nodes[0]; return nodes.length===1 && node?.type===T.Ident && defaults.has(node.raw.toLowerCase()) ? node.raw.toLowerCase() : undefined;};
const invalid=(message: string,code='U_LAYOUT_VARIABLE'): VariableResult=>({status:'invalid',message,code});
const missing=(name: string)=>invalid(`Custom property ${name} has the guaranteed-invalid value`);
function resolutionBudget(globalSpend: Spend=()=>{}): Spend {
  let work=0;
  return (n=1)=>{work+=n;if(work>131072) limit('CSS variable resolution work limit exceeded');globalSpend(n);};
}
function evaluate(nodes: VariableToken[],lookup: VariableEnvironment['lookup'],spend: Spend): VariableResult {
  const tokens: string[]=[];let bytes=0;
  const append=(values: string[])=>{
    spend(values.length);bytes+=values.reduce((n,value)=>n+value.length+1,0);
    if(tokens.length+values.length>4096 || bytes>65536) limit('CSS variable expansion exceeds 4096 tokens or 65536 UTF-16 units');
    tokens.push(...values);
  };
  for(const node of nodes) {
    spend();
    if(node.variable) {
      let value=lookup(node.variable);
      if(value.status==='invalid' && node.fallback!==undefined) value=evaluate(node.fallback,lookup,spend);
      if(value.status!=='resolved') return value;
      append(value.tokens);
    } else if(node.children) {
      const children=evaluate(node.children,lookup,spend);if(children.status!=='resolved') return children;
      append([node.raw,...children.tokens,present(node.close)]);
    } else append([node.raw]);
  }
  return {status:'resolved',tokens};
}

/** The dependency graph is local to one element and includes dormant fallbacks. */
function cycles(declarations: ReadonlyMap<string, VariableDeclaration>,spend: Spend): Map<string, Cycle> {
  let next=0;const stack: string[]=[],indices=new Map<string,number>(),low=new Map<string,number>(),active=new Set<string>(),result=new Map<string,Cycle>();
  function visit(name: string): void {
    spend();indices.set(name,next);low.set(name,next++);stack.push(name);active.add(name);
    for(const target of present(declarations.get(name)).expression.references) {
      spend();
      if(!declarations.has(target)) continue;
      if(!indices.has(target)) {visit(target);low.set(name,Math.min(present(low.get(name)),present(low.get(target))));}
      else if(active.has(target)) low.set(name,Math.min(present(low.get(name)),present(indices.get(target))));
    }
    if(low.get(name)!==indices.get(name)) return;
    const members: string[]=[];let member: string;
    do {member=present(stack.pop());active.delete(member);members.push(member);} while(member!==name);
    if(members.length>1 || present(declarations.get(name)).expression.references.includes(name)) {
      const conditional=members.some(member=>present(declarations.get(member)).expression.fallbackReferences.some(target=>members.includes(target)));
      for(const member of members) result.set(member,{members:[...members].sort(),conditional});
    }
  }
  for(const name of declarations.keys()) if(!indices.has(name)) visit(name);
  return result;
}

const closed: VariableEnvironment={closed:true,lookup:missing};
const external: VariableEnvironment={closed:false,lookup:name=>({status:'unknown',code:'U_LAYOUT_VARIABLE',message:`Cannot resolve inherited ${name}; provide the real ancestor chain starting at html`})};

/** Parent closures are immutable: inherited aliases cannot rebind to child vars. */
/**
 * registry: name → {inherits, initial} from @property (initial: the initial-value text, or null). A registered
 * property that does not inherit reads its initial value where it is not set; one that inherits reads it at the root.
 * initial, and (when it does not inherit) unset and revert give it too.
 */
export function variableEnvironment(declarations: ReadonlyMap<string, VariableDeclaration>,parent: VariableEnvironment | null | undefined,documentRoot: boolean | undefined,globalSpend: Spend=()=>{},registry: ReadonlyMap<string, PropertyRegistration>=new Map()): VariableEnvironment {
  const ancestor=documentRoot ? closed : parent ?? external;
  if(!declarations.size && !registry.size) return ancestor;
  if(declarations.size>256) limit('An element has more than 256 custom-property bindings');
  const spend=resolutionBudget(globalSpend);
  const cyclic=cycles(declarations,spend),cache=new Map<string, VariableResult>();
  const registered=(name: string)=>registry.get(name);
  const initialOf=(name: string): VariableResult=>{const r=registered(name);return !r || r.initial===null ? missing(name) : evaluate(variableValue(r.initial).nodes,missing,spend);};
  // The parent's value (inherit). At the root a registered property that is not set there has its initial value; a
  // value invalid at computed-value time stays the guaranteed-invalid value (measured in Chromium, Firefox and WebKit).
  const inherited=(name: string): VariableResult=>registered(name) && documentRoot ? initialOf(name) : ancestor.lookup(name);
  function lookup(name: string): VariableResult {
    spend();
    if(cache.has(name)) return present(cache.get(name));
    const r=registered(name);
    if(!declarations.has(name)) return r ? (r.inherits ? inherited(name) : initialOf(name)) : ancestor.lookup(name);
    const declaration=present(declarations.get(name)),keyword=wide(declaration.expression.nodes);
    let result: VariableResult;
    if(keyword==='revert-layer') result={status:'unknown',code:'U_LAYOUT_VARIABLE',message:'Custom-property revert-layer is outside the checked subset'};
    else if(keyword==='initial') result=initialOf(name);
    else if(r && !r.inherits && keyword!=='inherit' && keyword) result=initialOf(name);
    else if(keyword) result=inherited(name);
    else if(cyclic.has(name)) {
      const {members,conditional}=present(cyclic.get(name));
      result={status:conditional ? 'unknown' : 'invalid',code:'U_LAYOUT_VARIABLE_CYCLE',message:`CSS variable cycle${conditional ? ' through fallback is outside the portable subset' : ''}: ${members.join(', ')}`};
    }
    else {
      result=evaluate(declaration.expression.nodes,lookup,spend);
      if(result.status==='resolved' && result.tokens.length===1 && defaults.has(present(result.tokens[0]).toLowerCase())) {
        const value=present(result.tokens[0]).toLowerCase();
        result=value==='initial' ? initialOf(name) : value==='revert-layer' ? {status:'unknown',code:'U_LAYOUT_VARIABLE',message:'Custom-property revert-layer is outside the checked subset'} : r && !r.inherits && value!=='inherit' ? initialOf(name) : inherited(name);
      }
    }
    cache.set(name,result);return result;
  }
  return {closed:ancestor.closed,lookup};
}

/**
 * Substitute var() for one declaration. A guaranteed-invalid reference
 * (missing without fallback, initial, non-conditional cycle) returns
 * `{invalid}`: the declaration is invalid at computed-value time and the
 * caller treats it as unset. Undecidable lookups still throw (Unknown).
 */
export function substituteDeclaration(expression: VariableExpression,environment: VariableEnvironment,spend?: Spend) {
  const value=evaluate(expression.nodes,environment.lookup,resolutionBudget(spend));
  if(value.status==='invalid') return {invalid:{code:value.code,message:value.message}};
  if(value.status!=='resolved') fail(value.message,value.code);
  return {value:value.tokens.join(' ').trim()};
}

export function substituteVariables(expression: VariableExpression,environment: VariableEnvironment,spend?: Spend) {
  const value=evaluate(expression.nodes,environment.lookup,resolutionBudget(spend));
  if(value.status!=='resolved') fail(value.message,value.code);
  // Whitespace preserves CSS tokens: Number(40) + Ident(px) is never Dimension(40px).
  return value.tokens.join(' ').trim();
}
