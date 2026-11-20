// Resource and container-query coverage warnings require a decided layout.
import type {ImageSize} from '../tree.mjs';
import type {ParsedCondition} from './conditions.mjs';
import type {Region} from './region.mjs';
import type {LayoutDiagnostic,LayoutWarning} from '../layout-contracts.d.ts';
interface QueryFact {condition:ParsedCondition & {css?:{file:string;line:number}};target:string|undefined;box:string;matched:boolean;region:Region}
interface SourceUse {box:{label:string;path:string};sources:readonly {facts:ImageSize}[];chosen:ReadonlySet<number>;active:ReadonlySet<number>}
export function checkQueryCoverage({diagnostics,layoutWarnings,sourceUse,queryFacts}:{
  diagnostics:readonly LayoutDiagnostic[];layoutWarnings:LayoutWarning[];
  sourceUse:ReadonlyMap<string,SourceUse>;queryFacts:readonly QueryFact[];
}):void {
  if(diagnostics.some(d=>d.severity==='unknown'))return;
  // A picture source that is never the selected one in the checked range: an earlier source's media covers every
  // width where its own matches (the first matching source wins), or its media never matches. Its files are dead.
  for (const use of sourceUse.values()) use.sources.forEach((source, i) => {
    if (use.chosen.has(i)) return;
    const media = source.facts.media ?? 'all', earlier = use.sources.slice(0, i).map(s => s.facts.media ?? 'all');
    layoutWarnings.push({ code: 'W_LAYOUT_SOURCE_SHADOWED', severity: 'warning', box: use.box.label, path: use.box.path, source: i, media, srcset: source.facts.srcset,
      message: use.active.has(i)
        ? `<source media="${media}"> (source ${i + 1}) of ${use.box.label}'s picture is never used: wherever it matches, an earlier source (${earlier.join(', ')}) matches too, and the first match wins. Order the sources from the most specific media to the least`
        : `<source media="${media}"> (source ${i + 1}) of ${use.box.label}'s picture never matches in the checked viewport range, so it is never used` });
  });
  // A container query that matches no element anywhere in the checked range: no ancestor is a query container (of
  // that name), or the containers it finds are never that size. Its rules never apply.
  {
    const byRule = new Map<string,QueryFact[]>();
    for (const f of queryFacts) {
      const key = `${f.condition.css?.file}:${f.condition.css?.line}:${f.condition.params}`;
      if (!byRule.has(key)) byRule.set(key, []);
      byRule.get(key)!.push(f);
    }
    for (const facts of byRule.values()) {
      if (facts.some(f => f.matched)) continue;
      const { condition } = facts[0]!, targets = [...new Set(facts.map(f => f.target).filter(Boolean))], boxes = [...new Set(facts.map(f => f.box))];
      const why = !targets.length ? (condition.name ? `no ancestor of ${boxes.join(', ')} has container-name: ${condition.name}` : `no ancestor of ${boxes.join(', ')} has a container-type`) : `its container ${targets.join(', ')} is never that size in the checked viewport range`;
      layoutWarnings.push({ code: 'W_CSS_CONTAINER_QUERY_NEVER', severity: 'warning', box: boxes[0]!, boxes, query: condition.params, ...(condition.name ? { name: condition.name } : {}), reason: targets.length ? 'size' : 'no-container',
        ...(condition.css ? { css: condition.css } : {}),
        message: `@container ${condition.params} never matches: ${why}, so its rules never apply${targets.length ? '' : ` (give an ancestor container-type: inline-size${condition.name ? ` and container-name: ${condition.name}` : ''})`}` });
    }
  }
}
