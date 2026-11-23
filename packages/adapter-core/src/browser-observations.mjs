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
/** An offscreen focus is a defect only when it occurs inside the caller's
 * declared *closed* scope. An intentionally off-canvas drawer without focus
 * is not a defect. This records a sampled action, never a CSS proof. */
export function focusObservation(state, profile, viewport, height, steps, event = 'keyboard-focus-visible') {
    identities(state, profile);
    if (!event || !valid(viewport) || !viewport || !valid(height) || !height || !Array.isArray(steps) ||
        steps.some(s => !rectangle(s.bounds)))
        throw new TypeError('Invalid keyboard event or focus measurement');
    return { state, profile, width: viewport, height, event, to: state, passed: !steps.some(s => s.inScope && s.offscreen) };
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
export async function captureClosedScopeTabFocus(page, { state, profile, anchor, closedScope, steps = 6, event = 'keyboard-focus-visible' }) {
    identities(state, profile);
    if (!anchor || !closedScope || !Number.isSafeInteger(steps) || steps < 1 || steps > 64)
        throw new TypeError('Invalid keyboard focus exploration');
    await page.locator(anchor).focus();
    const focus = [];
    let width = 0, height = 0;
    for (let i = 0; i < steps; i++) {
        await page.keyboard.press('Tab');
        const result = await page.evaluate(({ scope }) => {
            const el = document.activeElement, r = el?.getBoundingClientRect();
            if (!el || !r)
                return { width: innerWidth, height: innerHeight, step: null };
            return { width: innerWidth, height: innerHeight, step: { tag: el.tagName.toLowerCase(), inScope: !!el.closest(scope),
                    offscreen: r.width > 0 && r.height > 0 && (r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight),
                    bounds: { x: r.x, y: r.y, width: r.width, height: r.height } } };
        }, { scope: closedScope });
        width = result.width;
        height = result.height;
        if (result.step)
            focus.push(result.step);
    }
    return { steps: focus, observation: focusObservation(state, profile, width, height, focus, event) };
}
/** A genuine aria-modal dialog must keep sequential keyboard focus inside.
 * Sampled behavior only: this does not prove every element or browser state.
 * The caller opens the dialog first and retains responsibility for teardown. */
export function modalFocusObservation(state, profile, viewport, height, steps, event = 'modal-focus-contained') {
    identities(state, profile);
    if (!event || !valid(viewport) || !viewport || !valid(height) || !height || !Array.isArray(steps) || steps.length === 0 ||
        steps.some(s => !rectangle(s.bounds)))
        throw new TypeError('Invalid modal focus measurement');
    // Native <dialog> may transiently report BODY as activeElement in some
    // engines while the top-layer modal still blocks background interaction.
    // This is inconclusive, not evidence of a usable focus escape.
    const definiteEscape = steps.some(s => !s.inScope && !['body', 'html'].includes(s.tag));
    const hiddenFocus = steps.some(s => s.inScope && s.offscreen);
    if (!definiteEscape && !hiddenFocus && steps.some(s => !s.inScope && ['body', 'html'].includes(s.tag)))
        throw new Error('Indeterminate document focus during modal Tab traversal');
    return { state, profile, width: viewport, height, event, to: state, passed: !definiteEscape && !hiddenFocus };
}
export async function captureModalTabFocus(page, { state, profile, scope = '[role="dialog"][aria-modal="true"]', steps = 6, event = 'modal-focus-contained' }) {
    identities(state, profile);
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
    let width = 0, height = 0;
    for (let i = 0; i < steps; i++) {
        await page.keyboard.press('Tab');
        const result = await page.evaluate(({ selector }) => {
            const el = document.activeElement, r = el?.getBoundingClientRect();
            if (!el || !r)
                return { width: innerWidth, height: innerHeight, step: null };
            return { width: innerWidth, height: innerHeight, step: { tag: el.tagName.toLowerCase(),
                    inScope: !!el.closest(selector),
                    offscreen: r.width <= 0 || r.height <= 0 || r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight,
                    bounds: { x: r.x, y: r.y, width: r.width, height: r.height } } };
        }, { selector: scope });
        width = result.width;
        height = result.height;
        if (result.step)
            focus.push(result.step);
    }
    if (focus.length !== steps)
        throw new Error('Modal focus position could not be observed');
    return { steps: focus, observation: modalFocusObservation(state, profile, width, height, focus, event) };
}
const count = (n) => Number.isSafeInteger(n) && n >= 0;
export function controlAvailabilityObservation(state, profile, width, height, controls, expected, event = 'role-controls-match') {
    identities(state, profile);
    if (!event || !valid(width) || width === 0 || !valid(height) || height === 0 || !Array.isArray(controls) || controls.length === 0 ||
        controls.some(c => !c.id || !count(c.matched) || !count(c.enabled) || !count(c.blocked) || !count(c.uncertain) ||
            c.enabled + c.blocked + c.uncertain !== c.matched) || new Set(controls.map(c => c.id)).size !== controls.length ||
        Object.keys(expected).length !== controls.length || controls.some(c => !['some-enabled', 'all-enabled', 'all-blocked'].includes(expected[c.id] ?? '')))
        throw new TypeError('Invalid role control measurements');
    // An absent selector, or a semantic-only disabled state with no browser
    // enforcement, must NOT be accepted as a successful security restriction.
    if (controls.some(c => c.matched === 0 || c.uncertain > 0))
        throw new Error('Inconclusive role control availability');
    const passed = controls.every(c => expected[c.id] === 'some-enabled' ? c.enabled > 0 :
        expected[c.id] === 'all-enabled' ? c.enabled === c.matched : c.enabled === 0 && c.blocked === c.matched);
    return { state, profile, width, height, event, to: state, passed };
}
/** Observe an already-authenticated role-specific view. We only classify
 * native controls with enforced disabled/inert or rendered, enabled UI. An
 * aria-disabled-only or pointer-events-only pattern is inconclusive. */
export async function captureControlAvailability(page, { state, profile, controls, event = 'role-controls-match' }) {
    identities(state, profile);
    if (!Array.isArray(controls) || controls.length === 0 || controls.length > 24 ||
        new Set(controls.map(c => c.id)).size !== controls.length || controls.some(c => !c.id || !c.selector || !['some-enabled', 'all-enabled', 'all-blocked'].includes(c.expect)))
        throw new TypeError('Invalid role control selection');
    const capture = await page.evaluate(({ selectors }) => {
        const result = selectors.map(({ id, selector }) => {
            const elements = [...document.querySelectorAll(selector)];
            let enabled = 0, blocked = 0, uncertain = 0;
            for (const el of elements) {
                const tag = el.tagName.toLowerCase();
                const native = ['button', 'input', 'select', 'textarea'].includes(tag);
                const rect = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                const visible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
                const trulyDisabled = el.matches(':disabled') || !!el.closest('[inert]');
                if (!visible || trulyDisabled)
                    blocked++;
                else if (!native || !!el.closest('[aria-disabled="true"]') || style.pointerEvents === 'none')
                    uncertain++;
                else
                    enabled++;
            }
            return { id, matched: elements.length, enabled, blocked, uncertain };
        });
        return { width: innerWidth, height: innerHeight, controls: result };
    }, { selectors: controls.map(c => ({ id: c.id, selector: c.selector })) });
    const expectations = Object.fromEntries(controls.map(c => [c.id, c.expect]));
    return { controls: capture.controls, observation: controlAvailabilityObservation(state, profile, capture.width, capture.height, capture.controls, expectations, event) };
}
