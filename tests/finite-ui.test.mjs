import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveReactState } from '../packages/react-adapter/src/index.mjs';
import { deriveVueState } from '../packages/vue-adapter/src/index.mjs';
import { deriveSvelteState } from '../packages/svelte-adapter/src/index.mjs';
import { verifyFiniteUI } from '../packages/adapter-core/src/index.mjs';
const fixtures = [
    [deriveReactState, `import {useState} from 'react';export default function Panel(){const [open,setOpen]=useState(false);return <main><button id="toggle" onClick={()=>setOpen(!open)}>Toggle</button>{open&&<div id="panel"/>}</main>}`],
    [deriveVueState, `<script setup>import {ref} from 'vue';const open=ref(false)</script><template><main><button id="toggle" @click="open = !open">Toggle</button><div v-if="open" id="panel"></div></main></template>`],
    [deriveSvelteState, `<script>let open=$state(false)</script><main><button id="toggle" onclick={()=>open=!open}>Toggle</button>{#if open}<div id="panel"></div>{/if}</main>`],
];
test('derive settled click transitions from actual boolean updates in React, Vue and Svelte', () => {
    for (const [derive, source] of fixtures) {
        const r = derive(source);
        assert.equal(r.status, 'derived', JSON.stringify(r));
        assert.deepEqual(r.state.states, ['s0', 's1']);
        assert.deepEqual(r.state.transitions, [{ from: 's0', event: 'click:toggle', to: 's1' }, { from: 's1', event: 'click:toggle', to: 's0' }]);
        assert.deepEqual(r.variants.map(v => v.values), [{ open: false }, { open: true }]);
        assert.ok(!r.variants[0].html.includes('id="panel"'));
        assert.ok(r.variants[1].html.includes('id="panel"'));
    }
});
test('reject uncontrolled updates, arbitrary JavaScript and unsupported conditions', () => {
    for (const [derive, source] of fixtures) {
        const external = source.replace('!open', 'Boolean(Date.now())');
        assert.equal(derive(external).status, 'unknown');
        const unsupported = source.replace('id="panel"', 'id="panel" contenteditable="true"');
        assert.equal(derive(unsupported).status, 'unknown');
    }
    const [react, source] = fixtures[0];
    assert.equal(react(source.replace('return <main>', 'setOpen(true);return <main>')).status, 'unknown');
    assert.equal(react(source.replace('open&&', 'window.location&&')).status, 'unknown');
});
test('finite graph distinguishes absent controls, literal updates and unreachable render choices', () => {
    const r = deriveReactState(`import {useState} from 'react';export default function Panel(){const [open,setOpen]=useState(false);return <main>{open?<button id="close" onClick={()=>setOpen(false)}>Close</button>:<button id="open" onClick={()=>setOpen(true)}>Open</button>}</main>}`);
    assert.equal(r.status, 'derived', JSON.stringify(r));
    assert.deepEqual(r.state.transitions, [{ from: 's0', event: 'click:open', to: 's1' }, { from: 's1', event: 'click:close', to: 's0' }]);
    const one = deriveReactState(fixtures[0][1].replace('setOpen(!open)', 'setOpen(false)'));
    assert.equal(one.status, 'derived');
    assert.deepEqual(one.state.states, ['s0']);
});
test('derived graph connects to relational contracts, while unknown state analysis never verifies', () => {
    const source = fixtures[0][1].replace('<button id="toggle" onClick={()=>setOpen(!open)}>Toggle</button>', '<button id="toggle" onClick={()=>setOpen(!open)} aria-label="Toggle"/>');
    const analysis = deriveReactState(source);
    const profile = { id: 'web', viewport: { min: 320, max: 800, height: { min: 400, max: 900 } } };
    const options = { profiles: [profile], contracts: [{ id: 'stable', kind: 'stable', target: 'toggle', event: 'click:toggle' }], targets: ['toggle'],
        css: '*{box-sizing:border-box;margin:0;padding:0}html,body,#app,main{display:grid;grid-template-columns:minmax(0,1fr)}button{width:100%;height:48px;border:0;appearance:none}#panel{height:80px}' };
    const r = verifyFiniteUI(analysis, options);
    assert.equal(r.status, 'verified', JSON.stringify(r));
    assert.equal(verifyFiniteUI({ status: 'unknown', reason: 'external code' }, options).status, 'unknown');
});
test('scoped geometry remains unknown for runtime CSS variables or ambiguous compiler class assignment', () => {
    const profile = { id: 'web', viewport: { min: 320, max: 800, height: { min: 400, max: 900 } } };
    const inputs = [
        [deriveVueState, fixtures[1][1] + '<style scoped>main{height:v-bind(open)}</style>'],
        [deriveSvelteState, fixtures[2][1].replace('<main>', '<main class="panel">') + '<style>.panel{height:48px}</style>']
    ];
    for (const [derive, source] of inputs) {
        const scoped = derive(source);
        assert.equal(scoped.status, 'derived', JSON.stringify(scoped));
        assert.equal(verifyFiniteUI(scoped, { profiles: [profile], contracts: [], targets: ['toggle'] }).status, 'unknown');
    }
});
test('two independent boolean variables explore their full reachable product without inferring missing events', () => {
    const r = deriveReactState(`import {useState} from 'react';export default function Panel(){const [open,setOpen]=useState(false);const [dirty,setDirty]=useState(false);return <main><button id="open" onClick={()=>setOpen(!open)}/>{open&&<button id="dirty" onClick={()=>setDirty(!dirty)}/>}</main>}`);
    assert.equal(r.status, 'derived', JSON.stringify(r));
    assert.equal(r.state.states.length, 4);
    assert.equal(r.state.transitions.length, 6);
    assert.ok(r.state.transitions.every(t => t.event !== 'click:dirty' || r.variants.find(v => v.id === t.from).values.open));
});
test('native compiler scope attributes/classes preserve the component cascade instead of unscoping it', () => {
    const profile = { id: 'web', viewport: { min: 320, max: 800, height: { min: 400, max: 900 } } };
    const options = { profiles: [profile], contracts: [{ id: 'size', kind: 'min-size', target: 'toggle', width: 44, height: 44 }], targets: ['toggle'],
        css: '*{box-sizing:border-box;margin:0;padding:0}html,body,#app,main{display:grid;grid-template-columns:minmax(0,1fr)}button{width:100%;height:32px;border:0;appearance:none}#panel{height:80px}' };
    for (const [derive, original] of fixtures.slice(1)) {
        const source = original.replace('>Toggle</button>', ' aria-label="Toggle"></button>') +
            (derive === deriveVueState ? '<style scoped>button{height:48px}body{padding:200px}</style>' : '<style>button{height:48px}body{padding:200px}</style>');
        const r = derive(source);
        assert.equal(r.status, 'derived', JSON.stringify(r));
        assert.equal(r.scopedCSS, false, JSON.stringify(r));
        assert.ok(r.variants.every(v => v.html.includes(derive === deriveVueState ? 'data-v-veriss-finite' : 'svelte-veriss-finite')));
        const proof = verifyFiniteUI(r, options);
        assert.equal(proof.status, 'verified', JSON.stringify(proof));
        const broken = derive(source.replace('height:48px', 'height:30px'));
        assert.equal(verifyFiniteUI(broken, options).status, 'violated');
    }
});
