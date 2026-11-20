// Shared comparison helpers for measured browser geometry and static model rows.
import type {LayoutAffine} from '../../packages/veriss/src/layout-contracts.js';
import type {Choice} from '../../packages/adapter-core/src/index.mjs';

export function rationalNumber(value: string | undefined): number {
  const [numerator, denominator = '1'] = String(value ?? '0').split('/');
  return Number(numerator) / Number(denominator);
}
export function evaluateAffine(value: LayoutAffine, width: number, height: number): number {
  return rationalNumber(value.constant) + width * rationalNumber(value.coefficient) + height * rationalNumber(value.heightCoefficient);
}
// An array length is a recorded finite-state choice, not an arbitrary prop.
export function repeatedItems(value: Choice | undefined): number[] {
  if(typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Expected a finite nonnegative repeat count');
  return Array.from({length:value}, (_, i) => i);
}
