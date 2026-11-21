import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { test } from 'node:test';
import { isolatedFirefoxAppData } from '../tools/firefox-app-data.mjs';

test('macOS Firefox gets isolated writable app-data without replacing the test profile', () => {
  const original = { HOME: '/example/home', CUSTOM: 'value' };
  const { env, cleanup } = isolatedFirefoxAppData(original, 'darwin');
  try {
    assert.equal(env.HOME, original.HOME);
    assert.equal(env.CUSTOM, 'value');
    assert.notEqual(env.MOZ_APP_DATA, env.MOZ_LOCAL_APP_DATA);
    const appData = env.MOZ_APP_DATA;
    const localData = env.MOZ_LOCAL_APP_DATA;
    assert(appData); assert(localData);
    assert.equal(appData.includes('/example/home'), false);
    mkdirSync(appData, { recursive: true });
    mkdirSync(localData, { recursive: true });
    assert(existsSync(appData));
  } finally {
    cleanup();
  }
  assert.equal(existsSync(env.MOZ_APP_DATA!), false);
  assert.equal(existsSync(env.MOZ_LOCAL_APP_DATA!), false);
  cleanup();
});

test('explicit Firefox paths and other OSes are unchanged', () => {
  for (const [env, platform] of ([
    [{ MOZ_APP_DATA: '/explicit/app', MOZ_LOCAL_APP_DATA: '/explicit/local' }, 'darwin'],
    [{}, 'linux'],
  ] as [NodeJS.ProcessEnv, NodeJS.Platform][])) {
    const prepared = isolatedFirefoxAppData(env, platform);
    assert.equal(prepared.env, env);
    prepared.cleanup();
  }
});

test('one explicit override is preserved; missing path isolated', () => {
  const { env, cleanup } = isolatedFirefoxAppData({ MOZ_APP_DATA: '/explicit/app' }, 'darwin');
  try {
    assert.equal(env.MOZ_APP_DATA, '/explicit/app');
    assert(env.MOZ_LOCAL_APP_DATA);
    assert(env.MOZ_LOCAL_APP_DATA);
    mkdirSync(env.MOZ_LOCAL_APP_DATA, { recursive: true });
  } finally {
    cleanup();
  }
  assert(!existsSync(env.MOZ_LOCAL_APP_DATA!));
});
