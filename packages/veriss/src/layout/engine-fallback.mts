// Independent fallback checks: report style/markup findings even when geometry is unknown.
import type {InlineBox,createInlineSolver} from './engine-inline.mjs';
import type {EngineStyle} from './engine-style.mjs';
import type {Region} from './region.mjs';
import type {LayoutDiagnostic,LayoutRange,LayoutRegion} from '../layout-contracts.d.ts';

type Ancestor={box:InlineBox;style:EngineStyle;names?:readonly string[]};
type InlineContext=Parameters<typeof createInlineSolver>[0];
type StyleContext=Pick<InlineContext,'styles'|'pseudoWithoutContent'|'inlineStateTransforms'|'inlineTextAlignment'|'inlineAutoMargin'|'inlineOverflow'|'decorationNone'|'firstPseudoInert'> & {
  root:InlineBox;initial:Region;
  cssMistakes:(box:InlineBox,style:EngineStyle,ancestors:readonly Ancestor[],inherited:EngineStyle|undefined,gridItem:boolean,region:Region,state?:ReadonlySet<string>)=>void;
};
export function checkUnknownStyles({root,initial,styles,cssMistakes,pseudoWithoutContent,inlineStateTransforms,inlineTextAlignment,inlineAutoMargin,inlineOverflow,decorationNone,firstPseudoInert}:StyleContext):void {
    const walkStyles = (box:InlineBox, ancestors:readonly Ancestor[], inherited:EngineStyle|undefined):void => {
      let state; try { [state] = styles(box, initial, ancestors, inherited, false, true); } catch { return; }
      if (!state) return;
      try { cssMistakes(box, state.style, ancestors, inherited, true, state.region, undefined); } catch { /* the rest still runs */ }
      for (const kind of ['before', 'after']) try {
        const pbox = { ...box, path: `${box.path}/${kind === 'before' ? -1 : (box.children ?? []).length}`, label: `${box.label}::${kind}`, children: [], pseudo: kind };
        for (const c of styles(pbox, initial, ancestors, state.style, false, false, new Set([`::${kind}`]))) pseudoWithoutContent(pbox, c.style);
      } catch { /* the rest still runs */ }
      if (state.style.display === 'none') return;
      for (const child of box.children ?? []) walkStyles(child, [...ancestors, { box, style: state.style, names: [] }], state.style);
      // The inline elements of a text leaf (links, spans): the checks that hold for an inline box (F36).
      const walkInline = (child:InlineBox, chain:readonly Ancestor[], parentStyle:EngineStyle):void => {
        let c; try { [c] = styles(child, initial, chain, parentStyle, false, false); } catch { return; }
        if (!c || c.style.display === 'none') return;
        try { inlineStateTransforms(child, c.style); } catch { /* the rest still runs */ }
        try { inlineTextAlignment(child, c.style); } catch { /* the rest still runs */ }
        try { inlineAutoMargin(child, c.style); } catch { /* the rest still runs */ }
        try { inlineOverflow(child, c.style); } catch { /* the rest still runs */ }
        try { decorationNone(child, c.style, chain); } catch { /* the rest still runs */ }
        try { firstPseudoInert(child, c.style); } catch { /* the rest still runs */ }
        for (const grand of child.inline ?? child.children ?? []) walkInline(grand, [...chain, { box: child, style: c.style, names: [] }], c.style);
      };
      for (const child of box.inline ?? []) walkInline(child, [...ancestors, { box, style: state.style, names: [] }], state.style);
    };
    try { walkStyles(root, [], undefined); } catch { /* best effort */ }
}

// The legacy diagnostics list also carries the placeholder-label warning.
// Keep that runtime distinction explicit at this boundary.
type MarkupDiagnostic=Omit<LayoutDiagnostic,'severity'> & {severity:'error'|'warning';rule:string};
export function checkMarkupAccessibility({root,initial,diagnostics,ranges}:{
  root:InlineBox;initial:Region;diagnostics:MarkupDiagnostic[];
  ranges:(region:Region)=>{range:LayoutRange;heightRange?:LayoutRange;region?:LayoutRegion}
}):void {
    const speaks = (box:InlineBox):boolean => Boolean(box.text || box.inline?.length || (box.textContent ?? '').trim() || (box.tag === 'img' && (box.alt ?? '').trim()) || box.alt === undefined && box.tag === 'img' || (box.tag === 'svg' && box.named) || (box.children ?? []).some(speaks) || (box.inline ?? []).some(speaks));
    // label elements by for= (a field is labelled by a wrapping label or label[for=id] whose text is present).
    const labelsFor = new Map<string,InlineBox[]>(); (function collect(box:InlineBox) { if (box.tag === 'label' && box.labelFor) labelsFor.set(box.labelFor, [...(labelsFor.get(box.labelFor) ?? []), box]); for (const child of [...(box.children ?? []), ...(box.inline ?? [])]) collect(child); })(root);
    const labelSpeaks = (label:InlineBox, field:InlineBox) => label.text || (label.textContent ?? '').trim() || [...(label.children ?? []), ...(label.inline ?? [])].some(child => child !== field && speaks(child));
    const fieldOf = (box:InlineBox) => ['select', 'textarea'].includes(box.tag) || (box.tag === 'input' && !['hidden', 'submit', 'reset', 'button', 'image'].includes(box.inputType ?? ""));
    const widget = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'textbox', 'searchbox', 'combobox', 'treeitem', 'gridcell']);
    const owners:Record<string,readonly string[]> = { option: ['listbox'], treeitem: ['tree'], gridcell: ['grid', 'treegrid'], menuitem: ['menu', 'menubar'], menuitemcheckbox: ['menu', 'menubar'], menuitemradio: ['menu', 'menubar'] };
    const roleOfBox = (box:InlineBox) => box.role && box.role !== 'dynamic' ? box.role.split(/\s+/)[0] : undefined;
    const walk = (box:InlineBox, hidden:boolean, wrappingLabel:InlineBox|null = null, ancestorsRoles:readonly string[] = []):void => {
      // UA-hidden: a popover (closed until shown), a dialog that is not open, and a closed details' content.
      const gone = Boolean(hidden || box.ariaHidden || box.hiddenAttr || box.inert || box.popover || (box.tag === 'dialog' && box.dialogOpen !== true) || box.tag === 'template');
      const control = !box.pseudo && (box.tag === 'button' || (box.tag === 'a' && box.focusable !== false && box.href !== undefined));
      // An exposed img without an alt attribute (role none/presentation or aria-hidden take it out of the tree).
      if (box.tag === 'img' && !box.pseudo && !gone && box.alt === undefined && !['none', 'presentation'].includes(String(box.role ?? '').split(/\s+/)[0] ?? ''))
        diagnostics.push({ code: 'E_A11Y_IMAGE_ALT', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'image-alt', ...ranges(initial),
          message: `${box.label} has no alt; use alt="" if it is decorative (checked from the markup; the layout was not analysed)` });
      if (control && !gone && !box.named && !box.labelledBy && !speaks(box))
        diagnostics.push({ code: 'E_A11Y_NAME', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'accessible-name', ...ranges(initial),
          message: `${box.label} has no accessible name: no text, no image text and no aria-label, aria-labelledby or title (checked from the markup; the layout was not analysed)` });
      // form-label: a field with no aria name and no label with text (label[for] or a wrapping label).
      if (!box.pseudo && !gone && fieldOf(box) && box.named !== 'dynamic' && box.inputType !== 'dynamic' && !labelsFor.has('dynamic')) {
        const labelled = box.named === true || (wrappingLabel && labelSpeaks(wrappingLabel, box)) || (box.id && (labelsFor.get(box.id) ?? []).some(l => labelSpeaks(l, box)));
        if (!labelled && !box.labelledBy) diagnostics.push(box.placeholder
          ? { code: 'W_A11Y_PLACEHOLDER_LABEL', severity: 'warning', box: box.label, path: box.path, source: box.source, rule: 'form-label', ...ranges(initial), message: `${box.label} is named only by its placeholder, which disappears on input (checked from the markup; the layout was not analysed)` }
          : { code: 'E_A11Y_LABEL', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'form-label', ...ranges(initial), message: `${box.label} has no label: add a visible <label>, aria-label, aria-labelledby or title (checked from the markup; the layout was not analysed)` });
      }
      // interactive-role-focusable: a widget role on an element that cannot take focus (items of a composite widget get it
      // from their owner).
      const role = roleOfBox(box);
      if (!box.pseudo && !gone && role && widget.has(role) && !(owners[role] ?? []).some(o => ancestorsRoles.includes(o))
        && !(box.focusable === true || (box.tabIndex ?? -1) >= 0 || ['button', 'input', 'select', 'textarea'].includes(box.tag) || (box.tag === 'a' && box.href !== undefined && box.focusable !== false)))
        diagnostics.push({ code: 'E_A11Y_ROLE_FOCUS', severity: 'error', box: box.label, path: box.path, source: box.source, rule: 'interactive-role-focusable', ...ranges(initial), message: `${box.label} has role ${role} but cannot take focus; add tabindex="0" (checked from the markup; the layout was not analysed)` });
      for (const child of [...(box.children ?? []), ...(box.inline ?? [])]) walk(child, gone || (box.tag === 'details' && box.detailsOpen !== true && child.tag !== 'summary'), box.tag === 'label' ? box : wrappingLabel, role ? [...ancestorsRoles, role] : ancestorsRoles);
    };
    walk(root, false);
}
