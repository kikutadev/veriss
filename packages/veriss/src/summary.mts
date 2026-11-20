// TypeScript source. Run pnpm build:ts to regenerate the adjacent ESM and declarations.
import type {LayoutProof} from './layout-z3.mjs';
import type {NoShiftProof} from './transitions.mjs';
type Source = {start:number;end?:number};
interface Range {min?:number;max?:number;minExact?:string;maxExact?:string;minInclusive?:boolean;maxInclusive?:boolean}
interface CSSLocation {file:string;line?:number;column?:number}
interface CSSOrigin extends CSSLocation {specified:string|undefined;conditions?:readonly {kind:string;name?:string;params:string;css:CSSLocation}[]}
interface ExplanationFact {
  kind?:string;origin?:string;axis?:string;hostInset?:number;box?:string;property?:string;value?:string|number|undefined;derivedFrom?:string;selector?:string|undefined;
  css?:CSSOrigin;overridden?:readonly {css:CSSOrigin}[];dormant?:readonly {css:CSSOrigin}[];
}
interface Explanation {version?:number;available:{facts:readonly ExplanationFact[]};required:{facts:readonly ExplanationFact[]}}
interface SummaryRow {
  code:string;message?:string;source?:Source|number|undefined;start?:number;css?:CSSLocation;path?:string|undefined;box?:string|undefined;
  range?:Range; heightRange?:Range; checkedContract?:string;hint?:string; text?: {lines?:number;fitsLines?:number;fitsUpTo?:number;maxLength?:number;widest?:string};
  explanation?:Explanation;related?:readonly {message:string;css:CSSLocation}[];
}
interface SummaryDeclaration {
  status:string;contract:{component:string};instance?:{path:string};proof:LayoutProof;coverage?:LayoutProof
}
interface SummaryShiftCheck extends NoShiftProof {
  component:string;path:string;source?:Source|undefined;targets:readonly {source?:Source;selector?:string;nodeId?:string}[];
  identities?:readonly {target:string;keys:readonly {value:unknown}[]}[];
}
interface SummaryReport {
  component?:string;status?:string;scope?:{viewport?:Range & {height?:Range|null}};
  declarations?:readonly SummaryDeclaration[];diagnostics?:readonly SummaryRow[];integrity?:{warnings?:readonly SummaryRow[]};
  accessibility?:{warnings?:readonly SummaryRow[]};noshift?:{status:string;comparisons:{checked:number;planned:number};diagnostics:readonly SummaryRow[];checks:readonly SummaryShiftCheck[]};
  assumptions?:readonly string[];
}
// CLI presentation only. The complete machine-readable report remains unchanged.
const interval = (value:Range) => `${value.minInclusive === false ? '(' : '['}${value.minExact ?? value.min}, ${value.maxExact ?? value.max}${value.maxInclusive === false ? ')' : ']'}`;
function location(source:string, file:string, offset:number|undefined) {
  if (offset===undefined || !Number.isInteger(offset)) return file;
  const before = source.slice(0, offset), line = before.split('\n').length;
  return `${file}:${line}:${before.length - before.lastIndexOf('\n')}`;
}

const cssAt = (css:CSSLocation) => `${css.file}:${css.line}`;
const condition = (css:CSSOrigin) => css.conditions?.length ? ` under ${css.conditions.map(c => `@${c.kind}${c.name ? ` ${c.name}` : ''} ${c.params} (${cssAt(c.css)})`).join(' and ')}` : '';
/** ADR-0002: one line per side, citing only authored CSS, caller contracts and the viewport. */
export function explanationLines(explanation:Explanation|undefined, limit = 6):string[] {
  if (!explanation) return [];
  const lines:string[] = [], dormant:string[] = [], overridden:string[] = [];
  for (const side of ['available', 'required'] as const) {
    const parts = [];
    for (const fact of explanation[side].facts) {
      if (fact.kind === 'viewport') parts.push(`viewport ${fact.axis} size${fact.hostInset ? ` minus host inset ${fact.hostInset}px` : ''}`);
      else if (fact.kind === 'contract') parts.push(`${fact.box} ${fact.property} ${fact.value}px (${fact.derivedFrom ? `derived from ${fact.derivedFrom}` : 'trusted contract'} ${JSON.stringify(fact.selector)})`);
      else if (fact.origin === 'author' && fact.css) parts.push(`${fact.box} ${fact.property}: ${fact.css.specified}${fact.css.specified === fact.value ? '' : ` = ${fact.value}`} (${cssAt(fact.css)}${condition(fact.css)})`);
      for (const entry of fact.overridden ?? []) overridden.push(`${fact.box} ${fact.property}: ${entry.css.specified} (${cssAt(entry.css)}${condition(entry.css)})`);
      for (const entry of fact.dormant ?? []) dormant.push(`${fact.box} ${fact.property}: ${entry.css.specified} (${cssAt(entry.css)}${condition(entry.css)})`);
    }
    if (parts.length) lines.push(`  ${side === 'available' ? 'offered by' : 'required by'}: ${parts.slice(0, limit).join('; ')}${parts.length > limit ? `; … ${parts.length - limit} more` : ''}`);
  }
  for (const [label, list] of [['overridden', overridden]] as const) {
    const items = [...new Set(list)];
    if (items.length) lines.push(`  ${label}: ${items.slice(0, limit).join('; ')}${items.length > limit ? `; … ${items.length - limit} more` : ''}`);
  }
  const unique = [...new Set(dormant)];
  if (unique.length) lines.push(`  not applied here: ${unique.slice(0, limit).join('; ')}${unique.length > limit ? `; … ${unique.length - limit} more` : ''}`);
  return lines;
}

export function formatLayoutSummary(report:SummaryReport, {file, source}:{file:string;source:string}) {
  const lines = [`Layout ${report.component ?? file}: ${report.status ?? 'invalid'}`];
  const viewport = report.scope?.viewport;
  if (viewport) lines.push(`Deployment: width ${interval(viewport)}px${viewport.height ? `; height ${interval(viewport.height)}px` : ''}`);
  const declarations = report.declarations ?? [];
  if (declarations.length) {
    const counts = new Map<string,number>();
    for (const item of declarations) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    lines.push(`Declared instances: ${[...counts].map(([status,count]) => `${count} ${status}`).join(', ')}`);
  }
  // Integrity warnings (clipped content, nested scrolling) are listed but do not change the status.
  const rows:SummaryRow[] = [...(report.diagnostics ?? []), ...(report.integrity?.warnings ?? []), ...(report.accessibility?.warnings ?? [])];
  if(report.noshift) {
    const {noshift}=report;
    lines.push(`Noshift: ${noshift.status}; ${noshift.comparisons.checked}/${noshift.comparisons.planned} comparisons (all finite cases)`);
    rows.push(...noshift.diagnostics);
    for(const check of noshift.checks.filter(row=>row.status!=='verified')) {
      const witness=check.proof.witness,change=check.change;
      const index=check.contract.targets.findIndex(target=>target.name===(change?.target ?? witness?.box));
      const target=check.targets[index];
      const identity=check.identities?.find(row=>row.target===change?.target);
      const keys=identity?.keys.length ? ` key ${identity.keys.map(key=>JSON.stringify(key.value)).join(' / ')}` : '';
      if(witness) rows.push({...witness,source:target?.source ?? check.source,
        message:change ? `${JSON.stringify(target?.selector ?? (target?.nodeId ? '@noshift' : change.target))}${keys} ${change.field} changes by ${change.delta.exact}px (${change.before.exact} -> ${change.after.exact}) at viewport ${witness.viewportExact}px × ${witness.viewportHeightExact}px` : `${check.component}: noshift target must remain present in every live case`});
      rows.push(...check.proof.diagnostics.map(row=>({...row,path:check.path,source:target?.source ?? check.source})));
    }
  }
  for (const item of declarations.filter(item => item.status !== 'verified')) {
    const witness = item.proof.witness;
    if (witness && witness.axis !== undefined && witness.required !== undefined) {
      const diagnostic = (report.diagnostics ?? []).find(row => row.box === witness.box && row.path === witness.path);
      rows.push({...witness, source:diagnostic?.source, path:witness.path ?? item.instance?.path,
        checkedContract:`${item.contract.component} at ${item.instance?.path}`,
        message:`${witness.box ?? 'box'} ${witness.axis} size: requires ${witness.required}px but receives ${witness.available}px at viewport ${witness.viewportExact}px × ${witness.viewportHeightExact}px`});
    } else if (witness) rows.push({...witness,path:witness.path ?? item.instance?.path,checkedContract:`${item.contract.component} at ${item.instance?.path}`,
      message:witness.code.startsWith('U_') ? `${item.contract.component}: implementation facts do not cover every required input, box and case` : `${item.contract.component}: declared layout obligation failed`});
    for (const diagnostic of [...(item.coverage?.diagnostics ?? []),...(item.proof.diagnostics ?? [])]) rows.push({...diagnostic,path:item.instance?.path});
  }
  const groups = new Map<string,{row:SummaryRow;paths:Set<string>;contracts:Set<string>}>();
  for (const row of rows) {
    const key = JSON.stringify([row.code,row.message,row.source,row.css,row.range,row.heightRange]);
    if (!groups.has(key)) groups.set(key, {row,paths:new Set(),contracts:new Set()});
    if (row.path) groups.get(key)!.paths.add(row.path);
    if (row.checkedContract) groups.get(key)!.contracts.add(row.checkedContract);
  }
  for (const {row,paths,contracts} of groups.values()) {
    const at = row.css ? `${row.css.file}:${row.css.line ?? 1}${row.css.column ? `:${row.css.column}` : ''}` : location(source,file,(typeof row.source==="object"?row.source.start:undefined) ?? row.start);
    lines.push(`${row.code}: ${row.message}`, `  at ${at}${paths.size ? `; instances: ${[...paths].join(', ')}` : ''}`);
    if (contracts.size) lines.push(`  checked contracts: ${[...contracts].join(', ')}`);
    if (row.range) lines.push(`  width ${interval(row.range)}px${row.heightRange ? `; height ${interval(row.heightRange)}px` : ''}`);
    if (row.hint) lines.push(`  ${row.hint}`);
    if (row.text?.lines) lines.push(`  text: wraps into ${row.text.lines} lines at this width; ${row.text.fitsLines} fit`);
    else if (row.text) lines.push(`  text: up to ${row.text.fitsUpTo} of ${row.text.maxLength} characters fit here (widest ${JSON.stringify(row.text.widest)}); ${(row.text.fitsUpTo ?? 0) + 1} or more may overflow`);
    lines.push(...explanationLines(row.explanation));
    for(const related of row.related??[]) lines.push(`  ${related.message}: ${related.css.file}:${related.css.line}${related.css.column ? `:${related.css.column}` : ''}`);
  }
  if (report.assumptions?.length) lines.push('Scope: closed CSS and trusted content-size bounds; excludes ink overflow and browser pixel rounding.');
  lines.push('Full report: use --json (default).');
  return lines.join('\n');
}
