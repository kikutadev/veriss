export interface VariableToken {
    type: number;
    raw: string;
    children?: VariableToken[];
    close?: ')' | ']' | '}';
    variable?: string;
    fallback?: VariableToken[];
}
export interface VariableExpression {
    nodes: VariableToken[];
    references: string[];
    fallbackReferences: string[];
}
export interface VariableDeclaration {
    expression: VariableExpression;
}
export interface PropertyRegistration {
    inherits: boolean;
    initial: string | null;
    syntax?: string;
}
export type VariableResult = {
    status: 'resolved';
    tokens: string[];
} | {
    status: 'invalid' | 'unknown';
    message: string;
    code: string;
};
export interface VariableEnvironment {
    closed: boolean;
    lookup: (name: string) => VariableResult;
}
type Spend = (n?: number) => void;
export declare const customName: (name: string) => boolean;
/** Parse token boundaries, including fallback edges; never replace raw substrings. */
export declare function variableValue(source: string): VariableExpression;
/** Parent closures are immutable: inherited aliases cannot rebind to child vars. */
/**
 * registry: name → {inherits, initial} from @property (initial: the initial-value text, or null). A registered
 * property that does not inherit reads its initial value where it is not set; one that inherits reads it at the root.
 * initial, and (when it does not inherit) unset and revert give it too.
 */
export declare function variableEnvironment(declarations: ReadonlyMap<string, VariableDeclaration>, parent: VariableEnvironment | null | undefined, documentRoot: boolean | undefined, globalSpend?: Spend, registry?: ReadonlyMap<string, PropertyRegistration>): VariableEnvironment;
/**
 * Substitute var() for one declaration. A guaranteed-invalid reference
 * (missing without fallback, initial, non-conditional cycle) returns
 * `{invalid}`: the declaration is invalid at computed-value time and the
 * caller treats it as unset. Undecidable lookups still throw (Unknown).
 */
export declare function substituteDeclaration(expression: VariableExpression, environment: VariableEnvironment, spend?: Spend): {
    invalid: {
        code: string;
        message: string;
    };
    value?: never;
} | {
    value: string;
    invalid?: never;
};
export declare function substituteVariables(expression: VariableExpression, environment: VariableEnvironment, spend?: Spend): string;
type StateRead = {
    property?: string;
    expression?: VariableExpression;
    pending?: {
        property: string;
        expression: VariableExpression;
    };
};
export interface StateVariableRule {
    declarations: readonly StateRead[];
    unmodeledVariableConsumer?: boolean;
}
export declare function stateVariableDependencies(rules: readonly StateVariableRule[]): {
    reads: Map<string, Set<string>>;
    onlyLengths: (name: string) => boolean;
};
export {};
