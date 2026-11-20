// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// Shared encoding only. Contract predicates and CSS geometry are built separately.
import type { Rational } from './linear.mjs';
import type { LayoutAffine, LayoutRange, LayoutRegion } from '../layout-contracts.d.ts';
type ExactInterval = Pick<LayoutRange,'minExact'|'maxExact'|'minInclusive'|'maxInclusive'>;
export interface RegionRow { readonly range: ExactInterval; readonly heightRange?: ExactInterval; readonly region?: Pick<LayoutRegion,'constraints'> }

export function rational(value: unknown): Rational {
  if(typeof value!=='string' || value.length>128 || !/^-?\d+(?:\/[1-9]\d*)?$/.test(value)) throw new TypeError('Invalid exact layout rational');
  const [n,d='1']=value.split('/');return {n:BigInt(n!),d:BigInt(d)};
}
export function numeral(value: string): string {
  const {n,d}=rational(value),integer=n<0n ? `(- ${-n})` : String(n);
  return d===1n ? integer : `(/ ${integer} ${d})`;
}
export function affine(expr: LayoutAffine): string {
  const terms=[];
  for(const [coefficient,name] of [[expr.coefficient,'width'],[expr.heightCoefficient ?? '0','height']] as const) {
    const value=rational(coefficient);
    if(value.n) terms.push(value.n===value.d ? name : `(* ${numeral(coefficient)} ${name})`);
  }
  if(rational(expr.constant).n) terms.push(numeral(expr.constant));
  return !terms.length ? '0' : terms.length===1 ? terms[0]! : `(+ ${terms.join(' ')})`;
}
export const and=(terms: readonly string[])=>terms.length ? `(and ${terms.join(' ')})` : 'true';
export const or=(terms: readonly string[])=>terms.length ? `(or ${terms.join(' ')})` : 'false';
export function interval(range: ExactInterval,variable: string) {
  if(!range || typeof range.minInclusive!=='boolean' || typeof range.maxInclusive!=='boolean') throw new TypeError('Invalid layout interval');
  return [`(${range.minInclusive ? '>=' : '>'} ${variable} ${numeral(range.minExact)})`,`(${range.maxInclusive ? '<=' : '<'} ${variable} ${numeral(range.maxExact)})`];
}
export function region(row: RegionRow) {
  const terms=interval(row.range,'width');
  if(row.heightRange) terms.push(...interval(row.heightRange,'height'));
  if(row.region) for(const constraint of row.region.constraints) {
    if(typeof constraint.strict!=='boolean') throw new TypeError('Invalid strict layout constraint');
    terms.push(`(${constraint.strict ? '>' : '>='} ${affine(constraint)} 0)`);
  }
  return and([...new Set(terms)]);
}
