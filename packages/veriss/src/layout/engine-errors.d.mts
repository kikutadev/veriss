import type { Region } from './region.mjs';
import type { NormalizedBox } from '../tree.mjs';
import type { Axis } from './engine-types.mjs';
interface ErrorBox {
    label: string;
    path: string;
    source?: NormalizedBox['source'];
}
export declare function layoutError(value: unknown): {
    code: string | undefined;
    message: string;
    box: ErrorBox | undefined;
    region: Region | undefined;
    axis: Axis | undefined;
    line: number | undefined;
    file: string | undefined;
    ancestor: string | undefined;
    ancestorPath: string | undefined;
    property: string | undefined;
};
export {};
