// css-tree exposes its public ident helper through a subpath that the upstream
// DefinitelyTyped package does not currently declare.
declare module 'css-tree/utils' {
  export const ident: typeof import('css-tree').ident;
}
