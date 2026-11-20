export declare const supportedDeclarations: Record<string, (value: string) => boolean>;
export declare const unsupportedDeclarations: Record<string, (value: string) => boolean>;
export declare const supportedSelectors: string[];
export declare function supportsFunctionToken(text: unknown): string | null;
export declare function supportsCondition(text: unknown): boolean | undefined;
