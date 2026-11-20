import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { verifyUI } from '../packages/veriss/src/layout-contract.mjs';
import { domGeometry } from '../packages/adapter-core/src/ui-contracts.mjs';
if (!process.argv[2])
    throw new Error('Pass the extracted xstate@5.33.4 package directory');
const require = createRequire(resolve(process.argv[2], 'package.json'));
function record(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
const xstate = require('xstate'), graphModule = require('xstate/graph');
if (!record(xstate) || typeof xstate.createMachine !== 'function' || typeof xstate.assign !== 'function' || !record(graphModule) || typeof graphModule.getAdjacencyMap !== 'function')
    throw Error('Unsupported XState API');
const { createMachine, assign } = xstate, { getAdjacencyMap } = graphModule;
function isSnapshot(value) { return record(value) && typeof value.value === 'string' && record(value.context) && typeof value.context.dirty === 'boolean'; }
function isGraphTransition(value) { return record(value) && record(value.event) && typeof value.event.type === 'string' && isSnapshot(value.state); }
function isGraphRecord(value) { return record(value) && isSnapshot(value.state) && record(value.transitions) && Object.values(value.transitions).every(isGraphTransition); }
function isGraph(value) { return record(value) && Object.values(value).every(isGraphRecord); }
const machine = createMachine({
    id: 'settings', initial: 'editing', context: { dirty: false },
    states: {
        editing: { on: {
                CHANGE: { actions: assign({ dirty: true }) },
                SAVE: { guard: ({ context }) => context.dirty, target: 'saving' }
            } },
        saving: { on: { RESOLVE: 'saved', REJECT: 'error' } },
        saved: { on: { EDIT: { target: 'editing', actions: assign({ dirty: false }) } } },
        error: { on: { RETRY: 'saving', EDIT: 'editing' } }
    }
});
// This key is complete ONLY for this particular finite pure machine. It
// must not be treated as a general serialization of an arbitrary actor.
const serializeState = (s) => JSON.stringify([s.value, s.context]);
const graphValue = getAdjacencyMap(machine, { serializeState });
assert.ok(isGraph(graphValue), 'Invalid XState graph');
const graph = Object.entries(graphValue);
const ids = new Map(graph.map(([key], i) => [key, 's' + i]));
function id(key) { const found = ids.get(key); assert.ok(found, 'Unknown graph state'); return found; }
const initial = id(serializeState({ value: 'editing', context: { dirty: false } }));
const states = graph.map(([key]) => id(key));
const transitions = graph.flatMap(([key, record]) => Object.values(record.transitions).map(t => ({
    from: id(key), event: t.event.type, to: id(serializeState(t.state))
})));
assert.equal(states.length, 5);
assert.equal(transitions.length, 9);
assert.ok(initial && transitions.every(t => t.from && t.to));
assert.ok(transitions.some(t => t.from === initial && t.event === 'SAVE' && t.to === initial));
const profile = { id: 'web', viewport: { min: 320, max: 1280, height: { min: 400, max: 900 } } };
const html = '<!doctype html><html lang="en"><head><title>Settings</title></head><body><div id="save" role="button" aria-label="Save"></div></body></html>';
const model = { version: 1, component: 'Settings', initial, states, transitions, profiles: [profile], contracts: [
        { id: 'min-size', kind: 'min-size', target: 'save', width: 44, height: 44 },
        { id: 'stable-save', kind: 'stable', target: 'save', event: 'SAVE' }
    ] };
const facts = (broken = false) => graph.flatMap(([key, record]) => domGeometry({
    state: id(key), profile, html,
    css: '*{box-sizing:border-box;margin:0}html,body{display:grid;grid-template-columns:minmax(0,1fr)}#save{width:100%;height:' +
        (broken && record.state.value === 'saving' ? '40' : '48') + 'px}',
    targets: ['save']
}));
const results = [];
for (const [mode, evidence, expected] of [
    ['valid', facts(), 'verified'],
    ['broken', facts(true), 'violated'],
    ['incomplete', facts().filter(e => e.state !== ids.get(serializeState({ value: 'saving', context: { dirty: true } }))), 'unknown']
]) {
    const report = verifyUI({ model, evidence });
    assert.equal(report.status, expected, JSON.stringify(report));
    assert.ok(report.contracts.every(c => c.status === expected));
    results.push({ mode, status: report.status, contracts: report.contracts.map(c => ({
            id: c.id, status: c.status, cases: c.cases.length, witness: c.cases.find(v => v.witness)?.witness
        })) });
}
console.log(JSON.stringify({
    states: graph.map(([key, record]) => ({ id: id(key), value: record.state.value, context: record.state.context })),
    transitions, results
}, null, 2));
