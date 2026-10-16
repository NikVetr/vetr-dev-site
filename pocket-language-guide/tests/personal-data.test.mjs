import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';

const disk = new Map([['plg.about', JSON.stringify({ name: 'before' })]]);
/** @type {(key:string, value:string) => Promise<void>} */ let write = async (key, value) => { disk.set(key, value); };
const globals = /** @type {any} */ (globalThis);
globals.localStorage = { getItem: () => null, removeItem: () => {}, key: () => null, length: 0 };
globals.Capacitor = { isNativePlatform: () => true, Plugins: { Preferences: {
  keys: async () => ({ keys: [...disk.keys()] }), get: async (/** @type {any} */ { key }) => ({ value: disk.get(key) ?? null }),
  set: (/** @type {any} */ { key, value }) => write(key, value),
  remove: async (/** @type {any} */ { key }) => { disk.delete(key); },
} } };
const store = await import('../ui/platform/store.js');
await store.ready();
const { personalWiring } = await import('../ui/personal-data.js');
let refreshes = 0;
const wiring = personalWiring({ save: () => {}, onChanged: () => { refreshes += 1; } });

test('rollback waits for delayed native writes, including nested edit writes', async () => {
  for (const nested of [false, true]) {
    /** @type {() => void} */ let release = () => {};
    const delayed = new Promise((resolve) => { release = () => resolve(undefined); });
    write = async (key, value) => {
      if (key === 'plg.speaker' && value.includes('fail')) throw new Error('refused');
      if (nested && key === 'plg.edits.es__en') throw new Error('refused edit');
      if (value.includes('after')) await delayed;
      disk.set(key, value);
    };
    const pending = wiring.apply({ version: 1, created: 'test',
      ...(nested ? { edits: { es__en: {}, ja__en: { extras: [], overrides: { hello: { values: { script: 'after' } } } } } }
        : { speaker: { gender: 'fail' }, about: { name: 'after' } }),
    });
    const refused = assert.rejects(pending, /refused/);
    await setImmediate();
    release();
    await refused;
    await setImmediate();
    assert.equal(disk.get('plg.about'), JSON.stringify({ name: 'before' }));
    assert.equal(store.get('plg.about'), disk.get('plg.about'));
    assert.equal(disk.has('plg.edits.ja__en'), false);
    assert.equal(refreshes, 0, 'keep the import error visible instead of reloading the page');
  }
});

test('a failed rollback is reported, not hidden behind the original error', async () => {
  write = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(wiring.apply({ version: 1, created: 'test', about: { name: 'after' } }),
    (error) => error instanceof AggregateError && /previous data could not be fully restored/.test(error.message));
  assert.equal(refreshes, 0);
});

test('a successful restore refreshes the page after its writes land', async () => {
  write = async (key, value) => { disk.set(key, value); };
  await wiring.apply({ version: 1, created: 'test', about: { name: 'restored' } });
  assert.equal(disk.get('plg.about'), JSON.stringify({ name: 'restored' }));
  assert.equal(refreshes, 1);
});
