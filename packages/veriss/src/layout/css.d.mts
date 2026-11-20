// Transitional declarations of the CSS operations used by migrated modules.
// The parser/cascade implementation is still JavaScript.
import type {Rational} from './linear.mjs';
import type {MediaFeatures} from '../layout-contracts.d.ts';
import type {SyntaxNote} from '../rules/syntax-notes.mjs';
export {matches,simpleSelector} from './selectors.mjs';
export function px(text:string):Rational;
export function parseLayoutCSS(sheets:readonly {css:string;file:string}[],diagnostic:(code:string,message:string,line?:number,filename?:string,detail?:unknown)=>void,options?:{scripting?:'enabled';mediaFeatures?:MediaFeatures}):{notes:SyntaxNote[]};
