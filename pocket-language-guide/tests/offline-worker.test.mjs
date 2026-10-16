import test from 'node:test';
import assert from 'node:assert/strict';
import { askWorker } from '../ui/offline-worker.js';
import { languageFilesToForget } from '../ui/travel-check.js';

test('simultaneous worker requests receive only their own reply', async () => {
  const worker = /** @type {any} */ ({ ready: Promise.resolve({ active: {
    postMessage: (/** @type {any} */ message, /** @type {MessagePort[]} */ [port]) => {
      port.postMessage({ type: 'done', ok: message.ok });
    },
  } }) });
  const results = await Promise.all([true, false].map((ok) => askWorker({ ok }, 'done', { worker })));
  assert.deepEqual(results.map((r) => r.ok), [true, false]);
});

test('the timeout covers registration and prevents a late write', async () => {
  /** @type {(v:any) => void} */ let registered = () => {};
  let posted = false;
  const worker = /** @type {any} */ ({ ready: new Promise((resolve) => { registered = resolve; }) });
  await assert.rejects(askWorker({}, 'done', { worker, timeout: 10 }), /did not answer/);
  registered({ active: { postMessage: () => { posted = true; } } });
  await Promise.resolve();
  assert.equal(posted, false);
});

test('deleting Hindi retains shared fonts until the remaining language is deleted', async () => {
  const language = (/** @type {string} */ code) => ({ files: [code], fonts: ['deva.ttf'], bytes: 1, fontBytes: 1 });
  const languages = { hi: language('hi'), mr: language('mr') };
  assert.deepEqual(await languageFilesToForget('hi', languages, async () => true), ['hi']);
  assert.deepEqual(await languageFilesToForget('mr', languages, async () => false), ['mr', 'deva.ttf']);
});
