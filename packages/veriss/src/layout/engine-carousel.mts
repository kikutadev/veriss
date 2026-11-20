// Enumerate authored carousel states and compare only boxes outside the slides.
import type {NormalizedBox} from '../tree.mjs';
import type {LayoutDiagnostic, LayoutSummary, LayoutRange, LayoutRegion} from '../layout-contracts.d.ts';
import type {Region} from './region.mjs';
import {exact, number} from './linear.mjs';
import {layoutStartMoves, shiftScoreBound} from './engine-geometry.mjs';

type VariantReport = Pick<LayoutSummary,'status'|'diagnostics'|'sizes'>;
const role=(box:NormalizedBox,name:string)=>String(box.aria?.['aria-roledescription'] ?? '').trim().toLowerCase()===name;
export const hasCarousel=(box:NormalizedBox):boolean=>role(box,'carousel')||(box.children??[]).some(hasCarousel);

export function checkCarouselShifts({root,pristine,block,diagnostics,ranges,analyze}:{
  root:NormalizedBox;pristine:NormalizedBox;block:boolean;diagnostics:LayoutDiagnostic[];
  ranges:(region:Region)=>{range:LayoutRange;heightRange?:LayoutRange;region?:LayoutRegion};
  analyze:(root:NormalizedBox)=>VariantReport;
}):void {
  const carousels:NormalizedBox[] = []; (function walk(box:NormalizedBox) { if (role(box, 'carousel')) carousels.push(box); for (const child of box.children ?? []) walk(child); })(root);
  for (const carousel of carousels.slice(0, 8)) {
    const slides:NormalizedBox[] = []; (function walk(box:NormalizedBox) { for (const child of box.children ?? []) { if (role(child, 'slide')) slides.push(child); else if (!role(child, 'carousel')) walk(child); } })(carousel);
    if (slides.length < 2) continue;
    const fail = (message:string) => diagnostics.push({ code: 'U_LAYOUT_CAROUSEL_SHIFT', severity: 'unknown', message: `${carousel.label}: ${message}`, box: carousel.label, path: carousel.path });
    const shownByHidden = slides.filter(slide => slide.hiddenAttr !== true);
    // A state class (active, is-current, selected, show, …) that exactly one slide carries marks the shown slide.
    const stateClass = /(?:^|[-_])(?:active|current|selected|show|shown|visible|open)$/i;
    const unique = slides.map(slide => slide.classes.filter(c => stateClass.test(c) && !slides.some(other => other !== slide && other.classes.includes(c))));
    let marker: {kind:'hidden'}|{kind:'class';name:string}|null;
    if (slides.some(slide => slide.hiddenAttr === 'dynamic' || slide.hiddenAttr === 'until-found' || [...slide.classes].some(c => c === 'dynamic'))) { fail('a slide with a dynamic hidden attribute or class is not enumerated'); continue; }
    if (shownByHidden.length === 1) marker = { kind: 'hidden' };
    else if (unique.filter(list => list.length).length === 1) marker = { kind: 'class', name: unique.find(list => list.length)![0]! };
    else if (shownByHidden.length !== slides.length) { fail('the shown slide is not identified (one slide without hidden, or one with a state class such as active that no other slide has)'); continue; }
    else marker = null; // every slide shown at once (a scrolling track): switching does not change the layout
    if (!marker) continue;
    const inSlide = (path:string) => slides.some(slide => path === slide.path || path.startsWith(slide.path + '/'));
    const variants: {target:NormalizedBox;report:VariantReport}[] = [];
    for (const target of slides.slice(0, 16)) {
      const copy = structuredClone(pristine);
      const find = (box:NormalizedBox, path:string):NormalizedBox|undefined => box.path === path ? box : (box.children ?? []).map(child => find(child, path)).find(Boolean);
      const list = slides.map(slide => find(copy, slide.path));
      if (list.some(slide => !slide)) { fail('a slide is missing from the original tree'); break; }
      const cloned = list.filter((slide):slide is NormalizedBox => slide !== undefined);
      if (marker.kind === 'hidden') cloned.forEach(slide => { if (slide.path === target.path) delete slide.hiddenAttr; else slide.hiddenAttr = true; });
      else cloned.forEach(slide => { slide.classes = slide.classes.filter(c => c !== marker.name); if (slide.path === target.path) slide.classes.push(marker.name); });
      variants.push({ target, report: analyze(copy) });
    }
    const failed = variants.find(v => v.report.status === 'unknown');
    if (failed) { fail(`its layout with ${failed.target.label} shown is not decided (${failed.report.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`); continue; }
    if (variants.length !== Math.min(slides.length,16)) continue;
    const first = variants[0]!;
    for (const variant of variants.slice(1)) {
      const result = layoutStartMoves(first.report.sizes, variant.report.sizes, row => !inSlide(row.path));
      if (result.undecided !== undefined) { fail(`${result.undecided.box} has no layout rectangle to compare across slides`); break; }
      for (const move of result.moves) diagnostics.push({ code: 'E_LAYOUT_CAROUSEL_SHIFT', severity: 'error', box: move.row.box, path: move.row.path, carousel: carousel.label, carouselPath: carousel.path, from: first.target.label, to: variant.target.label, field: move.field, delta: exact(move.delta),
        ...(() => { const bound = block ? shiftScoreBound(first.report.sizes, variant.report.sizes, row => !inSlide(row.path), move.v) : null; return bound !== null ? { scoreBound: bound } : {}; })(),
        message: `Switching ${carousel.label} from ${first.target.label} to ${variant.target.label} moves ${move.row.box} (${move.field} by ${number(move.delta)}px at viewport ${number(move.v.x)}px${block ? ` × ${number(move.v.y)}px` : ''}): slides of different sizes shift the page. Give the slide area a fixed height or aspect-ratio, or stack the slides in one grid cell`, ...ranges(move.shared) });
      if (result.moves.length) break;
    }
  }
}
