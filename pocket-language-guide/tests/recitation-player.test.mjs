import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecitationPlayer, createWebRecitation } from '../ui/platform/recitation.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const clip = { text: 'Hello', locale: 'en', voiceId: 'local-en', rate: 0.8 };
/** @param {Partial<import('../ui/platform/recitation.js').RecitationStep>} [change] */
const step = (change = {}) => ({ id: 'one', audio: [{ ...clip }], delayMs: 1000, ...change });

function fixture() {
  let time = 0;
  let serial = 0;
  /** @type {Map<number,{at:number,fn:()=>void}>} */ const timers = new Map();
  /** @type {{audio:import('../ui/platform/recitation.js').RecitationAudio,
   * resolve:(outcome:'completed'|'cancelled')=>void,reject:(error:Error)=>void}[]} */
  const spoken = [];
  /** @type {import('../ui/platform/recitation.js').RecitationState[]} */ const states = [];
  let stops = 0;
  class Visibility extends EventTarget { hidden = false; }
  const doc = new Visibility();
  const player = createWebRecitation({
    speech: {
      speak: (audio) => new Promise((resolve, reject) => spoken.push({ audio, resolve, reject })),
      stop: () => { stops++; },
    },
    onState: (state) => states.push(state),
    now: () => time,
    setTimer: /** @type {typeof setTimeout} */ (/** @type {unknown} */ (
      (/** @type {()=>void} */ fn, /** @type {number} */ ms) => {
        const id = ++serial;
        timers.set(id, { at: time + ms, fn });
        return id;
      })),
    clearTimer: /** @type {typeof clearTimeout} */ (/** @type {unknown} */ (
      (/** @type {number} */ id) => { timers.delete(id); })),
    document: /** @type {Document} */ (/** @type {unknown} */ (doc)),
  });
  return {
    player, spoken, states, timers, doc, stops: () => stops,
    /** @param {number} ms */
    tick(ms) {
      const end = time + ms;
      while (timers.size) {
        const [id, next] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (next.at > end) break;
        time = next.at;
        timers.delete(id);
        next.fn();
      }
      time = end;
    },
    /** @param {number} index */
    async finish(index) { spoken[index].resolve('completed'); await flush(); },
  };
}

test('speaks clips in order and starts the exact delay after the final spoken completion', async () => {
  const f = fixture();
  f.player.start({ steps: [step({ audio: [clip, { text: '你好', locale: 'zh-Hans' }] }),
    step({ id: 'two', delayMs: 0 })], repeat: false });
  assert.deepEqual(f.spoken.map((p) => p.audio), [clip]);
  f.tick(10_000);
  assert.equal(f.timers.size, 0, 'speech duration is not part of the pause');
  await f.finish(0);
  assert.equal(f.spoken[1].audio.locale, 'zh-Hans');
  await f.finish(1);
  f.tick(999);
  assert.equal(f.player.getState().index, 0);
  f.tick(1);
  assert.equal(f.player.getState().index, 1);
  assert.equal(f.spoken.length, 3);
  await f.finish(2);
  assert.equal(f.player.getState().status, 'ended');
  f.player.dispose();
});

test('pause cancels speech and resumes the same clip, ignoring old completion callbacks', async () => {
  const f = fixture();
  f.player.start({ steps: [step()], repeat: false });
  f.player.pause();
  assert.equal(f.player.getState().status, 'paused');
  assert.equal(f.stops(), 2);
  f.player.resume();
  assert.deepEqual(f.spoken[1].audio, clip);
  await f.finish(0);
  assert.equal(f.timers.size, 0);
  await f.finish(1);
  assert.equal(f.timers.size, 1);
  const lateTimer = [...f.timers.values()][0].fn;
  f.player.stop();
  lateTimer();
  assert.deepEqual(f.player.getState(), { status: 'stopped', index: -1 });
  assert.equal(f.spoken.length, 2);
  f.player.dispose();
});

test('a paused delay resumes only its remainder and does not repeat completed audio', async () => {
  const f = fixture();
  f.player.start({ steps: [step()], repeat: false });
  await f.finish(0);
  f.tick(300);
  f.player.pause();
  f.tick(5000);
  assert.equal(f.player.getState().status, 'paused');
  f.player.resume();
  f.tick(699);
  assert.equal(f.player.getState().status, 'playing');
  f.tick(1);
  assert.equal(f.player.getState().status, 'ended');
  assert.equal(f.spoken.length, 1);
  f.player.dispose();
});

test('hidden pages pause, returning does not resume, and disposal removes the visibility listener', () => {
  const f = fixture();
  f.player.start({ steps: [step()], repeat: false });
  f.doc.hidden = true;
  f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.player.getState().status, 'paused');
  f.player.resume();
  assert.equal(f.spoken.length, 1, 'hidden pages cannot restart speech');
  f.doc.hidden = false;
  f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.player.getState().status, 'paused');
  f.player.resume();
  assert.equal(f.spoken.length, 2);
  f.player.dispose();
  const reports = f.states.length;
  f.doc.hidden = true;
  f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.states.length, reports);
  assert.throws(() => f.player.start({ steps: [step()], repeat: false }), /disposed/);
});

test('screen-only steps use their duration, and repeat restarts the ordered timeline', () => {
  const f = fixture();
  f.player.start({ steps: [step({ audio: [], delayMs: 250 }),
    step({ id: 'two', audio: [], delayMs: 500 })], repeat: true });
  assert.equal(f.player.background, false);
  assert.equal(f.player.getState().index, 0);
  f.tick(250);
  assert.equal(f.player.getState().index, 1);
  f.tick(500);
  assert.equal(f.player.getState().index, 0);
  assert.equal(f.spoken.length, 0);
  f.player.dispose();
  assert.equal(f.timers.size, 0);
});

test('replacement sessions own their callbacks and keep a snapshot of the requested audio', async () => {
  const f = fixture();
  f.player.start({ steps: [step()], repeat: false });
  const next = { steps: [step({ id: 'replacement', audio: [{ ...clip, text: 'Replacement' }], delayMs: 0 })], repeat: false };
  f.player.start(next);
  next.steps[0].audio[0].text = 'Changed settings';
  await f.finish(0);
  assert.equal(f.player.getState().id, 'replacement');
  assert.equal(f.player.getState().status, 'playing');
  assert.equal(f.spoken[1].audio.text, 'Replacement');
  await f.finish(1);
  assert.equal(f.player.getState().status, 'ended');
  f.player.dispose();
});

test('speech failures report errors; cancellation pauses rather than advancing silently', async () => {
  const f = fixture();
  f.player.start({ steps: [step()], repeat: false });
  f.spoken[0].reject(new Error('No matching voice'));
  await flush();
  assert.equal(f.player.getState().status, 'error');
  assert.equal(f.player.getState().error, 'No matching voice');
  f.player.start({ steps: [step()], repeat: false });
  f.spoken[1].resolve('cancelled');
  await flush();
  assert.equal(f.player.getState().status, 'paused');
  assert.equal(f.player.getState().index, 0);
  assert.equal(f.timers.size, 0);
  f.player.dispose();
});

test('invalid and infinitely spinning silent timelines fail loudly before starting', () => {
  const f = fixture();
  assert.throws(() => f.player.start({ steps: [], repeat: false }), /no steps/);
  assert.throws(() => f.player.start({ steps: [step({ delayMs: -1 })], repeat: false }), /Invalid/);
  assert.throws(() => f.player.start({ steps: [step({ audio: [], delayMs: 0 })], repeat: true }), /needs a delay/);
  assert.throws(() => f.player.start({ steps: [step({ audio: [{ text: '', locale: 'en' }] })], repeat: false }), /Invalid/);
  assert.equal(f.spoken.length, 0);
  f.player.dispose();
});

test('native background playback delegates the timeline, commands, state and disposal', async (t) => {
  const globals = /** @type {any} */ (globalThis);
  const previous = globals.Capacitor;
  t.after(() => { globals.Capacitor = previous; });
  /** @type {((state:any)=>void)|undefined} */ let notify;
  /** @type {any[]} */ const calls = [];
  let removed = 0;
  /** @type {any[]} */ const states = [];
  const plugin = {
    /** @param {string} event @param {(state:any)=>void} listener */
    async addListener(event, listener) { assert.equal(event, 'state'); notify = listener; return { remove: async () => { removed++; } }; },
    async getState() { calls.push('getState'); return { status: 'stopped', index: -1 }; },
    /** @param {import('../ui/platform/recitation.js').RecitationPlan} plan */
    async start(plan) { calls.push(plan); notify?.({ status: 'preparing', index: 0 }); notify?.({ status: 'playing', index: 0, id: 'one' }); },
    async pause() { calls.push('pause'); return { status: 'paused', index: 0 }; },
    async resume() { calls.push('resume'); return { status: 'playing', index: 0 }; },
    async stop() { calls.push('stop'); return { status: 'stopped', index: -1 }; },
  };
  globals.Capacitor = { isNativePlatform: () => true, Plugins: { BackgroundRecitation: plugin } };
  const player = await createRecitationPlayer((state) => states.push(state), { background: true });
  assert.equal(player.background, true);
  const plan = { steps: [step()], repeat: true };
  await player.start(plan);
  assert.deepEqual(calls[1], plan, 'selected native voice and rate are preserved');
  assert.deepEqual(states.slice(1).map((s) => s.status), ['preparing', 'playing']);
  await player.pause();
  assert.equal(states.at(-1).status, 'paused');
  await player.resume();
  await player.getState();
  await player.stop();
  await player.dispose();
  await player.dispose();
  assert.equal(removed, 1);
  const reports = states.length;
  notify?.({ status: 'playing', index: 0 });
  assert.equal(states.length, reports);
  assert.deepEqual(calls.slice(2), ['pause', 'resume', 'getState', 'stop', 'stop']);
});

test('native requests do not silently fall back to foreground if the plugin is missing', async (t) => {
  const globals = /** @type {any} */ (globalThis);
  const previous = globals.Capacitor;
  t.after(() => { globals.Capacitor = previous; });
  globals.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  await assert.rejects(createRecitationPlayer(() => {}, { background: true }), /unavailable/);
  const foreground = await createRecitationPlayer(() => {}, { background: false });
  assert.equal(foreground.background, false);
  await foreground.dispose();
});

test('native foreground return refreshes the current step, reports sync errors and removes its listener', async (t) => {
  const globals = /** @type {any} */ (globalThis);
  const previous = { capacitor: globals.Capacitor, document: globals.document };
  t.after(() => { globals.Capacitor = previous.capacitor; globals.document = previous.document; });
  class Visibility extends EventTarget { hidden = false; }
  const doc = new Visibility();
  globals.document = doc;
  let reads = 0;
  let removed = 0;
  let fail = false;
  /** @type {any[]} */ const states = [];
  globals.Capacitor = { isNativePlatform: () => true, Plugins: { BackgroundRecitation: {
    async addListener() { return { remove: async () => { removed++; } }; },
    async getState() {
      reads++;
      if (fail) throw new Error('Service disconnected');
      return { status: 'playing', index: reads, id: `step-${reads}` };
    },
    async stop() {},
  } } };
  const player = await createRecitationPlayer((state) => states.push(state), { background: true });
  assert.equal(states.at(-1).index, 1);
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(reads, 1, 'native playback keeps running while the WebView is hidden');
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(states.at(-1).index, 2);
  fail = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(states.at(-1).status, 'error');
  assert.match(states.at(-1).error, /Service disconnected/);
  await player.dispose();
  doc.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(reads, 3);
  assert.equal(removed, 1);
});

test('a delayed native state response cannot overwrite a newer service notification', async (t) => {
  const globals = /** @type {any} */ (globalThis);
  const previous = globals.Capacitor;
  t.after(() => { globals.Capacitor = previous; });
  /** @type {(state:any)=>void} */ let notify = () => {};
  /** @type {(state:any)=>void} */ let answer = () => {};
  let reads = 0;
  globals.Capacitor = { isNativePlatform: () => true, Plugins: { BackgroundRecitation: {
    /** @param {string} _event @param {(state:any)=>void} callback */
    async addListener(_event, callback) { notify = callback; return { remove: async () => {} }; },
    getState() {
      if (++reads === 1) return Promise.resolve({ status: 'stopped', index: -1 });
      return new Promise((resolve) => { answer = resolve; });
    },
    async stop() {},
  } } };
  /** @type {any[]} */ const states = [];
  const player = await createRecitationPlayer((state) => states.push(state), { background: true });
  const pending = player.getState();
  notify({ status: 'playing', index: 2 });
  answer({ status: 'playing', index: 1 });
  const current = await pending;
  assert.equal(current.index, 2);
  assert.equal(states.at(-1).index, 2);
  await player.dispose();
});
