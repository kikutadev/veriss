// Minimal public css-tree/tokenizer surface used here (css-tree 3.2.1 has no declarations).
declare module 'css-tree/tokenizer' {
  export function tokenize(source: string, onToken: (type: number, start: number, end: number) => void): void;
  export const tokenTypes: {
    readonly WhiteSpace: number; readonly Comment: number; readonly BadString: number; readonly BadUrl: number;
    readonly Function: number; readonly LeftParenthesis: number; readonly RightParenthesis: number;
    readonly LeftSquareBracket: number; readonly RightSquareBracket: number;
    readonly LeftCurlyBracket: number; readonly RightCurlyBracket: number; readonly Comma: number; readonly Ident: number;
  };
}
