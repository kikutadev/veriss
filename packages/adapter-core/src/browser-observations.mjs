const valid = (x) => Number.isFinite(x) && x >= 0;
const rectangle = (r) => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width >= 0 && r.height >= 0;
const identities = (state, profile) => {
    if (!state || !profile || typeof state !== 'string' || typeof profile !== 'string')
        throw new TypeError('Expected state and profile identifiers');
};
export function viewportObservation(state, profile, frame) {
    identities(state, profile);
    if (!valid(frame.viewport) || frame.viewport === 0 || !valid(frame.height) || frame.height === 0 || !valid(frame.documentWidth) ||
        frame.main !== null && !rectangle(frame.main) || !Array.isArray(frame.overflowElements))
        throw new TypeError('Invalid viewport measurement');
    return { state, profile, width: frame.viewport, height: frame.height,
        rects: { ...(frame.main ? { main: frame.main } : {}), scrollExtent: { x: 0, y: 0, width: frame.documentWidth, height: frame.height } } };
}
export async function captureViewport(page, { state, profile, mainSelector = 'main,[role=main]' }) {
    const frame = await page.evaluate(({ selector }) => {
        const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        const main = document.querySelector(selector);
        // Structural paths only: do not return DOM text, attribute values,
        // credentials, form inputs, user IDs or session information.
        const path = (el) => {
            const parts = [];
            let n = el;
            for (let depth = 0; n && depth < 4; depth++, n = n.parentElement) {
                let index = 1;
                for (let prev = n.previousElementSibling; prev; prev = prev.previousElementSibling)
                    if (prev.tagName === n.tagName)
                        index++;
                parts.unshift(n.tagName.toLowerCase() + ':nth-of-type(' + index + ')');
            }
            return parts.join(' > ');
        };
        const overflowElements = document.documentElement.scrollWidth > innerWidth + 2 ?
            [...(main?.querySelectorAll('*') ?? [])].filter(el => {
                const r = el.getBoundingClientRect(), style = getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.right > innerWidth + 2;
            }).slice(0, 8).map(path) : [];
        return { viewport: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, main: main ? rect(main) : null, overflowElements };
    }, { selector: mainSelector });
    return { frame, observation: viewportObservation(state, profile, frame) };
}
/** Keyboard exploration starts from a caller-selected anchor on an already
 * logged-in page. The caller declares which drawer/panel is CLOSED. */
export async function captureClosedScopeTabFocus(page, { anchor, closedScope, steps = 6 }) {
    if (!anchor || !closedScope || !Number.isSafeInteger(steps) || steps < 1 || steps > 64)
        throw new TypeError('Invalid keyboard focus exploration');
    await page.locator(anchor).focus();
    const focus = [];
    for (let i = 0; i < steps; i++) {
        await page.keyboard.press('Tab');
        const result = await page.evaluate(({ scope }) => {
            const el = document.activeElement, r = el?.getBoundingClientRect();
            if (!el || !r)
                return { step: null };
            return { step: { tag: el.tagName.toLowerCase(), inScope: !!el.closest(scope),
                    offscreen: r.width > 0 && r.height > 0 && (r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight),
                    bounds: { x: r.x, y: r.y, width: r.width, height: r.height } } };
        }, { scope: closedScope });
        if (result.step)
            focus.push(result.step);
    }
    return { steps: focus, passed: !focus.some(s => s.inScope && s.offscreen) };
}
/** A genuine aria-modal dialog must keep sequential keyboard focus inside.
 * Sampled behavior only: this does not prove every element or browser state.
 * The caller opens the dialog first and retains responsibility for teardown. */
function modalFocusContained(steps) {
    if (steps.length === 0 || steps.some(s => !rectangle(s.bounds)))
        throw new TypeError('Invalid modal focus measurement');
    // Native <dialog> may transiently report BODY as activeElement while its
    // top-layer still blocks background interaction: that outcome is unknown.
    const escaped = steps.some(s => !s.inScope && !['body', 'html'].includes(s.tag));
    const hidden = steps.some(s => s.inScope && s.offscreen);
    if (!escaped && !hidden && steps.some(s => !s.inScope && ['body', 'html'].includes(s.tag)))
        throw new Error('Indeterminate document focus during modal Tab traversal');
    return !escaped && !hidden;
}
export async function captureModalTabFocus(page, { scope = '[role="dialog"][aria-modal="true"]', steps = 6 }) {
    if (!scope || !Number.isSafeInteger(steps) || steps < 1 || steps > 64)
        throw new TypeError('Invalid modal exploration');
    // Refuse nonmodal popovers and hidden DOM nodes, rather than reporting a
    // false positive or pretending a missing dialog has been verified.
    const init = await page.evaluate(({ selector }) => {
        const el = document.querySelector(selector);
        if (!el)
            return { present: false, modal: false, visible: false };
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return { present: true, modal: el.getAttribute('aria-modal') === 'true',
            visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' };
    }, { selector: scope });
    if (!init.present || !init.modal || !init.visible)
        throw new Error('Open visible aria-modal dialog required for focus capture');
    const focus = [];
    for (let i = 0; i < steps; i++) {
        await page.keyboard.press('Tab');
        const result = await page.evaluate(({ selector }) => {
            const el = document.activeElement, r = el?.getBoundingClientRect();
            if (!el || !r)
                return { step: null };
            return { step: { tag: el.tagName.toLowerCase(),
                    inScope: !!el.closest(selector),
                    offscreen: r.width <= 0 || r.height <= 0 || r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight,
                    bounds: { x: r.x, y: r.y, width: r.width, height: r.height } } };
        }, { selector: scope });
        if (result.step)
            focus.push(result.step);
    }
    if (focus.length !== steps)
        throw new Error('Modal focus position could not be observed');
    return { steps: focus, passed: modalFocusContained(focus) };
}
