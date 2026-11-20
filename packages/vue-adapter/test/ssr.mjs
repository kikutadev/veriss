// Vue's own server rendering of an SFC template with given data, and the SFC's CSS unscoped (fidelity checks).
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { parse } from 'vue/compiler-sfc';
import { unscopeVueCSS } from '../src/index.mjs';
export const renderSSR = (source, data) => { const template = parse(source).descriptor.template; if (!template)
    throw Error("Missing template"); return renderToString(createSSRApp({ template: template.content, data: () => data })); };
export const sfcCSS = (source) => unscopeVueCSS(parse(source).descriptor.styles.map(s => s.content).join('\n'));
