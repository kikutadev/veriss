// The real thing, for fidelity checks: StyleX's own compiler (atomic classes and CSS), esbuild's JSX transform,
// and react-dom/server's markup. Linaria is compiled by its own build (wyw-in-js).
import {createRequire} from 'node:module';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {transform} from 'esbuild';


const require = createRequire(import.meta.url);
// Compiler and React packages do not publish all of the types used by this
// fixture. Check the dynamic module boundary instead of treating results as untyped.
const property = (v:unknown,k:string):unknown => v!==null&&(typeof v==='object'||typeof v==='function')?Reflect.get(v,k):undefined;
const callable = (v:unknown):v is (...args:unknown[])=>unknown => typeof v==='function';
function callMethod(module:unknown,key:string,...args:unknown[]):unknown {
  const method=property(module,key);if(!callable(method))throw Error('Missing '+key);return method.apply(module,args);
}
const stringResult = (v:unknown,label:string):string=>{if(typeof v!=='string')throw Error('Expected '+label);return v};
const plugin:unknown = require('@stylexjs/babel-plugin');
const babel:unknown = createRequire(require.resolve('@stylexjs/babel-plugin'))('@babel/core');
const react:unknown=require('react'), reactServer:unknown=require('react-dom/server');
const dir = mkdtempSync(join(fileURLToPath(new URL('.', import.meta.url)), '.ssr-'));
let n = 0;

export function compileStylex(source:string, filename = 'Component.jsx') {
  const out = callMethod(babel,'transformSync',source, {filename, parserOpts: {plugins: ['jsx']}, plugins: [[plugin, {dev: false, runtimeInjection: false, treeshakeCompensation: true, unstable_moduleResolution: {type: 'commonJS'}}]]});
  return {code:stringResult(property(out,'code'),'Babel code'),css:stringResult(callMethod(plugin,'processStylexRules',property(property(out,'metadata'),'stylex'),false),'StyleX CSS')};
}

// Linaria's own build (wyw-in-js): it evaluates the templates' interpolations from the module, writes each class's
// CSS and replaces css`` with the class name and styled`` with @linaria/react's runtime component.
export async function compileLinaria(source:string, filename = 'Component.jsx') {
  // wyw 2.4.0 ships extensionless declaration imports incompatible with NodeNext.
  // Load the resolved ESM entry and validate the two exports this test uses.
  const wyw:unknown = await import(pathToFileURL(require.resolve('@wyw-in-js/transform')).href);
  const Cache=property(wyw,'TransformCacheCollection');
  if(typeof Cache!=='function')throw Error('Missing TransformCacheCollection');
  const cache:unknown=Reflect.construct(Cache,[]);
  const file = join(dir, filename);
  writeFileSync(file, source);
  const asyncResolve = async (what:string, importer:string) => require.resolve(what, {paths: [importer.replace(/[\\/][^\\/]*$/, ''), fileURLToPath(new URL('.', import.meta.url))]});
  const result = await callMethod(wyw,'transform',{options: {filename: file, root: fileURLToPath(new URL('..', import.meta.url)), pluginOptions: {babelOptions: {plugins: [require.resolve('@babel/plugin-syntax-jsx', {paths: [require.resolve('@wyw-in-js/transform')]})]}}}, cache}, source, asyncResolve);
  return {code:stringResult(property(result,'code'),'Linaria code'),css:stringResult(property(result,'cssText'),'Linaria CSS')};
}

export async function render(code:string, props:Record<string,unknown>) {
  const {code: js} = await transform(code, {loader: 'jsx', jsx: 'automatic', format: 'esm'});
  const file = join(dir, `c${n++}.mjs`);
  writeFileSync(file, js.replace(/from ['"](@linaria\/(?:core|react))['"]/g, (m:string, name:string) => `from '${pathToFileURL(require.resolve(name)).href}'`).replace(/from ['"]@stylexjs\/stylex['"]/, `from '${pathToFileURL(require.resolve('@stylexjs/stylex')).href}'`).replace(/from ['"]react(\/jsx-runtime)?['"]/g, (m:string, sub:string|undefined) => `from '${pathToFileURL(require.resolve(`react${sub ?? ''}`)).href}'`));
  const Component:unknown = (await import(pathToFileURL(file).href)).default;
  return stringResult(callMethod(reactServer,'renderToStaticMarkup',callMethod(react,'createElement',Component,props)),'React markup');
}
