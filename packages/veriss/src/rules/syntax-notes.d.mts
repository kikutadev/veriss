interface NoteSource {
    file: string;
    line: number;
}
export interface SyntaxNotePayloads {
    W_CSS_BACKGROUND_INVALID: NoteSource & {
        problem: string;
        selector: string;
        value: string;
    };
    W_CSS_TIMING_INVALID: NoteSource & {
        problem: string;
        property: string;
        selector: string;
        value: string;
    };
    W_CSS_FONT_FACE_INVALID: NoteSource & {
        family?: string;
        ignored?: boolean;
        problem: string;
    };
    W_CSS_PROPERTY_INVALID: NoteSource & {
        name: string;
        problem: string;
    };
    W_CSS_SUPPORTS_INVALID: NoteSource & {
        params: string;
        written: string;
    };
    W_CSS_KEYWORD_INVALID: NoteSource & {
        allowed: string;
        keyword: string;
        property: string;
        selector: string;
        suggest?: string;
        value: string;
    };
    W_CSS_COLOR_INVALID: NoteSource & {
        color: string;
        problem: string;
        property: string;
        selector: string;
        value: string;
    };
    W_CSS_MARKER_IGNORED: NoteSource & {
        property: string;
        selector: string;
    };
    W_CSS_COUNTER_UNUSED: NoteSource & {
        name: string;
        property: string;
        selector: string;
    };
    W_CSS_GRID_TRACKS_INVALID: NoteSource & {
        problem: string;
        property: string;
        selector: string;
        value: string;
    };
    W_CSS_FONT_INVALID: NoteSource & {
        family?: string;
        missing?: string;
        property: string;
        selector: string;
        value: string;
    };
    W_CSS_UNITLESS_LENGTH: NoteSource & {
        bare: string;
        property: string;
        selector: string;
        value: string;
    };
    W_CSS_CALC_OPERATOR_SPACE: NoteSource & {
        property: string;
        selector: string;
        value: string;
        written: string;
    };
    W_CSS_IMPORTANT_TYPO: NoteSource & {
        property: string;
        selector: string;
        value: string;
        word: string;
    };
    W_CSS_MEDIA_AND_SPACE: NoteSource & {
        params: string;
        written?: string;
    };
    W_CSS_MEDIA_INVALID_LENGTH: NoteSource & {
        params: string;
        value: string;
    };
    W_CSS_MEDIA_VAR: NoteSource & {
        params: string;
    };
    W_CSS_GRID_AREAS_INVALID: NoteSource & {
        selector: string;
        value: string;
        why: string;
    };
    W_CSS_PLACEHOLDER_IGNORED: NoteSource & {
        property: string;
        selector: string;
    };
    W_CSS_SELECTION_IGNORED: NoteSource & {
        property: string;
        selector: string;
    };
    W_CSS_VISITED_IGNORED: NoteSource & {
        property: string;
        selector: string;
    };
    W_CSS_TRANSITION_NO_DURATION: NoteSource & {
        item: string;
        selector: string;
    };
    W_CSS_DUPLICATE_DECLARATION: NoteSource & {
        dead: string;
        kept: string;
        property: string;
        same: boolean;
        selector: string;
    };
    W_CSS_KEYFRAMES_MISSING: NoteSource & {
        name: string;
        selector?: string | undefined;
    };
    W_CSS_IMPORT_IGNORED: NoteSource & {
        nested: boolean;
        params: string;
    };
    W_CSS_KEYFRAME_IMPORTANT: NoteSource & {
        name: string;
        property: string;
    };
    W_CSS_TRANSITION_DISPLAY: NoteSource & {
        selector: string;
    };
}
export type SyntaxNoteCode = keyof SyntaxNotePayloads;
export type SyntaxNote = {
    [K in SyntaxNoteCode]: {
        code: K;
    } & SyntaxNotePayloads[K];
}[SyntaxNoteCode];
export interface SyntaxWarning {
    code: SyntaxNoteCode;
    severity: 'warning';
    message: string;
    selector?: string | undefined;
    property?: string | undefined;
    css: {
        property: string;
        file: string;
        line: number;
        selector?: string;
    }[];
    counter?: string;
    keyframes?: string;
}
export declare const syntaxNoteOrder: SyntaxNoteCode[];
export declare function syntaxWarnings(notes: readonly SyntaxNote[], codes?: readonly SyntaxNoteCode[]): SyntaxWarning[];
export {};
