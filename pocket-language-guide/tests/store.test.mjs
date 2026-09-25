// Personal data on a platform that can throw `localStorage` away.
//
// The web path is the one every existing test already exercises by using the app;
// what needs its own test is the native path, which no browser here runs. A fake
// Capacitor is enough, because the contract is small and the failure it guards
// against is specific: a reader upgrades, the native store hydrates, and their
// phrases are still there.

import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * A `localStorage` good enough for the adapter, and a `Preferences` good enough.
 * @param {{native?:boolean, local?:Record<string,string>, durable?:Record<string,string>}} how
 */
function stage(how = {}) {
  const { native, local = {}, durable = {} } = how;
  const web = new Map(Object.entries(local));
  const disk = new Map(Object.entries(durable));
  const any = /** @type {any} */ (globalThis);
  any.localStorage = /** @type {any} */ ({
    getItem: (/** @type {string} */ k) => web.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => web.set(k, v),
    removeItem: (/** @type {string} */ k) => web.delete(k),
    key: (/** @type {number} */ i) => [...web.keys()][i] ?? null,
    get length() { return web.size; },
  });
  any.Capacitor = /** @type {any} */ (native ? {
    isNativePlatform: () => true,
    Plugins: {
      Preferences: {
        keys: async () => ({ keys: [...disk.keys()] }),
        get: async (/** @type {any} */ { key }) => ({ value: disk.get(key) ?? null }),
        set: async (/** @type {any} */ { key, value }) => { disk.set(key, value); },
        remove: async (/** @type {any} */ { key }) => { disk.delete(key); },
      },
    },
  } : undefined);
  return { web, disk };
}

/** A fresh copy of the module, because `ready()` is deliberately once-per-process. */
const load = (/** @type {string} */ tag) => import(`../ui/platform/store.js?${tag}`);

test('on the web it is localStorage, unchanged', async () => {
  const { web } = stage({ native: false, local: { 'plg.x': '1' } });
  const store = await load('web');
  await store.ready();
  assert.equal(store.get('plg.x'), '1');
  store.set('plg.y', '2');
  assert.equal(web.get('plg.y'), '2');
  store.remove('plg.x');
  assert.equal(store.get('plg.x'), null);
});

test('on a device the durable store is read, and written through', async () => {
  const { disk } = stage({ native: true, durable: { 'plg.boards': '{"a":1}' } });
  const store = await load('native');
  await store.ready();
  // Read from the mirror, synchronously, which is what every caller here expects.
  assert.equal(store.get('plg.boards'), '{"a":1}');
  store.set('plg.speaker', '{"speaker_gender":"feminine"}');
  assert.equal(store.get('plg.speaker'), '{"speaker_gender":"feminine"}');
  // The write reaches the durable store behind the reader, not in front of them.
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(disk.get('plg.speaker'), '{"speaker_gender":"feminine"}');
});

test('an upgrade carries the old store over, and never the other way', async () => {
  // **The case this exists for.** A build that predates the adapter wrote the
  // reader's phrases to `localStorage`; the same install now reads the durable
  // store. Their work has to survive that, which means copying forward -- and only
  // forward, because a stale web copy must not overwrite something saved after the
  // upgrade.
  const { web, disk } = stage({
    native: true,
    local: { 'plg.boards': 'old phrases', 'plg.edits.zh-Hans__en': 'old edits', 'other.app': 'not ours' },
    durable: { 'plg.boards': 'newer phrases' },
  });
  const store = await load('migrate');
  await store.ready();
  // Already in the durable store: the native value wins, the web copy is ignored.
  assert.equal(store.get('plg.boards'), 'newer phrases');
  // Only in the web store: carried over, so nothing the reader made is lost.
  assert.equal(store.get('plg.edits.zh-Hans__en'), 'old edits');
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(disk.get('plg.edits.zh-Hans__en'), 'old edits');
  // The source copy is left alone. Deleting it before the destination has been read
  // back at least once is how a failed migration becomes a lost sheet.
  assert.equal(web.get('plg.edits.zh-Hans__en'), 'old edits');
  // Another origin's keys are not this app's to move.
  assert.equal(store.get('other.app'), null);
  assert.equal(disk.has('other.app'), false);
});

test('ready is idempotent, because every page calls it', async () => {
  stage({ native: true, durable: { 'plg.x': '1' } });
  const store = await load('idem');
  const [a, b] = [store.ready(), store.ready()];
  assert.equal(a, b, 'the second caller gets the first one’s promise');
  await a;
  assert.equal(store.get('plg.x'), '1');
});

test('a write says when it has landed, and a refused one says so too', async () => {
  const { disk } = stage({ native: true });
  const store = await load('durable');
  await store.ready();
  await store.set('plg.k', 'v');
  assert.equal(disk.get('plg.k'), 'v');
  // The durable store refuses: the mirror has the value, the promise says it did not
  // reach the disk, and a caller that says "saved" has something to wait on.
  const any = /** @type {any} */ (globalThis);
  any.Capacitor.Plugins.Preferences.set = async () => { throw new Error('disk full'); };
  await assert.rejects(store.set('plg.k2', 'v2'), /disk full/);
  assert.equal(store.get('plg.k2'), 'v2');
  assert.equal(disk.has('plg.k2'), false);
});

test('a deletion deletes the web copy too, so the migration cannot bring it back', async () => {
  // Deleted on the device, the key was back on the next launch: the migration copies
  // forward anything the durable store lacks, and the `localStorage` copy it had
  // been migrated from was never touched.
  const { web, disk } = stage({ native: true, local: { 'plg.edits.zh-Hans__en': 'old edits' } });
  const store = await load('remove');
  await store.ready();
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(disk.get('plg.edits.zh-Hans__en'), 'old edits');
  await store.remove('plg.edits.zh-Hans__en');
  assert.equal(store.get('plg.edits.zh-Hans__en'), null);
  assert.equal(disk.has('plg.edits.zh-Hans__en'), false);
  assert.equal(web.has('plg.edits.zh-Hans__en'), false);
  // And a second launch finds nothing to migrate.
  const again = await load('remove2');
  await again.ready();
  assert.equal(again.get('plg.edits.zh-Hans__en'), null);
});
