// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
import type { MediaFeatures } from '../layout-contracts.d.ts';
import type { Rational } from './linear.mjs';
import type { RegionRelation } from './region.mjs';
import postcss from 'postcss';
import { q, mul, div } from './linear.mjs';

/** User preference media features, their values and the default each check assumes (the first). */
export const preferenceValues: Readonly<Record<string, readonly string[]>> = { 'prefers-reduced-motion': ['no-preference', 'reduce'], 'prefers-color-scheme': ['light', 'dark'], 'prefers-contrast': ['no-preference', 'more', 'less', 'custom'], 'forced-colors': ['none', 'active'] };
// Explicit finite media assumptions, not inferred from viewport, UA or touch input.
export const mediaFeatureValues: Readonly<Record<string, readonly string[]>> = Object.freeze({hover:['none','hover'],pointer:['none','coarse','fine'],'prefers-reduced-motion':['no-preference','reduce']});
export const validMediaFeatures = (v: unknown): v is Record<string, string> | undefined => v === undefined || !!v && Object.getPrototypeOf(v) === Object.prototype &&
  Object.entries(v).every(([k,value])=>Object.hasOwn(mediaFeatureValues,k)&&typeof value === "string" && mediaFeatureValues[k]?.includes(value) === true);
export const mediaFeatureEntries = (v: MediaFeatures | Readonly<Record<string, string>> | undefined) => Object.entries(v??{}).sort(([a],[b])=>a.localeCompare(b));
export type ConditionAtom =
  | { feature: string; relation: RegionRelation; value: Rational; orientation?: string; fixed?: never; preference?: never }
  | { feature: string; fixed: boolean; relation?: never; value?: never; orientation?: never; preference?: never }
  | { feature: string; preference: string; relation?: never; value?: never; orientation?: never; fixed?: never };
export interface ParsedCondition {
  kind: 'media' | 'container';
  name: string | undefined;
  groups: ConditionAtom[][];
  listed: number;
  params: string;
}
export function parseCondition(params: string, kind: 'media' | 'container', mediaFeatures?: MediaFeatures | Readonly<Record<string, string>>): ParsedCondition {
  let name: string | undefined;
  // The relation token is captured by the supported comparison regex.
  const relation = (token: string): RegionRelation => {
    if (token === '<' || token === '>' || token === '<=' || token === '>=' || token === '=') return token;
    throw new Error('Unsupported condition relation');
  };
  if (kind === 'container') {
    if (params.includes(',')) throw new Error('Container query lists are outside this subset');
    const named = params.match(/^([a-zA-Z_][\w-]*)\s+(?=\()/);
    if (named) {
      name = named[1]!;
      if (['and', 'or', 'not', 'none', 'default', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(name.toLowerCase())) throw new Error('Reserved container query name');
      params = params.slice(named[0].length);
    }
  }
  const groups = postcss.list.comma(params).map(part => {
    if (kind === 'media') {
      if (/^print(?:\s|$)/i.test(part)) return null;
      part = part.replace(/^(?:screen|all)(?:\s+and\s+|$)/i, '').trim();
      if (!part) return [];
    }
    const atoms: ConditionAtom[] = [];
    for (const term of part.split(/(?:\s+|(?<=\)))and\s+/i)) {
      if (!/^\([^()]+\)$/.test(term.trim())) throw new Error(`Unsupported ${kind} condition: ${params}`);
      const value = term.trim().slice(1, -1).trim();
      const push = (feature: string, relation: RegionRelation, size: string) => atoms.push({ feature: feature.toLowerCase(), relation, value: q(size) });
      let m;
      // orientation: portrait is height >= width, landscape is width > height (Media Queries 4).
      // User preferences: not geometry. They become paint-only states (see parseLayoutCSS).
      if (kind === 'media' && (m = value.match(/^(hover|pointer)\s*:\s*([a-z-]+)$/i))) {
        const feature=m[1]!.toLowerCase(),v=m[2]!.toLowerCase();
        if(!mediaFeatureValues[feature]?.includes(v))throw Error('Unsupported '+feature+' value: '+v);
        if(!Object.hasOwn(mediaFeatures??{},feature))throw Error('Media feature '+feature+' requires an explicit mediaFeatures profile');
        atoms.push({feature, fixed:(mediaFeatures as Readonly<Record<string,string>>|undefined)?.[feature]===v});
      }
      else if (kind === 'media' && (m = value.match(/^(prefers-reduced-motion|prefers-color-scheme|prefers-contrast|forced-colors)\s*:\s*([a-z-]+)$/i))) {
        const feature = m[1]!.toLowerCase(), v = m[2]!.toLowerCase();
        if (!preferenceValues[feature]?.includes(v)) throw new Error(`Unsupported ${feature} value: ${v}`);
        atoms.push(Object.hasOwn(mediaFeatures??{},feature)?{feature,fixed:(mediaFeatures as Readonly<Record<string,string>>|undefined)?.[feature]===v}:{ feature, preference: v });
      }
      // Device resolution: dppx (x), dpi (÷ 96), dpcm (× 2.54 ÷ 96), and the -webkit- device-pixel-ratio forms.
      else if (kind === 'media' && (m = value.match(/^(min-|max-)?resolution\s*:\s*(\d+(?:\.\d{1,6})?)(dppx|x|dpi|dpcm)$/i))) {
        const n = q(m[2]!), unit = m[3]!.toLowerCase(), dppx = unit === 'dpi' ? div(n, q(96)) : unit === 'dpcm' ? div(mul(n, q('2.54')), q(96)) : n;
        atoms.push({ feature: 'resolution', relation: !m[1] ? '=' : m[1]!.toLowerCase() === 'min-' ? '>=' : '<=', value: dppx });
      }
      else if (kind === 'media' && (m = value.match(/^-webkit-(min-|max-)?device-pixel-ratio\s*:\s*(\d+(?:\.\d{1,6})?)$/i))) atoms.push({ feature: 'resolution', relation: !m[1] ? '=' : m[1]!.toLowerCase() === 'min-' ? '>=' : '<=', value: q(m[2]!) });
      else if (kind === 'media' && (m = value.match(/^orientation\s*:\s*(portrait|landscape)$/i))) atoms.push({ feature: 'orientation', relation: m[1]!.toLowerCase() === 'portrait' ? '>=' : '>', value: q(0), orientation: m[1]!.toLowerCase() });
      else if ((m = value.match(/^(min|max)-(width|height|inline-size|block-size)\s*:\s*(\d+(?:\.\d{1,6})?)px$/i))) push(m[2]!, m[1]!.toLowerCase() === 'min' ? '>=' : '<=', m[3]!);
      else if ((m = value.match(/^(width|height|inline-size|block-size)\s*(<=|>=|<|>|=)\s*(\d+(?:\.\d{1,6})?)px$/i))) push(m[1]!, relation(m[2]!), m[3]!);
      else if ((m = value.match(/^(\d+(?:\.\d{1,6})?)px\s*(<=|<)\s*(width|height|inline-size|block-size)(?:\s*(<=|<)\s*(\d+(?:\.\d{1,6})?)px)?$/i))) {
        push(m[3]!, m[2]! === '<' ? '>' : '>=', m[1]!); if (m[4]) push(m[3]!, relation(m[4]), m[5]!);
      } else throw new Error(`Unsupported ${kind} condition: ${params}`);
      if (kind === 'media' && atoms.some(atom => atom.feature.includes('-size'))) throw new Error('Media queries use width/height, not logical size features');
    }
    return atoms.some(a=>a.fixed===false)?null:atoms.filter(a=>a.fixed!==true);
  }).filter((group): group is ConditionAtom[] => group !== null);
  // listed: the queries of the list (a print query is dropped from groups, which are the ones that can match a screen).
  return { kind, name, groups, listed: postcss.list.comma(params).length, params };
}
