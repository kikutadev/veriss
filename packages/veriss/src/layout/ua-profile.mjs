// User-agent style profiles for form controls, per browser engine, measured with tools/css-baseline.mjs (Chromium 153,
// Firefox 157, WebKit 27.2 on Linux; evals/results/css-baseline). A profile is the "initial condition" the layout of
// an unstyled control starts from: its padding, border, margins, colors and font.
//
//   ua: 'chromium' | 'firefox' | 'webkit'                 a measured profile
//   ua: { base: 'webkit', button: { padding: [...] } }    a profile with some values replaced (your own baseline)
//
// Without the ua option the engine keeps its historical behaviour: the Chromium button and range boxes are modeled,
// and the other controls' UA padding, border and margins are not known ('ua'). With it, every value below is known.
// Sides are [top, right, bottom, left].
const px = (v) => `${v}px`;
const sides = (t, r = t, b = t, l = r) => [px(t), px(r), px(b), px(l)];
export const uaProfiles = {
    chromium: {
        button: { padding: sides(1, 6), border: sides(2), background: '#efefef', color: '#000000', darkBackground: '#6b6b6b', darkColor: '#ffffff' },
        textField: { padding: sides(1, 2), border: sides(2) },
        textarea: { padding: sides(2), border: sides(1) },
        select: { padding: sides(0), border: sides(1) },
        checkbox: { margin: sides(3, 3, 3, 4), size: 13 },
        radio: { margin: sides(3, 3, 0, 5), size: 13 },
        range: { margin: sides(2) },
        controlFont: { family: 'Arial', size: '13.3333px', textareaFamily: 'monospace', textareaSize: '13.3333px' },
        placeholder: 'rgb(117, 117, 117)',
        focusRing: '1px',
    },
    firefox: {
        button: { padding: sides(1, 4), border: sides(2), background: 'rgb(233, 233, 237)', color: '#000000' },
        textField: { padding: sides(1, 2), border: sides(2) },
        textarea: { padding: sides(2), border: sides(2) },
        select: { padding: sides(1, 4), border: sides(2) },
        checkbox: { margin: sides(3, 3, 3, 4), size: 14 },
        radio: { margin: sides(3, 3, 0, 5), size: 14 },
        range: { margin: sides(2) },
        controlFont: { family: 'sans-serif', size: '13.3281px', textareaFamily: 'monospace', textareaSize: '12px' },
        placeholder: 'rgba(0, 0, 0, 0.54)',
        focusRing: '1px',
    },
    webkit: {
        button: { padding: sides(2, 6, 3, 6), border: sides(2), background: 'rgb(192, 192, 192)', color: 'rgba(0, 0, 0, 0.8)' },
        textField: { padding: sides(1), border: sides(2) },
        textarea: { padding: sides(2), border: sides(1) },
        select: { padding: sides(0), border: sides(1) },
        checkbox: { margin: sides(3, 2), size: 12 },
        radio: { margin: sides(3, 2), size: 12 },
        range: { margin: sides(2) },
        controlFont: { family: '-webkit-standard', size: '16px', textareaFamily: '-webkit-standard', textareaSize: '16px' },
        placeholder: 'rgb(169, 169, 169)',
        focusRing: '3px',
    },
};
// Each profile member is either a scalar or a one-level record of scalars and side tuples.
function merge(base, over) {
    return {
        ...base, ...over,
        button: { ...base.button, ...over.button },
        textField: { ...base.textField, ...over.textField },
        textarea: { ...base.textarea, ...over.textarea },
        select: { ...base.select, ...over.select },
        checkbox: { ...base.checkbox, ...over.checkbox },
        radio: { ...base.radio, ...over.radio },
        range: { ...base.range, ...over.range },
        controlFont: { ...base.controlFont, ...over.controlFont },
    };
}
export function isUAEngine(value) {
    return value === 'chromium' || value === 'firefox' || value === 'webkit';
}
/** The profile for an ua option (a name, or { base, ...overrides }), or null for the engine's historical defaults. */
export function resolveUAProfile(ua) {
    if (ua === undefined || ua === null)
        return null;
    if (typeof ua === 'string') {
        if (!isUAEngine(ua))
            throw new Error(`Invalid layout options: ua must be one of ${Object.keys(uaProfiles).join(', ')} (or { base, ... })`);
        return { name: ua, engine: ua, ...uaProfiles[ua] };
    }
    if (typeof ua !== 'object')
        throw new Error('Invalid layout options: ua must be a browser name or { base, ... }');
    const { base = 'chromium', ...overrides } = ua;
    if (!isUAEngine(base))
        throw new Error(`Invalid layout options: ua.base must be one of ${Object.keys(uaProfiles).join(', ')}`);
    return { ...merge(uaProfiles[base], overrides), name: `${base} (with overrides)`, engine: base };
}
