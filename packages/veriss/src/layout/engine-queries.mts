// TypeScript source. Run pnpm build:ts to regenerate adjacent ESM and declarations.
// Image resource selection and media/container-query geometry.
import {q,sub} from './linear.mjs';
import { scalar, width, height, diff } from './region.mjs';
import type { Affine2, RegionRelation } from './region.mjs';
import type { ParsedCondition } from './conditions.mjs';
export type LoadedSource = string | undefined | {candidates: string[]};
interface QueryTarget {inline: Affine2; block: Affine2 | null; box?: {label:string;path:string}}
interface QueryAncestor {inline?:Affine2|null;block?:Affine2|null;box?:{label:string;path:string};type?:string;names?:readonly string[]}
interface CompiledQuery {groups: {slack: Affine2; relation: RegionRelation}[][]; target: string | undefined; path?: string | undefined}
const inlineFeature = (feature: string) => ['width','inline-size'].includes(feature);
export const compare = (value: number, relation: RegionRelation) => relation === '>=' ? value >= 0 : relation === '>' ? value > 0 : relation === '<=' ? value <= 0 : relation === '<' ? value < 0 : value === 0;
export function createQuerySolver(heightKnown: boolean, ratioValue: number | undefined) {
  function loadedSource(srcset?: string, src?: string): LoadedSource {
    if (srcset === undefined) return src;
    if (srcset === 'dynamic') return 'dynamic';
    const list: {url:string;density:number}[] = [];
    for (const part of srcset.split(',').map(p => p.trim()).filter(Boolean)) {
      const m = /^(\S+)(?:\s+(\d+(?:\.\d+)?)x)?$/.exec(part);
      if (!m || list.some(c => c.density === Number(m[2] ?? 1))) return 'dynamic';
      list.push({ url: m[1]!, density: Number(m[2] ?? 1) });
    }
    if (typeof src === 'string' && src !== 'dynamic' && !list.some(c => c.density === 1)) list.push({ url: src, density: 1 });
    if (list.length === 1) return list[0]!.url;
    const ratio = ratioValue;
    if (!list.length) return 'dynamic';
    if (ratio === undefined) return { candidates: list.map(c => c.url) };
    const sorted = [...list].sort((a, b) => a.density - b.density);
    return (sorted.find(c => c.density >= ratio) ?? sorted.at(-1)!).url;
  }
  function context(condition: ParsedCondition, ancestors: readonly QueryAncestor[]): CompiledQuery {
    let target: QueryTarget | undefined;
    if (condition.kind === 'media') target = { inline: width, block: heightKnown ? height : null };
    else {
      const needsBlock = condition.groups.flat().some(atom => !inlineFeature(atom.feature));
      const ancestor = ancestors.slice().reverse().find(ancestor => (!condition.name || ancestor.names?.includes(condition.name)) &&
        (ancestor.type === 'size' || (!needsBlock && ancestor.type === 'inline-size')));
      if (!ancestor) return {groups:[],target:undefined};
      if(!ancestor.inline || ancestor.block===undefined)throw new Error('Container query needs known ancestor size');
      target={inline:ancestor.inline,block:ancestor.block,...(ancestor.box?{box:ancestor.box}:{})};
    }
    const selected = target;
    const groups = condition.groups.map(group => group.map(atom => {
      if (atom.relation === undefined || atom.value === undefined) throw Object.assign(new Error('Non-geometric media feature in layout context'), {code:'U_LAYOUT_QUERY'});
      // Device resolution: a constant under the analysed device pixel ratio (the devicePixelRatios option).
      if (atom.feature === 'resolution') {
        if (ratioValue === undefined) throw Object.assign(new Error('A resolution media query needs the devicePixelRatios option'), { code: 'U_LAYOUT_QUERY' });
        return { slack: scalar(sub(q(String(ratioValue)), atom.value)), relation: atom.relation };
      }
      if (atom.feature === 'orientation') {
        if (!selected.block) throw new Error('An orientation query needs the viewport height domain');
        return { slack: atom.orientation === 'portrait' ? diff(selected.block, selected.inline) : diff(selected.inline, selected.block), relation: atom.relation };
      }
      const size = inlineFeature(atom.feature) ? selected.inline : selected.block;
      if (!size) throw new Error('Height condition needs a known container/viewport block size');
      return { slack: diff(size, scalar(atom.value)), relation: atom.relation };
    }));
    return { groups, target: selected.box?.label, path: selected.box?.path };
  }
  return {loadedSource, context};
}
