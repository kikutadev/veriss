// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
// F89: in a math function (calc, min, max, clamp, …) + and − are operators only with white space on both sides
// (CSS Values 4 §10.1): 100%-10px and 100% -10px are an operand followed by a signed number, so the value is invalid
// and the browser drops the declaration (measured in Chromium, Firefox and WebKit). * and / need no space.
const math = /^(?:calc|min|max|clamp|round|mod|rem|abs|sign|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp)$/i;
// The first operator without its spaces (as written, e.g. "100%-10px"), or null when the value is fine or not judged.
export function calcOperatorProblem(value: unknown): string | null {
  const text = String(value);
  let found: string | null = null;
  // Reads the arguments of a math function from i (just after its "("); returns the index after its ")".
  const args = (i: number): number => {
    let expectOperand = true, operandStart = i;
    for (;;) {
      const start = i;
      while (/\s/.test(text[i] ?? '')) i++;
      const spaced = i > start, c = text[i];
      if (c === undefined) throw 0;
      if (c === ')') return i + 1;
      if (c === ',') { i++; expectOperand = true; continue; }
      if (!expectOperand) {
        if (c === '*' || c === '/') { i++; expectOperand = true; continue; }
        if (c === '+' || c === '-') {
          if (!spaced || !/\s/.test(text[i + 1] ?? '')) { found ??= text.slice(operandStart, i + 1) + /^\s*[^\s,)]*/.exec(text.slice(i + 1))![0]; return skipTo(i); }
          i++; expectOperand = true; continue;
        }
        throw 0; // something else after an operand: not judged here
      }
      operandStart = i;
      const fn = /^-?-?[a-z_][\w-]*\(/i.exec(text.slice(i));
      if (fn) { const name = fn[0].slice(0, -1); i += fn[0].length; i = math.test(name) ? args(i) : skipTo(i); expectOperand = false; continue; }
      if (c === '(') { i = args(i + 1); expectOperand = false; continue; }
      const num = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:%|[a-z]+)?/i.exec(text.slice(i));
      if (num) { i += num[0].length; expectOperand = false; continue; }
      const ident = /^-?[a-z_][\w-]*/i.exec(text.slice(i));
      if (ident) { i += ident[0].length; expectOperand = false; continue; }
      throw 0;
    }
  };
  // Skips to after the ")" that closes the parenthesis opened before i.
  const skipTo = (i: number): number => { for (let depth = 1; i < text.length; i++) { if (text[i] === '(') depth++; else if (text[i] === ')' && !--depth) return i + 1; } throw 0; };
  try {
    for (const m of text.matchAll(/(?:^|[^\w-])((?:calc|min|max|clamp|round|mod|rem|abs|sign|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp)\()/gi)) {
      if (found) break;
      args(m.index + m[0].length);
    }
  } catch { return found; }
  return found;
}
