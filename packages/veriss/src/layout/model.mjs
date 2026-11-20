// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
import { and, or } from './smt.mjs';
/** Shared bounded query encoding; predicates remain the caller's responsibility. */
export function obligationModel(base, domain, input, { variables = [] } = {}) {
    if (!Array.isArray(variables) || variables.length > 512 || new Set(variables).size !== variables.length || variables.some(v => !/^rect_[0-9]+_[0-9]+$/.test(v)))
        throw new TypeError('Invalid extra SMT variables');
    const sourceObligations = input.length;
    const obligations = [...new Map(input.map(row => [
            JSON.stringify([row.code, row.box, row.path, row.axis, row.variant, row.scrollbarProfile, row.domain, row.failure]), row,
        ])).values()];
    if (obligations.length > 8192)
        throw new RangeError('Layout obligation limit exceeded');
    const prelude = `(set-logic QF_LRA)\n(declare-const width Real)\n(declare-const height Real)\n(declare-const layout_case Real)\n${variables.map(v => `(declare-const ${v} Real)\n`).join('')}(assert ${domain})\n`;
    const smt2 = prelude + `(assert ${or(obligations.map((row, i) => and([`(= layout_case ${i})`, row.domain, row.failure])))})\n`;
    if (smt2.length > 2_000_000)
        throw new RangeError('Layout model size limit exceeded');
    return { ...base, version: 1, sourceObligations, domain: prelude, smt2, obligations };
}
