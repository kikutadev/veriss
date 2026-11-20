import type { Affine2, Region } from './region.mjs';
import type { Rational, RationalInput } from './linear.mjs';
import type { LayoutBoxContract, LayoutRange, LayoutRegion, SourceSpan } from '../layout-contracts.d.ts';
type Axis = 'inline' | 'block';
interface IntegrityBox {
    label: string;
    tag: string;
    text?: boolean;
    source?: SourceSpan | undefined;
    contract?: LayoutBoxContract | undefined;
}
interface Origin {
    inline: Affine2;
    block: Affine2;
}
interface BaseGeometry {
    box: IntegrityBox;
    path: string;
    region: Region;
    position: string;
    painted: boolean;
    borders: {
        left: Rational;
        right: Rational;
        top: Rational;
        bottom: Rational;
    };
    overflow: 'visible' | 'clip' | 'scroll';
    overflowValue: string;
}
interface SizedGeometry extends BaseGeometry {
    inline: Affine2;
    block: Affine2 | null;
    origin: Origin | null;
    content: {
        left: Affine2 | RationalInput;
        top: Affine2 | RationalInput;
        inline: Affine2;
    };
    textAlign: string;
}
interface UnplacedInline extends BaseGeometry {
    inline: null;
    block: null;
    origin: null;
}
export type IntegrityGeometry = SizedGeometry | UnplacedInline;
interface Extent {
    inline: [Affine2, Affine2][];
    block: [Affine2, Affine2][];
    basis: 'border-box' | 'text';
}
interface Ranges {
    range: LayoutRange;
    heightRange?: LayoutRange;
    region?: LayoutRegion;
}
interface Waiver {
    box: IntegrityBox;
    path: string;
    region: Region;
    axis: Axis;
    self: boolean;
}
interface FindingExtras {
    rule: string;
    other?: string;
    axis?: Axis;
    parent?: string;
    amount?: number;
    basis?: Extent['basis'][];
    container?: string;
    outer?: string;
}
interface Finding extends Ranges, FindingExtras {
    code: string;
    severity: 'error' | 'warning';
    message: string;
    box: string;
    path: string;
    source: SourceSpan | undefined;
    witness: {
        viewport: number;
        viewportExact: string;
        viewportHeight?: number;
        viewportHeightExact?: string;
    };
}
interface Exemption extends Ranges, FindingExtras {
    code: string;
    box: string;
    path: string;
    reason: string;
}
export interface IntegrityInput {
    geometry: readonly IntegrityGeometry[];
    waived: readonly Waiver[];
}
export interface IntegrityOptions {
    block: boolean;
    targetSize?: number;
    protrusion?: 'all' | 'painted';
    ranges: (region: Region) => Ranges;
}
export declare function intersect(a: Region, b: Region): Region | null;
export declare function judgeIntegrity({ geometry, waived }: IntegrityInput, { block, targetSize, protrusion, ranges }: IntegrityOptions): {
    findings: Finding[];
    warnings: Finding[];
    exempted: Exemption[];
};
export {};
