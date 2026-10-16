import test from 'node:test';
import assert from 'node:assert/strict';
import { deliver, exportCacheSize, clearExportCache } from '../ui/platform/shell.js';

const directory = 'wanderwart-exports';
const oldName = '11111111-1111-4111-8111-111111111111--card.png';
const missing = () => Object.assign(new Error('missing'), { code: 'OS-PLUG-FILE-0008' });

function deferred() {
  /** @type {(value?:void)=>void} */ let resolve = () => {};
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

/** @param {import('node:test').TestContext} t */
function native(t) {
  const global = /** @type {any} */ (globalThis);
  const before = global.Capacitor;
  t.after(() => { global.Capacitor = before; });
  /** @type {Map<string, {type:string, size:number}>} */ const files = new Map();
  /** @type {string[]} */ const removed = [];
  const fs = {
    async writeFile(/** @type {{path:string, directory:string, data:string}} */ options) {
      assert.equal(options.directory, 'CACHE');
      files.set(options.path, { type: 'file', size: atob(options.data).length });
      return { uri: `file:///cache/${options.path}` };
    },
    async readdir(/** @type {{path:string, directory:string}} */ options) {
      assert.equal(options.path, directory);
      assert.equal(options.directory, 'CACHE');
      return { files: [...files].filter(([path]) => path.startsWith(`${directory}/`))
        .map(([path, info]) => ({ ...info, name: path.slice(directory.length + 1) })) };
    },
    async deleteFile(/** @type {{path:string, directory:string}} */ options) {
      assert.equal(options.directory, 'CACHE');
      if (!files.delete(options.path)) throw missing();
      removed.push(options.path);
    },
  };
  const share = { async share(/** @type {{url:string, title:string}} */ _options) {} };
  global.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: fs, Share: share } };
  return { files, removed, fs, share };
}

test('native exports use unique owned cache paths and cleanup leaves unrelated files alone', async (t) => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  t.after(() => Object.defineProperty(globalThis, 'crypto', /** @type {PropertyDescriptor} */ (cryptoDescriptor)));
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: crypto.getRandomValues.bind(crypto) },
  });
  const { files, removed } = native(t);
  files.set('legacy.png', { type: 'file', size: 123 });
  files.set(`${directory}/unrelated.txt`, { type: 'file', size: 456 });
  files.set(`${directory}/${oldName}`, { type: 'directory', size: 789 });
  assert.equal(await deliver(new Blob(['abc']), '../card.png'), true);
  assert.equal(await deliver(new Blob(['de']), '../card.png'), true);
  const exports = [...files.keys()].filter((path) => path.endsWith('--.._card.png'));
  assert.equal(exports.length, 2);
  assert.ok(exports.every((path) => path.split('/').length === 2));
  assert.equal(await exportCacheSize(), 5);
  await clearExportCache();
  assert.deepEqual(removed.sort(), exports.sort());
  assert.equal(files.size, 3);
  assert.equal(await exportCacheSize(), 0);
});

test('cleanup keeps files while the native share sheet is using them', async (t) => {
  const { files, share, removed } = native(t);
  files.set(`${directory}/${oldName}`, { type: 'file', size: 8 });
  const opened = deferred();
  const finish = deferred();
  share.share = async () => { opened.resolve(undefined); await finish.promise; };
  const delivery = deliver(new Blob(['active']), 'card.png');
  await opened.promise;
  assert.equal(await exportCacheSize(), 14);
  await clearExportCache();
  assert.deepEqual(removed, [`${directory}/${oldName}`]);
  assert.equal(await exportCacheSize(), 6);
  finish.resolve(undefined);
  assert.equal(await delivery, true);
  await clearExportCache();
  assert.equal(await exportCacheSize(), 0);
});

test('missing export cache is empty, while native permission and deletion failures surface', async (t) => {
  const { fs, files } = native(t);
  const read = fs.readdir;
  fs.readdir = async () => { throw missing(); };
  assert.equal(await exportCacheSize(), 0);
  await clearExportCache();
  fs.readdir = async () => { throw Object.assign(new Error('Permission denied'), { code: 'OS-PLUG-FILE-0007' }); };
  await assert.rejects(exportCacheSize(), /Permission denied/);
  await assert.rejects(clearExportCache(), /Permission denied/);
  fs.readdir = read;
  files.set(`${directory}/${oldName}`, { type: 'file', size: 8 });
  fs.deleteFile = async () => { throw new Error('Cannot delete'); };
  await assert.rejects(clearExportCache(), /Cannot delete/);
  assert.equal(files.size, 1);
});

test('cleanup does not remove an export created after its snapshot', async (t) => {
  const { fs, files } = native(t);
  files.set(`${directory}/${oldName}`, { type: 'file', size: 8 });
  const read = fs.readdir;
  const snapshot = deferred();
  const resume = deferred();
  fs.readdir = async (options) => {
    const found = await read(options);
    snapshot.resolve(undefined);
    await resume.promise;
    return found;
  };
  const clearing = clearExportCache();
  await snapshot.promise;
  await deliver(new Blob(['new']), 'new.png');
  resume.resolve(undefined);
  await clearing;
  fs.readdir = read;
  assert.equal(await exportCacheSize(), 3);
});

test('a cancelled share releases its temporary copy for later cleanup', async (t) => {
  const { share } = native(t);
  share.share = async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); };
  assert.equal(await deliver(new Blob(['cancelled']), 'card.png'), true);
  await clearExportCache();
  assert.equal(await exportCacheSize(), 0);
});
