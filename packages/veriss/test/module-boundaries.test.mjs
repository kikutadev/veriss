// ADR-0016 M2: the import direction between modules. A module may import only what its row allows; an edge not listed
// fails the test. The list for the existing modules records today's edges and shrinks as the migration (M3-M8) goes on.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join, dirname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const files = dir => readdirSync(join(src, dir), {withFileTypes: true}).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.mjs') ? [join(dir, e.name)] : []);
const importsOf = file => [...readFileSync(join(src, file), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"](\.[^'"]+)['"]/g)].map(m => relative(src, resolve(dirname(join(src, file)), m[1])));

// Pure tools: they import nothing of veriss.
const pure = ['color/index.mjs', 'layout/linear.mjs', 'layout/calc-syntax.mjs', 'layout/font-syntax.mjs', 'layout/grid-syntax.mjs', 'layout/smt.mjs', 'layout/easing.mjs', 'layout/simple-selector.mjs'];

test('pure tools import nothing of veriss', () => {
  for (const file of pure) assert.deepEqual(importsOf(file), [], file);
});

test('color/ is used only through the rules that judge colors (today: layout/accessibility.mjs)', () => {
  const users = files('.').filter(file => !file.startsWith('color/') && importsOf(file).some(target => target.startsWith('color/')));
  assert.deepEqual(users, ['layout/accessibility.mjs']);
});

test('the syntax validators are imported only by the syntax stage (layout/css.mjs)', () => {
  for (const validator of ['layout/calc-syntax.mjs', 'layout/font-syntax.mjs', 'layout/grid-syntax.mjs'])
    assert.deepEqual(files('.').filter(file => importsOf(file).includes(validator)), ['layout/css.mjs'], validator);
});
