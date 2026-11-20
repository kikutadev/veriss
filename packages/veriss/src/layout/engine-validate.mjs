// Admission checks for the modeled layout subset. No recursive solving.
import { number } from './linear.mjs';
import { px, viewportLength } from './css.mjs';
import { ratioOf } from './engine-edges.mjs';
import { unitContext } from './engine-geometry.mjs';
import { viewportFont, zoomShortfall } from './zoom-font.mjs';
import { textFontMismatch, textBrowserMismatch, textLinesMismatch, textLangMismatch } from './text-font.mjs';
const fontValue = (value) => { if (typeof value !== 'string')
    throw Object.assign(new Error('Computed font property is unresolved'), { code: 'U_LAYOUT_TEXT_FONT' }); return value; };
const measuredFont = (s) => ({
    'font-family': fontValue(s['font-family']), 'font-size': fontValue(s['font-size']), 'line-height': fontValue(s['line-height']), 'font-weight': fontValue(s['font-weight']),
    'font-style': fontValue(s['font-style']), 'font-stretch': fontValue(s['font-stretch']), 'font-variant': fontValue(s['font-variant']), 'text-transform': fontValue(s['text-transform']),
    'letter-spacing': fontValue(s['letter-spacing']), 'word-spacing': fontValue(s['word-spacing'])
});
export const visuallyHiddenStyle = (style) => style['clip-path'] === 'empty' || style.clip === 'empty' || (['hidden', 'clip'].includes(String(style['overflow-x'])) && /^\d+(?:\.\d+)?px$/.test(String(style['block-size'])) && Number(String(style['block-size']).slice(0, -2)) <= 1);
export function createStyleValidator({ block, options, rootTag, uaEngine, layoutWarnings, policies, issue, ranges }) {
    function validate(style, box, region, emit, available = {}, parentStyle = null) {
        if (style.display === 'none')
            return false;
        if (box.whitespace && !['normal', 'nowrap'].includes(String(style['white-space'])))
            throw new Error('Preserved whitespace needs explicit text geometry from the input adapter');
        // A px height on text whose font-size follows the user's default font size: a larger default makes the text
        // taller than the box, which then overflows it or clips it (min-height grows, so it is fine).
        // Visually hidden text (clipped to nothing, or a 1px box that hides its overflow) is meant not to be seen.
        const visuallyHidden = visuallyHiddenStyle(style);
        if ((box.text || box.inline?.length) && !box.pseudo && emit && !visuallyHidden && /^\d+(?:\.\d+)?px$/.test(String(style['block-size'])) && style.$sources?.['block-size'] && !layoutWarnings.some(w => w.code === 'W_LAYOUT_HEIGHT_FIXED_TEXT' && w.path === box.path)) {
            const size = String(style['font-size']);
            const keyword = /^(?:medium|small|large|x-small|x-large|xx-small|xx-large|xxx-large|smaller|larger|ua)$/.test(size);
            if (!/^\d+(?:\.\d+)?px$/.test(size) && (keyword || !unitContext.rootFontSize))
                layoutWarnings.push({ code: 'W_LAYOUT_HEIGHT_FIXED_TEXT', severity: 'warning', box: box.label, path: box.path, blockSize: style['block-size'], fontSize: size,
                    message: `${box.label} has height: ${style['block-size']} but its text follows the user's default font size (font-size: ${size === 'ua' ? 'the UA default' : size}): with a larger default the text outgrows the box and ${['hidden', 'clip'].includes(String(style['overflow-y'])) ? 'is cut off' : 'overflows it'}. Use min-height (or padding) instead`, ...ranges(region) });
        }
        // A px line-height on text whose font-size follows the user's default font size (no px root size and a
        // relative size, or a keyword such as medium): a larger default grows the glyphs, not the line, so wrapped lines
        // overlap. Unitless or em line-heights grow with the text.
        if ((box.text || box.inline?.length) && !box.pseudo && emit && /^\d+(?:\.\d+)?px$/.test(String(style['line-height'])) && !layoutWarnings.some(w => w.code === 'W_LAYOUT_LINE_HEIGHT_FIXED' && w.path === box.path)) {
            const size = String(style['font-size']);
            const keyword = /^(?:medium|small|large|x-small|x-large|xx-small|xx-large|xxx-large|smaller|larger|ua)$/.test(size);
            const scales = !/^\d+(?:\.\d+)?px$/.test(size) && (keyword || !unitContext.rootFontSize);
            if (scales)
                layoutWarnings.push({ code: 'W_LAYOUT_LINE_HEIGHT_FIXED', severity: 'warning', box: box.label, path: box.path, lineHeight: style['line-height'], fontSize: size,
                    message: `${box.label} has line-height: ${style['line-height']} but font-size: ${size === 'ua' ? 'the UA default' : size}, which follows the user's default font size: with a larger default the text grows and the lines do not, so wrapped lines overlap. Use a unitless line-height (e.g. 1.5)`, ...ranges(region) });
        }
        // A font-size in viewport units alone (or mostly): page zoom shrinks the viewport in CSS px, so the text does not
        // grow with zoom; where 200% zoom shows it below twice its size it fails SC 1.4.4 unless it is resized otherwise.
        // Judged on the declaring element (descendants inherit the computed px). Evaluated at every whole px of width.
        if (!box.pseudo && emit && style.$sources?.['font-size'] && !layoutWarnings.some(w => w.code === 'W_LAYOUT_FONT_ZOOM' && w.path === box.path)) {
            const specified = String(style.$sources['font-size'].specified ?? '');
            const root = unitContext.rootFontSize ?? (/rem\b/.test(specified) ? undefined : 16);
            const f = root === undefined ? null : viewportFont(specified, typeof root === 'object' ? Number(number(root)) : Number(root));
            const heights = /vh|vmin|vmax/.test(specified) ? [options.viewport.height?.min, options.viewport.height?.max].filter(h => typeof h === 'number') : [600];
            if (f && heights.length) {
                const short = heights.flatMap(h => zoomShortfall(f, options.viewport, h));
                if (short.length) {
                    const lo = Math.min(...short.map(r => r[0])), hi = Math.max(...short.map(r => r[1])), mid = Math.round((lo + hi) / 2), h = heights[0];
                    layoutWarnings.push({ code: 'W_LAYOUT_FONT_ZOOM', severity: 'warning', box: box.label, path: box.path, fontSize: specified, intervals: short, range: { min: lo, max: hi, minInclusive: true, maxInclusive: true },
                        message: `${box.label} has font-size: ${specified}: viewport units do not grow with page zoom, so at 200% zoom it shows at ${(2 * f(mid / 2, h / 2) / f(mid, h)).toFixed(2)}× (viewport ${mid}px), short of 2× (SC 1.4.4). Add a rem or px part that grows, e.g. max(…, 1rem) only where the vw part is below it, or clamp with rem bounds` });
                }
            }
        }
        // An absolute font-size on html or body replaces the user's default font size (the browser's font size setting):
        // the page's text no longer follows it (relative sizes, %, em, rem and the medium keyword do).
        if (['html', 'body'].includes(box.tag) && !box.pseudo && style.$sources?.['font-size'] && /^\d+(?:\.\d+)?(?:px|pt|pc|cm|mm|in|q)$/i.test(String(style['font-size']))
            && emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_ROOT_FONT_FIXED' && w.path === box.path))
            layoutWarnings.push({ code: 'W_LAYOUT_ROOT_FONT_FIXED', severity: 'warning', box: box.label, path: box.path, fontSize: style['font-size'],
                message: `${box.label} sets font-size: ${style['font-size']}, an absolute length: it replaces the user's default font size, so text no longer grows with the browser's font size setting. Use a percentage or rem (for example 100%)`, ...ranges(region) });
        // hyphens: auto hyphenates by the content language's dictionary (not modeled); with no language (no lang on the
        // element, an ancestor or the html element) browsers do not hyphenate, so it breaks like manual (measured).
        if ((box.text || box.inline?.length) && !box.pseudo && style.hyphens === 'auto') {
            if (style.$lang === '<dynamic>')
                throw Object.assign(new Error(`${box.label}: hyphens: auto with a dynamic lang`), { code: 'U_LAYOUT_CSS' });
            if (style.$lang)
                throw Object.assign(new Error(`${box.label}: hyphens: auto with lang ${style.$lang} breaks words by that language's hyphenation dictionary, which is not modeled`), { code: 'U_LAYOUT_CSS' });
            if (rootTag !== 'html')
                throw Object.assign(new Error(`${box.label}: hyphens: auto in a fragment: whether it hyphenates depends on the document's lang, which is not known here`), { code: 'U_LAYOUT_CSS' });
            if (emit && !layoutWarnings.some(w => w.code === 'W_LAYOUT_HYPHENS_NO_LANG' && w.path === box.path))
                layoutWarnings.push({ code: 'W_LAYOUT_HYPHENS_NO_LANG', severity: 'warning', box: box.label, path: box.path,
                    message: `${box.label} has hyphens: auto but no language (no lang attribute on it, an ancestor or html): browsers do not hyphenate it, and long words overflow or break as with hyphens: manual. Set lang on the html element`, ...ranges(region) });
        }
        // Derived text metrics apply only to the exact font they were measured with.
        if (box.contract?.font) {
            const reason = textFontMismatch(measuredFont(style), box.contract.font, options.defaultFontSize) ?? textLangMismatch(style.$lang, box.contract.textMetrics?.lang) ?? (box.contract.textMetrics?.kind === 'lines' ? textLinesMismatch({ 'white-space': String(style['white-space']), 'overflow-wrap': String(style['overflow-wrap']), ...(style.$lang !== undefined ? { $lang: style.$lang } : {}) }, { ...box.contract, font: box.contract.font, textMetrics: box.contract.textMetrics }) : null);
            if (reason)
                throw Object.assign(new Error(reason), { code: 'U_LAYOUT_TEXT_FONT' });
            const browser = textBrowserMismatch(uaEngine(), { ...(style.direction !== undefined ? { direction: style.direction } : {}) }, box.contract);
            if (browser)
                throw Object.assign(new Error(`${box.label}: ${browser}`), { code: 'U_LAYOUT_BROWSER' });
        }
        // A button with the reset may also be a grid or flex container (an icon and a label): measured in Chromium, it lays
        // its children out exactly as a div with the same CSS.
        // A text field (text-like input or textarea) keeps the same box with its default appearance once the author sets
        // its padding and border on every side (measured): only its UA paint differs.
        const textField = box.tag === 'textarea' || (box.tag === 'input' && ['text', 'email', 'search', 'password', 'tel', 'url', 'number', 'date', 'time', 'datetime-local', 'month', 'week', undefined].includes(box.inputType));
        // (Or known from the UA profile: the ua option makes a field's default padding and border known.)
        const authoredEdges = ['left', 'right', 'top', 'bottom'].every(side => (style.$sources?.[`padding-${side}`] || (options.ua && style[`padding-${side}`] !== 'ua')) && (style.$sources?.[`border-${side}`] || (options.ua && style[`border-${side}`] !== 'ua')));
        // A button's box is the same with its default appearance (measured: sizes, padding, border, grid content); its
        // UA padding, border, colors and display are modeled.
        const buttonLike = box.tag === 'button' || (box.tag === 'input' && ['button', 'submit', 'reset'].includes(String(box.inputType)));
        // A range slider keeps the same box with its default appearance (no padding or border; measured).
        const rangeLike = box.tag === 'input' && box.inputType === 'range';
        if (!box.pseudo && ['button', 'input', 'select', 'textarea'].includes(box.tag) && ((style.appearance !== 'none' && !(textField && authoredEdges) && !buttonLike && !rangeLike) || (style.display !== 'block' && !(box.tag === 'button' && ['grid', 'flex'].includes(String(style.display)) && (box.children ?? []).length))))
            throw new Error(`Checked ${box.tag === 'button' ? 'buttons' : 'form controls'} require appearance:none, display:block and explicit box-sizing/min-size/padding/border resets`);
        // A fieldset's rendered legend sits in its border: modeled only when the fieldset generates no box.
        // Replaced elements and text fields have intrinsic sizes the model does not compute.
        // Layout shifts from images (Layout Instability, measured): an img without a reserved height gets one when it
        // loads; one whose reserved ratio differs from the file's changes height when it loads.
        if (['img', 'video'].includes(box.tag) && style.$imageUnreserved && emit)
            issue('E_LAYOUT_IMAGE_UNRESERVED', `${box.label} has no reserved height: it shifts the layout when ${style.$imageUnreserved.src} loads; add width="${style.$imageUnreserved.width}" height="${style.$imageUnreserved.height}" (the file's size) or an aspect-ratio`, box, region);
        if (['img', 'video'].includes(box.tag) && style.$imageRatioMismatch && emit)
            issue('E_LAYOUT_IMAGE_RATIO', `${box.label} reserves the ratio ${style.$imageRatioMismatch.reserved} but ${style.$imageRatioMismatch.src} is ${style.$imageRatioMismatch.natural.width}×${style.$imageRatioMismatch.natural.height}: its height changes when it loads`, box, region);
        if (box.tag === 'img' && !box.pseudo && style['block-size'] === 'auto' && !ratioOf(style) && block)
            throw Object.assign(new Error(`${box.label} has no reserved height (no height, aspect-ratio or width/height attributes) and its file's size is not known; it shifts the layout when it loads`), { code: 'U_LAYOUT_IMAGE' });
        // An img may leave its block-size auto when an aspect-ratio (CSS or its width/height attributes) gives it.
        // A text field that is a grid item (not block flow) with an auto width and justify-self normal/stretch is
        // stretched to its area like a block (measured in Chromium: 368px in a 368px column; in block flow it keeps its
        // intrinsic width instead, which is not modeled). Its intrinsic minimum stays Unknown where a track probes it.
        // (A grid's justify-items other than normal/stretch is Unknown for its items, checked with the item's alignment.)
        const stretchedField = (textField || rangeLike) && available.gridItem && !available.blockFlowChild && style['inline-size'] === 'auto'
            && ['auto', 'normal', 'stretch'].includes(String(style['justify-self'] ?? 'auto'));
        // A replaced element or field in a flex row with a px flex-basis and a non-auto min-width: the flex algorithm
        // sizes its main axis from those alone (its intrinsic width is neither its base size nor its automatic minimum).
        const flexSized = (textField || rangeLike) && available.flexItem?.main === 'inline' && available.inline && /^\d+(?:\.\d+)?px$/.test(String(style['flex-basis']))
            && /^\d+(?:\.\d+)?px$|^0$/.test(String(style['min-inline-size']));
        if (!box.pseudo && ['img', 'input', 'select', 'textarea', 'iframe', 'svg', 'video', 'audio', 'marquee', 'canvas'].includes(box.tag) && (style.display !== 'block' || (style['inline-size'] === 'auto' && !stretchedField && !flexSized) || (block && style['block-size'] === 'auto' && !(['img', 'video', 'iframe', 'svg'].includes(box.tag) && ratioOf(style)))))
            throw new Error(`Checked ${box.tag} elements require display:block and an explicit inline-size${block ? ' and block-size' : ''}; intrinsic sizes are not modeled`);
        // A translate moves painted and hit-tested coordinates, which the accessibility and integrity checks use; layout
        // proofs (transitions, no-shift, coordinate contracts) keep it Unknown.
        // A closed popover that author CSS displays keeps the UA [popover] { position: fixed; inset: 0; margin: auto }:
        // it renders as a fixed, centred box over the page, which is not modeled.
        // A closed dialog that author CSS displays: it renders as the UA's position: absolute box over the page.
        if (box.tag === 'dialog' && box.dialogOpen === false && style.display !== 'none') {
            if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_DIALOG_CLOSED_SHOWN' && w.path === box.path))
                layoutWarnings.push({ code: 'W_LAYOUT_DIALOG_CLOSED_SHOWN', severity: 'warning', box: box.label, path: box.path,
                    ...(style.$sources?.display ? { css: [{ property: 'display', file: style.$sources.display.file, line: style.$sources.display.line, selector: style.$sources.display.selector }] } : {}),
                    message: `${box.label} is a closed dialog, but display: ${style.display} overrides the UA dialog:not([open]) { display: none }, so it shows over the page while closed. Put the display on dialog[open] (or .x[open])`, ...ranges(region) });
            throw Object.assign(new Error(`${box.label} is a closed dialog that renders (author display overrides dialog:not([open]) { display: none }); its UA position: absolute is not modeled`), { code: 'U_LAYOUT_DIALOG', box });
        }
        if (box.popover === true && style.display !== 'none')
            throw Object.assign(new Error(`${box.label} is a closed popover that renders (author display overrides [popover]:not(:popover-open) { display: none }); its UA position: fixed is not modeled`), { code: 'U_LAYOUT_POPOVER' });
        if (style.$sticky && (!options.accessibility && !options.integrity || !['0', '0px'].includes(String(style.top)) || ['bottom', 'left', 'right'].some(key => style[key] !== 'auto') || !block || !options.viewport.height || (options.hostBlockInset ?? 0) !== 0))
            throw Object.assign(new Error(`${box.label} is position: sticky; only top: 0 under the page scroll (no scrolling or clipping ancestor) is modeled, for the accessibility and integrity checks`), { code: 'U_LAYOUT_CSS' });
        if (style.$fixed && !options.accessibility && !options.integrity)
            throw Object.assign(new Error(`${box.label} is position: fixed; it is modeled (against the viewport at scroll position 0) for the accessibility and integrity checks only`), { code: 'U_LAYOUT_CSS' });
        if (style.$fixed && (!options.viewport.height || (options.hostInset ?? 0) !== 0 || (options.hostBlockInset ?? 0) !== 0))
            throw Object.assign(new Error(`${box.label} is position: fixed; the viewport needs a height range and the component must start at the viewport origin`), { code: 'U_LAYOUT_CSS' });
        if (/^(?:rotate|linear)-any\(/.test(String(style.transform)) && (!options.accessibility || options.integrity))
            throw Object.assign(new Error(`transform ${style.transform}: an arbitrary rotation is modeled for the accessibility checks only (not integrity, whose overflow it changes)`), { code: 'U_LAYOUT_CSS' });
        if (style.transform !== 'none' && !options.accessibility && !options.integrity)
            throw Object.assign(new Error(`transform ${style.transform} moves the painted box; it is modeled for the accessibility and integrity checks only`), { code: 'U_LAYOUT_CSS' });
        // float on a grid or flex item does nothing (CSS Flexbox §3, Grid §3: the item is blockified, float ignored;
        // measured: the rectangles are the same without it): it is also reported as inert, which says why. The checked
        // layout forbids float everywhere (E_LAYOUT_FLOAT, a policy), so that stays.
        if (['left', 'right', 'inline-start', 'inline-end'].includes(String(style.float)) && parentStyle && ['grid', 'inline-grid', 'flex', 'inline-flex'].includes(String(parentStyle.display)) && !parentStyle.$blockFlow) {
            if (!layoutWarnings.some(w => w.code === 'W_LAYOUT_DECLARATION_INERT' && w.path === box.path && w.properties?.includes('float')))
                layoutWarnings.push({ code: 'W_LAYOUT_DECLARATION_INERT', severity: 'warning', box: box.label, path: box.path, properties: ['float'], ...(style.$sources?.float ? { css: [{ property: 'float', file: style.$sources.float.file, line: style.$sources.float.line, selector: style.$sources.float.selector }] } : {}),
                    message: `${box.label}: float: ${style.float} has no effect (its parent is display: ${parentStyle.display}, whose items do not float). Use justify-self, margin-left: auto or order to move it`, ...ranges(region) });
        }
        if (['left', 'right', 'inline-start', 'inline-end'].includes(String(style.float))) {
            issue('E_LAYOUT_FLOAT', 'float is forbidden in checked layout', box, region);
            return false;
        }
        if (style.float !== 'none')
            throw new Error('Unsupported float value');
        if (style.display === 'contents')
            throw new Error('display: contents on the analyzed root or with text needs its parent box and anonymous items');
        if (!['block', 'grid', 'flex'].includes(String(style.display)))
            throw new Error(`Unsupported display: ${style.display}`);
        // text-wrap: balance / pretty re-break wrapping text; the measured line profile assumes greedy breaking.
        // Checklist E3: balance only balances short text (measured: Chromium and Firefox up to 6 lines, WebKit longer). Dynamic text (the adapters'
        // … for an expression) with no length bound can grow past that and stop balancing.
        if (style['text-wrap-style'] === 'balance' && !['nowrap', 'pre'].includes(String(style['white-space'])) && String(box.textContent ?? box.text ?? '').includes('…') && box.attributes?.['data-text-max-length'] === undefined && !layoutWarnings.some(w => w.code === 'W_LAYOUT_BALANCE_LINES' && w.path === box.path))
            layoutWarnings.push({ code: 'W_LAYOUT_BALANCE_LINES', severity: 'warning', box: box.label, path: box.path, css: style.$sources?.['text-wrap-style'] ? [{ property: 'text-wrap', file: style.$sources['text-wrap-style'].file, line: style.$sources['text-wrap-style'].line, selector: style.$sources['text-wrap-style'].selector }] : undefined,
                message: `${box.label} balances dynamic text (text-wrap: balance) with no length bound: Chromium and Firefox balance only up to 6 lines (WebKit longer), so a long value stops being balanced there. Bound its length (data-text-max-length), or use text-wrap: pretty` });
        if (['balance', 'pretty'].includes(String(style['text-wrap-style'])) && (box.text || box.inline?.length) && !['nowrap', 'pre'].includes(String(style['white-space'])))
            throw Object.assign(new Error(`${box.label} has text-wrap: ${style['text-wrap-style']}, which changes where its text wraps (the line profile assumes greedy breaking); keep it on one line or drop it`), { code: 'U_LAYOUT_CSS' });
        if (['grid', 'flex'].includes(String(style.display)) && box.text)
            throw new Error('Wrap text in an explicit leaf; anonymous grid/flex text items need a layout adapter');
        // Main-axis auto margins of flex items absorb free space (resolved by the flex line).
        // A grid item may also have px margins: its grid area less the margins is what it is laid out in (margins of grid
        // and flex items never collapse).
        // A negative px margin on a flex row item's main axis (an overlapping avatar stack): its outer size shrinks by it.
        const marginOk = (key, axis) => ((available.gridItem || available.flexItem) && viewportLength(style[key])) || (available.flexItem?.main === 'inline' && axis === 'inline' && /^-\d+(?:\.\d+)?px$/.test(String(style[key]))) || style[key] === '0' || (style[key] === 'auto' && available.flexItem?.main === axis) || ((available.gridItem || available.flexItem) && /^\d+(?:\.\d+)?px$/.test(String(style[key]))) || (available.gridItem && axis === 'inline' && style[key] === 'auto' && available.autoMargins);
        // px margins on items of a row flex container are modeled (layoutFlex adds them to the outer sizes); a column's not.
        // px margins on flex items are modeled (layoutFlex adds them to the outer sizes on both axes).
        if (['margin-left', 'margin-right'].some(key => !marginOk(key, 'inline')))
            throw new Error(available.flexItem && ['margin-left', 'margin-right'].some(key => style[key] === 'auto') ? 'Cross-axis auto margins of a flex item are outside the subset' : 'Only known zero inline margins are supported');
        if (block && ['margin-top', 'margin-bottom'].some(key => !marginOk(key, 'block')))
            throw new Error(available.flexItem && ['margin-top', 'margin-bottom'].some(key => style[key] === 'auto') ? 'Cross-axis auto margins of a flex item are outside the subset' : 'Reset native block margins explicitly before block checking');
        if (!['static', 'relative', 'absolute'].includes(String(style.position)) || style['writing-mode'] !== 'horizontal-tb' || !['ltr', 'rtl'].includes(String(style.direction)))
            throw new Error('Only static/relative/local-absolute horizontal-tb boxes are supported');
        // rtl scroll containers put the scrollbar on the left; the container's own box and content width do not change,
        // and positions inside a scroll container are withheld anyway, so nothing depends on the side.
        // Relative offsets (checklist D1) in px move the box and its contents (resolvedOrigin); a percentage needs the
        // containing block's size, which is not modeled here.
        if (style.position === 'relative' && ['left', 'right', 'top', 'bottom'].some(key => !['auto'].includes(String(style[key])) && !/^-?(?:\d+(?:\.\d+)?|\.\d+)px$|^0$/.test(String(style[key]))))
            throw new Error('Relative positioning offsets other than px are not modeled');
        // In an rtl box the children are placed from its inline end, mirrored: an inline offset there is not modeled yet.
        if (style.position === 'relative' && style.direction === 'rtl' && ['left', 'right'].some(key => !['auto', '0', '0px'].includes(String(style[key]))))
            throw new Error('A relative inline offset in an rtl box is not modeled');
        if (style.position === 'absolute' && (!block || ['inline-size', 'block-size'].some(key => style[key] === 'auto') || style['grid-column'] !== 'auto' || style['grid-row'] !== 'auto'))
            throw new Error('Absolute boxes require both explicit sizes, both-axis analysis and auto Grid placement');
        if (!['border-box', 'content-box'].includes(String(style['box-sizing'])))
            throw new Error('Unsupported box-sizing');
        if (!['normal', 'inline-size', 'size'].includes(String(style['container-type'])))
            throw new Error('Unsupported container-type');
        if (style['container-name'] !== 'none' && !String(style['container-name']).split(/\s+/).every(name => /^[a-zA-Z_][\w-]*$/.test(name) && !['and', 'or', 'not', 'none', 'default', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(name.toLowerCase())))
            throw new Error('Unsupported container-name');
        for (const axis of ['inline', 'block']) {
            const key = axis === 'inline' ? 'x' : 'y', policy = box.contract?.[axis === 'inline' ? 'overflow' : 'overflowBlock'] ?? 'fit';
            if (!['visible', 'hidden', 'clip', 'auto', 'scroll'].includes(String(style[`overflow-${key}`])))
                throw new Error('Unsupported overflow value');
            if (axis === 'block' && !block)
                continue;
            if (emit) {
                const value = style[`overflow-${key}`];
                if ((policy === 'scroll' && !['auto', 'scroll'].includes(String(value))) || (policy === 'clip' && !['clip', 'hidden'].includes(String(value))) || (policy === 'visible' && value !== 'visible'))
                    issue('E_LAYOUT_OVERFLOW_POLICY', `Requested ${policy} policy disagrees with computed overflow-${key}: ${value}`, box, region, axis);
                policies.push({ box: box.label, path: box.path, axis, overflow: policy, ...ranges(region) });
            }
        }
        if (!['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'].includes(String(style['white-space'])) || !['normal', 'anywhere', 'break-word'].includes(String(style['overflow-wrap'])))
            throw new Error('Unsupported text wrapping value');
        const nowrap = ['nowrap', 'pre'].includes(String(style['white-space'])), wrap = box.contract?.wrap;
        if (emit && ((wrap === 'anywhere' && (nowrap || style['overflow-wrap'] !== 'anywhere')) || (wrap === 'normal' && nowrap) || (wrap === 'nowrap' && !nowrap)))
            issue('E_LAYOUT_WRAP', `Requested ${wrap} wrapping disagrees with CSS`, box, region);
        for (const axis of ['inline', 'block']) {
            if (axis === 'block' && !block) {
                if (style['block-size'] !== 'auto' || style['grid-template-rows'] !== 'none')
                    throw new Error('Enable block checking for explicit block sizes or row tracks');
                continue;
            }
            // max-inline-size in px clamps the preferred width (CSS 2 §10.4: max(min, min(preferred, max))); flex items and
            // other max sizes are not modeled.
            // max-block-size in px: it caps an explicit or stretched height, and a leaf's content height; an auto-height
            // container with children is not modeled.
            if (axis === 'block' && style['max-block-size'] !== 'none' && !(/^\d+(?:\.\d+)?px$/.test(String(style['max-block-size'])) && !available.flexItem && style.display !== 'table' && (style['block-size'] !== 'auto' || !(box.children ?? []).length || (available.block && available.alignBlock === undefined && !available.root))))
                throw new Error('CSS max size clamping is not modeled');
            if (style[`max-${axis}-size`] !== 'none' && axis === 'inline' && !(((/^\d+(?:\.\d+)?px$/.test(String(style['max-inline-size']))) || (!/px$/.test(String(style['max-inline-size'])) && available.inline && !available.flexItem)) && (!available.flexItem || available.flexItem.main === 'inline') && style.display !== 'table'))
                throw new Error('CSS max size clamping is not modeled');
            if (axis === 'inline') {
                if (style['min-inline-size'] !== 'auto')
                    px(String(style['min-inline-size']));
                // A column flex item's minimum is resolved by the flex line (its track is never smaller).
                // min-block-size raises a leaf's content height, an explicit or stretched height, and a block-flow container
                // whose content stays at the top, also as an item of a flex row (its line's cross size takes the raised height).
                // Grid and flex containers (it stretches their rows or line) and other flex items are not modeled.
            }
            else if (!['auto', '0', '0px'].includes(String(style['min-block-size'])) && !available.flexBlockMinimum) {
                const leaf = !(box.children ?? []).length && !['grid', 'inline-grid', 'flex', 'inline-flex', 'table'].includes(String(style.display));
                const blockFlow = ['block', 'list-item'].includes(String(style.display)) && ['normal', 'start', 'flex-start'].includes(String(style['align-content']));
                const stretched = available.block && available.alignBlock === undefined && !available.root;
                // A stretched item of a single-line flex row whose height is a px length: the line's cross size is that height
                // (whatever the items' minimums), and the item's height is the larger of it and its minimum, as for a grid item.
                const parentFlex = parentStyle;
                const fixedLine = available.flexItem?.main === 'inline' && !!parentFlex && String(parentFlex['flex-wrap']) === 'nowrap' && /^\d+(?:\.\d+)?px$/.test(String(parentFlex['block-size']))
                    && ['auto', '0', '0px'].includes(String(parentFlex['min-block-size'])) && String(parentFlex['max-block-size']) === 'none';
                // (A flex row of indefinite height: the line is the tallest item's hypothetical size, each raised to its px
                // minimum, so a stretched item is never below its minimum; and its content is measured before the raise.)
                const measuredLine = available.flexItem?.main === 'inline' && /^\d+(?:\.\d+)?px$/.test(String(style['min-block-size'])) && (available.$crossMeasure || stretched || available.$minNatural || available.$minRaised) && !!parentFlex && String(parentFlex['block-size']) === 'auto' && ['auto', '0', '0px'].includes(String(parentFlex['min-block-size'])) && String(parentFlex['max-block-size']) === 'none';
                if (!measuredLine && !available.$minNatural && !available.$minRaised && !(stretched && (!available.flexItem || fixedLine) && !['table'].includes(String(style.display))) && ((available.flexItem && !(available.flexItem.main === 'inline' && (leaf || blockFlow))) || !(leaf || blockFlow || (style['block-size'] !== 'auto' && !['flex', 'inline-flex', 'table'].includes(String(style.display))))))
                    throw new Error('CSS min-block-size clamping is not modeled here (a grid or flex container, or a flex item)');
            }
        }
        // Flex containers and items validate their alignment in the flex model.
        // (align-items does nothing on a block container: reported as inert, not Unknown.)
        // Grid items align in their area's block axis by align-self (align-items of the grid): start, center and end are
        // modeled (gridAlign); baseline is not.
        const gridSelf = ['normal', 'stretch', 'start', 'end', 'center', 'flex-start', 'flex-end', 'self-start', 'self-end'];
        if (block && ((style.display !== 'flex' && !['block', 'list-item'].includes(String(style.display)) && !(style.display === 'grid' ? gridSelf : ['normal', 'stretch']).includes(String(style['align-items']))) || (!available.flexItem && !available.blockFlowChild && !(available.gridItem ? ['auto', ...gridSelf] : ['auto', 'normal', 'stretch']).includes(String(style['align-self']))) || (style.display !== 'flex' && !['normal', 'stretch', 'start', ...(style.display === 'grid' ? ['center', 'end'] : []), ...(style.display === 'block' && !box.text && !box.inline?.length ? ['center', 'end', 'flex-end', 'flex-start', 'space-between', 'space-around', 'space-evenly'] : [])].includes(String(style['align-content'])))))
            throw new Error('Only stretch items and normal/stretch/start (grid: center/end) content alignment are supported');
        return true;
    }
    return validate;
}
