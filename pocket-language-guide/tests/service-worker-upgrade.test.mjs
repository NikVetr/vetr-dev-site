import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('sw.js', 'utf8');
const currentShell = `${source.match(/const VERSION = '([^']+)'/)?.[1]}-shell`;
const BASE = 'https://example.test/pocket-language-guide/';
const HASH = 'x-plg-content-sha256';
/** @param {string} text */
const hash = (text) => createHash('sha256').update(text).digest('hex');
/** @param {string|Request} request */
const address = (request) => new URL(typeof request === 'string' ? request : request.url, BASE).href;

class MemoryCache {
  /** @type {Map<string,Response>} */ entries = new Map();
  /** @param {string|Request} request @param {{ignoreSearch?:boolean}} [options] */
  async keys(request, options = {}) {
    const strip = (/** @type {string} */ value) => {
      const url = new URL(value);
      if (options.ignoreSearch) url.search = '';
      return url.href;
    };
    return [...this.entries.keys()].filter((key) => !request || strip(key) === strip(address(request)))
      .map((key) => new Request(key));
  }
  /** @param {string|Request} request @param {{ignoreSearch?:boolean}} [options] */
  async match(request, options) {
    const key = (await this.keys(request, options))[0];
    return key ? this.entries.get(key.url)?.clone() : undefined;
  }
  /** @param {string|Request} request @param {Response} response */
  async put(request, response) { this.entries.set(address(request), response.clone()); }
  /** @param {string|Request} request */
  async delete(request) { return this.entries.delete(address(request)); }
}

/** Run the actual worker against Cache/Fetch fakes; no duplicate upgrade logic.
 * @param {Record<string,string>} expected */
async function worker(expected) {
  /** @type {Map<string,MemoryCache>} */ const stores = new Map();
  const open = async (/** @type {string} */ name) => {
    if (!stores.has(name)) stores.set(name, new MemoryCache());
    return /** @type {MemoryCache} */ (stores.get(name));
  };
  const shell = await open(currentShell);
  await shell.put('data/offline.json', new Response(JSON.stringify({ hashes: expected })));
  await open('plg-previous-shell');
  await open('another-app-shell');
  const pack = await open('plg-packs');
  /** @type {Record<string,Function[]>} */ const events = {};
  /** @type {Map<string,string|Response>} */ const network = new Map();
  /** @type {string[]} */ const reads = [];
  /** @type {any[][]} */ const warnings = [];
  /** @param {...any} args */
  function warn(...args) { warnings.push(args); }
  vm.runInNewContext(source, {
    self: {
      addEventListener: (/** @type {string} */ type, /** @type {Function} */ callback) => { (events[type] ??= []).push(callback); },
      clients: { claim: async () => {} },
    },
    location: new URL('sw.js', BASE), URL, Request, Response, Headers, Uint8Array, crypto: webcrypto,
    console: { warn },
    caches: { open, keys: async () => [...stores.keys()], delete: async (/** @type {string} */ key) => stores.delete(key) },
    fetch: async (/** @type {string|Request} */ request) => {
      const path = address(request).slice(BASE.length);
      reads.push(path);
      const body = network.get(path);
      if (body === undefined) throw new Error('Offline');
      return body instanceof Response ? body.clone() : new Response(body);
    },
  });
  return {
    shell, pack, stores, network, reads, warnings,
    async activate() {
      /** @type {Promise<unknown>|undefined} */ let work;
      events.activate[0]({ waitUntil: (/** @type {Promise<unknown>} */ promise) => { work = promise; } });
      await work;
    },
    /** @param {string} path */
    async read(path) {
      /** @type {Promise<Response>|undefined} */ let work;
      events.fetch[0]({ request: new Request(new URL(path, BASE)),
        respondWith: (/** @type {Promise<Response>} */ promise) => { work = promise; } });
      return (await work)?.text();
    },
  };
}

test('upgrade migrates an unchanged legacy pack locally and reuses it without downloads', async () => {
  const path = 'data/lang/de/core.csv';
  const f = await worker({ [path]: hash('unchanged rows') });
  await f.pack.put(path, new Response('unchanged rows'));
  await f.activate();
  assert.deepEqual(f.reads, []);
  assert.equal((await f.pack.match(path))?.headers.get(HASH), hash('unchanged rows'));
  assert.equal(await f.read(path), 'unchanged rows');
  assert.equal(await f.read(path), 'unchanged rows');
  assert.deepEqual(f.reads, []);
  assert.ok(!f.stores.has('plg-previous-shell'));
  assert.ok(f.stores.has('another-app-shell'));
});

test('upgrade refreshes only changed cached files and removes shell shadows', async () => {
  const changed = 'data/lang/de/core.csv';
  const same = 'data/fonts/example.woff2';
  const unopened = 'data/lang/fr/core.csv';
  const f = await worker({ [changed]: hash('new rows'), [same]: hash('same font'), [unopened]: hash('not saved') });
  await f.pack.put(changed, new Response('old rows', { headers: { [HASH]: hash('old rows') } }));
  await f.pack.put(same, new Response('same font'));
  await f.shell.put('ui/app.js', new Response('new module'));
  await f.pack.put('ui/app.js', new Response('old module'));
  f.network.set(changed, 'new rows');
  await f.activate();
  assert.deepEqual(f.reads, [changed]);
  assert.equal(await f.read(changed), 'new rows');
  assert.equal(await f.read(same), 'same font');
  assert.equal((await f.pack.match(changed))?.headers.get(HASH), hash('new rows'));
  assert.equal(await f.pack.match('ui/app.js'), undefined);
  assert.equal(await f.pack.match(unopened), undefined);
  assert.deepEqual(f.reads, [changed], 'unchanged and unopened languages are never redownloaded');
});

test('failed upgrade keeps offline bytes and old hashes, then retries once online with in-flight deduplication', async () => {
  const path = 'data/lang/de/core.csv';
  const f = await worker({ [path]: hash('new rows') });
  await f.pack.put(path, new Response('old rows'));
  await f.activate();
  assert.equal((await f.pack.match(path))?.headers.get(HASH), hash('old rows'));
  assert.ok(!f.stores.has('plg-previous-shell'), 'retry metadata survives deletion of the old shell');
  assert.equal(await f.read(path), 'old rows');
  f.network.set(path, 'wrong deploy bytes');
  assert.equal(await f.read(path), 'old rows', 'a hash mismatch cannot replace the saved copy');
  assert.equal((await f.pack.match(path))?.headers.get(HASH), hash('old rows'));
  f.network.set(path, new Response('Not found', { status: 404 }));
  assert.equal(await f.read(path), 'old rows');
  assert.ok(f.warnings.length >= 3, 'failed refreshes are reported');
  f.network.set(path, 'new rows');
  const before = f.reads.length;
  assert.deepEqual(await Promise.all([f.read(path), f.read(path)]), ['new rows', 'new rows']);
  assert.equal(f.reads.length, before + 1);
  assert.equal(await f.read(path), 'new rows');
  assert.equal(f.reads.length, before + 1, 'successful refresh returns to cache-first reads');
});
