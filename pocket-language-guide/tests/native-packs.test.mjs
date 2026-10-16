import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLanguagePacks, nativeLanguagePacks } from '../ui/platform/language-packs.js';
import { sha256 } from '../vendor/sha256.esm.js';

const hash = (/** @type {Uint8Array} */ bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = (/** @type {string} */ text) => new TextEncoder().encode(text);
const absent = () => Object.assign(new Error('file missing'), { code: 'OS-PLUG-FILE-0008' });
const ROOT = 'https://raw.githubusercontent.com/NikVetr/vetr-dev-site/12f1403a83e444acd41b0b797113597987335f38/pocket-language-guide/';
const DIRECTORY = 'wanderwart-language-packs/';

function fixture() {
  /** @type {Map<string,Uint8Array>} */ const remote = new Map();
  const entry = (/** @type {string} */ path, /** @type {string} */ value) => {
    const data = bytes(value);
    remote.set(ROOT + path, data);
    return { path, bytes: data.length, sha256: hash(data) };
  };
  const en = entry('data/lang/en/core.csv', 'English');
  const zh = entry('data/lang/zh-Hans/core.csv', 'Chinese');
  const common = entry('data/fonts/latin-400.ttf', 'bundled font');
  const shared = entry('data/fonts/latin-serif-400.ttf', 'shared font');
  const es = entry('data/lang/es/core.csv', 'Spanish');
  const fr = entry('data/lang/fr/core.csv', 'French');
  const manifest = { schemaVersion: 1, version: hash(bytes('version1')), baseUrl: ROOT,
    starter: ['en', 'zh-Hans'], bundled: [en.path, zh.path, common.path], languages: {
      en: { files: [en], fonts: [common] }, 'zh-Hans': { files: [zh], fonts: [common] },
      es: { files: [es], fonts: [common, shared] }, fr: { files: [fr], fonts: [common, shared] },
    } };
  /** @type {Map<string,string>} */ const disk = new Map();
  /** @type {Map<string,string>} */ const settings = new Map([['plg.cards', 'keep cards'], ['plg.speaker', 'keep profile']]);
  /** @type {string[]} */ const downloads = [];
  const dependencies = {
    hash,
    async download(/** @type {string} */ url) {
      downloads.push(url);
      const value = remote.get(url);
      if (!value) throw new Error('network unavailable');
      return value;
    },
    preferences: {
      async get(/** @type {{key:string}} */ options) { return { value: settings.get(options.key) ?? null }; },
      async set(/** @type {{key:string,value:string}} */ options) { settings.set(options.key, options.value); },
    },
    filesystem: {
      async readFile(/** @type {{path:string,directory:string}} */ options) {
        assert.equal(options.directory, 'DATA');
        const data = disk.get(options.path);
        if (data === undefined) throw absent();
        return { data };
      },
      async writeFile(/** @type {{path:string,directory:string,data:string}} */ options) {
        assert.equal(options.directory, 'DATA');
        disk.set(options.path, options.data);
      },
      async stat(/** @type {{path:string}} */ options) {
        const data = disk.get(options.path);
        if (data === undefined) throw absent();
        return { type: 'file', size: atob(data).length };
      },
      async readdir(/** @type {{path:string,directory:string}} */ options) {
        assert.equal(options.directory, 'DATA');
        assert.equal(options.path + '/', DIRECTORY);
        return { files: [...disk.keys()].filter((p) => p.startsWith(DIRECTORY))
          .map((p) => ({ type: 'file', name: p.slice(DIRECTORY.length) })) };
      },
      async deleteFile(/** @type {{path:string,directory:string}} */ options) {
        assert.equal(options.directory, 'DATA');
        if (!disk.delete(options.path)) throw absent();
      },
    },
  };
  return { manifest, dependencies, disk, settings, remote, downloads, en, es, fr, shared };
}

test('native pack hashing uses the vetted bundle for binary data without WebCrypto', () => {
  const data = Uint8Array.from({ length: 1025 }, (_, i) => i % 256);
  assert.equal(Buffer.from(sha256(data)).toString('hex'), hash(data));
});

test('starter works without download; missing and optional language rows ask for their pack', async () => {
  const f = fixture();
  const manager = await createLanguagePacks(f.manifest, f.dependencies);
  assert.equal((await manager.status()).en.state, 'bundled');
  assert.equal(await manager.readBytes(f.en.path), null);
  assert.equal(await manager.readBytes('data/registry/languages.csv'), null);
  for (const path of [f.es.path, 'data/lang/es/variants.csv']) {
    await assert.rejects(manager.readBytes(path), { code: 'NATIVE_PACK_REQUIRED', language: 'es' });
  }
  await assert.rejects(manager.remove('en'), /Starter languages/);
  assert.equal(f.downloads.length, 0);
});

test('verified complete packs survive relaunch offline and retain shared fonts on deletion', async () => {
  const f = fixture();
  f.disk.set('unrelated-file', btoa('keep'));
  f.disk.set(DIRECTORY + 'unknown-file', btoa('keep'));
  const manager = await createLanguagePacks(f.manifest, f.dependencies);
  assert.equal(await manager.downloadBytes(['en', 'es', 'fr']), f.es.bytes + f.fr.bytes + f.shared.bytes);
  /** @type {number[]} */ const progress = [];
  await manager.install('es', (p) => progress.push(p.done));
  assert.equal(await manager.downloadBytes(['es', 'fr']), f.fr.bytes);
  await manager.install('fr');
  assert.deepEqual(progress, [1, 2]);
  assert.equal(f.downloads.filter((url) => url.endsWith(f.shared.path)).length, 1);
  f.dependencies.download = async () => { throw new Error('offline'); };
  const restarted = await createLanguagePacks(f.manifest, f.dependencies);
  const stat = f.dependencies.filesystem.stat;
  let sharedStats = 0;
  f.dependencies.filesystem.stat = async (options) => {
    if (options.path === DIRECTORY + f.shared.sha256) sharedStats += 1;
    return stat(options);
  };
  assert.equal((await restarted.status()).es.state, 'installed');
  assert.equal(sharedStats, 1, 'shared blob is checked once per status call');
  f.disk.delete(DIRECTORY + f.shared.sha256);
  const missingShared = await restarted.status();
  assert.equal(sharedStats, 2, 'later status calls recheck the filesystem');
  assert.equal(missingShared.es.state, 'update');
  assert.equal(missingShared.fr.state, 'update');
  f.disk.set(DIRECTORY + f.shared.sha256, btoa('shared font'));
  assert.deepEqual(await restarted.readBytes(f.es.path), bytes('Spanish'));
  assert.equal(await restarted.readBytes('data/lang/es/variants.csv'), null);
  await restarted.remove('es');
  assert.equal(f.disk.has(DIRECTORY + f.shared.sha256), true);
  assert.deepEqual(await restarted.readBytes(f.fr.path), bytes('French'));
  await restarted.remove('fr');
  assert.deepEqual([...f.disk.keys()].sort(), ['unrelated-file', DIRECTORY + 'unknown-file'].sort());
  assert.equal(f.settings.get('plg.cards'), 'keep cards');
  assert.equal(f.settings.get('plg.speaker'), 'keep profile');
});

test('cancelling a download leaves no partial pack or uncommitted blobs', async () => {
  const f = fixture();
  const controller = new AbortController();
  const download = f.dependencies.download;
  f.dependencies.download = async (url) => {
    const data = await download(url);
    if (url.endsWith(f.shared.path)) controller.abort();
    return data;
  };
  const manager = await createLanguagePacks(f.manifest, f.dependencies);
  await assert.rejects(manager.install('es', undefined, controller.signal), { name: 'AbortError' });
  assert.equal((await manager.status()).es.state, 'missing');
  assert.equal(f.disk.size, 0);
});

test('download mismatch and persistence failures never commit a partial pack', async () => {
  for (const fail of ['hash', 'network', 'write', 'readback', 'commit']) {
    const f = fixture();
    if (fail === 'hash') f.remote.set(ROOT + f.shared.path, bytes('bad data'));
    if (fail === 'network') f.remote.delete(ROOT + f.shared.path);
    if (fail === 'write') f.dependencies.filesystem.writeFile = async (options) => {
      f.disk.set(options.path, options.data);
      throw new Error('disk full');
    };
    if (fail === 'readback') f.dependencies.filesystem.writeFile = async (options) => {
      f.disk.set(options.path, btoa('corrupt persisted bytes'));
    };
    if (fail === 'commit') f.dependencies.preferences.set = async () => { throw new Error('preferences refused'); };
    const manager = await createLanguagePacks(f.manifest, f.dependencies);
    await assert.rejects(manager.install('es'));
    assert.equal((await manager.status()).es.state, 'missing', fail);
    assert.equal(f.disk.size, 0, fail);
  }
});

test('missing or corrupt installed files demand repair, which restores their verified bytes', async () => {
  const f = fixture();
  const manager = await createLanguagePacks(f.manifest, f.dependencies);
  await manager.install('es');
  f.disk.set(DIRECTORY + f.es.sha256, btoa('corrupt'));
  await assert.rejects(manager.readBytes(f.es.path), { code: 'NATIVE_PACK_REQUIRED', language: 'es' });
  await manager.install('es');
  assert.deepEqual(await manager.readBytes(f.es.path), bytes('Spanish'));
  f.disk.delete(DIRECTORY + f.es.sha256);
  assert.equal((await manager.status()).es.state, 'update');
  await assert.rejects(manager.readBytes(f.es.path), { code: 'NATIVE_PACK_REQUIRED', language: 'es' });
});

test('a new app inventory requires changed packs to update rather than mixing versions', async () => {
  const f = fixture();
  const manager = await createLanguagePacks(f.manifest, f.dependencies);
  await manager.install('es');
  const manifest = structuredClone(f.manifest);
  manifest.version = hash(bytes('version2'));
  manifest.languages.es.files[0] = { ...f.es, bytes: 11, sha256: hash(bytes('new Spanish')) };
  f.remote.set(ROOT + f.es.path, bytes('new Spanish'));
  const updated = await createLanguagePacks(manifest, f.dependencies);
  assert.equal((await updated.status()).es.state, 'update');
  await assert.rejects(updated.readBytes(f.es.path), { code: 'NATIVE_PACK_REQUIRED', language: 'es' });
  await updated.install('es');
  assert.deepEqual(await updated.readBytes(f.es.path), bytes('new Spanish'));
  assert.equal(f.disk.has(DIRECTORY + f.es.sha256), false);
});

test('serialized installs deduplicate downloads and failed deletion remains retryable', async () => {
  const f = fixture();
  const manager = await createLanguagePacks(f.manifest, f.dependencies);
  await Promise.all([manager.install('es'), manager.install('es'), manager.install('fr')]);
  assert.equal(f.downloads.length, 3);
  const remove = f.dependencies.filesystem.deleteFile;
  f.dependencies.filesystem.deleteFile = async () => { throw new Error('delete refused'); };
  await assert.rejects(manager.remove('es'), /delete refused/);
  assert.equal((await manager.status()).es.state, 'installed');
  f.dependencies.filesystem.deleteFile = remove;
  await manager.remove('es');
  assert.equal((await manager.status()).es.state, 'missing');
  assert.equal((await manager.status()).fr.state, 'installed');
});

test('untrusted origins, paths and malformed persistent records are refused', async () => {
  const f = fixture();
  await assert.rejects(createLanguagePacks({ ...f.manifest, baseUrl: 'https://untrusted.test/' }, f.dependencies), /inventory/);
  const bad = structuredClone(f.manifest);
  bad.languages.es.files[0].path = '../settings';
  await assert.rejects(createLanguagePacks(bad, f.dependencies), /Invalid native language file/);
  f.settings.set('wanderwart.language-packs.v1', JSON.stringify({ schemaVersion: 1, languages: { es: { version: f.manifest.version, hashes: ['../outside'] } } }));
  await assert.rejects(createLanguagePacks(f.manifest, f.dependencies), /Invalid installed language record/);
});

test('native adapter uses binary native HTTP, refuses redirects, and pins every request', async (t) => {
  const f = fixture();
  const global = /** @type {any} */ (globalThis);
  const before = global.Capacitor;
  const beforeFetch = global.fetch;
  t.after(() => { global.Capacitor = before; global.fetch = beforeFetch; });
  let redirected = true;
  global.fetch = async (/** @type {string} */ path) => {
    assert.equal(path, 'data/native-packs.json');
    return new Response(JSON.stringify(f.manifest));
  };
  global.Capacitor = { isNativePlatform: () => true, Plugins: {
    Filesystem: f.dependencies.filesystem, Preferences: f.dependencies.preferences,
    CapacitorHttp: { request: async (/** @type {any} */ options) => {
      assert.equal(options.responseType, 'arraybuffer');
      assert.equal(options.disableRedirects, true);
      assert.ok(options.url.startsWith(ROOT));
      return { status: 200, url: redirected ? 'https://elsewhere.test/' : options.url,
        data: Buffer.from(/** @type {Uint8Array} */ (f.remote.get(options.url))).toString('base64') };
    } },
  } };
  const manager = await nativeLanguagePacks();
  assert.ok(manager);
  await assert.rejects(manager.install('es'), /download refused/);
  redirected = false;
  await manager.install('es');
  assert.deepEqual(await manager.readBytes(f.es.path), bytes('Spanish'));
});
