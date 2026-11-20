// Post-layout warnings use established geometry; they do not make layout decisions.
import { q, cmp, number } from './linear.mjs';
import { scalar, asAffine, width, height, sum, diff, times, evaluate, clip, partition, sample } from './region.mjs';
import { intersect } from './integrity.mjs';
import { parseCondition } from './conditions.mjs';
import { compare } from './engine-queries.mjs';
import { lengthPieces } from './engine-geometry.mjs';
const zero = q(0);
export function checkLayoutWarnings({ block, options, scrollbarProfile, geometry, sizes, boxes, diagnostics, layoutWarnings, ranges, context, isZeroAffine }) {
    const overflowFinding = (path, code, warning) => {
        const failed = diagnostics.find(d => d.code === code && d.path === path && d.axis === 'inline');
        return failed && !layoutWarnings.some(w => w.code === warning && w.path === path) ? failed : undefined;
    };
    // A sticky box that cannot stick: its containing block (the parent's content box) ends at or before its own bottom,
    // so there is no scroll range in which it stays at top: 0 (a sticky header wrapped in a box of its own height).
    if (block)
        for (const row of geometry) {
            if (!row.sticky?.parent || !row.origin || !row.block)
                continue;
            const parent = geometry.find(other => other.path === row.sticky.parent && other.origin && other.contentBlockSize && intersect(other.region, row.region));
            if (!parent?.origin || !parent.content || !parent.contentBlockSize || layoutWarnings.some(w => w.code === 'W_LAYOUT_STICKY_INERT' && w.path === row.path))
                continue;
            const room = diff(sum(sum(parent.origin.block, asAffine(parent.content.top)), parent.contentBlockSize), sum(row.origin.block, row.block));
            const shared = intersect(row.region, parent.region);
            if (!shared || clip(shared, room, true))
                continue;
            layoutWarnings.push({ code: 'W_LAYOUT_STICKY_INERT', severity: 'warning', box: row.box.label, path: row.path, parent: parent.box.label,
                message: `${row.box.label} is position: sticky, but its parent ${parent.box.label} ends at its bottom: it scrolls away like a static box. Make it a child of the scrolling content (or give the parent the height it should stick across)`, ...ranges(shared) });
        }
    // An img whose srcset has width descriptors picks its file by the sizes attribute's width (× the pixel ratio): a
    // sizes width below the width the image is laid out at selects a file too small for its box (a blurry image).
    // sizes is evaluated like the layout: its media conditions split the region, its lengths are viewport-affine.
    for (const row of sizes) {
        const box = boxes.find(b => b.path === row.path);
        const facts = box?.tag === 'img' ? box.imageSize : null;
        if (!facts || typeof facts.srcset !== 'string' || !/\d+w\s*(?:,|$)/.test(facts.srcset) || !row.$shown?.region)
            continue;
        // No sizes attribute: the browser sizes the w-descriptor candidates for 100vw. Where the image is laid out at most
        // half the viewport wide, it downloads a file at least twice as wide as it shows (at every device pixel ratio).
        if (facts.sizes === undefined) {
            const wide = clip(row.$shown.region, diff(width, times(row.$shown.inline, q(2))));
            if (wide && !layoutWarnings.some(w => w.code === 'W_LAYOUT_SIZES_MISSING' && w.path === row.path)) {
                const p = sample(wide);
                layoutWarnings.push({ code: 'W_LAYOUT_SIZES_MISSING', severity: 'warning', box: row.box, path: row.path, srcset: facts.srcset,
                    message: `${row.box} has a srcset with width descriptors but no sizes attribute, so the browser assumes 100vw: at viewport ${number(p.x)}px it is laid out ${number(evaluate(row.$shown.inline, p))}px wide and downloads a file for ${number(p.x)}px. Add sizes (for this layout, the width it takes at each breakpoint)`, ...ranges(wide) });
            }
            continue;
        }
        if (facts.sizes === 'dynamic' || /^\s*auto\b/i.test(facts.sizes))
            continue;
        const entries = [];
        let depth = 0, start = 0;
        for (let i = 0; i <= facts.sizes.length; i++) {
            const c = facts.sizes[i];
            if (c === '(')
                depth++;
            else if (c === ')')
                depth--;
            else if ((c === ',' && depth === 0) || i === facts.sizes.length) {
                entries.push(facts.sizes.slice(start, i).trim());
                start = i + 1;
            }
        }
        let pending = [{ region: row.$shown.region }];
        const findings = [];
        try {
            for (const entry of entries.filter(Boolean)) {
                const m = /^(\(.*\))\s+(\S.*)$/.exec(entry);
                const [media, len] = m ? [m[1], m[2]] : [null, entry];
                const next = [];
                for (const piece of pending) {
                    let yes = [piece.region];
                    let no = [];
                    if (media) {
                        // Split by every atom, then classify each piece at a sample point (as the cascade does).
                        const compiled = context(parseCondition(media, 'media', options.mediaFeatures), []);
                        let parts = [piece.region];
                        for (const atom of compiled.groups.flat())
                            parts = parts.flatMap(r => { const p = partition(r, atom.slack, atom.relation); return [...p.yes, ...p.no]; });
                        const holds = (r) => { const p = sample(r); return compiled.groups.some(group => group.every(atom => compare(cmp(evaluate(atom.slack, p), zero), atom.relation))); };
                        yes = parts.filter(holds);
                        no = parts.filter(r => !holds(r));
                    }
                    for (const r of yes)
                        for (const L of lengthPieces(len, null, r, {})) {
                            const short = clip(L.region, diff(row.$shown.inline, L.value), true);
                            if (short)
                                findings.push({ region: short, L: L.value });
                        }
                    next.push(...no.map(region => ({ region })));
                }
                pending = next;
                if (!pending.length)
                    break;
            }
        }
        catch {
            continue;
        }
        for (const { region: short, L } of findings.slice(0, 8)) {
            const p = sample(short);
            if (layoutWarnings.filter(w => w.code === 'W_LAYOUT_SIZES_SMALL' && w.path === row.path).length >= 8)
                break;
            layoutWarnings.push({ code: 'W_LAYOUT_SIZES_SMALL', severity: 'warning', box: row.box, path: row.path, sizes: facts.sizes,
                message: `${row.box} is laid out ${number(evaluate(row.$shown.inline, p))}px wide at viewport ${number(p.x)}px but its sizes attribute says ${number(evaluate(L, p))}px: the browser picks a srcset file for the smaller width, so the image is upscaled (blurry). Make sizes match the layout width`, ...ranges(short) });
        }
    }
    // A list item's outside marker is drawn before its start edge (left in ltr): where that edge is at the viewport's left
    // edge, the whole marker lies outside and is not seen (measured). Under a clipping ancestor positions are not
    // tracked, and a small gap that cuts the marker in part depends on the font: neither is reported.
    for (const row of geometry) {
        if (!row.outsideMarker || !(row.origin ?? row.clipOrigin) || row.box.pseudo)
            continue;
        if (layoutWarnings.some(w => w.code === 'W_LAYOUT_MARKER_HIDDEN' && w.path === row.path))
            continue;
        // (Under a clipping ancestor a row keeps its position as clipOrigin.)
        const at = (r) => r.origin ?? r.clipOrigin;
        // An overflow-x: clip ancestor (it never scrolls, so positions under it are exact) cuts the marker at its padding
        // edge; hidden/auto/scroll ancestors may be scrolled and are not judged.
        const ancestors = geometry.filter(other => other.path !== row.path && row.path.startsWith(other.path + '/') && other.overflow !== 'visible' && intersect(other.region, row.region));
        if (ancestors.some(other => !other.clipAxes?.inline))
            continue;
        const clipper = ancestors.sort((a, b) => b.path.length - a.path.length)[0];
        if (clipper && !at(clipper))
            continue;
        const edge = clipper ? sum(at(clipper).inline, scalar(clipper.borders?.left ?? zero)) : scalar(0);
        const shared = clipper ? intersect(row.region, clipper.region) : row.region;
        const hidden = shared && clip(shared, diff(edge, at(row).inline));
        if (!hidden)
            continue;
        const p = sample(hidden);
        layoutWarnings.push({ code: 'W_LAYOUT_MARKER_HIDDEN', severity: 'warning', box: row.box.label, path: row.path, marker: row.outsideMarker, ...(clipper ? { clippedBy: clipper.box.label } : {}),
            message: `${row.box.label}'s ${row.outsideMarker} marker is drawn outside it, before its left edge, which is at ${clipper ? `the start of ${clipper.box.label} (overflow ${clipper.overflowValue})` : 'the left edge of the viewport'} at viewport ${number(p.x)}px: the marker is not seen. Give the list padding-inline-start (or list-style-position: inside)`, ...ranges(hidden) });
    }
    // An image laid out wider than its widest file: the file's natural width (a single src whose size is known), or the
    // largest w descriptor of its srcset. The browser upscales it — blurry even at a device pixel ratio of 1.
    for (const row of sizes) {
        const box = boxes.find(b => b.path === row.path), facts = box?.tag === 'img' ? box.imageSize : null;
        if (!box || !facts || !row.$shown?.region || box.pseudo || layoutWarnings.some(w => w.code === 'W_LAYOUT_IMAGE_UPSCALED' && w.path === row.path))
            continue;
        const parent = boxes.find(b => (b.children ?? []).includes(box));
        if (parent?.tag === 'picture' && (parent.children ?? []).some(c => c.tag === 'source'))
            continue;
        let widest, from;
        if (typeof facts.srcset === 'string' && facts.srcset !== 'dynamic' && /\d+w\s*(?:,|$)/.test(facts.srcset)) {
            const ws = facts.srcset.split(',').map(part => /\s(\d+)w\s*$/.exec(part.trim())?.[1]).filter(Boolean).map(Number);
            if (ws.length) {
                widest = Math.max(...ws);
                from = `its largest srcset candidate is ${widest}w`;
            }
        }
        else if (facts.srcset === undefined && typeof facts.src === 'string' && options.images?.[facts.src]?.width) {
            widest = options.images[facts.src].width;
            from = `${facts.src} is ${widest}px wide`;
        }
        if (!widest)
            continue;
        const over = clip(row.$shown.region, diff(row.$shown.inline, scalar(widest)), true);
        if (!over)
            continue;
        const p = sample(over);
        layoutWarnings.push({ code: 'W_LAYOUT_IMAGE_UPSCALED', severity: 'warning', box: row.box, path: row.path, naturalWidth: widest,
            message: `${row.box} is laid out ${number(evaluate(row.$shown.inline, p))}px wide at viewport ${number(p.x)}px, but ${from}: the browser upscales it, so it looks blurry even at 1x. Cap it (max-width: ${widest}px) or add a wider file`, ...ranges(over) });
    }
    // object-fit: fill (the initial value) scales an img's picture to its content box on each axis: a box whose ratio
    // differs from the picture's (by more than 2%) draws it stretched. Boxes with padding or borders are not judged.
    for (const row of geometry) {
        if (!row.imageRatio || row.imageRatio.follows || row.paint?.objectFit !== 'fill' || !row.inline || !row.block || !row.content || row.box.pseudo)
            continue;
        if (layoutWarnings.some(w => w.code === 'W_LAYOUT_IMAGE_DISTORTED' && w.path === row.path))
            continue;
        if (['left', 'right', 'top', 'bottom'].some(side => cmp(row.borders?.[side] ?? zero, zero) !== 0) || !isZeroAffine(asAffine(row.content.left)) || !isZeroAffine(asAffine(row.content.top)))
            continue;
        const { width: w, height: h } = row.imageRatio;
        // inline·h vs block·w: wider when inline·h·50 > block·w·51, taller when inline·h·51 < block·w·50.
        const wide = clip(row.region, diff(times(row.inline, q(String(h * 50))), times(row.block, q(String(w * 51)))), true);
        const tall = clip(row.region, diff(times(row.block, q(String(w * 50))), times(row.inline, q(String(h * 51)))), true);
        for (const [found, way] of [[wide, 'wider'], [tall, 'taller']]) {
            if (!found)
                continue;
            const p = sample(found), iw = number(evaluate(row.inline, p)), ih = number(evaluate(row.block, p));
            layoutWarnings.push({ code: 'W_LAYOUT_IMAGE_DISTORTED', severity: 'warning', box: row.box.label, path: row.path, natural: `${w}/${h}`, basis: row.imageRatio.basis, stretched: way,
                message: `${row.box.label} is drawn ${iw}×${ih}px at viewport ${number(p.x)}px, but its picture is ${w}×${h} (${row.imageRatio.basis === 'file' ? 'the file' : 'its width/height attributes'}): object-fit: fill stretches it ${way}. Use object-fit: cover (or contain), or let one size be auto`, ...ranges(found) });
        }
    }
    // A grid whose columns are all px tracks does not shrink: where they (and the gaps) are wider than the container
    // (the inline E_LAYOUT_TRACKS), the fix is flexible tracks.
    for (const row of geometry.filter(row => row.fixedTracks)) {
        const failed = overflowFinding(row.path, 'E_LAYOUT_TRACKS', 'W_LAYOUT_FIXED_TRACKS');
        if (!failed)
            continue;
        layoutWarnings.push({ code: 'W_LAYOUT_FIXED_TRACKS', severity: 'warning', box: row.box.label, path: row.path, columns: row.fixedTracks,
            message: `${row.box.label} has grid-template-columns: ${row.fixedTracks}, only fixed px tracks, so it cannot shrink below their sum and overflows narrower containers. Use flexible tracks: repeat(N, minmax(0, 1fr)), or fewer columns under a media or container query`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
    }
    // Wrapping text with overflow-wrap: normal breaks only between words: its minimum width is its longest word (a
    // URL, a long compound). Where that does not fit (the inline E_LAYOUT_CONTENT), say so.
    for (const row of geometry.filter(row => row.wrapsByWords)) {
        const failed = overflowFinding(row.path, 'E_LAYOUT_CONTENT', 'W_LAYOUT_LONG_WORD');
        if (!failed)
            continue;
        layoutWarnings.push({ code: 'W_LAYOUT_LONG_WORD', severity: 'warning', box: row.box.label, path: row.path,
            message: `${row.box.label} wraps only between words (overflow-wrap: normal), and its longest word is wider than the box: it sticks out. Use overflow-wrap: anywhere (or break-word) for URLs and long words`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
    }
    // An img (or video) sized by its width attribute with no CSS width or max-width keeps that px width in a narrower
    // container: the inline overflow is explained by the missing max-width: 100%.
    for (const row of geometry.filter(row => row.widthFromAttribute)) {
        const failed = overflowFinding(row.path, 'E_LAYOUT_ITEM_SIZE', 'W_LAYOUT_MEDIA_NO_MAX');
        if (!failed)
            continue;
        layoutWarnings.push({ code: 'W_LAYOUT_MEDIA_NO_MAX', severity: 'warning', box: row.box.label, path: row.path, width: row.widthFromAttribute,
            message: `${row.box.label} takes its width from its width="${row.widthFromAttribute}" attribute and no CSS width or max-width limits it, so it is wider than its container. Add max-width: 100% (with height: auto to keep its ratio)`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
    }
    // width: 100% is the whole area; a px start margin then pushes the box out of it (stretching, width: auto, would
    // have subtracted the margins). Explains the inline E_LAYOUT_ITEM_SIZE.
    for (const row of geometry) {
        if (!row.fullWidthMargins?.length)
            continue;
        const failed = overflowFinding(row.path, 'E_LAYOUT_ITEM_SIZE', 'W_LAYOUT_FULL_WIDTH_MARGIN');
        if (!failed)
            continue;
        layoutWarnings.push({ code: 'W_LAYOUT_FULL_WIDTH_MARGIN', severity: 'warning', box: row.box.label, path: row.path, properties: row.fullWidthMargins,
            message: `${row.box.label} has width: 100% and ${row.fullWidthMargins.join(', ')}; the 100% is the whole area, so the margin pushes the box out of it. Drop width: 100% (a grid or flex item stretches to the area less its margins) or use calc(100% - the margins)`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
    }
    // width: 100% under box-sizing: content-box is the content width: the padding and border come on top, so the box
    // is wider than its container (the content-box pitfall, the default for most boxes and for text inputs).
    for (const row of geometry) {
        if (!row.contentBoxFull?.length)
            continue;
        const failed = overflowFinding(row.path, 'E_LAYOUT_ITEM_SIZE', 'W_LAYOUT_CONTENT_BOX_FULL');
        if (!failed)
            continue;
        layoutWarnings.push({ code: 'W_LAYOUT_CONTENT_BOX_FULL', severity: 'warning', box: row.box.label, path: row.path, properties: row.contentBoxFull,
            message: `${row.box.label} is width: 100% with box-sizing: content-box, so its ${row.contentBoxFull.join(', ')} come on top of the container's width and it overflows. Use box-sizing: border-box (or width: auto in a grid or flex parent)`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
    }
    // A vw width is a share of the whole viewport, the classic scrollbar included: on a scrolling page it is wider
    // than the space beside the scrollbar (100vw → a horizontal scrollbar). Explains the inline E_LAYOUT_ITEM_SIZE.
    if (scrollbarProfile && scrollbarProfile.inlineSize > 0)
        for (const row of geometry.filter(row => row.vwInline)) {
            const failed = overflowFinding(row.path, 'E_LAYOUT_ITEM_SIZE', 'W_LAYOUT_VW_SCROLLBAR');
            if (!failed)
                continue;
            layoutWarnings.push({ code: 'W_LAYOUT_VW_SCROLLBAR', severity: 'warning', box: row.box.label, path: row.path, width: row.vwInline, scrollbar: scrollbarProfile.inlineSize,
                message: `${row.box.label} is width: ${row.vwInline}, and vw includes the ${scrollbarProfile.inlineSize}px classic scrollbar of the scrolling page: it is wider than the page beside the scrollbar, which scrolls sideways. Use 100% (or width: auto in a grid or flex parent)`, range: failed.range, ...(failed.heightRange ? { heightRange: failed.heightRange } : {}) });
        }
    // A lazily loaded image in the initial viewport (its layout top above the viewport height somewhere, at the
    // initial scroll position): it starts loading only after layout, later than an eager one, which delays the largest
    // contentful paint when it is the hero image. Reported as a warning with the region where it is visible.
    if (block && options.viewport.height)
        for (const row of sizes) {
            const box = boxes.find(b => b.path === row.path);
            if (box?.tag !== 'img' || box.imageSize?.loading !== 'lazy' || !row.$shown?.origin || !row.$shown.block || layoutWarnings.some(w => w.code === 'W_LAYOUT_LAZY_IN_VIEWPORT' && w.path === row.path))
                continue;
            const top = row.$shown.origin.block, bottom = sum(top, row.$shown.block), left = row.$shown.origin.inline;
            // Visible: top < H, bottom > 0 and left < W.
            let visible = clip(row.$shown.region, diff(height, top), true);
            visible = visible && clip(visible, bottom, true);
            visible = visible && clip(visible, diff(width, left), true);
            if (!visible)
                continue;
            const p = sample(visible);
            layoutWarnings.push({ code: 'W_LAYOUT_LAZY_IN_VIEWPORT', severity: 'warning', box: row.box, path: row.path,
                message: `${row.box} has loading="lazy" but is in the initial viewport (top ${number(evaluate(top, p))}px at viewport ${number(p.x)}px × ${number(p.y)}px): it loads later than an eager image; drop loading="lazy" for images above the fold (and consider fetchpriority="high" for the largest one)`, ...ranges(visible) });
        }
}
