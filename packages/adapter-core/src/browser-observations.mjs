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
