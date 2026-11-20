// Pre-layout diagnostics derived from the closed DOM and parsed stylesheet.
// Kept in historical order so report output remains stable.
import { q, sub, div, cmp, number } from './linear.mjs';
import { setRegisteredProperties, matches } from './css.mjs';
import { PARENT, dynamicAttributeTests } from './selectors.mjs';
import { syntaxWarnings, syntaxNoteOrder } from '../rules/syntax-notes.mjs';
export function preflight({ options, boxes, parsed, diagnostics, layoutWarnings, unknown }) {
    const { rules, notes, registered, markerSizing, defaultNamespace } = parsed;
    if (options.accessibility && Object.hasOwn(options.mediaFeatures ?? {}, 'prefers-reduced-motion'))
        unknown('U_LAYOUT_QUERY', 'A fixed reduced-motion geometry profile does not check motion accessibility across preferences');
    // A selector testing the value of an attribute that is dynamic on an element (an adapter's placeholder): whether
    // the rule applies there is not known.
    // Likewise a structural pseudo-class on the root of a component: its siblings in the page are not known.
    for (const box of boxes)
        if (box.attributes || !box[PARENT])
            for (const rule of rules)
                for (const selector of rule.selectors ?? []) {
                    const tests = dynamicAttributeTests(selector, box);
                    const attributes = tests.filter(t => t.kind === 'attribute'), structural = tests.filter(t => ['structural', 'has'].includes(t.kind));
                    if (attributes.length && !diagnostics.some(d => d.code === 'U_LAYOUT_ATTRIBUTE' && d.path === box.path))
                        unknown('U_LAYOUT_ATTRIBUTE', `${box.label}: ${selector.source} tests the value of ${attributes.map(t => t.name).join(', ')}, which is dynamic here`, rule.line, box, rule.file);
                    if (structural.length && !diagnostics.some(d => d.code === 'U_LAYOUT_STRUCTURAL' && d.path === box.path))
                        unknown('U_LAYOUT_STRUCTURAL', `${box.label}: ${selector.source} tests its position among its siblings, which are outside the analyzed root`, rule.line, box, rule.file);
                }
    // A media-query gap: max-width: M and min-width: m with M < m ≤ M + 1 (767px and 768px) leave the widths strictly
    // between them matched by neither (Media Queries 4 treats width as continuous and warns of exactly this; its range
    // syntax, width < 768px, has no gap). A zoomed page or a fractional device pixel ratio can make the CSS viewport
    // width fractional. Not measured: Chromium, Firefox and WebKit round an iframe's viewport width to whole pixels, and
    // browser zoom could not be driven here. Gaps of 0.02px or less (Bootstrap's 767.98px) are the common workaround and
    // are not reported. Reported where the two rules set the same property on the same selector.
    {
        const widthAtoms = (rule) => rule.contexts.filter(c => c.kind === 'media').flatMap(c => c.groups.length === 1 ? c.groups[0].filter(a => a.feature === 'width' && a.value !== undefined) : []);
        const set = (rule) => new Set(rule.selectors.flatMap(sel => rule.declarations.map(d => `${sel.source}|${d.property}`)));
        const below = rules.flatMap(rule => widthAtoms(rule).filter(a => a.relation === '<=').map(a => ({ rule, value: a.value })));
        const above = rules.flatMap(rule => widthAtoms(rule).filter(a => a.relation === '>=').map(a => ({ rule, value: a.value })));
        for (const b of below)
            for (const a of above) {
                if (!(cmp(sub(a.value, b.value), div(q(1), q(50))) > 0 && cmp(sub(a.value, b.value), q(1)) <= 0))
                    continue;
                const shared = [...set(b.rule)].filter(key => set(a.rule).has(key));
                if (!shared.length || layoutWarnings.some(w => w.code === 'W_CSS_MEDIA_GAP' && w.max === number(b.value) && w.min === number(a.value)))
                    continue;
                const [selector, property] = shared[0].split('|');
                layoutWarnings.push({ code: 'W_CSS_MEDIA_GAP', severity: 'warning', max: number(b.value), min: number(a.value), selector, property,
                    message: `@media (max-width: ${number(b.value)}px) and @media (min-width: ${number(a.value)}px) leave the widths between them matched by neither (a zoomed page or a fractional device pixel ratio can make the viewport ${(number(b.value) + number(a.value)) / 2}px wide): there ${selector} gets neither rule's ${property}. Use max-width: ${number(a.value) - 0.02}px, or a range query (width < ${number(a.value)}px)` });
            }
    }
    // F5: a media query no viewport matches (every query of its list contradicts itself: min-width above max-width).
    {
        const seen = new Set();
        for (const rule of rules)
            for (const c of rule.contexts ?? []) {
                if (c.kind !== 'media' || !c.groups?.length || c.groups.length !== c.listed || seen.has(c.params))
                    continue;
                const never = (group) => ['width', 'height'].some(feature => {
                    let lo = null, loStrict = false, hi = null, hiStrict = false;
                    for (const a of group) {
                        if (a.feature !== feature || a.relation === undefined || a.value === undefined)
                            continue;
                        if (['>=', '>', '='].includes(a.relation) && (lo === null || cmp(a.value, lo) > 0 || (cmp(a.value, lo) === 0 && a.relation === '>'))) {
                            lo = a.value;
                            loStrict = a.relation === '>';
                        }
                        if (['<=', '<', '='].includes(a.relation) && (hi === null || cmp(a.value, hi) < 0 || (cmp(a.value, hi) === 0 && a.relation === '<'))) {
                            hi = a.value;
                            hiStrict = a.relation === '<';
                        }
                    }
                    return lo !== null && hi !== null && (cmp(lo, hi) > 0 || (cmp(lo, hi) === 0 && (loStrict || hiStrict)));
                });
                if (!c.groups.every(never))
                    continue;
                seen.add(c.params);
                layoutWarnings.push({ code: 'W_CSS_MEDIA_NEVER', severity: 'warning', media: c.params, selector: rule.selectors?.[0]?.source, css: [{ property: '@media', file: rule.file, line: rule.line, selector: `@media ${c.params}` }],
                    message: `@media ${c.params} matches no viewport (its lower bound is above its upper bound): its rules never apply. Check the order of min and max (min-width: 600px and max-width: 900px)` });
            }
    }
    // :disabled / :enabled where an element's disabled attribute is dynamic (an adapter's expression): whether the rule
    // applies is not known.
    if (rules.some(rule => rule.selectors.some(sel => JSON.stringify(sel).includes('"kind":"disabled"'))) && boxes.some(box => box.disabled === 'dynamic'))
        unknown('U_LAYOUT_ATTRIBUTE', `${boxes.find(box => box.disabled === 'dynamic').label}: a :disabled or :enabled rule depends on a disabled state that is dynamic, or that browsers decide differently (an option in a disabled select)`);
    // F64: DOM properties written as HTML attributes.
    for (const b of boxes)
        if (b.notAttributes?.length) {
            const how = { indeterminate: 'set input.indeterminate = true in script', value: b.tag === 'textarea' ? 'put the text inside <textarea>…</textarea>' : 'put selected on the <option>', defaultvalue: 'write value="…"', defaultchecked: 'write checked', disabled: b.tag === 'a' ? 'the link stays focusable and clickable: remove href and set aria-disabled="true", or use a <button disabled>' : 'the element stays focusable and clickable: use a <button disabled> or aria-disabled="true"', checked: 'only a checkbox or a radio button is checked', readonly: `a ${b.tag === 'select' ? 'select' : 'checkbox or radio'} still changes when clicked: use disabled (or prevent the change in script)`, placeholder: `a ${b.tag === 'input' ? `type=${(b.inputType ?? 'text')} input` : `<${b.tag}>`} shows no placeholder: use a label, or a first <option> for a select`, maxlength: 'it limits text fields only: use max (and min) on a number input', selected: 'only an <option> is selected' };
            layoutWarnings.push({ code: 'W_HTML_ATTRIBUTE_NOT_HTML', severity: 'warning', box: b.label, path: b.path, attributes: b.notAttributes,
                message: `${b.label}: ${b.notAttributes.map(a => a === 'defaultvalue' ? 'defaultValue' : a === 'defaultchecked' ? 'defaultChecked' : a).join(', ')} on <${b.tag}> does nothing${b.notAttributes.every(a => ['disabled', 'checked', 'selected', 'readonly', 'placeholder', 'maxlength'].includes(a)) ? ' (this element does not take it)' : ': it is a DOM property (or a framework prop), not an HTML attribute here'}. ${b.notAttributes.map(a => how[a]).join('; ')}` });
        }
    // F28: presentational attributes on elements they do not map to.
    for (const b of boxes)
        if (b.inertAttributes?.length)
            layoutWarnings.push({ code: 'W_HTML_ATTRIBUTE_INERT', severity: 'warning', box: b.label, path: b.path, attributes: b.inertAttributes,
                message: `${b.label}: the ${b.inertAttributes.join(', ')} attribute${b.inertAttributes.length > 1 ? 's do' : ' does'} nothing on <${b.tag}> (only some elements — images, tables and their cells, embedded content — take ${b.inertAttributes.length > 1 ? 'them' : 'it'}). Use CSS (${b.inertAttributes.map(a => a === 'bgcolor' ? 'background-color' : a === 'border' ? 'border' : a).join(', ')})` });
    // F27: the HTML parser changed the structure written in the source (the analysis, like the browser, lays out the
    // parsed tree; the CSS was likely written for the source's).
    for (const b of boxes)
        if (b.restructured && !layoutWarnings.some(w => w.code === 'W_HTML_RESTRUCTURED' && w.path === b.path))
            layoutWarnings.push({ code: 'W_HTML_RESTRUCTURED', severity: 'warning', box: b.label, path: b.path, tag: b.tag,
                message: b.restructured === 'fostered' ? `${b.label} is written inside a <table> but outside its cells, so the HTML parser moves it before the table (foster parenting): it is not in the table in the page. Put it in a cell (<td>) or a <caption>, or outside the table` : b.restructured === 'nested-form' ? `${b.label} has a <form> written inside it: the HTML parser drops the inner <form> start tag, so its fields belong to the outer form and its attributes (action, method) are lost. Forms cannot be nested: close the outer one first, or use the form attribute on the fields` : b.restructured === 'implied' ? `${b.label} is not in the source: the HTML parser made it (a stray </${b.tag}> after an element that cannot be inside a <${b.tag}> — a block in a paragraph — closed the open one, and the end tag became an empty <${b.tag}>). The elements written inside it are siblings in the page: nest only phrasing content in <${b.tag}>` : `${b.label} is closed early by the HTML parser (its </${b.tag}> does not end it: an element it cannot contain — a nested <a>, a block in a <button> or a heading in a heading — was written inside), so the elements after that point are not inside it in the page. Fix the nesting` });
    // F26: a child combinator through an element the HTML parser inserted (the tbody of a table written with its rows
    // directly inside): table > tr never matches — the selector matches only with the implied element skipped.
    for (const b of boxes)
        if (b.implied)
            for (const c of b.children ?? [])
                for (const rule of rules)
                    for (const sel of rule.selectors ?? []) {
                        if (sel.state || sel.pseudoElement || matches(sel, c) || !matches(sel, { ...c, [PARENT]: b[PARENT] }) || layoutWarnings.some(w => w.code === 'W_CSS_SELECTOR_IMPLIED_PARENT' && w.selector === sel.source))
                            continue;
                        layoutWarnings.push({ code: 'W_CSS_SELECTOR_IMPLIED_PARENT', severity: 'warning', box: c.label, path: c.path, selector: sel.source, css: [{ property: 'selector', file: rule.file, line: rule.line, selector: sel.source }],
                            message: `${sel.source} never matches ${c.label}: the HTML parser puts a ${b.tag} between it and its ${b[PARENT]?.tag ?? 'parent'} (no ${b.tag} is written in the source, but every table has one), so the child combinator skips nothing. Write ${b[PARENT]?.tag ?? 'table'} > ${b.tag} > ${c.tag}, or use a descendant combinator` });
                    }
    setRegisteredProperties(registered);
    if (defaultNamespace.length && boxes.some(box => ['svg', 'math'].includes(box.tag)))
        unknown('U_LAYOUT_CSS', 'A default XHTML @namespace keeps type and universal selectors off the SVG and MathML elements of this page, which is not modeled', defaultNamespace[0].line, undefined, defaultNamespace[0].file);
    layoutWarnings.push(...syntaxWarnings(notes, ['W_CSS_MARKER_IGNORED']));
    // A ::marker rule that sizes the marker (font, line-height, content, …) on a list item: the marker box is not modeled
    // and it changes the first line's height (measured, by amounts browsers differ on).
    {
        const sized = markerSizing.find(note => boxes.some(box => !box.pseudo && note.selectors.some(sel => matches(sel, box, new Set(['::marker'])))));
        if (sized)
            unknown('U_LAYOUT_CSS', `::marker sets ${sized.property}, which sizes the list marker and can change the line's height: the marker box is not modeled`, sized.line, undefined, sized.file);
    }
    // F62: a country code where a language code belongs (:lang(jp) for Japanese, which is ja): it matches no page.
    {
        const country = { jp: 'ja (Japanese)', cn: 'zh (Chinese)', cz: 'cs (Czech)', gr: 'el (Greek)', dk: 'da (Danish)', ua: 'uk (Ukrainian)' };
        const seen = new Set();
        for (const rule of rules)
            for (const sel of rule.selectors ?? [])
                for (const part of sel.parts ?? []) {
                    if (part.kind !== 'lang')
                        continue;
                    const code = part.value.split('-')[0];
                    const language = country[code];
                    if (!language || seen.has(sel.source))
                        continue;
                    seen.add(sel.source);
                    layoutWarnings.push({ code: 'W_CSS_LANG_CODE', severity: 'warning', selector: sel.source, css: [{ property: ':lang', file: rule.file, line: rule.line, selector: sel.source }],
                        message: `${sel.source}: ${code} is a country code, not a language code, so :lang(${part.value}) matches lang="${code}" only — the language is ${language}. Write :lang(${language.split(' ')[0]})` });
                }
    }
    layoutWarnings.push(...syntaxWarnings(notes, syntaxNoteOrder.filter(code => code !== 'W_CSS_MARKER_IGNORED')));
    if (rules.some(rule => rule.stateLayout && !rule.hoverLayout) && !options.accessibility)
        unknown('U_LAYOUT_SELECTOR', 'A :focus rule changes the layout; the focused layout is modeled for the accessibility checks only');
    if (rules.some(rule => rule.stateGeometry) && !options.accessibility && !options.integrity)
        unknown('U_LAYOUT_SELECTOR', 'A state rule moves a box (focus insets or a transform); that is modeled for the accessibility and integrity checks only');
}
