// State-transition layout diagnostics. Recursive analysis is supplied by the caller.
import { q, exact, number } from './linear.mjs';
import { sample } from "./region.mjs";
import { matches } from './css.mjs';
import { intersect } from './integrity.mjs';
import { easedFrames } from './animation-extremes.mjs';
import { unitContext, layoutRectangle, firstStartMove, layoutStartMoves, shiftScoreBound, sweptBound } from './engine-geometry.mjs';
export function checkHoverShifts({ root, rules, block, sizes, diagnostics, ranges, analyze }) {
    const hoverRules = rules.filter(rule => rule.hoverLayout);
    const targets = [];
    (function walk(box) { if (hoverRules.some(rule => rule.selectors.some(selector => matches(selector, box, new Set(['hover'])))))
        targets.push(box); for (const child of box.children ?? [])
        walk(child); })(root);
    for (const target of targets.slice(0, 64)) {
        const hover = analyze(target.path);
        if (hover.status === 'unknown') {
            diagnostics.push({ code: 'U_LAYOUT_HOVER_SHIFT', severity: 'unknown', message: `${target.label}: its hovered layout is not decided (${hover.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`, box: target.label, path: target.path });
            continue;
        }
        const result = layoutStartMoves(sizes, hover.sizes);
        if (result.undecided) {
            diagnostics.push({ code: 'U_LAYOUT_HOVER_SHIFT', severity: 'unknown', message: `${target.label}: the hovered layout of ${result.undecided.box} cannot be compared (it has no layout rectangle)`, box: target.label, path: target.path });
            continue;
        }
        for (const { row, shared, field, v, delta } of result.moves) {
            const scoreBound = block ? shiftScoreBound(sizes, hover.sizes, () => true, v) : null;
            diagnostics.push({ code: 'E_LAYOUT_HOVER_SHIFT', severity: 'error', box: row.box, path: row.path, hovered: target.label, hoveredPath: target.path, field, delta: exact(delta), ...(scoreBound !== null ? { scoreBound } : {}),
                message: `Hovering ${target.label} moves ${row.box} (${field} by ${number(delta)}px at viewport ${number(v.x)}px${block ? ` × ${number(v.y)}px` : ''}): a layout shift without an excusing input. Change paint or transform on :hover, or reserve the space`, ...ranges(shared) });
        }
    }
}
export function checkAnimationShifts({ block, sizes, diagnostics, ranges, animated, keyframeFrames, heightKnown, analyze }) {
    const seen = new Set();
    for (const entry of animated) {
        const id = `${entry.box.path}|${entry.name}`;
        if (seen.has(id) || seen.size >= 32)
            continue;
        seen.add(id);
        const where = animated.filter(other => `${other.box.path}|${other.name}` === id).map(other => other.region);
        const reported = new Set();
        const states = [];
        let complete = true; // keyframe layouts for the score bound
        // The keyframes and the frames at the easing's extremes (an overshoot carries a value past its keyframes).
        const logical = { width: 'inline-size', height: 'block-size', 'min-width': 'min-inline-size', 'min-height': 'min-block-size', 'max-width': 'max-inline-size', 'max-height': 'max-block-size' };
        const eased = easedFrames(keyframeFrames.get(entry.name), { easing: entry.easing, rem: unitContext.rootFontSize ? number(unitContext.rootFontSize) : undefined, base: new Proxy({}, { get: (_, key) => { const property = String(key); const v = entry.style[logical[property] ?? property]; return entry.position === 'relative' && ['top', 'bottom', 'left', 'right'].includes(property) && v === 'auto' ? '0px' : v; } }) });
        if (eased.unknown !== undefined) {
            diagnostics.push({ code: 'U_LAYOUT_ANIMATION_SHIFT', severity: 'unknown', message: `${entry.box.label}: animation ${entry.name}: ${eased.unknown}`, box: entry.box.label, path: entry.box.path });
            continue;
        }
        for (const frame of eased.frames) {
            const layout = frame.layout;
            const label = frame.extreme ? `${entry.name} between ${frame.extreme.from} and ${frame.extreme.to} (the easing ${frame.extreme.easing} ${frame.extreme.y > 1 || frame.extreme.y < 0 ? 'overshoots' : 'turns'} to ${frame.extreme.value})` : `${entry.name} at ${number(q(String(Math.round(frame.offset * 1e4) / 100)))}%`;
            // A nonzero px margin-top/left (the checked layout has zero margins) moves an in-flow box's own start: a shift
            // without a re-layout (margins are outside the layout subset).
            const starts = Object.fromEntries(layout.split(';').flatMap(decl => {
                const [prop, ...rest] = decl.split(':'), value = rest.join(':').trim(), parts = value.split(/\s+/), name = prop.trim().toLowerCase();
                if (name === 'margin')
                    return [['blockStart', parts[0]], ['inlineStart', parts[3] ?? parts[1] ?? parts[0]]];
                if (name === 'margin-block' || name === 'margin-top' || name === 'margin-block-start')
                    return [['blockStart', parts[0]]];
                if (name === 'margin-inline' || name === 'margin-left' || name === 'margin-inline-start')
                    return [['inlineStart', parts[0]]];
                return [];
            }));
            // A position: relative box's offsets move it alone, by the change from its own offset (CSS 2 §9.4.3: top wins
            // over bottom, left over right in ltr). An rtl box is laid out again instead.
            let offsetsOnly = false;
            if (entry.position === 'relative' && entry.style.direction !== 'rtl') {
                offsetsOnly = layout.split(';').filter(d => d.trim()).every(d => ['top', 'bottom', 'left', 'right'].includes(d.split(':')[0].trim().toLowerCase()) && /^\s*(?:-?(?:\d+(?:\.\d+)?|\.\d+)px|0)\s*$/.test(d.split(':').slice(1).join(':')));
                const pxOf = (v) => v === 'auto' || v === undefined ? 0 : /^-?(?:\d+(?:\.\d+)?|\.\d+)px$|^0$/.test(String(v)) ? Number.parseFloat(String(v)) || 0 : null;
                const own = (side) => entry.style[side] ?? 'auto';
                for (const decl of layout.split(';')) {
                    const [prop, ...rest] = decl.split(':'), name = prop.trim().toLowerCase(), value = rest.join(':').trim();
                    if (!['top', 'bottom', 'left', 'right'].includes(name))
                        continue;
                    const [next, base] = [pxOf(value), pxOf(own(name))];
                    if (next === null || base === null)
                        continue;
                    const field = ['top', 'bottom'].includes(name) ? 'blockStart' : 'inlineStart';
                    if (name === 'bottom' && own('top') !== 'auto')
                        continue;
                    if (name === 'right' && own('left') !== 'auto')
                        continue;
                    const delta = (['bottom', 'right'].includes(name) ? -1 : 1) * (next - base);
                    if (delta !== 0)
                        starts[field] = `${Math.round(delta * 1e4) / 1e4}px`;
                }
            }
            const shifted = Object.entries(starts).find((pair) => typeof pair[1] === 'string' && /^-?\d+(?:\.\d+)?px$/.test(pair[1]) && Number.parseFloat(pair[1]) !== 0);
            if (shifted && !reported.has(entry.box.path) && !['absolute', 'fixed'].includes(entry.position)) {
                reported.add(entry.box.path);
                diagnostics.push({ code: 'E_LAYOUT_ANIMATION_SHIFT', severity: 'error', box: entry.box.label, path: entry.box.path, animated: entry.box.label, animatedPath: entry.box.path, animation: entry.name, offset: frame.offset, field: shifted[0], delta: exact(q(shifted[1].replace(/px$/, ''))),
                    message: `Animation ${label} on ${entry.box.label} ${entry.position === 'relative' && /(?:^|;)\s*(?:top|bottom|left|right)\s*:/i.test(layout) ? `moves its relative offset by ${shifted[1]}` : `sets a ${shifted[1]} start margin`}, which moves it (${shifted[0]}): a layout shift while it runs. Animate transform (translate) instead`, ...ranges(entry.region) });
                complete = false;
                continue;
            }
            // Offsets that move nothing (bottom under a set top, an unchanged value): the layout is the box's own.
            if (offsetsOnly) {
                states.push({ offset: frame.offset, sizes });
                continue;
            }
            const moved = analyze(entry.box.path, layout);
            if (moved.status === 'unknown') {
                diagnostics.push({ code: 'U_LAYOUT_ANIMATION_SHIFT', severity: 'unknown', message: `${entry.box.label}: the layout at keyframe ${label} is not decided (${moved.diagnostics.find(d => d.severity === 'unknown')?.message ?? 'unknown'})`, box: entry.box.label, path: entry.box.path });
                continue;
            }
            states.push({ offset: frame.offset, sizes: moved.sizes });
            const undecided = [...sizes, ...moved.sizes].find(row => !layoutRectangle(row) || !row.$shown?.region);
            if (undecided) {
                diagnostics.push({ code: 'U_LAYOUT_ANIMATION_SHIFT', severity: 'unknown', message: `${entry.box.label}: the layout of ${undecided.box} at keyframe ${label} cannot be compared (it has no layout rectangle)`, box: entry.box.label, path: entry.box.path });
                continue;
            }
            for (const row of sizes)
                for (const other of moved.sizes.filter(o => o.path === row.path)) {
                    if (reported.has(row.path))
                        continue;
                    for (const running of where) {
                        const both = intersect(row.$shown.region, other.$shown.region), shared = both && intersect(both, running);
                        if (!shared)
                            continue;
                        const change = firstStartMove(layoutRectangle(row), layoutRectangle(other), shared);
                        if (!change)
                            continue;
                        reported.add(row.path);
                        diagnostics.push({ code: 'E_LAYOUT_ANIMATION_SHIFT', severity: 'error', box: row.box, path: row.path, animated: entry.box.label, animatedPath: entry.box.path, animation: entry.name, offset: frame.offset, field: change.field, delta: exact(change.delta),
                            message: `Animation ${label} on ${entry.box.label} moves ${row.box} (${change.field} by ${number(change.delta)}px at viewport ${number(change.v.x)}px${block ? ` × ${number(change.v.y)}px` : ''}): a layout shift while it runs (every frame it moves). Animate transform (translate/scale) instead of layout properties`, ...ranges(shared) });
                        break;
                    }
                }
        }
        // The score bound of one 5 s session window (Chromium's CLS window), under the premise that boxes move
        // monotonically between keyframes. Missing 0% / 100% keyframes are the box's own (base) layout.
        const found = diagnostics.filter(d => d.code === 'E_LAYOUT_ANIMATION_SHIFT' && d.animatedPath === entry.box.path && d.animation === entry.name);
        // Scroll-driven: the shifts happen as the page scrolls (not input for CLS), as often as it is scrolled; no time
        // window bounds the score.
        if (entry.scrollDriven)
            for (const d of found)
                if (!d.scrollDriven) {
                    d.scrollDriven = true;
                    d.message += ` The animation is scroll-driven (${entry.style['animation-timeline']}): it moves the boxes as the page scrolls, which is not input for CLS, and as often as the page is scrolled.`;
                }
        if (complete && found.length && block && heightKnown && !entry.scrollDriven) {
            const frames = [...states].sort((a, b) => a.offset - b.offset);
            if (!frames.length || frames[0].offset > 0)
                frames.unshift({ offset: 0, sizes });
            if (frames.at(-1).offset < 1)
                frames.push({ offset: 1, sizes });
            const p = sample(entry.region);
            let perIteration = 0, ok = true;
            for (let i = 0; i + 1 < frames.length; i++) {
                const b = sweptBound(frames[i].sizes, frames[i + 1].sizes, p);
                if (!b) {
                    ok = false;
                    break;
                }
                perIteration += b.impact * b.distance;
            }
            // A normal-direction repeat jumps from the last keyframe back to the first in one frame; the start jumps from
            // the base layout to the first keyframe.
            const jump = (a, b) => shiftScoreBound(a, b, () => true, p);
            const seconds = (/^(\d+(?:\.\d+)?|\.\d+)(m?s)$/.exec(String(entry.duration)) ?? []);
            const duration = seconds[2] === 'ms' ? Number(seconds[1]) / 1000 : Number(seconds[1]);
            const count = entry.count === 'infinite' ? Infinity : Number(entry.count);
            if (ok && duration > 0 && count > 0) {
                const iterations = Math.min(count, Math.ceil(5 / duration));
                const wraps = ['normal', 'reverse'].includes(entry.direction) ? Math.max(0, iterations - 1) : 0;
                // The start: with no delay (or a negative one) the first frame drawn is already inside the animation, and a
                // backwards fill shows the first keyframe during the delay; only a positive delay without it draws the box's own
                // layout first and then jumps to the first keyframe.
                const delayed = Number.parseFloat(entry.delay ?? '0') > 0 && !['backwards', 'both'].includes(entry.fill ?? '');
                const startJump = delayed ? (jump(sizes, frames[0].sizes) ?? 0) : 0, wrapJump = wraps ? (jump(frames.at(-1).sizes, frames[0].sizes) ?? 0) : 0;
                // A finite animation ends by jumping back to the box's own layout, unless a forwards fill keeps the last frame. Where it ends depends on the direction and a fractional
                // count, so the largest jump back from any frame bounds it.
                const endJump = count === Infinity || ['forwards', 'both'].includes(entry.fill ?? '') ? 0 : Math.max(0, ...frames.map(f => jump(f.sizes, sizes) ?? 0));
                const windowBound = perIteration * iterations + wraps * wrapJump + startJump + endJump;
                for (const d of found)
                    d.scoreBound = { window: windowBound, perIteration, iterations, ...(startJump ? { startJump } : {}), ...(endJump ? { endJump } : {}), viewport: { width: number(p.x), height: number(p.y) }, assumes: 'boxes move monotonically between keyframes and the easing extremes' };
            }
        }
    }
}
