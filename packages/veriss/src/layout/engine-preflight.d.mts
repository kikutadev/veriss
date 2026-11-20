import type { parseLayoutCSS } from './css.mjs';
import { PARENT } from './selectors.mjs';
import type { NormalizedBox } from '../tree.mjs';
import type { LayoutDiagnostic, LayoutWarning } from '../layout-contracts.d.ts';
import type { EngineOptions } from './input.mjs';
type PreflightBox = NormalizedBox & {
    [PARENT]?: PreflightBox | undefined;
    pseudo?: string | boolean;
};
interface PreflightInput {
    options: EngineOptions;
    boxes: readonly PreflightBox[];
    parsed: ReturnType<typeof parseLayoutCSS>;
    diagnostics: readonly LayoutDiagnostic[];
    layoutWarnings: LayoutWarning[];
    unknown: (code: string, message: string, line?: number, box?: PreflightBox, file?: string) => void;
}
export declare function preflight({ options, boxes, parsed, diagnostics, layoutWarnings, unknown }: PreflightInput): void;
export {};
