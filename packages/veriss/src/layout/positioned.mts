// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
import type { Affine2 } from './region.mjs';
import type { Dimensions } from './engine-types.mjs';
import {q, div} from './linear.mjs';
import {scalar, sum, diff, times} from './region.mjs';

/** Fixed coefficients only; no evaluation, variable products or intrinsic sizing. */
export function insetLength(text: string, basis: Affine2): Affine2 {
  const atom = (value: string) => {
    if (!/^[+-]?(?:\d+(?:\.\d{1,6})?)(?:px|%)$/.test(value) && value !== '0') throw new Error(`Unsupported positioned length: ${text}`);
    value=value.replace(/^\+/,'');
    return value.endsWith('%') ? times(basis, div(q(value.slice(0, -1)), q(100))) : scalar(q(value.replace(/px$/, '')));
  };
  if (!text.startsWith('calc(')) return atom(text);
  const terms = /^calc\(([^()]+)\)$/.exec(text)?.[1]?.trim().split(/\s+([+-])\s+/);
  if (!terms || terms.length > 31) throw new Error(`Unsupported positioned calc: ${text}`);
  let result = atom(terms[0]!);
  for (let i = 1; i < terms.length; i += 2) result = terms[i] === '+' ? sum(result, atom(terms[i + 1]!)) : diff(result, atom(terms[i + 1]!));
  return result;
}

export function absoluteOrigin(style: Record<'left' | 'right' | 'top' | 'bottom', string>, containing: Dimensions, size: Dimensions): Dimensions {
  const coordinate = (start: 'left' | 'top', end: 'right' | 'bottom', basis: Affine2, dimension: Affine2) => {
    if ((style[start] === 'auto') === (style[end] === 'auto')) throw new Error('Absolute positioning requires exactly one inset per axis');
    return style[start] !== 'auto' ? insetLength(style[start], basis) : diff(diff(basis, insetLength(style[end], basis)), dimension);
  };
  return {inline: coordinate('left', 'right', containing.inline, size.inline), block: coordinate('top', 'bottom', containing.block, size.block)};
}
