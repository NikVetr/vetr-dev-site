// Native checks on the Android emulator. Run after `npm run android`:
//
//   npm run check:android             # AVD "phraselet" by default
//
// Drives the app over adb and the WebView's devtools socket: persistence across a
// relaunch and an in-place reinstall, a cold start with the radios off, and a backup
// through the share sheet, cancelled. The devtools socket exists because
// `scripts/build_android.sh` enables it in the generated (debug) project only.
// Everything here is emulator evidence, not a phone's.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const SDK = process.env.ANDROID_HOME ?? `${process.env.HOME}/android-tools/sdk`;
const ADB = `${SDK}/platform-tools/adb`;
const AVD = process.env.AVD ?? 'phraselet';
const APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const APP = 'dev.vetr.pocketlanguageguide';
const OUT = 'tmp/android';
mkdirSync(OUT, { recursive: true });
const adb = (/** @type {string[]} */ ...a) => execFileSync(ADB, a, { encoding: 'utf8', timeout: 120_000 }).trim();
const sleep = (/** @type {number} */ ms) => new Promise((r) => { setTimeout(r, ms); });
/** @type {Record<string, {ok:boolean, detail:string}>} */ const results = {};
const check = (/** @type {string} */ name, /** @type {boolean} */ ok, /** @type {unknown} */ detail) => {
  results[name] = { ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${results[name].detail}`);
};
const focus = () => adb('shell', 'dumpsys', 'window', 'displays').split('\n')
  .filter((l) => /mCurrentFocus/.test(l)).join(' ').trim();

// --- the device ---------------------------------------------------------------
let booted = false;
try { booted = adb('shell', 'getprop', 'sys.boot_completed') === '1'; } catch { /* no device yet */ }
if (!booted) {
  // `sg kvm`: the emulator is unusable without acceleration, and a shell that
  // predates the kvm group membership does not have it.
  spawn('sg', ['kvm', '-c', `${SDK}/emulator/emulator -avd ${AVD} -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect`],
    { stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 60 && !booted; i += 1) {
    await sleep(3000);
    try { booted = adb('shell', 'getprop', 'sys.boot_completed') === '1'; } catch { /* booting */ }
  }
  if (!booted) throw new Error(`emulator ${AVD} did not boot`);
  await sleep(8000);
}
const install = () => adb('install', '-r', APK);
const stop = () => adb('shell', 'am', 'force-stop', APP);
// HOME first: it runs the activity's stop, which flushes SharedPreferences. A
// force-stop straight after a write is not an exit anyone performs, and it can lose
// an `apply()` still in flight.
const leave = async () => { adb('shell', 'input', 'keyevent', '3'); await sleep(2000); stop(); };

/** A connection to the WebView page over the devtools protocol. */
async function page() {
  /** @type {any} */ let target = null;
  // The socket and its page arrive a little after the activity does, and later still
  // after a reinstall, so both are waited for rather than assumed.
  // The socket is named for the process that owns it, and a process that has died
  // can leave its socket behind -- one that accepts a connection and never answers.
  // So the socket asked for is the one belonging to the app's process now.
  for (let i = 0; i < 30 && !target; i += 1) {
    let pid = '';
    try { pid = adb('shell', 'pidof', APP); } catch { /* not running yet */ }
    if (pid && adb('shell', 'cat', '/proc/net/unix').includes(`webview_devtools_remote_${pid}`)) {
      adb('forward', '--remove-all');
      adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
      try {
        const list = await (await fetch('http://127.0.0.1:9222/json', { signal: AbortSignal.timeout(3000) })).json();
        target = list.find((/** @type {any} */ t) => t.type === 'page') ?? null;
      } catch { /* not listening yet */ }
    }
    if (!target) await sleep(1000);
  }
  if (!target) throw new Error('no WebView page to attach to');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0;
  /** @type {Map<number,(r:any)=>void>} */ const pending = new Map();
  ws.onmessage = (msg) => {
    const d = JSON.parse(String(msg.data));
    if (d.id && pending.has(d.id)) { pending.get(d.id)?.(d); pending.delete(d.id); }
  };
  const send = (/** @type {string} */ method, params = {}) => new Promise((resolve) => {
    id += 1; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  /** @param {string} expression */
  const evaluate = async (expression) => {
    const r = /** @type {any} */ (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }));
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluation failed');
    return r.result?.result?.value;
  };
  /** @param {string} path @param {string} selector */
  const open = async (path, selector) => {
    await send('Page.navigate', { url: `https://localhost/${path}` });
    for (let i = 0; i < 40; i += 1) {
      await sleep(1000);
      if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
    }
    throw new Error(`${selector} never appeared on ${path}`);
  };
  return { evaluate, open, close: () => ws.close() };
}
async function launch() {
  adb('shell', 'am', 'start', '-W', '-n', `${APP}/.MainActivity`);
  await sleep(6000);
  return page();
}

const BOARDS = JSON.stringify({
  schemaVersion: 1,
  phrases: { p1: { id: 'p1', label: 'no peanuts', owner: 'No peanuts', listener: '不要花生', pair: 'zh-Hans__en', created: '2026-09-25T00:00:00.000Z' } },
  placements: { 'spa/main': ['p1'] },
});
const SPA = 'conversation.html?target=zh-Hans&source=en&board=spa';

install();
stop();
let p = await launch();
const plugins = await p.evaluate('Object.keys(Capacitor.Plugins).sort().join(",")');
check('launch', /Filesystem/.test(plugins) && /Preferences/.test(plugins) && /Share/.test(plugins), plugins);

// --- persistence ------------------------------------------------------------------
await p.open(SPA, '.board-cell');
await p.evaluate(`Capacitor.Plugins.Preferences.set({ key: 'plg.boards', value: ${JSON.stringify(BOARDS)} })`);
p.close();
await leave();
p = await launch();
await p.open(SPA, '.board-cell');
check('persist-relaunch', await p.evaluate(`!!document.querySelector('[data-button="p1"]')`), 'written through Preferences, then HOME, force-stop, relaunch');

// --- offline start-up ---------------------------------------------------------------
adb('shell', 'svc', 'wifi', 'disable');
adb('shell', 'svc', 'data', 'disable');
p.close();
await leave();
try {
  p = await launch();
  for (let i = 0; i < 30 && !(await p.evaluate("document.querySelectorAll('.card').length")); i += 1) await sleep(1000);
  const cards = await p.evaluate("document.querySelectorAll('.card').length");
  await p.open(SPA, '.board-cell');
  const phrase = await p.evaluate(`!!document.querySelector('[data-button="p1"]')`);
  check('offline-start', cards > 50 && phrase, { cards, phrase });
  execFileSync('bash', ['-c', `${ADB} exec-out screencap -p > ${OUT}/offline-board.png`]);
} finally {
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
}

// --- a backup through the share sheet, cancelled --------------------------------------
await p.evaluate(`(() => { window.__blobs = 0; const c = URL.createObjectURL;
  URL.createObjectURL = (b) => { window.__blobs += 1; return c.call(URL, b); }; })()`);
await p.evaluate("document.getElementById('board-menu').click()");
await sleep(1200);
await p.evaluate("[...document.querySelectorAll('dialog button')].find((b) => /save a copy/i.test(b.textContent)).click()");
await sleep(4000);
const sheet = focus();
execFileSync('bash', ['-c', `${ADB} exec-out screencap -p > ${OUT}/share-sheet.png`]);
check('share-sheet-opens', /intentresolver|Chooser/i.test(sheet), sheet.slice(0, 120));
adb('shell', 'input', 'keyevent', '4');
await sleep(2000);
check('share-cancel', focus().includes(APP) && await p.evaluate('window.__blobs') === 0,
  'BACK returned to the app, and no browser download fell back behind it');

// --- an in-place update -------------------------------------------------------------
p.close();
await leave();
install();
p = await launch();
await p.open(SPA, '.board-cell');
check('persist-reinstall', await p.evaluate(`!!document.querySelector('[data-button="p1"]')`), 'the same after adb install -r');
p.close();

writeFileSync(`${OUT}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
const failed = Object.entries(results).filter(([, r]) => !r.ok).map(([n]) => n);
console.log(failed.length ? `\n${failed.length} failed: ${failed.join(', ')}` : '\nall checks passed');
process.exit(failed.length ? 1 : 0);
