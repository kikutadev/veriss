export type UAEngine = 'chromium' | 'firefox' | 'webkit';
export type Sides = [string, string, string, string];
interface ControlBox {
    padding: Sides;
    border: Sides;
}
interface ToggleBox {
    margin: Sides;
    size: number;
}
export interface UAValues {
    button: ControlBox & {
        background: string;
        color: string;
        darkBackground?: string;
        darkColor?: string;
    };
    textField: ControlBox;
    textarea: ControlBox;
    select: ControlBox;
    checkbox: ToggleBox;
    radio: ToggleBox;
    range: {
        margin: Sides;
    };
    controlFont: {
        family: string;
        size: string;
        textareaFamily: string;
        textareaSize: string;
    };
    placeholder: string;
    focusRing: string;
}
export type UAOverrides = {
    [K in keyof UAValues]?: UAValues[K] extends object ? Partial<UAValues[K]> : UAValues[K];
};
export interface UAProfile extends UAValues {
    name: string;
    engine: UAEngine;
}
export declare const uaProfiles: Record<UAEngine, UAValues>;
export declare function isUAEngine(value: string): value is UAEngine;
/** The profile for an ua option (a name, or { base, ...overrides }), or null for the engine's historical defaults. */
export declare function resolveUAProfile(ua: string | ({
    base?: string;
} & UAOverrides) | null | undefined): UAProfile | null;
export {};
