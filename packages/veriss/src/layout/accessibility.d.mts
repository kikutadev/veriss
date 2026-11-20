import { parseColor } from '../color/index.mjs';
export { parseColor, contrastRatio } from '../color/index.mjs';
import type { Affine2, Region } from './region.mjs';
import type { Rational, RationalInput } from './linear.mjs';
import type { NormalizedBox } from '../tree.mjs';
import type { LayoutBoxContract, LayoutRange, LayoutRegion, SourceSpan } from '../layout-contracts.d.ts';
type CssText = string | undefined;
type Side = 'top' | 'right' | 'bottom' | 'left';
type AnimationPaint = import('../layout-contracts.d.ts').LayoutAnimationPaint;
interface TransitionPaint {
    property: string;
    duration: string;
}
interface CssAnimation extends AnimationPaint {
    easing: string;
    delay: string;
    fill: string;
    timeline: string;
}
interface CssTransition extends TransitionPaint {
    easing: string;
    delay: string;
}
type Color = NonNullable<ReturnType<typeof parseColor>>;
interface CanvasColors {
    canvas: string;
    canvastext: string;
}
interface PaintStyle {
    [property: string]: unknown;
    $iconPaint?: string | undefined;
    $stacks?: boolean | undefined;
    $fixed?: boolean | undefined;
    position: string;
    'backdrop-filter'?: CssText;
    'background-color'?: CssText;
    'background-image'?: CssText;
    'block-size'?: CssText;
    'border-bottom-color'?: CssText;
    'border-left-color'?: CssText;
    'border-right-color'?: CssText;
    'border-top-color'?: CssText;
    'box-shadow'?: CssText;
    'caret-color'?: CssText;
    'clip'?: CssText;
    'clip-path'?: CssText;
    'color'?: CssText;
    'cursor'?: CssText;
    'font-size'?: CssText;
    'font-style'?: CssText;
    'font-weight'?: CssText;
    'isolation'?: CssText;
    'list-style-type'?: CssText;
    'object-fit'?: CssText;
    'opacity'?: CssText;
    'outline-color'?: CssText;
    'outline-offset'?: CssText;
    'outline-style'?: CssText;
    'outline-width'?: CssText;
    'overflow-x'?: CssText;
    'pointer-events'?: CssText;
    'scroll-behavior'?: CssText;
    'scroll-margin-bottom'?: CssText;
    'scroll-margin-top'?: CssText;
    'scroll-padding-bottom'?: CssText;
    'scroll-padding-top'?: CssText;
    'text-decoration-line'?: CssText;
    'touch-action'?: CssText;
    'transform'?: CssText;
    'visibility'?: CssText;
    'will-change'?: CssText;
}
declare module './css.mjs' {
    function animationsOf(style: Readonly<Record<string, unknown>>): CssAnimation[];
    function transitionsOf(style: Readonly<Record<string, unknown>>): CssTransition[];
}
interface BackdropLayer {
    color: CssText;
    backgroundColor: CssText;
    backgroundImage: CssText;
    opacity: CssText;
}
export interface PaintFacts extends BackdropLayer {
    iconPaint?: string;
    hiddenVisually?: boolean;
    caretColor: CssText;
    objectFit: CssText;
    scrollBehavior: CssText;
    touchAction: CssText;
    visibility: CssText;
    pointerEvents: CssText;
    fontSize: CssText;
    fontStyle: CssText;
    fontWeight: CssText;
    position: string;
    decoration: CssText;
    isolation: CssText;
    transform: CssText;
    backdropFilter: string;
    stacks?: boolean;
    willChange: string;
    scrollMargin: {
        top: CssText;
        bottom: CssText;
    };
    scrollPadding: {
        top: CssText;
        bottom: CssText;
    };
    outlineStyle: CssText;
    outlineWidth: CssText;
    outlineColor: CssText;
    outlineOffset: CssText;
    clippedAway: boolean;
    borderColors: Record<Side, CssText>;
    boxShadow: CssText;
    cursor: CssText;
    listStyleType: CssText;
    animations: AnimationPaint[];
    transitions: TransitionPaint[];
}
type Metrics = NonNullable<LayoutBoxContract['textMetrics']>;
type AccessibilityContract = Omit<LayoutBoxContract, 'textMetrics'> & {
    textMetrics?: Metrics & {
        minContent?: number;
        spacedProfile?: {
            atLeastInlineSize: number;
            lines: number | null;
        }[];
    };
};
export interface AccessibilityBox extends Omit<NormalizedBox, 'children' | 'inline'> {
    children: AccessibilityBox[];
    inline?: AccessibilityBox[] | undefined;
    pseudo?: string;
    generated?: {
        before?: string;
        after?: string;
    };
    contract?: AccessibilityContract | undefined;
}
interface Origin {
    inline: Affine2;
    block: Affine2;
}
interface Rectangle {
    origin: Origin;
    inline: Affine2;
    block: Affine2;
}
interface PaintState {
    region: Region;
    paint: PaintFacts;
}
interface FocusState extends PaintState {
    authorOutline: boolean;
    origin?: Origin;
    originUnknown?: boolean;
    inline?: Affine2;
    block?: Affine2 | null;
    zIndex?: number | null;
}
interface CheckedState extends PaintState {
    marks: string;
    markUnknown: boolean;
}
interface MeasureBounds {
    region: Region;
    outer: Rectangle | null;
    inner: Rectangle | null;
}
interface RowFacts {
    box: AccessibilityBox;
    path: string;
    region: Region;
    origin: Origin | null;
    inline: Affine2 | null;
    block: Affine2 | null;
    position: string;
    painted: boolean;
    paint: PaintFacts;
    chain: PaintFacts[];
    borders: Record<Side, Rational>;
    overflow: 'visible' | 'clip' | 'scroll';
    overflowValue: string;
    overflowX?: string | undefined;
    clipAxes?: {
        inline: boolean;
        block: boolean;
    };
    clipOrigin?: Origin | null;
    content?: {
        left: Affine2 | RationalInput;
        top: Affine2 | RationalInput;
        inline: Affine2;
    };
    contentBlockSize?: Affine2 | null;
    lineHeight?: CssText;
    textAlign?: CssText;
    direction?: CssText;
    fontSize?: CssText;
    fixed?: boolean;
    uaControl?: boolean;
    sticky?: {
        parent: string | null;
    };
    zIndex?: number | null | undefined;
    stickyFrom?: Affine2;
    stickyUntil?: Affine2;
    paddingBlockEnd?: Affine2 | RationalInput;
    paddingInlineEnd?: Affine2 | RationalInput;
    inlineFlow?: boolean;
    parentText?: string;
    rotatedBounds?: Rectangle;
    rotatedBy?: string;
    containingPath?: string | undefined;
    focusStates?: FocusState[];
    hoverStates?: PaintState[];
    reducedMotion?: PaintState[];
    checkedStates?: [CheckedState[], CheckedState[]];
    placeholderPaint?: {
        region: Region;
        color: CssText;
        opacity: CssText;
    }[];
    pad?: string;
}
interface Geometry extends RowFacts {
    bounds?: MeasureBounds[] | undefined;
}
export type AccessibilityGeometry = Geometry;
interface FlashFrame {
    offset: number;
    props: Record<string, string | undefined>;
}
interface RangeFacts {
    range: LayoutRange;
    heightRange?: LayoutRange;
    region?: LayoutRegion;
}
export type AccessibilityDiagnosticDetails = {
    rule: string;
    other?: string;
    cover?: string;
    before?: string;
    previous?: string;
    outer?: string;
    reference?: string;
    id?: string;
    name?: string;
    ratio?: number;
    required?: number;
    foreground?: Color;
    background?: Color;
    control?: string;
    fontSize?: number;
    clipper?: string;
    coverBox?: string;
    scroller?: string;
    axis?: 'inline' | 'block';
    part?: string;
    edge?: string;
    layer?: string;
    also?: string;
    first?: string;
    label?: string;
    parent?: string;
    child?: string;
    caption?: string;
    role?: string | undefined;
    attribute?: string;
    value?: string | undefined;
    visible?: string;
    content?: string;
    missing?: string;
    rotated?: string;
    state?: string;
    lines?: number;
    level?: string;
    animation?: AnimationPaint;
    transition?: TransitionPaint;
    perSecond?: number;
    accessKey?: string;
    target?: string;
    controls?: string;
    dialog?: string;
    message?: string;
};
interface DiagnosticIdentity extends RangeFacts {
    code: string;
    path: string;
    box: string;
}
export interface AccessibilityFinding extends DiagnosticIdentity, AccessibilityDiagnosticDetails {
    /** Added during report assembly, after rule profile filtering. */
    tier?: string;
    severity: 'error' | 'warning' | 'unknown';
    message: string;
    source: SourceSpan | undefined;
    regionConstraints?: LayoutRegion['constraints'];
    witness: {
        viewport: number;
        viewportExact: string;
        viewportHeight?: number;
        viewportHeightExact?: string;
    };
}
export interface AccessibilityExemption extends DiagnosticIdentity, AccessibilityDiagnosticDetails {
    reason: string;
    equivalent?: string;
}
export interface AccessibilityInput {
    geometry: Geometry[];
    waived?: readonly {
        path: string;
        self: boolean;
        region: Region;
    }[];
    root: AccessibilityBox;
    domain: Region;
}
export interface AccessibilityOptions {
    keyframeFrames?: ReadonlyMap<string, FlashFrame[]>;
    contrast?: 'AA' | 'AAA';
    targetLevel?: 'AA' | 'AAA';
    targetSize?: number;
    ranges: (region: Region) => RangeFacts;
    block: boolean;
    viewportMin?: number;
    hostInset?: number;
    hostBlockInset?: number;
    viewportBlock?: Affine2 | null;
    scrollPaddingDeclared?: boolean;
    forcedColorsHandled?: boolean;
    smoothReduced?: boolean;
    defaultColors?: CanvasColors | null;
    scrollZero?: boolean;
}
export declare const accessibilityRules: string[];
export declare const ruleTier: (rule: string) => string;
export declare const accessibilityProfiles: {
    all: () => boolean;
    core: (rule: string) => boolean;
};
/** The paint facts of one computed style, kept on each geometry row. */
export declare function paintFacts(style: PaintStyle): PaintFacts;
/**
 * Where the point (dx, dy) — affine in the viewport — is strictly inside the
 * circle of radius r: {yes} proven inside, {maybe} not decided (a thin band
 * at the circle when both offsets vary). Exact when an offset is constant zero
 * or both are constants.
 */
export declare function circleReach(region: Region, dx: Affine2, dy: Affine2, r: Rational): {
    yes: Region[];
    maybe: Region[];
};
export declare function judgeAccessibility({ geometry, waived, root, domain }: AccessibilityInput, { keyframeFrames, contrast, targetLevel, targetSize, ranges, block, viewportMin, hostInset, hostBlockInset, viewportBlock, scrollPaddingDeclared, forcedColorsHandled, smoothReduced, defaultColors, scrollZero }: AccessibilityOptions): {
    findings: AccessibilityFinding[];
    warnings: AccessibilityFinding[];
    unknowns: AccessibilityFinding[];
    exempted: AccessibilityExemption[];
    notes: string[];
};
