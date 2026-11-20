import {affine, and, or, region as encodeRegion} from './smt.mjs';
import {simpleSelector} from './simple-selector.mjs';

import type {LayoutIR,LayoutIRBox,LayoutSpaceBinding,LayoutOverlayBinding} from '../layout-contract.mjs';
import type {LayoutScenarioIdentity,LayoutElement,LayoutAffine} from '../layout-contracts.d.ts';
import type {LayoutObligation} from '../layout-z3.mjs';
type PositionContract={readonly spaces:readonly LayoutSpaceBinding[];readonly overlays:readonly LayoutOverlayBinding[]};
type PathRow=LayoutScenarioIdentity & {path:string};
type MetaRow=PathRow & {box?:string;axis?:'inline'|'block'};
const region=(row:LayoutIRBox)=>encodeRegion({range:row.range,...(row.heightRange ? {heightRange:row.heightRange} : {}),...(row.region ? {region:{constraints:[...row.region.constraints]}} : {})});
const axisNames=['inline','block'] as const;
const array=(v:unknown):v is readonly unknown[]=>Array.isArray(v);
const selector = (value:unknown):value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && simpleSelector.test(value);
const object = (value:unknown, keys:readonly string[]):value is Record<string,unknown> => value!==null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));

const isSpace=(s:unknown):s is LayoutSpaceBinding=>object(s,['name','selector']) && typeof s.name==='string' && /^[A-Za-z_][\w]{0,127}$/.test(s.name) && selector(s.selector);
const isOverlay=(o:unknown):o is LayoutOverlayBinding=>object(o,['selector','within']) && selector(o.selector) && typeof o.within==='string';
export function validatePositionedBindings(spaces:unknown, overlays:unknown):void {
  if (!array(spaces) || !spaces.length || spaces.length > 64 || !array(overlays) || !overlays.length || overlays.length > 64 ||
    !spaces.every(isSpace) || new Set(spaces.map(s => s.name)).size !== spaces.length ||
    !overlays.every(isOverlay) || overlays.some(o => !spaces.some(s => s.name === o.within)) ||
    new Set(overlays.map(o => o.selector)).size !== overlays.length) throw new TypeError('Invalid PositionedGrid space/overlay bindings');
}

// This is the closed selector contract, not the implementation CSS parser.
export const matchesBindingSelector = (selector:string, element:Readonly<Pick<LayoutElement,'tag'|'id'>> & {readonly classes:readonly string[]}) => {
  const tag = selector.match(/^(?:[a-z][a-z0-9-]*|\*)/)?.[0];
  return (!tag || tag === '*' || tag === element.tag) && [...selector.matchAll(/([.#])([\w-]+)/g)].every(([,kind,value]) => value!==undefined && (kind === '.' ? element.classes.includes(value) : element.id === value));
};
const identity = (row:LayoutScenarioIdentity) => JSON.stringify([row.variant ?? null,row.scrollbarProfile ?? null]);
const metadata = (row:MetaRow) => ({box:row.box,path:row.path,...(row.axis ? {axis:row.axis} : {}),...(row.variant!==undefined ? {variant:row.variant} : {}),...(row.scrollbarProfile!==undefined ? {scrollbarProfile:row.scrollbarProfile} : {})});
const plus = (a:LayoutAffine,b:LayoutAffine) => `(+ ${affine(a)} ${affine(b)})`;

/** Contract predicates use only independently extracted facts. */
export function positionedObligations(contract:PositionContract, implementation:LayoutIR, path:string, {exposed=[],external=[]}:{exposed?:readonly PathRow[];external?:readonly PathRow[]}={}) {
  const obligations:LayoutObligation[] = [], coverage:LayoutObligation[] = [];
  const key=(row:PathRow)=>JSON.stringify([identity(row),row.path]);
  const exposedKeys=new Set(exposed.map(key)),externalKeys=new Set(external.map(key));
  let work=0;
  const spend=(count=1)=>{work+=count;if(work>2_000_000 || obligations.length+coverage.length>8192) throw new RangeError('Positioned layout obligation limit exceeded');};
  for (const scenario of implementation.cases) {
    spend(implementation.boxes.length+(implementation.elements?.length ?? 0));
    const boxes = implementation.boxes.filter(row => identity(row) === identity(scenario));
    const roots = boxes.filter(row => row.path === path);
    const elements = (implementation.elements ?? []).filter(row => identity(row) === identity(scenario));
    const owner = elements.find(row => row.path === path)?.owner;
    const owned = elements.filter(row => row.owner === owner && !exposedKeys.has(key(row)) && (row.path === path || row.path.startsWith(path + '/')));
    const selectable=[...owned,...elements.filter(row=>exposedKeys.has(key(row)))];
    const ownedPaths=new Set(owned.map(row=>row.path));
    for(const row of boxes) if(row.position==='absolute' && (row.path===path || row.path.startsWith(path+'/')) && !ownedPaths.has(row.path) && !exposedKeys.has(key(row)) && !externalKeys.has(key(row)))
      coverage.push({...metadata(row),code:'U_LAYOUT_POSITIONED_OWNER',domain:region(row),failure:'true'});
    const rootDomain = or(roots.map(region));
    const fail = (code:string, failure = 'true', row:MetaRow = {path,...scenario}, domain = rootDomain) => {spend();obligations.push({...metadata(row),code,domain,failure});};
    if (!roots.length || !owner) coverage.push({...scenario,path,code:'U_LAYOUT_POSITIONED',domain:'true',failure:'true'});
    const select = (selector:string,roots=owned) => {spend(roots.length);return roots.filter(element => matchesBindingSelector(selector,element));};
    const spaces = new Map<string,LayoutIRBox[]>();
    for (const binding of contract.spaces) {
      const selected = new Set(select(binding.selector).map(row => row.path));
      spend(boxes.length);
      const rows = boxes.filter(row => selected.has(row.path));
      spaces.set(binding.name, rows);
      fail('E_LAYOUT_SPACE', `(not ${or(rows.map(region))})`);
      for (const row of rows) {
        if (row.position !== 'relative') fail('E_LAYOUT_SPACE', 'true', row, region(row));
        if(!row.padding?.block) coverage.push({...metadata(row),code:'U_LAYOUT_POSITIONED',domain:region(row),failure:'true'});
      }
      for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
        spend();
        const A=rows[a],B=rows[b];
        if(A && B && A.path!==B.path) fail('E_LAYOUT_SPACE_AMBIGUOUS','true',A,and([region(A),region(B)]));
      }
    }
    const bound = new Map<string,Set<LayoutOverlayBinding>>();
    for (const binding of contract.overlays) {
      const selected = new Set(select(binding.selector,selectable).map(row => row.path));
      spend(boxes.length+(!selected.size ? implementation.elements?.length ?? 0 : 0));
      // Optional Show/For arms may omit an overlay in this case. A typo that
      // matches no owned element in any reachable case is still an error.
      if (!selected.size && !(implementation.elements ?? []).some(element=>(element.owner===owner || exposedKeys.has(key(element))) &&
        (element.path===path || element.path.startsWith(path+'/')) && matchesBindingSelector(binding.selector,element))) fail('E_LAYOUT_OVERLAY');
      const rows = boxes.filter(row => selected.has(row.path));
      for (const row of rows) {
        const bindings=bound.get(row.path) ?? new Set<LayoutOverlayBinding>();
        bindings.add(binding);bound.set(row.path,bindings);
        if (row.position !== 'absolute') {fail('E_LAYOUT_OVERLAY', 'true', row, region(row));continue;}
        const candidates = (spaces.get(binding.within) ?? []).filter(space => space.position === 'relative' && space.path === row.containingBlock?.path);
        fail('E_LAYOUT_SPACE_BINDING', `(not ${or(candidates.map(region))})`, row, region(row));
        for(const space of candidates) if(space.padding?.block && row.containingBlock) {
          const padding={inline:space.padding.inline,block:space.padding.block};
          for(const axis of axisNames) fail('E_LAYOUT_SPACE_GEOMETRY', `(not (= ${affine(padding[axis])} ${affine(row.containingBlock[axis])}))`, row, and([region(space),region(row)]));
        }
      }
    }
    const absolute = boxes.filter(row => row.position === 'absolute' && !externalKeys.has(key(row)) && (ownedPaths.has(row.path) || exposedKeys.has(key(row))));
    for (const row of absolute) {
      if (bound.get(row.path)?.size !== 1) fail('E_LAYOUT_OVERLAY', 'true', row, region(row));
      if (!row.origin || !row.containingBlock || !row.border.block) {coverage.push({...metadata(row),code:'U_LAYOUT_POSITIONED',domain:region(row),failure:'true'});continue;}
      const border={inline:row.border.inline,block:row.border.block};
      for (const axis of axisNames) {
        fail('E_LAYOUT_ABSOLUTE_START', `(< ${affine(row.origin[axis])} 0)`, {...row,axis}, region(row));
        fail('E_LAYOUT_ABSOLUTE_END', `(> ${plus(row.origin[axis],border[axis])} ${affine(row.containingBlock[axis])})`, {...row,axis}, region(row));
      }
    }
    for (let a = 0; a < absolute.length; a++) for (let b = a + 1; b < absolute.length; b++) {
      spend();
      const A = absolute[a], B = absolute[b];
      if (!A || !B || A.path === B.path || !A.origin || !B.origin || A.containingBlock?.path !== B.containingBlock?.path || !A.border.block || !B.border.block) continue;
      // Positive-area intersection: touching edges and zero-sized boxes are disjoint.
      const originA=A.origin,originB=B.origin,borderA={inline:A.border.inline,block:A.border.block},borderB={inline:B.border.inline,block:B.border.block};
      const failure = and(axisNames.flatMap(axis => [
        `(< 0 ${affine(borderA[axis])})`, `(< 0 ${affine(borderB[axis])})`,
        `(< ${affine(originA[axis])} ${plus(originB[axis],borderB[axis])})`,
        `(< ${affine(originB[axis])} ${plus(originA[axis],borderA[axis])})`,
      ]));
      fail('E_LAYOUT_OVERLAY_OVERLAP', failure, A, and([region(A),region(B)]));
    }
  }
  return {obligations,coverage};
}
