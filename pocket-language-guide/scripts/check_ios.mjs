// Native checks on the iOS simulator. Run on the Mac after `npm run ios -- --run`:
//
//   npm run check:ios                 # SIM="iPhone 17" by default
//
// Three channels, because each can see something the others cannot:
//   - `simctl` boots, launches, terminates, reinstalls and takes screenshots;
//   - `idb` taps, types and swipes. A touch from idb is a user gesture, which the
//     keyboard, speech and the share sheet all require -- a click dispatched from
//     script opens none of them. The WebView's content is not in the simulator's
//     accessibility tree, so a web control is touched at the point the page reports
//     for it: in a full-screen WebView a CSS pixel is a screen point;
//   - WebKit's remote inspector, through `ios_webkit_debug_proxy`, reads what the
//     page reports and records every request it makes.
// Everything here is simulator evidence. A phone is still the only witness for the
// torch, the share sheet's destinations, and how speech actually sounds.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = 'dev.vetr.pocketlanguageguide';
const SIM = process.env.SIM ?? 'iPhone 17';
const BUILT = process.env.APP_PATH ?? 'build/ios/Build/Products/Debug-iphonesimulator/App.app';
const OUT = 'tmp/ios';
mkdirSync(OUT, { recursive: true });
const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.HOME}/Library/Python/3.9/bin:${process.env.PATH}` };
const run = (/** @type {string} */ cmd, /** @type {string[]} */ args) => execFileSync(cmd, args,
  { encoding: 'utf8', timeout: 180_000, env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = (/** @type {number} */ ms) => new Promise((r) => { setTimeout(r, ms); });
/** @type {Record<string, {ok:boolean, detail:string}>} */ const results = {};
const check = (/** @type {string} */ name, /** @type {boolean} */ ok, /** @type {unknown} */ detail) => {
  results[name] = { ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${results[name].detail}`);
};

// --- the device -------------------------------------------------------------
const devices = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])).devices;
const device = Object.values(devices).flat().find((/** @type {any} */ d) => d.name === SIM);
if (!device) throw new Error(`no available simulator named ${SIM}`);
const UDID = device.udid;
try { run('xcrun', ['simctl', 'boot', UDID]); } catch { /* already booted */ }
run('xcrun', ['simctl', 'bootstatus', UDID, '-b']);
const shot = (/** @type {string} */ name) => run('xcrun', ['simctl', 'io', UDID, 'screenshot', `${OUT}/${name}.png`]);
const idb = (/** @type {string[]} */ ...args) => run('idb', [...args, '--udid', UDID]);
const screen = JSON.parse(idb('ui', 'describe-all', '--json'))[0].frame;

// --- the inspector ----------------------------------------------------------
const socket = run('bash', ['-c', 'ls /private/var/tmp/com.apple.launchd.*/com.apple.webinspectord_sim.socket | head -1']);
const proxy = spawn('ios_webkit_debug_proxy', ['-s', `unix:${socket}`, '-F'], { stdio: 'ignore', env });
process.on('exit', () => proxy.kill());

/**
 * A connection to the app's page. WebKit multiplexes its protocol through a Target
 * domain: after `Target.targetCreated` every command is wrapped in
 * `Target.sendMessageToTarget` and every reply and event arrives inside
 * `Target.dispatchMessageFromTarget`. Evaluation takes no `awaitPromise`, so a
 * promise is parked on `window` and polled.
 */
async function page() {
  /** @type {any[]} */ let pages = [];
  for (let i = 0; i < 40 && !pages.length; i += 1) {
    try {
      pages = (await (await fetch('http://127.0.0.1:9222/json')).json())
        .filter((/** @type {any} */ p) => p.url.startsWith('capacitor://localhost'));
    } catch { /* the proxy is still starting */ }
    if (!pages.length) await sleep(500);
  }
  if (!pages.length) throw new Error('no inspectable page in the app');
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let inner = 0;
  let outer = 1_000_000;
  /** @type {string|null} */ let target = null;
  /** @type {Map<number,(r:any)=>void>} */ const pending = new Map();
  /** @type {any[]} */ const events = [];
  const deliver = (/** @type {any} */ d) => {
    if (d.id && pending.has(d.id)) { pending.get(d.id)?.(d); pending.delete(d.id); } else if (d.method) events.push(d);
  };
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    if (d.method === 'Target.targetCreated') target = d.params.targetInfo.targetId;
    else if (d.method === 'Target.didCommitProvisionalTarget') target = d.params.newTargetId;
    else if (d.method === 'Target.dispatchMessageFromTarget') deliver(JSON.parse(d.params.message));
    else deliver(d);
  };
  await sleep(600);
  const send = (/** @type {string} */ method, params = {}) => new Promise((resolve) => {
    inner += 1;
    pending.set(inner, resolve);
    const message = JSON.stringify({ id: inner, method, params });
    ws.send(target
      ? JSON.stringify({ id: (outer += 1), method: 'Target.sendMessageToTarget', params: { targetId: target, message } })
      : message);
  });
  /** @param {string} expression */
  const evaluate = async (expression) => {
    const r = /** @type {any} */ (await send('Runtime.evaluate', { expression, returnByValue: true }));
    if (r.error || r.result?.wasThrown) throw new Error(`${expression.slice(0, 60)}: ${JSON.stringify(r.error ?? r.result?.result)}`);
    return r.result?.result?.value;
  };
  /** @param {string} expression  true once the page is ready */
  const until = async (expression, ms = 30_000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) {
      try { if (await evaluate(`!!(${expression})`)) return; } catch { /* navigating */ }
    }
    shot('failed-wait');
    throw new Error(`never true: ${expression}`);
  };
  /** @param {string} path @param {string} selector */
  const open = async (path, selector) => {
    await evaluate(`location.href = 'capacitor://localhost/${path}'; 0`);
    await sleep(800);
    await until(`document.querySelector(${JSON.stringify(selector)})`);
  };
  /**
   * Touch the element an expression finds, at its centre, through idb.
   * @param {string} find  an expression evaluating to the element
   */
  const touch = async (find) => {
    // Scrolled into view first and measured after it has settled: measured in the
    // same turn, a smooth scroll still under way put the touch where the control was.
    await evaluate(`(() => { (${find})?.scrollIntoView({ block: 'center', behavior: 'instant' }); })(); 0`);
    await sleep(400);
    const r = JSON.parse(await evaluate(`(() => { const e = ${find}; if (!e) return 'null';
      const b = e.getBoundingClientRect();
      return b.width && b.height ? JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 }) : 'null'; })()`));
    if (!r) throw new Error(`nothing visible to touch: ${find}`);
    idb('ui', 'tap', String(Math.round(r.x)), String(Math.round(r.y)));
  };
  /** Record what the Share plugin is asked to do and how each request ends. */
  const watchShare = () => evaluate(`window.__share = []; (() => {
    const s = Capacitor.Plugins.Share; const share = s.share.bind(s);
    s.share = (o) => { window.__share.push('called:' + String(o.url ?? o.text ?? '').split('/').pop());
      return share(o).then((r) => { window.__share.push('resolved'); return r; },
        (e) => { window.__share.push('rejected:' + (e?.message ?? e)); throw e; }); };
    window.__blobs = 0; const c = URL.createObjectURL;
    URL.createObjectURL = (b) => { window.__blobs += 1; return c.call(URL, b); };
  })(); 0`);
  return { send, evaluate, until, open, touch, watchShare, events, close: () => ws.close() };
}

async function launch() {
  try { run('xcrun', ['simctl', 'terminate', UDID, APP]); } catch { /* not running */ }
  run('xcrun', ['simctl', 'launch', UDID, APP]);
  await sleep(3000);
  const p = await page();
  await p.until("document.querySelectorAll('.card, .board-cell').length");
  return p;
}

/**
 * The system share sheet, once it is on screen: it brings a "dismiss popup" region
 * into the accessibility tree -- the dimmed part of the screen around it.
 * @returns {Promise<any>}
 */
async function sheetUp(ms = 20_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) {
    const scrim = JSON.parse(idb('ui', 'describe-all', '--json')).find((/** @type {any} */ e) => e.AXLabel === 'dismiss popup');
    if (scrim) return scrim;
  }
  return null;
}

/**
 * Dismiss the share sheet the way a person does, with a touch outside it, and report
 * what the Share plugin said about it.
 * @param {Awaited<ReturnType<typeof page>>} p @param {any} scrim
 */
async function dismissSheet(p, scrim) {
  idb('ui', 'tap', String(Math.round(scrim.frame.x + scrim.frame.width / 2)), String(Math.round(scrim.frame.y + Math.min(80, scrim.frame.height / 4))));
  for (let i = 0; i < 20; i += 1) {
    const said = JSON.parse(await p.evaluate('JSON.stringify(window.__share)'));
    if (said.some((/** @type {string} */ s) => !s.startsWith('called'))) return said;
    await sleep(500);
  }
  return JSON.parse(await p.evaluate('JSON.stringify(window.__share)'));
}

// --- 1. start-up, offline, safe areas -----------------------------------------
// From a clean install, so nothing a previous run left in storage -- a board left
// turned, a theme -- decides what this one sees, and the first launch is checked too.
try { run('xcrun', ['simctl', 'uninstall', UDID, APP]); } catch { /* not installed */ }
run('xcrun', ['simctl', 'install', UDID, BUILT]);
let p = await launch();
const start = JSON.parse(await p.evaluate(`JSON.stringify({
  cards: document.querySelectorAll('.card').length,
  platform: Capacitor.getPlatform(), plugins: Object.keys(Capacitor.Plugins).sort() })`));
check('launch', start.cards > 50 && start.platform === 'ios', start);
shot('01-gallery');

// Offline start-up, as proof rather than as a toggled switch: the simulator shares
// the Mac's network and turning that off would drop this session. Instead every
// request a fresh start of the gallery makes is recorded, and every one of them is
// shown to be answered from the app bundle.
await p.send('Network.enable');
p.events.length = 0;
await p.send('Page.reload');
await sleep(1500);
await p.until("document.querySelectorAll('.card').length");
await sleep(1500);
const requested = p.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url);
const outside = requested.filter((/** @type {string} */ u) => !/^(capacitor:\/\/localhost|data:|blob:)/.test(u));
check('offline-start', requested.length > 5 && outside.length === 0,
  { requests: requested.length, notFromTheBundle: outside.slice(0, 5), serviceWorker: await p.evaluate('!!navigator.serviceWorker?.controller') });
await p.send('Network.disable');

const insets = JSON.parse(await p.evaluate(`(() => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)';
  document.body.append(probe);
  const s = getComputedStyle(probe);
  const out = { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom),
    brandTop: document.querySelector('.brand').getBoundingClientRect().top, innerHeight };
  probe.remove();
  return JSON.stringify(out);
})()`));
check('safe-area-top', insets.top > 20 && insets.brandTop >= insets.top, insets);

// --- 2. the board, and what survives a relaunch and a reinstall ---------------
const SPA = 'conversation.html?target=zh-Hans&source=en&board=spa';
await p.open(SPA, '.board-cell');
const foot = JSON.parse(await p.evaluate(`JSON.stringify({
  bar: document.querySelector('.board-bar').getBoundingClientRect().bottom, innerHeight })`));
check('safe-area-bottom', foot.bar <= foot.innerHeight - insets.bottom + 1, { ...foot, insetBottom: insets.bottom });
shot('02-board');

const BOARDS = JSON.stringify({
  schemaVersion: 1,
  phrases: { p1: { id: 'p1', label: 'no peanuts', owner: 'No peanuts', listener: '不要花生', pair: 'zh-Hans__en', created: '2026-09-26T00:00:00.000Z' } },
  placements: { 'spa/main': ['p1'] },
});
await p.evaluate(`window.__set = null; Capacitor.Plugins.Preferences.set({ key: 'plg.boards', value: ${JSON.stringify(BOARDS)} })
  .then(() => { window.__set = 'done'; }); 0`);
await p.until("window.__set === 'done'");
p.close();
p = await launch();
await p.open(SPA, '.board-cell');
check('persist-relaunch', await p.evaluate(`!!document.querySelector('[data-button="p1"]')`), 'a phrase written through Preferences, then terminate and launch');
p.close();
run('xcrun', ['simctl', 'install', UDID, BUILT]);
p = await launch();
await p.open(SPA, '.board-cell');
check('persist-reinstall', await p.evaluate(`!!document.querySelector('[data-button="p1"]')`), 'the same after installing the build over itself');

// --- 3. speech, from a real touch ------------------------------------------------
await p.touch(`document.querySelector('[data-button="stop"]')`);
await p.until("document.querySelector('.board-speak')");
await p.evaluate(`window.__speech = []; const s = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = (u) => { for (const e of ['start', 'end', 'error'])
    u.addEventListener(e, (ev) => window.__speech.push(e + (ev.error ? ':' + ev.error : ''))); s(u); }; 0`);
await p.touch(`document.querySelector('.board-speak')`);
/** @type {string[]} */ let heard = [];
for (let i = 0; i < 30 && !heard.some((e) => e === 'end' || e.startsWith('error')); i += 1) {
  await sleep(500);
  heard = JSON.parse(await p.evaluate('JSON.stringify(window.__speech)'));
}
check('speech', heard.includes('start') && heard.includes('end'),
  { events: heard, voices: await p.evaluate('speechSynthesis.getVoices().length'),
    shownError: await p.evaluate("document.querySelector('.board-speech-trouble')?.textContent ?? ''") });
shot('03-message');
await p.touch(`document.querySelector('.board-message')`);
// The grid stays in the document under a message, so what says it is back is the
// owner's footer, which is shown only on the grid.
await p.until("!document.getElementById('board-add-bar').hidden");

// --- 4. the keyboard ------------------------------------------------------------
await p.touch(`document.getElementById('board-add-bar')`);
await p.until("document.querySelector('dialog[open] .board-editor-field input')");
await p.touch(`document.querySelector('dialog[open] .board-editor-field input')`);
await sleep(1500);
idb('ui', 'text', 'hello');
await sleep(800);
const typed = JSON.parse(await p.evaluate(`(() => {
  const i = document.activeElement; const r = i.getBoundingClientRect();
  return JSON.stringify({ value: i.value, viewport: visualViewport.height, innerHeight,
    fieldBottom: Math.round(r.bottom), visible: r.top >= 0 && r.bottom <= visualViewport.height });
})()`));
shot('04-keyboard');
check('keyboard', typed.value === 'hello' && typed.viewport < typed.innerHeight && typed.visible, typed);
// With the keyboard up iOS scrolls the whole page to bring the field into view, and
// the dialog's own header -- and its × -- goes above the screen. A person puts the
// keyboard away first, with the ✓ at the end of its accessory bar; its buttons are
// not in the accessibility tree, but the bar is, and ✓ is its last 40 points.
// A fresh simulator puts a one-time tip over the keyboard ("slide your finger...");
// it belongs to the simulator's first run, not to the app, and is put away first.
const tip = JSON.parse(idb('ui', 'describe-all', '--json')).find((/** @type {any} */ e) => e.type === 'Button' && e.AXLabel === 'Continue');
if (tip) { idb('ui', 'tap', String(Math.round(tip.frame.x + tip.frame.width / 2)), String(Math.round(tip.frame.y + tip.frame.height / 2))); await sleep(1200); }
const bar = JSON.parse(idb('ui', 'describe-all', '--json')).find((/** @type {any} */ e) => e.AXLabel === 'Toolbar');
if (!bar) throw new Error('no keyboard accessory bar on screen');
idb('ui', 'tap', String(Math.round(bar.frame.x + bar.frame.width - 40)), String(Math.round(bar.frame.y + bar.frame.height / 2)));
/** @type {any} */ let settled = null;
for (let i = 0; i < 20; i += 1) {
  await sleep(500);
  settled = JSON.parse(await p.evaluate(`JSON.stringify({ innerHeight, viewport: visualViewport.height,
    viewportTop: visualViewport.offsetTop, scrollY, focused: document.activeElement?.tagName })`));
  if (settled.viewport === insets.innerHeight && settled.scrollY === 0) break;
}
shot('04b-after-keyboard');
check('keyboard-dismiss', settled.innerHeight === insets.innerHeight && settled.viewport === insets.innerHeight
  && settled.scrollY === 0 && settled.viewportTop === 0, { ...settled, before: insets.innerHeight });
await p.touch(`document.querySelector('dialog[open] .board-editor-close')`);
await p.until("!document.querySelector('dialog[open]')", 5000);
const grid = JSON.parse(await p.evaluate(`JSON.stringify({ bar: document.querySelector('.board-bar').getBoundingClientRect().bottom, innerHeight, scrollY })`));
check('layout-after-keyboard', Math.abs(grid.bar - foot.bar) < 2 && grid.scrollY === 0, { ...grid, barBefore: foot.bar });

// --- 5. a backup through the share sheet, and cancelling it ----------------------
await p.watchShare();
await p.touch(`document.getElementById('board-menu')`);
await p.until("document.querySelector('dialog[open]')");
await p.touch(`[...document.querySelectorAll('dialog[open] button')].find((b) => /save a copy/i.test(b.textContent))`);
const scrim = await sheetUp();
shot('05-share-sheet');
const asked = JSON.parse(await p.evaluate('JSON.stringify(window.__share)'));
check('share-sheet-opens', scrim !== null && asked.some((/** @type {string} */ s) => s.startsWith('called:') && s.endsWith('.json')),
  { plugin: asked, sheetOnScreen: scrim !== null });
if (!scrim) throw new Error('no share sheet to cancel; the later touches would land on it');
const ended = await dismissSheet(p, scrim);
check('share-cancel', ended.some((/** @type {string} */ s) => /cancel/i.test(s)) && await p.evaluate('window.__blobs') === 0,
  { plugin: ended, browserDownloads: await p.evaluate('window.__blobs'), status: await p.evaluate("document.querySelector('dialog[open] [role=status]')?.textContent ?? ''") });
await p.evaluate("document.querySelector('dialog[open]')?.close(); 0");

// --- 6. an export through the same path --------------------------------------------
await p.open('sheet.html?target=zh-Hans&source=en', '.face');
await p.watchShare();
await p.touch(`document.getElementById('pdf')`);
const pdfScrim = await sheetUp(120_000);
shot('06-export-pdf');
const pdf = JSON.parse(await p.evaluate('JSON.stringify(window.__share)'));
check('export-pdf-share', pdfScrim !== null && pdf.some((/** @type {string} */ s) => s.startsWith('called:') && s.endsWith('.pdf')),
  { plugin: pdf, sheetOnScreen: pdfScrim !== null });
if (pdfScrim) await dismissSheet(p, pdfScrim);

// --- 7. the life cycle --------------------------------------------------------------
await p.open('signal.html', '#signal-sos');
await p.evaluate('window.__marker = 42; 0');
await p.touch(`document.getElementById('signal-sos')`);
await sleep(1200);
const flashing = await p.evaluate("!!document.querySelector('.beacon')");
run('xcrun', ['simctl', 'launch', UDID, 'com.apple.Preferences']);
await sleep(2500);
run('xcrun', ['simctl', 'launch', UDID, APP]);
await sleep(2500);
const after = JSON.parse(await p.evaluate(`JSON.stringify({ marker: window.__marker ?? null,
  beacon: !!document.querySelector('.beacon'), path: location.pathname })`));
check('background-stops-beacon', flashing && !after.beacon, { flashingBefore: flashing, ...after });
check('background-keeps-page', after.marker === 42, 'the page was not reloaded by a trip to another app');

p.close();
proxy.kill();
writeFileSync(`${OUT}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
const failed = Object.entries(results).filter(([, r]) => !r.ok).map(([n]) => n);
console.log(failed.length ? `\n${failed.length} failed: ${failed.join(', ')}` : '\nall checks passed');
process.exit(failed.length ? 1 : 0);
