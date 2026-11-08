// The page: inputs that build a request for the core's submit(), which runs in a Web Worker
// (worker.js) along with the renderers, and the card it returns. window.MessageCollage exposes
// the same submit() and the exports to scripts and agents running in the page.

import { createHistory, bindHistoryShortcuts, bindFormHistory, captureForm, restoreForm } from '../shared/history.js';
import { FAMILIES, fontUrl } from './core/catalogue.js';
import { CollageError, DEFAULTS, parseMessages, STYLE_NAMES } from './core/request.js';

/**
 * @typedef {import('./core/request.js').Issue} Issue
 * @typedef {import('./core/index.js').Result} Result
 * @typedef {import('./core/index.js').Progress} Progress
 */

const SCHEMES = /** @type {Record<string, { label: string, palette: readonly string[], background: string }>} */ ({
  royal: { label: 'Royal on navy', palette: DEFAULTS.palette, background: DEFAULTS.background },
  ink: { label: 'Ink on paper', palette: ['#1f3a5f', '#8c2d19', '#2f6b3b', '#6b3f8c', '#8a5d00', '#1c6b73', '#3a3a3a'], background: '#fbf8f1' },
  pastel: { label: 'Pastels on charcoal', palette: ['#f4b6c2', '#b8e0d2', '#fde2a4', '#c7ceea', '#ffdac1', '#e2f0cb', '#d4a5a5'], background: '#2b2d33' },
  bold: { label: 'Bright on white', palette: ['#d7263d', '#1b998b', '#2e294e', '#f46036', '#3f88c5', '#7b2d8b'], background: '#ffffff' },
});
const STYLE_LABELS = /** @type {Record<string, string>} */ ({ plain: 'Plain', bold: 'Bold', italic: 'Italic', 'bold-italic': 'Bold italic' });

/** @type {ReturnType<typeof createHistory<any>> | null} */
let history = null;
let stateEpoch = 0; // invalidates pending file/example reads when history restores a state

const byId = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
/** @type {Record<string, any>} */
const el = {
  messages: byId('messages'), messageCount: byId('message-count'), messageIssues: byId('message-issues'), pasteNote: byId('paste-note'),
  upload: byId('upload'), families: byId('families'), styles: byId('styles'),
  sizePreset: byId('size-preset'), widthIn: byId('width-in'), heightIn: byId('height-in'), fill: byId('fill'), runs: byId('runs'),
  seed: byId('seed'), sizeMin: byId('size-min'), sizeMax: byId('size-max'), lineGap: byId('line-gap'), messageGap: byId('message-gap'),
  gridRes: byId('grid-res'), rotation: byId('rotation'), expand: byId('expand-messages'), shuffle: byId('shuffle'), scheme: byId('scheme'), backgroundPick: byId('background-pick'),
  background: byId('background'), palette: byId('palette'), swatches: byId('swatches'),
  generate: byId('generate'), reroll: byId('reroll'), stop: byId('stop'), progress: byId('progress'), status: byId('status'),
  runIssues: byId('run-issues'), noResult: byId('no-result'), result: byId('result'), stale: byId('stale'), preview: byId('preview'),
  summary: byId('summary'), pngWidth: byId('png-width'), pngNote: byId('png-note'),
  undoNote: byId('undo-note'), undoText: byId('undo-text'),
};

/** @type {Result | null} */
let result = null;
/** The outlined SVG of the card on view. */
let resultSvg = '';
/** @type {object | null} */
let resultRequest = null;
/** @type {string | null} the page's inputs when the card on view was requested */
let resultInputs = null;
let failed = false;

// ---------- fonts and colours ----------

/** @type {Record<string, HTMLInputElement>} */
const familyInputs = {};
for (const [family, { category, faces }] of Object.entries(FAMILIES)) {
  const label = document.createElement('label');
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true, value: family });
  const name = Object.assign(document.createElement('span'), { className: 'family-name', textContent: family });
  // the family's name in its own plain face, once loaded (the fallback until then)
  const face = new FontFace(`mc-sample-${category}`, `url(${fontUrl(faces.plain)})`);
  face.load().then((loaded) => {
    document.fonts.add(loaded);
    name.style.fontFamily = `"mc-sample-${category}", ui-sans-serif, sans-serif`;
  }, () => {});
  label.append(input, name, Object.assign(document.createElement('span'), { className: 'muted family-kind', textContent: category }));
  el.families.append(label);
  familyInputs[family] = input;
}
/** @type {Record<string, HTMLInputElement>} */
const styleInputs = {};
for (const style of STYLE_NAMES) {
  const label = Object.assign(document.createElement('label'), { className: `style-${style}` });
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true, value: style });
  label.append(input, ` ${STYLE_LABELS[style]}`);
  el.styles.append(label);
  styleInputs[style] = input;
}
for (const [key, { label }] of Object.entries(SCHEMES)) el.scheme.append(new Option(label, key));
el.scheme.append(new Option('Custom', 'custom'));

/** The palette field's colours: anything between spaces or commas. */
const paletteColours = () => /** @type {string[]} */ (el.palette.value.split(/[\s,]+/).filter(Boolean));

function showSwatches() {
  const colours = paletteColours();
  el.swatches.style.background = el.background.value;
  el.swatches.replaceChildren(...colours.map((c) => {
    const s = Object.assign(document.createElement('span'), { className: 'swatch', textContent: c });
    if (/^#[0-9a-f]{6}$/i.test(c)) s.style.color = c;
    else s.classList.add('swatch-bad');
    return s;
  }));
}

/** @param {string} key */
function applyScheme(key) {
  const scheme = SCHEMES[key];
  if (!scheme) return;
  el.palette.value = scheme.palette.join(' ');
  el.background.value = scheme.background;
  el.backgroundPick.value = scheme.background;
  showSwatches();
}

/** Picks the scheme the palette and background match, or Custom. */
function matchScheme() {
  const now = `${paletteColours().join(' ')}|${el.background.value}`.toLowerCase();
  el.scheme.value = Object.entries(SCHEMES).find(([, s]) => `${s.palette.join(' ')}|${s.background}`.toLowerCase() === now)?.[0] ?? 'custom';
}

el.scheme.addEventListener('change', () => applyScheme(el.scheme.value));
el.palette.addEventListener('input', () => {
  showSwatches();
  matchScheme();
});
el.background.addEventListener('input', () => {
  if (/^#[0-9a-f]{6}$/i.test(el.background.value)) el.backgroundPick.value = el.background.value;
  showSwatches();
  matchScheme();
});
el.backgroundPick.addEventListener('input', () => {
  el.background.value = el.backgroundPick.value;
  showSwatches();
  matchScheme();
});

// ---------- card size ----------

function matchSizePreset() {
  const key = `${el.widthIn.value}x${el.heightIn.value}`;
  el.sizePreset.value = [...el.sizePreset.options].some((o) => o.value === key) ? key : 'custom';
}
el.sizePreset.addEventListener('change', () => {
  if (el.sizePreset.value === 'custom') return;
  [el.widthIn.value, el.heightIn.value] = el.sizePreset.value.split('x');
  showPngNote();
});
el.widthIn.addEventListener('input', matchSizePreset);
el.heightIn.addEventListener('input', matchSizePreset);

// ---------- request <-> page ----------

/** A number field's value, or the text typed when it is not a number (so validation can name it). @param {HTMLInputElement} input */
const numberOf = (input) => (input.value.trim() === '' || Number.isNaN(input.valueAsNumber) ? input.value : input.valueAsNumber);

function currentRequest() {
  return {
    messages: parseMessages(el.messages.value),
    fonts: Object.keys(familyInputs).filter((f) => familyInputs[f].checked),
    styles: STYLE_NAMES.filter((s) => styleInputs[s].checked),
    size_range: [numberOf(el.sizeMin), numberOf(el.sizeMax)],
    width_in: numberOf(el.widthIn),
    height_in: numberOf(el.heightIn),
    grid_res: el.gridRes.value.trim() === '' ? null : numberOf(el.gridRes),
    fill: numberOf(el.fill),
    line_gap: numberOf(el.lineGap),
    message_gap: numberOf(el.messageGap),
    rotation_deg: numberOf(el.rotation),
    expand_messages: el.expand.checked,
    palette: paletteColours(),
    background: el.background.value.trim(),
    shuffle: el.shuffle.checked,
    seed: numberOf(el.seed),
    runs: numberOf(el.runs),
  };
}

/** Puts an accepted request into the inputs. @param {Record<string, any>} request */
function loadRequest(request) {
  /** @type {Record<string, any>} */
  const r = { ...DEFAULTS, ...request };
  el.messages.value = r.messages.join('\n');
  for (const [f, input] of Object.entries(familyInputs)) input.checked = r.fonts.includes(f);
  for (const [s, input] of Object.entries(styleInputs)) input.checked = r.styles.includes(s);
  [el.sizeMin.value, el.sizeMax.value] = r.size_range.map(String);
  el.widthIn.value = String(r.width_in);
  el.heightIn.value = String(r.height_in);
  el.gridRes.value = r.grid_res === null ? '' : String(r.grid_res);
  for (const [field, key] of [['fill', 'fill'], ['lineGap', 'line_gap'], ['messageGap', 'message_gap'], ['rotation', 'rotation_deg'], ['seed', 'seed'], ['runs', 'runs']]) el[field].value = String(r[key]);
  el.shuffle.checked = r.shuffle;
  el.expand.checked = r.expand_messages;
  el.palette.value = r.palette.join(' ');
  el.background.value = r.background;
  el.backgroundPick.value = r.background;
  matchSizePreset();
  showSwatches();
  matchScheme();
  countMessages();
}

/** The page's inputs, to tell whether the card on view still matches them. */
const pageInputs = () => JSON.stringify(currentRequest());

/** Says whether, and why, the card on view no longer matches the inputs. */
function showStale() {
  let reason = '';
  if (result && failed) reason = 'the last run failed (see the problems above). This is the card made before it.';
  else if (result && resultInputs !== pageInputs()) reason = 'the messages or settings changed since this card was made; press Generate to update it.';
  el.stale.hidden = !reason;
  el.stale.textContent = reason ? `Out of date: ${reason}` : '';
  el.result.toggleAttribute('data-stale', Boolean(reason));
}

function countMessages() {
  const n = parseMessages(el.messages.value).length;
  el.messageCount.textContent = `${n} message${n === 1 ? '' : 's'}`;
  showStale();
}
el.messages.addEventListener('input', countMessages);
for (const card of ['fonts-card', 'settings-card', 'colours-card']) byId(card).addEventListener('input', showStale);
for (const input of [el.messages, byId('fonts-card'), byId('settings-card'), byId('colours-card')]) input.addEventListener('input', hideReplacementNote);

// ---------- the worker ----------

/** @type {Worker | null} */
let worker = null;
let nextId = 0;
/** @type {Map<number, { resolve: (data: any) => void, reject: (error: Error) => void, onProgress?: (p: Progress) => void }>} */
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  const w = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }) => {
    const job = pending.get(data.id);
    if (!job) return;
    if (data.type === 'progress') {
      job.onProgress?.(data.progress);
      return;
    }
    pending.delete(data.id);
    if (data.type === 'error') job.reject(new CollageError(data.error.code, data.error.message, data.error.issues));
    else job.resolve(data);
  };
  w.onerror = (event) => {
    for (const job of pending.values()) job.reject(new Error(`the worker failed: ${event.message}`));
    pending.clear();
    w.terminate();
    if (worker === w) worker = null;
  };
  worker = w;
  return w;
}

/** @param {object} message @param {(p: Progress) => void} [onProgress] @returns {Promise<any>} */
function ask(message, onProgress) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, ...message });
  });
}

/** Stops whatever the worker is doing; pending calls reject. */
function stop() {
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const job of pending.values()) job.reject(new Error('stopped'));
  pending.clear();
}

let running = false;
/** @param {boolean} on */
function setRunning(on) {
  running = on;
  el.generate.disabled = on;
  el.reroll.disabled = on;
  el.stop.disabled = !on;
  el.progress.hidden = !on;
}

/**
 * Lays out a request in the worker. Resolves with the result and its outlined SVG; rejects with
 * a CollageError, or an Error if stopped.
 * @param {object} request
 * @returns {Promise<{ result: Result, svg: string }>}
 */
async function run(request) {
  const epoch = stateEpoch;
  if (running) stop();
  const started = performance.now();
  setRunning(true);
  el.status.textContent = 'Loading fonts…';
  el.progress.removeAttribute('value');
  el.runIssues.hidden = true;
  markFields([]);
  try {
    const data = await ask({ type: 'submit', request }, (p) => {
      el.progress.max = p.runs;
      el.progress.value = p.run;
      el.status.textContent = `Layout ${p.run} of ${p.runs}; best so far ${percent(p.best_empty_fraction)} empty`;
    });
    if (epoch !== stateEpoch) throw new Error('stopped');
    el.status.textContent = `Done in ${((performance.now() - started) / 1000).toFixed(1)} s`;
    return data;
  } catch (error) {
    if (epoch === stateEpoch) el.status.textContent = error instanceof CollageError ? 'Not laid out' : 'Stopped';
    throw error;
  } finally {
    if (epoch === stateEpoch) setRunning(false);
  }
}

/** @param {object} request */
async function runFromPage(request) {
  history?.commit();
  const epoch = stateEpoch;
  const inputs = pageInputs();
  try {
    const { result: next, svg } = await run(request);
    if (epoch !== stateEpoch) return;
    showResult(next, svg, request, inputs);
  } catch (error) {
    if (epoch !== stateEpoch || !(error instanceof CollageError)) return;
    showIssues(error);
    failed = true;
    showStale();
  }
  history?.commit('Generate');
}

el.generate.addEventListener('click', () => runFromPage(currentRequest()));
el.reroll.addEventListener('click', () => {
  history?.commit();
  el.seed.value = String(Math.floor(Math.random() * 2147483000));
  runFromPage(currentRequest());
});
el.stop.addEventListener('click', stop);
byId('new-seed').addEventListener('click', () => {
  history?.commit();
  el.seed.value = String(Math.floor(Math.random() * 2147483000));
  showStale();
  history?.commit('New seed');
});

// ---------- result ----------

/** @param {number} x */
const percent = (x) => `${(100 * x).toFixed(1)}%`;
/** @param {number} x */
const inches = (x) => String(Math.round(x * 100) / 100);

/** @param {Result} next @param {string} svg @param {object} request @param {string} inputs */
function showResult(next, svg, request, inputs) {
  result = next;
  resultSvg = svg;
  resultRequest = request;
  resultInputs = inputs;
  failed = false;
  el.preview.innerHTML = svg;
  el.preview.style.setProperty('--aspect', String(next.card.width_in / next.card.height_in));
  const { card, runs, lines, messages } = next;
  el.preview.setAttribute('aria-label', `The collage card: ${messages.length} messages in ${lines.length} lines on a ${inches(card.width_in)} by ${inches(card.height_in)} inch card`);
  const sorted = runs.map((r) => r.empty_fraction).sort((a, b) => a - b);
  const chosen = runs.findIndex((r) => r.seed === card.seed) + 1;
  el.summary.textContent = `${inches(card.width_in)} × ${inches(card.height_in)} in card${card.n_rows > card.target_rows ? ' (grown from ' + inches(next.request.height_in) + ' in to fit)' : ''} · `
    + `${messages.length} messages in ${lines.length} lines · `
    + (next.request.expand_messages ? `messages expanded into spare space; ` : `${percent(card.empty_fraction)} empty, `)
    + (runs.length > 1 ? `the best of ${runs.length} layouts (layout ${chosen}; the others ${percent(sorted[1])} to ${percent(sorted.at(-1) ?? 0)})` : 'one layout tried');
  el.noResult.hidden = true;
  el.result.hidden = false;
  showStale();
  showPngNote();
  document.documentElement.dataset.ready = 'true';
}

// ---------- problems ----------

/** The input each request path a problem can be reported on. */
const FIELDS = /** @type {Record<string, HTMLElement>} */ ({
  messages: el.messages, fonts: el.families, styles: el.styles, size_range: el.sizeMin, width_in: el.widthIn, height_in: el.heightIn,
  grid_res: el.gridRes, fill: el.fill, line_gap: el.lineGap, message_gap: el.messageGap, rotation_deg: el.rotation, expand_messages: el.expand, palette: el.palette, background: el.background,
  shuffle: el.shuffle, seed: el.seed, runs: el.runs,
});
const FIELD_LABELS = /** @type {Record<string, string>} */ ({
  fonts: 'Fonts', styles: 'Styles', size_range: 'Relative sizes', width_in: 'Width', height_in: 'Height', grid_res: 'Layout cells per inch',
  fill: 'Fill', line_gap: 'Gap between a message\'s lines', message_gap: 'Gap below each line', rotation_deg: 'Maximum message angle', expand_messages: 'Expand messages', palette: 'Text colours',
  background: 'Background', shuffle: 'Shuffle', seed: 'Seed', runs: 'Layouts to try',
});

/** The text box's line number of each message. */
function messageLines() {
  return el.messages.value.split(/\r\n|\n|\r/).flatMap((/** @type {string} */ line, /** @type {number} */ i) => (line.trim() === '' ? [] : [i + 1]));
}

/** Where a problem is, in the page's words. @param {Issue} issue */
function describe(issue) {
  const m = /^messages\[(\d+)\]$/.exec(issue.path);
  // the core's advice names the request field; the page names the control
  const message = issue.message.replace(/leave (.+) out of fonts$/, 'untick $1 under Fonts').replace(/lower fill or the spread of size_range, or widen the card/, 'lower Fill, bring the relative sizes closer, or widen the card');
  if (m) return `Message ${Number(m[1]) + 1} (line ${messageLines()[Number(m[1])] ?? '?'}): ${message}`;
  const field = issue.path.split(/[[.]/)[0];
  if (field === 'messages') return `Messages: ${message}`;
  if (FIELD_LABELS[field]) return `${FIELD_LABELS[field]}${issue.path !== field ? ` (${issue.path.slice(field.length)})` : ''}: ${message}`;
  return issue.path ? `${issue.path}: ${message}` : message;
}

/** Lists a run's problems by the messages box or the card, and marks the fields they are on. @param {CollageError} error */
function showIssues(error) {
  /** @type {Issue[]} */
  const issues = error.issues.length ? error.issues : [{ code: error.code, path: '', message: error.message }];
  markFields(issues);
  const onMessages = issues.filter((i) => i.path.startsWith('messages'));
  const other = issues.filter((i) => !i.path.startsWith('messages'));
  for (const [box, list] of /** @type {[any, Issue[]][]} */ ([[el.messageIssues, onMessages], [el.runIssues, other]])) {
    box.hidden = list.length === 0;
    const ul = document.createElement('ul');
    ul.replaceChildren(...list.map((issue) => Object.assign(document.createElement('li'), { textContent: describe(issue) })));
    box.replaceChildren(ul);
  }
  if (onMessages.length && !other.length) {
    el.runIssues.hidden = false;
    el.runIssues.textContent = 'The card could not be laid out: see the problems under Messages.';
  }
}

/** @param {Issue[]} issues */
function markFields(issues) {
  for (const [path, field] of Object.entries(FIELDS)) {
    const bad = issues.some((issue) => issue.path === path || issue.path.startsWith(`${path}[`));
    for (const f of path === 'size_range' ? [field, el.sizeMax] : [field]) {
      if (bad) f.setAttribute('aria-invalid', 'true');
      else f.removeAttribute('aria-invalid');
    }
  }
  if (!issues.some((i) => i.path.startsWith('messages'))) el.messageIssues.hidden = true;
}

// ---------- messages: paste, upload, example ----------

/** The example as loaded, so pasted or uploaded messages replace it rather than join it. */
let exampleText = '';

/** @param {string} text */
function addMessages(text) {
  history?.commit();
  hideReplacementNote();
  const now = el.messages.value === exampleText ? '' : el.messages.value.replace(/\s+$/, '');
  el.messages.value = now ? `${now}\n${text}` : text;
  countMessages();
  history?.commit('Add messages');
}

byId('paste').addEventListener('click', async () => {
  history?.commit();
  const epoch = stateEpoch;
  el.pasteNote.hidden = true;
  try {
    const text = await navigator.clipboard.readText();
    if (epoch !== stateEpoch) return;
    addMessages(text);
  } catch {
    if (epoch !== stateEpoch) return;
    el.pasteNote.hidden = false;
    el.pasteNote.textContent = 'This browser did not let the page read the clipboard. Click in the box below and paste there (Ctrl+V or ⌘V).';
  }
});
el.upload.addEventListener('change', async () => {
  history?.commit();
  const epoch = stateEpoch;
  const file = el.upload.files?.[0];
  if (!file) return;
  const text = await file.text();
  if (epoch !== stateEpoch) return;
  addMessages(text);
  el.upload.value = '';
});
async function loadExample() {
  history?.commit();
  const epoch = stateEpoch;
  const response = await fetch('examples/request.json');
  const before = el.messages.value;
  const request = await response.json();
  if (epoch !== stateEpoch) return;
  history?.commit();
  loadRequest(request);
  exampleText = el.messages.value;
  const n = parseMessages(before).length;
  replacementNote(before, `Replaced your ${n} message${n === 1 ? '' : 's'} and the settings with the example.`);
}
byId('load-example').addEventListener('click', loadExample);
byId('clear').addEventListener('click', () => {
  history?.commit();
  const before = el.messages.value;
  el.messages.value = '';
  countMessages();
  const n = parseMessages(before).length;
  replacementNote(before, `Cleared ${n} message${n === 1 ? '' : 's'}.`);
});

/** @param {string} before @param {string} note */
function replacementNote(before, note) {
  el.undoText.textContent = note;
  el.undoNote.hidden = !history || before === el.messages.value;
  history?.commit('Replace messages');
}
function hideReplacementNote() { el.undoNote.hidden = true; }

// ---------- exports ----------

function showPngNote() {
  const width = el.pngWidth.valueAsNumber;
  const card = result?.card;
  if (!card || !Number.isFinite(width)) {
    el.pngNote.textContent = '';
    return;
  }
  el.pngNote.textContent = `The PNG is ${Math.round(width)} × ${Math.round((width * card.height_in) / card.width_in)} pixels, ${Math.round(width / card.width_in)} per inch.`;
}
el.pngWidth.addEventListener('input', showPngNote);

/** @returns {Result} */
function shown() {
  if (!result) throw new Error('there is no card yet');
  return result;
}

/**
 * The card as SVG text: text outlined (default) or selectable, in embedded fonts.
 * @param {{ text?: 'outlines' | 'embedded' }} [options]
 * @returns {Promise<string>}
 */
async function exportSvgText({ text = 'outlines' } = {}) {
  const r = shown();
  if (text === 'outlines' && r === result && resultSvg) return resultSvg;
  return (await ask({ type: 'render', result: r, format: text === 'embedded' ? 'svg-text' : 'svg' })).data;
}

/** The card as a PDF with outlined text. @returns {Promise<Blob>} */
async function exportPdfBlob() {
  const { data } = await ask({ type: 'render', result: shown(), format: 'pdf' });
  return new Blob([data], { type: 'application/pdf' });
}

/**
 * The card as a PNG `width` pixels wide (default: the width field, else 300 per inch).
 * @param {{ width?: number }} [options]
 * @returns {Promise<Blob>}
 */
async function exportPngBlob({ width } = {}) {
  const r = shown();
  const w = Math.round(width ?? (Number.isFinite(el.pngWidth.valueAsNumber) ? el.pngWidth.valueAsNumber : 300 * r.card.width_in));
  if (!(w >= 16 && w <= 16000)) throw new Error('the PNG width must be 16 to 16000 pixels');
  const h = Math.round((w * r.card.height_in) / r.card.width_in);
  const url = URL.createObjectURL(new Blob([await exportSvgText()], { type: 'image/svg+xml' }));
  try {
    const image = new Image(w, h);
    image.src = url;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(image, 0, 0, w, h);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @param {string} name @param {Blob} blob */
function download(name, blob) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const svgBlob = (/** @type {string} */ svg) => new Blob([svg], { type: 'image/svg+xml' });
/** @param {HTMLButtonElement} button @param {() => Promise<void>} action */
function exportButton(button, action) {
  button.addEventListener('click', async () => {
    const epoch = stateEpoch;
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      if (epoch === stateEpoch) el.status.textContent = `Download failed: ${/** @type {Error} */ (error).message}`;
    } finally {
      button.disabled = false;
    }
  });
}
exportButton(byId('export-svg'), async () => download('message-collage.svg', svgBlob(await exportSvgText())));
exportButton(byId('export-svg-text'), async () => download('message-collage-text.svg', svgBlob(await exportSvgText({ text: 'embedded' }))));
exportButton(byId('export-pdf'), async () => download('message-collage.pdf', await exportPdfBlob()));
exportButton(byId('export-png'), async () => download('message-collage.png', await exportPngBlob()));
exportButton(byId('export-result'), async () => download('message-collage-result.json', new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })));
exportButton(byId('export-request'), async () => download('message-collage-request.json', new Blob([JSON.stringify(resultRequest, null, 2)], { type: 'application/json' })));

// ---------- API for scripts in the page ----------

/** @type {any} */ (window).MessageCollage = {
  /**
   * Lays out a request (see api.md) in the worker, loads it into the page and shows the card.
   * An invalid request rejects with a CollageError and leaves the page as it was.
   * @param {object} request
   */
  async submit(request) {
    history?.commit();
    const epoch = stateEpoch;
    const { result: next, svg } = await run(request);
    if (epoch !== stateEpoch) throw new Error('stopped');
    loadRequest(next.request);
    hideReplacementNote();
    showResult(next, svg, request, pageInputs());
    history?.commit('Load result');
    return next;
  },
  getRequest: currentRequest,
  getResult: () => result,
  exportSvgText,
  exportPngBlob,
  exportPdfBlob,
  stop,
};

await loadExample();
await runFromPage(currentRequest());

// ---------- reversible workspace ----------
const historyRoot = /** @type {HTMLElement} */ (document.querySelector('main'));
function captureWorkspace() {
  const form = captureForm(historyRoot);
  const invalid = [...historyRoot.querySelectorAll('[aria-invalid=true]')].map(field => ({ id: field.id, described: field.getAttribute('aria-describedby') }));
  const feedback = ['message-issues', 'run-issues', 'paste-note'].map(id => ({ id, html: byId(id).innerHTML, hidden: byId(id).hidden }));
  return { form, feedback, invalid, result, resultSvg, resultRequest, resultInputs, failed, exampleText, status: el.status.textContent,
    key: JSON.stringify([form, feedback, invalid, failed, exampleText]) };
}
/** @param {ReturnType<typeof captureWorkspace>} saved */
function restoreWorkspace(saved) {
  stateEpoch++; stop(); setRunning(false);
  restoreForm(historyRoot, saved.form);
  exampleText = saved.exampleText;
  matchSizePreset(); showSwatches(); matchScheme(); countMessages(); markFields([]);
  if (saved.result) showResult(saved.result, saved.resultSvg, /** @type {object} */ (saved.resultRequest), /** @type {string} */ (saved.resultInputs));
  else { result = null; resultSvg = ''; resultRequest = null; resultInputs = null; el.result.hidden = true; el.noResult.hidden = false; }
  failed = saved.failed;
  for (const item of saved.feedback) { byId(item.id).innerHTML = item.html; byId(item.id).hidden = item.hidden; }
  for (const field of historyRoot.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
  for (const item of saved.invalid) {
    if (!item.id) continue;
    byId(item.id).setAttribute('aria-invalid', 'true');
    if (item.described) byId(item.id).setAttribute('aria-describedby', item.described);
  }
  showStale(); showPngNote(); hideReplacementNote();
  el.status.textContent = saved.status;
}
history = createHistory({ capture: captureWorkspace, restore: restoreWorkspace,
  equal: (a, b) => a.key === b.key && a.result === b.result && a.resultRequest === b.resultRequest,
  onChange: h => { byId('undo-replace').disabled = !h.canUndo; byId('redo').disabled = !h.canRedo; },
});
byId('undo-replace').addEventListener('click', () => history?.undo());
byId('redo').addEventListener('click', () => history?.redo());
bindHistoryShortcuts(history);
bindFormHistory(history, { root: historyRoot, filter: field => !field.matches('input[type=file]') });
