// The report boundary converts established geometry to the public serializable schema.
import {affine,projection,serialize} from './region.mjs';
import type {Region} from './region.mjs';
import type {Affine2} from './region.mjs';
import type {CSSRule} from './css.mjs';
import {mediaFeatureEntries} from './conditions.mjs';
import {selectorUsage} from './selector-usage.mjs';
import {selectorScope} from './selector-scope.mjs';
import {accessibilityRules,accessibilityProfiles} from './accessibility.mjs';
import type {EngineOptions} from './input.mjs';
import type {NormalizedBox} from '../tree.mjs';
import type {Dimensions} from './engine-types.mjs';
import type {LayoutSummary,LayoutRange,LayoutRegion,LayoutTextFontFacts,LayoutRectangle} from '../layout-contracts.d.ts';
type BoundRect={origin:Dimensions;inline:Affine2;block:Affine2};
type BoundRow={box:{label:string};path:string;bounds?:readonly {region:Region;outer:BoundRect|null;inner:BoundRect|null}[]|undefined};
const encodeRect=(piece:BoundRect|null):LayoutRectangle|null=>piece?{inlineStart:affine(piece.origin.inline),blockStart:affine(piece.origin.block),inlineSize:affine(piece.inline),blockSize:affine(piece.block)}:null;
import type {EngineSize} from './engine-finish.mjs';
export type EngineReport=Omit<LayoutSummary,'sizes'>&{sizes:EngineSize[]};
type ReportData=Pick<EngineReport,'diagnostics'|'policies'|'checks'|'sizes'|'queries'|'subgrids'>;
type A11y=NonNullable<LayoutSummary['accessibility']>;
type Integrity=NonNullable<LayoutSummary['integrity']>;
interface ReportInput extends ReportData {
  component:string;block:boolean;options:EngineOptions;initial:Region;
  rules:readonly CSSRule[];styleSources:readonly {kind?:'reset'|'app';file:string}[];
  boxes:readonly NormalizedBox[];geometry:readonly BoundRow[];
  ranges:(region:Region)=>{range:LayoutRange;heightRange?:LayoutRange;region?:LayoutRegion};
  scrollbars:NonNullable<LayoutSummary['scrollbars']>;invalidSubstitutions:NonNullable<LayoutSummary['invalidSubstitutions']>;
  layoutWarnings:NonNullable<LayoutSummary['layoutWarnings']>;pageScroll:LayoutSummary['pageScroll'];
  transitionSizes:NonNullable<LayoutSummary['transitionSizes']>;
  textFonts:ReadonlyMap<string,Omit<LayoutTextFontFacts,'path'|'varied'>|'varied'>;
  untransformed:boolean;hovered:string|undefined;generatedTexts:NonNullable<LayoutSummary['generatedText']>;
  accessibilityWarnings:A11y['warnings'];accessibilityExempted:A11y['exempted'];accessibilityNotes:A11y['notes'];
  integrityWarnings:Integrity['warnings'];integrityExempted:Integrity['exempted'];
}
export function buildLayoutReport({component,block,options,initial,rules,styleSources,boxes,geometry,ranges,diagnostics,policies,checks,sizes,queries,subgrids,scrollbars,invalidSubstitutions,layoutWarnings,pageScroll,transitionSizes,textFonts,untransformed,hovered,generatedTexts,accessibilityWarnings,accessibilityExempted,accessibilityNotes,integrityWarnings,integrityExempted}:ReportInput):EngineReport {
  const a11y=typeof options.accessibility==='object'?options.accessibility:{};
  const integrity=typeof options.integrity==='object'?options.integrity:{};
  const status = diagnostics.some(d => d.severity === 'unknown') ? 'unknown' : diagnostics.length ? 'violated' : 'verified';
  return { version: 1, ok: status === 'verified', status, component,
    scope: { ...(options.mediaFeatures!==undefined?{mediaFeatures:Object.fromEntries(mediaFeatureEntries(options.mediaFeatures))}:{}), axis: block ? 'both' : 'inline', viewport: { ...projection(initial, 'x'), ...(block ? { height: options.viewport.height ? projection(initial, 'y') : null } : {}) }, hostInset: options.hostInset ?? 0, ...(block ? { hostBlockInset: options.hostBlockInset ?? 0 } : {}), closedCSS: true, browserRounding: false, blockSizing: block },
    assumptions: [...(mediaFeatureEntries(options.mediaFeatures).map(([k,v])=>'CSS media environment is explicitly fixed: '+k+': '+v+'.')), ...(options.scripting==='enabled' ? ['The supplied DOM is a static snapshot in a scripting-enabled browser; script-driven mutations and disabled scripting are not checked.'] : []), 'The supplied CSS is the complete author cascade and the selected root has no external query-container ancestors; host provides the declared containing sizes without unmodeled scrollbar gutters.',
      'Each minInlineSize/minBlockSize is a trusted sufficient content-size bound; intrinsicBlockSize is a trusted exact auto-height profile for the permitted content/fonts.',
      'Only horizontal-tb/ltr in-flow and explicitly sized local absolute geometry is checked; ink overflow and browser pixel rounding are outside the contract.',
      ...(rules.some(rule=>rule.declarations.some(d=>d.expression || d.pending)) ? ['Custom properties are unregistered; unknown external inheritance and cycles through fallback references prevent verification when used by geometry.'] : [])],
    styleSources: styleSources.map(({ kind, file }) => ({ kind, file })), diagnostics, policies, checks, sizes, queries, subgrids,
    elements:boxes.map(({path,tag,id,classes,owner,targets,targetIdentity})=>({path,tag,...(id ? {id} : {}),classes,owner,...(targets?.length ? {targets} : {}),...(targetIdentity ? {targetIdentity} : {})})),
    ...(boxes.some(box=>box.layoutContracts?.length) ? {layoutBindings:boxes.flatMap(box=>(box.layoutContracts ?? []).map(declaration=>({path:box.path,declaration})))} : {}),
    ...(geometry.some(row => row.bounds) ? {inlineBounds:geometry.flatMap(row=>(row.bounds??[]).map(piece=>({box:row.box.label,path:row.path,...ranges(piece.region),...(block?{regionConstraints:serialize(piece.region).constraints}:{}),outer:encodeRect(piece.outer),inner:encodeRect(piece.inner)})))} : {}),
    ...(scrollbars.length ? {scrollbars} : {}), ...(invalidSubstitutions.length ? {invalidSubstitutions} : {}), ...(layoutWarnings.length ? { layoutWarnings } : {}), ...(pageScroll ? { pageScroll } : {}), ...(transitionSizes.length ? { transitionSizes } : {}), ...(options.reportTextFonts ? { textFonts: [...textFonts].map(([path, facts]) => facts === 'varied' ? { path, varied: true } : { path, ...facts }) } : {}), ...((options.selectors || options.scope) && !untransformed && hovered === undefined && !options.$animationFrame && !options.$slideVariant ? { selectors: (() => { const usage = options.selectors ? selectorUsage(rules, boxes) : { rows: [], warnings: [] }; return options.scope ? { ...usage, warnings: [...usage.warnings, ...selectorScope(rules, boxes, options.scope).warnings] } : usage; })() } : {}), ...(generatedTexts.length ? { generatedText: generatedTexts } : {}),
    ...(options.accessibility ? { accessibility: { rules: accessibilityRules.filter(accessibilityProfiles[a11y.profile ?? 'all']), profile: a11y.profile ?? 'all', contrast: a11y.contrast ?? 'AA', targetLevel: a11y.targetLevel ?? 'AA', targetSize: a11y.targetSize ?? (a11y.targetLevel === 'AAA' ? 44 : 24), warnings: accessibilityWarnings, exempted: accessibilityExempted, notes: accessibilityNotes } } : {}),
    ...(options.integrity ? { integrity: { rules: ['page-overflow-x', 'container-protrusion', 'text-collision', 'target-undersized', 'clipped-content', 'nested-scroll'], targetSize: integrity.targetSize ?? 24, protrusion: integrity.protrusion ?? 'all', warnings: integrityWarnings, exempted: integrityExempted } } : {}) };
}
