// Native checks on the Android emulator. Run after `npm run android`:
//
//   npm run check:android             # AVD "phraselet" by default
//
// Drives the app over adb and the WebView's devtools socket: persistence across a
// relaunch and an in-place reinstall, a cold start with the radios off that goes back
// to where the last session was, Back going up from there and out from the top, and a
// backup through the share sheet, cancelled. The devtools socket exists because
// `scripts/build_android.sh` enables it in the generated (debug) project only.
// Everything here is emulator evidence, not a phone's.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';

const SDK = process.env.ANDROID_HOME ?? `${process.env.HOME}/android-tools/sdk`;
const ADB = `${SDK}/platform-tools/adb`;
const AVD = process.env.AVD ?? 'phraselet';
const APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const APP = 'dev.vetr.pocketlanguageguide';
const OUT = 'tmp/out/android';
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
  spawn('sg', ['kvm', '-c', `${SDK}/emulator/emulator -avd ${AVD} -cores 4 -memory 1536 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect`],
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
      adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
      try {
        // Keep the adb endpoint local even when Node's fetch uses a host proxy.
        const list = /** @type {any[]} */ (await new Promise((resolve, reject) => {
          const request = get('http://127.0.0.1:9222/json', { agent: false }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
              try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
            response.on('error', reject);
          });
          request.setTimeout(3000, () => request.destroy(new Error('devtools discovery timed out')));
          request.on('error', reject);
        }));
        target = list.find((/** @type {any} */ t) => t.type === 'page') ?? null;
      } catch { /* not listening yet */ }
    }
    if (!target) await sleep(1000);
  }
  if (!target) throw new Error('no WebView page to attach to');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Cannot connect to local WebView devtools; exclude localhost from HTTP proxy settings.'));
  });
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
  const connected = await page();
  // The download chooser belongs to first-launch onboarding, not the persistence
  // checks below. Choose on-demand downloads and leave its preference durable.
  await connected.evaluate(`(() => {
    const dialog = document.querySelector('dialog.native-language-setup');
    if (dialog) dialog.querySelector('button.ghost')?.click();
  })()`);
  return connected;
}

const BOARDS = JSON.stringify({
  schemaVersion: 1,
  phrases: { p1: { id: 'p1', label: 'no peanuts', owner: 'No peanuts', listener: '不要花生', pair: 'zh-Hans__en', created: '2026-09-25T00:00:00.000Z' } },
  placements: { 'spa/main': ['p1'] },
});
const SPA = 'conversation.html?target=zh-Hans&source=en&board=spa';

/** A restored board can reach first-launch onboarding only after Back to gallery. */
async function galleryCards() {
  for (let i = 0; i < 30; i += 1) {
    const count = await p.evaluate(`(() => {
      document.querySelector('dialog.native-language-setup button.ghost')?.click();
      return document.querySelectorAll('.card').length;
    })()`);
    if (count) return count;
    await sleep(1000);
  }
  const diagnostic = await p.evaluate('document.body.innerText.slice(0,1500)');
  console.log('Gallery did not populate:', diagnostic);
  return 0;
}

install();
stop();
let p = await launch();
const plugins = await p.evaluate('Object.keys(Capacitor.Plugins).sort().join(",")');
check('launch', /Filesystem/.test(plugins) && /Preferences/.test(plugins) && /Share/.test(plugins)
  && /BackgroundRecitation/.test(plugins), plugins);

// --- native playback, independent of WebView timers while HOME is showing --------
const voices = await p.evaluate("Capacitor.Plugins.BackgroundRecitation.getVoices({ locale: 'en' })");
if (voices.voices.length) {
  const started = await p.evaluate(`Capacitor.Plugins.BackgroundRecitation.start({ repeat: false, steps: [
    { id: 'first', audio: [{ text: 'Hello.', locale: 'en', rate: 1 }], delayMs: 1000 },
    { id: 'second', audio: [{ text: 'This phrase is played by the native background service.', locale: 'en', rate: 1 }], delayMs: 15000 }
  ] })`);
  adb('shell', 'input', 'keyevent', '3');
  await sleep(6000);
  const services = adb('shell', 'dumpsys', 'activity', 'services', APP);
  const background = await p.evaluate('Capacitor.Plugins.BackgroundRecitation.getState()');
  const paused = await p.evaluate('Capacitor.Plugins.BackgroundRecitation.pause()');
  const resumed = await p.evaluate('Capacitor.Plugins.BackgroundRecitation.resume()');
  const stopped = await p.evaluate('Capacitor.Plugins.BackgroundRecitation.stop()');
  check('native-background-playback', started.status === 'playing' && background.status === 'playing'
    && background.index === 1 && /RecitationService/.test(services) && /isForeground=true/.test(services)
    && paused.status === 'paused' && resumed.status === 'playing' && stopped.status === 'stopped',
  { started, background, paused, resumed, stopped, foregroundService: /isForeground=true/.test(services) });
  p.close();
  p = await launch();
} else {
  const refused = await p.evaluate(`Capacitor.Plugins.BackgroundRecitation.start({ repeat: false,
    steps: [{ id: 'no-voice', audio: [{ text: 'Hello.', locale: 'en' }], delayMs: 1000 }] })
    .then(() => false, (error) => /local.*voice|voice.*unavailable/i.test(error.message))`);
  check('native-playback-no-voice', refused, 'No local English voice installed; playback explicitly refused. Background audio needs device/voice validation.');
}

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
  // The last screen was a board, so the launch goes back to that pair's contexts --
  // and Back goes up to the languages rather than doing nothing, which is what
  // Capacitor alone does on a screen whose history Chromium will not go back through.
  for (let i = 0; i < 30 && !(await p.evaluate("document.querySelectorAll('.board-grid-topics .board-cell').length")); i += 1) await sleep(1000);
  const resumed = await p.evaluate('location.pathname + location.search');
  check('resume-launch', resumed === '/conversation.html?target=zh-Hans&source=en', resumed);
  adb('shell', 'input', 'keyevent', '4');
  const cards = await galleryCards();
  check('resume-back', focus().includes(APP) && /^\/(index\.html)?$/.test(await p.evaluate('location.pathname')),
    'BACK from the restored contexts went to the languages, and stayed');
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
await p.evaluate("document.getElementById('site-menu').click()");
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

// --- disposable export copies, through the real native filesystem ---------------------
const cleanup = await p.evaluate(`(async () => {
  const { exportCacheSize, clearExportCache } = await import('./ui/platform/shell.js');
  const { Filesystem: fs, Preferences: prefs } = Capacitor.Plugins;
  const keys = ['plg.about', 'plg.speaker', 'plg.cards', 'plg.boards', 'plg.board-display'];
  const personal = () => Promise.all(keys.map(async (key) => [key, (await prefs.get({ key })).value]));
  const beforePersonal = JSON.stringify(await personal());
  const name = crypto.randomUUID() + '--native-cleanup-check.txt';
  const path = 'wanderwart-exports/' + name;
  const text = 'native temporary export cleanup check';
  await fs.writeFile({ path, data: btoa(text), directory: 'CACHE', recursive: true });
  const before = await exportCacheSize();
  await clearExportCache();
  const after = await exportCacheSize();
  const { files } = await fs.readdir({ path: 'wanderwart-exports', directory: 'CACHE' });
  return { before, after, fixtureBytes: text.length,
    fixtureGone: !files.some((file) => file.name === name),
    personalUnchanged: beforePersonal === JSON.stringify(await personal()) };
})()`);
check('temporary-export-cleanup', cleanup.fixtureGone && cleanup.personalUnchanged
  && cleanup.before >= cleanup.fixtureBytes && cleanup.after <= cleanup.before - cleanup.fixtureBytes, cleanup);

// --- pack persistence/deletion with real plugins; transport is a tiny local fixture ---
const packs = await p.evaluate(`(async () => {
  const { createLanguagePacks } = await import('./ui/platform/language-packs.js');
  const { sha256 } = await import('./vendor/sha256.esm.js');
  const { Filesystem: fs, Preferences: prefs } = Capacitor.Plugins;
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const root = 'native-pack-check-' + id;
  const key = root + '.metadata';
  const keys = ['plg.about', 'plg.speaker', 'plg.cards', 'plg.boards', 'plg.board-display', 'wanderwart.language-packs.v1'];
  const personal = async () => JSON.stringify(await Promise.all(keys.map(async (key) => [key, (await prefs.get({ key })).value])));
  const before = await personal();
  const hash = (bytes) => Array.from(sha256(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  const data = new Map([
    ['data/lang/fr/core.csv', new TextEncoder().encode('id,text\\nhello,bonjour\\n')],
    ['data/lang/de/core.csv', new TextEncoder().encode('id,text\\nhello,hallo\\n')],
    ['data/fonts/native-check.woff2', new Uint8Array([0, 128, 255, 42])],
  ]);
  const files = [...data].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) }));
  const manifest = { schemaVersion: 1, version: hash(new Uint8Array([1])),
    baseUrl: 'https://raw.githubusercontent.com/NikVetr/vetr-dev-site/' + '1'.repeat(40) + '/pocket-language-guide/',
    starter: ['en'], bundled: [], languages: {
      en: { files: [], fonts: [] }, fr: { files: [files[0]], fonts: [files[2]] }, de: { files: [files[1]], fonts: [files[2]] },
    } };
  // Only path/key rewriting is substituted: every storage operation reaches the plugin.
  const filesystem = Object.fromEntries(['readFile', 'writeFile', 'stat', 'readdir', 'deleteFile'].map((method) =>
    [method, (options) => fs[method]({ ...options, path: root + '/' + options.path })]));
  const preferences = { get: () => prefs.get({ key }), set: ({ value }) => prefs.set({ key, value }) };
  let downloads = 0;
  const download = async (url) => {
    downloads += 1;
    const bytes = data.get(url.slice(manifest.baseUrl.length));
    if (!bytes) throw new Error('Unexpected native fixture download: ' + url);
    return bytes;
  };
  try {
    let manager = await createLanguagePacks(manifest, { filesystem, preferences, hash, download });
    await manager.install('fr');
    await manager.install('de');
    manager = await createLanguagePacks(manifest, { filesystem, preferences, hash,
      download: async () => { throw new Error('Offline fixture cannot download'); } });
    const status = await manager.status();
    const persisted = status.fr.state === 'installed' && status.de.state === 'installed'
      && hash(await manager.readBytes(files[0].path)) === files[0].sha256;
    await manager.remove('fr');
    const remaining = (await filesystem.readdir({ path: 'wanderwart-language-packs', directory: 'DATA' })).files;
    const sharedRetained = remaining.length === 2 && remaining.some((file) => file.name === files[2].sha256)
      && hash(await manager.readBytes(files[2].path)) === files[2].sha256;
    let removedUnavailable = false;
    try { await manager.readBytes(files[0].path); }
    catch (error) { removedUnavailable = error.code === 'NATIVE_PACK_REQUIRED' && error.language === 'fr'; }
    await manager.remove('de');
    const empty = (await filesystem.readdir({ path: 'wanderwart-language-packs', directory: 'DATA' })).files.length === 0;
    return { persisted, sharedRetained, removedUnavailable, empty, downloads, personalUnchanged: before === await personal() };
  } finally {
    try { await fs.rmdir({ path: root, directory: 'DATA', recursive: true }); }
    catch (error) { if (error.code !== 'OS-PLUG-FILE-0008') throw error; }
    finally { await prefs.remove({ key }); }
  }
})()`);
check('native-pack-storage-lifecycle', packs.persisted && packs.sharedRetained && packs.removedUnavailable
  && packs.empty && packs.downloads === 3 && packs.personalUnchanged, packs);

// --- an in-place update -------------------------------------------------------------
p.close();
await leave();
install();
p = await launch();
await p.open(SPA, '.board-cell');
check('persist-reinstall', await p.evaluate(`!!document.querySelector('[data-button="p1"]')`), 'the same after adb install -r');

// --- Back at the top leaves the app ---------------------------------------------------
await p.evaluate("Capacitor.Plugins.Preferences.set({ key: 'plg.place', value: 'null' }).then(() => 0)");
p.close();
await leave();
p = await launch();
await galleryCards();
adb('shell', 'input', 'keyevent', '4');
await sleep(2500);
check('back-at-top-leaves', !focus().includes(APP), focus().slice(0, 120));
p.close();

writeFileSync(`${OUT}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
const failed = Object.entries(results).filter(([, r]) => !r.ok).map(([n]) => n);
console.log(failed.length ? `\n${failed.length} failed: ${failed.join(', ')}` : '\nall checks passed');
process.exit(failed.length ? 1 : 0);
