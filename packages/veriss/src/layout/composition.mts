// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
import type { LayoutIR, ContractIR } from '../layout-contract.mjs';
import type { LayoutScenarioIdentity, LayoutDeclaration } from '../layout-contracts.d.ts';
interface Scenario { readonly variant?: number; readonly scrollbarProfile?: string }
interface ScenarioRow extends Scenario { readonly path?: string }
export interface LayoutInstance { path: string; declaration: Readonly<LayoutDeclaration>; contract: ContractIR; cases: Scenario[] }
import {matchesBindingSelector} from './positioned-contract.mjs';

export const caseKey=(row: Scenario)=>JSON.stringify([row.variant ?? null,row.scrollbarProfile ?? null]);
export const boxKey=(row: ScenarioRow)=>JSON.stringify([caseKey(row),row.path]);
export const descendant=(path: string,parent: string)=>path.startsWith(parent+'/');

/** Authored interfaces, never substitutes for implementation geometry. */
export function layoutInstances(implementation: LayoutIR): LayoutInstance[] {
  const groups=new Map<string, Omit<LayoutInstance, "cases"> & {cases: Map<string, Scenario>}>();
  for(const binding of implementation.bindings ?? []) {
    const {path,declaration}=binding,key=JSON.stringify([path,declaration.contract.component,declaration.source]);
    if(!groups.has(key)) groups.set(key,{path,declaration,contract:declaration.contract,cases:new Map()});
    const {variant,scrollbarProfile}=binding,scenario={...(variant!==undefined ? {variant} : {}),...(scrollbarProfile!==undefined ? {scrollbarProfile} : {})};
    groups.get(key)!.cases.set(caseKey(scenario),scenario);
  }
  if(groups.size>256) throw new RangeError('Declared layout instance limit exceeded');
  const instances=[...groups.values()].map(group=>({...group,cases:[...group.cases.values()]}));
  if(instances.length**2*instances.reduce((count,instance)=>count+instance.cases.length,0)>2_000_000) throw new RangeError('Layout composition work limit exceeded');
  return instances;
}

export function directInstances(instances: readonly LayoutInstance[],path: string,cases: readonly Scenario[]) {
  const active=new Set(cases.map(caseKey));
  const children=instances.filter(instance=>descendant(instance.path,path));
  return children.map(instance=>({...instance,cases:instance.cases.filter(scenario=>active.has(caseKey(scenario)) &&
    !children.some(other=>descendant(instance.path,other.path) && other.cases.some(c=>caseKey(c)===caseKey(scenario))))})).filter(instance=>instance.cases.length);
}

/** Only the child's native root is visible to a caller's selectors/profile. */
export function localLayout(implementation: LayoutIR,boundaries: readonly LayoutInstance[]) {
  const visible=(row: ScenarioRow)=>!row.path || !boundaries.some(boundary=>descendant(row.path!,boundary.path) && boundary.cases.some(c=>caseKey(c)===caseKey(row)));
  return {...implementation,boxes:implementation.boxes.filter(visible),elements:implementation.elements.filter(visible)};
}

export const exposedRoots=(boundaries: readonly LayoutInstance[])=>boundaries.flatMap(boundary=>boundary.cases.map(scenario=>({...scenario,path:boundary.path})));

export function scopeLayout(implementation: LayoutIR,contract: ContractIR,path: string,cases: readonly Scenario[]) {
  const active=new Set(cases.map(caseKey)),within=(row: ScenarioRow)=>active.has(caseKey(row)) && (row.path===path || row.path?.startsWith(path+'/'));
  return {...implementation,component:contract.component,cases,
    elements:implementation.elements.filter(within),boxes:implementation.boxes.filter(within),presence:implementation.presence.filter(within),
    checks:implementation.checks.filter(within),errors:implementation.errors.filter(row=>!row.path || within(row))};
}

/** A source-declared child root needs an explicit request from one caller. */
export function parentPlacements(implementation: LayoutIR,instances: readonly LayoutInstance[],path: string,cases: readonly Scenario[]) {
  const placements=new Map<LayoutInstance, Scenario[]>();
  for(const scenario of cases) {
    const key=caseKey(scenario);
    if(!instances.some(instance=>instance.path===path && instance.cases.some(c=>caseKey(c)===key))) continue;
    const root=implementation.elements.find(row=>row.path===path && caseKey(row)===key);
    if(!root) continue;
    const ancestors=instances.filter(instance=>descendant(path,instance.path) && instance.cases.some(c=>caseKey(c)===key));
    const nearest=ancestors.filter(instance=>!ancestors.some(other=>descendant(other.path,instance.path)));
    if(nearest.length!==1) continue; // Ambiguous aliases do not grant placement rights.
    const parent=nearest[0]!;
    if(parent.contract.profile.id!=='positioned-grid/1' || !parent.contract.overlays!.some(binding=>matchesBindingSelector(binding.selector,root))) continue;
    if(!placements.has(parent)) placements.set(parent,[]);
    placements.get(parent)!.push(scenario);
  }
  return [...placements].map(([parent,cases])=>({parent,cases}));
}
