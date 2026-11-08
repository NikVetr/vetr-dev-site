// The page: inputs that build a request for the core's submit(), which runs in a Web
// Worker (worker.js), and views of its result. window.Crossword exposes the same
// submit() to scripts and agents running in the page.

import {
  CrosswordError, DEFAULTS, TERMS, formatEntries, issueLocation, maskFromRgba, parseEntries, renderPuzzleSvg, renderSvg,
} from './core/index.js';
import { preparePicture } from './core/score.js';

/**
 * @typedef {import('./core/input.js').Issue} Issue
 * @typedef {ReturnType<typeof import('./core/index.js').submit>} Result
 * @typedef {Result['crosswords'][number]['refined']} Crossword
 * @typedef {{ label: string, request: { mask: string[] } | { rgba: { width: number, height: number, data: string } }, pixels?: { width: number, height: number, data: Uint8ClampedArray } }} Target
 * @typedef {{ crossword?: number, stage?: 'orig' | 'refined', style?: 'filled' | 'blank' | 'puzzle' }} Pick
 */

const TERM_LABELS = /** @type {Record<string, string>} */ ({
  area: 'Area', areaRatio: 'Width / height', hvRatio: 'Across / down', nConnections: 'Connections',
  nCycles: 'Cycles', picSimilarity: 'Picture', circularity: 'Roundness',
});

const byId = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
/** @type {Record<string, any>} */
const el = {
  entries: byId('entries'), entryCount: byId('entry-count'), entryIssues: byId('entry-issues'),
  targetFile: byId('target-file'), targetStatus: byId('target-status'), targetPreview: byId('target-preview'), darkThreshold: byId('dark-threshold'),
  nXwords: byId('n-xwords'), nIter: byId('n-iter'), seed: byId('seed'), desiredAreaRatio: byId('desired-area-ratio'),
  desiredHvRatio: byId('desired-hv-ratio'), pictureDistance: byId('picture-distance'), maxAttemptsWord: byId('max-attempts-word'),
  maxAttemptsXword: byId('max-attempts-xword'), weights: byId('weights'),
  generate: byId('generate'), refine: byId('refine'), stop: byId('stop'), status: byId('status'), runIssues: byId('run-issues'),
  progressGrid: byId('progress-grid'), noResult: byId('no-result'), result: byId('result'), stale: byId('stale'), crosswordChoice: byId('crossword-choice'),
  gridFilled: byId('grid-filled'), gridBlank: byId('grid-blank'), cluesAcross: byId('clues-across'), cluesDown: byId('clues-down'),
  terms: byId('terms'), score: byId('score'), outlineField: byId('outline-field'), showOutline: byId('show-outline'),
};

/** @type {Target | null} */
let target = null;
/** @type {Result | null} */
let result = null;
/** @type {object | null} */
let resultRequest = null;
/** The page's inputs when the crosswords on view were requested (see pageInputs). @type {ReturnType<typeof pageInputs> | null} */
let resultInputs = null;
/** Whether the last run from the page failed, leaving earlier crosswords on view. */
let failed = false;
/** The target picture the crosswords on view were shaped towards, as the score prepares it. @type {ReturnType<typeof preparePicture> | null} */
let resultPicture = null;
let shown = { crossword: 0, stage: /** @type {'orig' | 'refined'} */ ('refined') };
/** @type {Worker | null} */
let worker = null;
/** @type {((error: Error) => void) | null} */
let cancelRun = null;

/** @type {Record<string, any>} */
const weightInputs = {};
for (const term of TERMS) {
  const label = document.createElement('label');
  label.textContent = TERM_LABELS[term];
  const input = document.createElement('input');
  Object.assign(input, { type: 'number', step: '0.1', value: String(DEFAULTS.weights[term]) });
  label.append(input);
  el.weights.append(label);
  weightInputs[term] = input;
}

// ---------- request <-> page ----------

function currentRequest() {
  return {
    entriesText: el.entries.value,
    ...(target && { target: 'rgba' in target.request ? { ...target.request, darkThreshold: el.darkThreshold.valueAsNumber } : target.request }),
    objective: {
      weights: Object.fromEntries(TERMS.map((t) => [t, weightInputs[t].valueAsNumber])),
      desiredAreaRatio: el.desiredAreaRatio.valueAsNumber,
      desiredHvRatio: el.desiredHvRatio.valueAsNumber,
      pictureDistance: el.pictureDistance.value,
    },
    search: {
      seed: el.seed.valueAsNumber, nXwords: el.nXwords.valueAsNumber, nIter: el.nIter.valueAsNumber,
      maxAttemptsWord: el.maxAttemptsWord.valueAsNumber, maxAttemptsXword: el.maxAttemptsXword.valueAsNumber,
    },
  };
}

/** What the page's inputs are, to tell whether the crosswords on view still match them. */
function pageInputs() {
  const { objective, search } = currentRequest();
  return { entries: el.entries.value, target, threshold: el.darkThreshold.value, settings: JSON.stringify({ objective, search }) };
}

/** Says whether, and why, the crosswords on view no longer match the inputs. */
function showStale() {
  const now = pageInputs();
  const parts = !result || !resultInputs ? [] : [
    now.entries !== resultInputs.entries && 'answers',
    (now.target !== resultInputs.target || now.threshold !== resultInputs.threshold) && 'picture',
    now.settings !== resultInputs.settings && 'settings',
  ].filter(Boolean);
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const reason = failed
    ? 'the last run failed (see the problems above). These are the crosswords made before it.'
    : what ? `the ${what} changed since these crosswords were made; ${el.entryIssues.hidden ? '' : 'fix the problems under Answers and clues, then '}press Generate to update them.` : '';
  el.stale.hidden = !reason;
  el.stale.textContent = reason ? `Out of date: ${reason}` : '';
  el.result.toggleAttribute('data-stale', Boolean(reason));
}

/** Puts an accepted request's entries and settings into the inputs. @param {Record<string, any>} request */
function loadRequest(request) {
  el.entries.value = typeof request.entriesText === 'string' ? request.entriesText : formatEntries(request.entries);
  const t = request.target;
  if (!t) setTarget(null);
  else if (t.mask) setTarget({ label: 'mask from the request', request: { mask: t.mask } });
  else setTarget(rgbaTarget('pixels from the request', t.rgba));
  if (t?.darkThreshold !== undefined) el.darkThreshold.value = String(t.darkThreshold);
  const objective = { ...DEFAULTS, ...request.objective };
  for (const term of TERMS) weightInputs[term].value = String({ ...DEFAULTS.weights, ...objective.weights }[term]);
  el.desiredAreaRatio.value = String(objective.desiredAreaRatio);
  el.desiredHvRatio.value = String(objective.desiredHvRatio);
  el.pictureDistance.value = objective.pictureDistance;
  const search = { ...DEFAULTS, ...request.search };
  for (const key of ['seed', 'nXwords', 'nIter', 'maxAttemptsWord', 'maxAttemptsXword']) el[key].value = String(search[key]);
  checkEntries();
}

// ---------- running ----------

/**
 * Runs a request in the worker. Resolves with the result; rejects with a
 * CrosswordError, or an Error if stopped.
 * @param {object} request
 * @returns {Promise<Result>}
 */
function run(request) {
  stopRun();
  const started = performance.now();
  worker = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  setRunning(true);
  el.status.textContent = 'Laying out…';
  el.runIssues.hidden = true;
  markFields([]);
  return new Promise((resolve, reject) => {
    const finish = () => {
      worker?.terminate();
      worker = null;
      cancelRun = null;
      setRunning(false);
      el.progressGrid.hidden = true;
    };
    cancelRun = (error) => {
      finish();
      el.status.textContent = 'Stopped';
      reject(error);
    };
    /** @type {Worker} */ (worker).onmessage = ({ data }) => {
      if (data.type === 'progress') {
        showProgress(data.progress);
      } else if (data.type === 'result') {
        finish();
        el.status.textContent = `Done in ${((performance.now() - started) / 1000).toFixed(1)} s`;
        resolve(data.result);
      } else {
        finish();
        el.status.textContent = 'Not run';
        reject(new CrosswordError(data.error.code, data.error.message, data.error.issues));
      }
    };
    /** @type {Worker} */ (worker).onerror = (event) => {
      finish();
      el.status.textContent = 'Failed';
      reject(new Error(`the worker failed: ${event.message}`));
    };
    /** @type {Worker} */ (worker).postMessage({ request });
  });
}

function stopRun() {
  cancelRun?.(new Error('stopped'));
}

/** @param {boolean} running */
function setRunning(running) {
  el.generate.disabled = running;
  el.refine.disabled = running || !result;
  el.stop.disabled = !running;
}

/** @param {import('./core/index.js').Progress} p */
function showProgress(p) {
  const total = el.nXwords.valueAsNumber;
  const of = Number.isFinite(total) && total > 1 ? ` of ${total}` : '';
  el.status.textContent = `Crossword ${p.crossword + 1}${of}: iteration ${p.iteration} of ${p.nIter}, score ${formatNumber(p.score)}`;
  el.progressGrid.innerHTML = renderSvg({ rows: p.grid.length, cols: p.grid[0].length, grid: p.grid, entries: [] });
  el.progressGrid.hidden = false;
}

/** @param {object} request */
async function runFromPage(request) {
  const inputs = pageInputs();
  try {
    showResult(await run(request), request, inputs);
  } catch (error) {
    if (!(error instanceof CrosswordError)) return;
    showIssues(el.runIssues, error);
    failed = true;
    showStale();
  }
}

el.generate.addEventListener('click', () => runFromPage(currentRequest()));
el.refine.addEventListener('click', () => {
  if (result) runFromPage({ ...currentRequest(), init: result.crosswords[shown.crossword][shown.stage] });
});
el.stop.addEventListener('click', stopRun);

// ---------- result ----------

/** @param {Result} next @param {object} request @param {ReturnType<typeof pageInputs>} inputs */
function showResult(next, request, inputs) {
  result = next;
  resultRequest = request;
  resultInputs = inputs;
  resultPicture = pictureOf(/** @type {Record<string, any>} */ (request).target);
  el.outlineField.hidden = !resultPicture;
  failed = false;
  showStale();
  shown = { crossword: 0, stage: 'refined' };
  el.crosswordChoice.replaceChildren(...next.crosswords.map((cw, i) => {
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'crossword', value: String(i), checked: i === 0 });
    label.append(input, ` ${i + 1} (score ${formatNumber(cw.refined.score)})`);
    return label;
  }));
  /** @type {HTMLInputElement} */ (document.querySelector('input[name="stage"][value="refined"]')).checked = true;
  el.noResult.hidden = true;
  el.result.hidden = false;
  el.refine.disabled = false;
  renderShown();
  document.documentElement.dataset.ready = 'true';
}

function renderShown() {
  if (!result) return;
  const cw = result.crosswords[shown.crossword][shown.stage];
  el.gridFilled.innerHTML = renderSvg(cw);
  if (resultPicture && el.showOutline.checked) el.gridFilled.querySelector('svg').insertAdjacentHTML('beforeend', targetOutline(cw, resultPicture));
  el.gridBlank.innerHTML = renderSvg(cw, { style: 'blank' });
  for (const [list, dir] of [[el.cluesAcross, 'across'], [el.cluesDown, 'down']]) {
    list.replaceChildren(...cw.entries.filter((e) => e.dir === dir).map((e) => {
      const li = document.createElement('li');
      const number = Object.assign(document.createElement('span'), { className: 'number', textContent: `${e.number}. ` });
      const answer = Object.assign(document.createElement('span'), { className: 'answer', textContent: ` ${e.answer}` });
      li.append(number, `${e.clue} (${e.length}):`, answer);
      return li;
    }));
  }
  el.terms.replaceChildren(...TERMS.map((t) => {
    const tr = document.createElement('tr');
    tr.append(Object.assign(document.createElement('td'), { textContent: TERM_LABELS[t] }),
      Object.assign(document.createElement('td'), { className: 'num', textContent: formatNumber(cw.terms[t]) }));
    return tr;
  }));
  el.score.textContent = formatNumber(cw.score);
}

el.showOutline.addEventListener('change', renderShown);

/** A request's target picture, prepared as the score compares it, or null. @param {any} t */
function pictureOf(t) {
  if (!t) return null;
  if (t.mask) {
    return preparePicture({ width: t.mask[0].length, height: t.mask.length, data: Uint8Array.from(t.mask.join(''), (ch) => (ch === '#' ? 1 : 0)) });
  }
  const bytes = Uint8ClampedArray.from(atob(t.rgba.data), (ch) => ch.charCodeAt(0));
  return preparePicture(maskFromRgba(t.rgba.width, t.rgba.height, bytes, t.darkThreshold ?? DEFAULTS.darkThreshold));
}

/**
 * The target picture's outline on a crossword's grid (in its SVG's grid-pitch units), placed
 * as the picture term compares them: both squared and centred, the picture scaled to the
 * crossword's size. A large picture is first reduced to 8 pixels per cell.
 * @param {Crossword} cw @param {NonNullable<typeof resultPicture>} picture
 */
function targetOutline(cw, picture) {
  const size = Math.max(cw.rows, cw.cols);
  const pad = Math.ceil(Math.abs(cw.rows - cw.cols) / 2);
  const [padR, padC] = cw.rows >= cw.cols ? [0, pad] : [pad, 0];
  const side = Math.min(picture.size, 8 * size);
  const cells = new Set(picture.locs.map(([r, c]) => `${Math.ceil((r * side) / picture.size)},${Math.ceil((c * side) / picture.size)}`));
  const has = (/** @type {number} */ r, /** @type {number} */ c) => cells.has(`${r},${c}`);
  const k = size / side;
  const x = (/** @type {number} */ c) => +((c - 1) * k - padC + 0.5).toFixed(3);
  const y = (/** @type {number} */ r) => +((r - 1) * k - padR + 0.5).toFixed(3);
  let d = '';
  for (const cell of cells) {
    const [r, c] = cell.split(',').map(Number);
    if (!has(r - 1, c)) d += `M${x(c)} ${y(r)}H${x(c + 1)}`;
    if (!has(r + 1, c)) d += `M${x(c)} ${y(r + 1)}H${x(c + 1)}`;
    if (!has(r, c - 1)) d += `M${x(c)} ${y(r)}V${y(r + 1)}`;
    if (!has(r, c + 1)) d += `M${x(c + 1)} ${y(r)}V${y(r + 1)}`;
  }
  return `<path d="${d}" fill="none" stroke="#2b66d5" stroke-width="0.08" stroke-linecap="square"/>`;
}

el.crosswordChoice.addEventListener('change', (/** @type {Event} */ e) => {
  shown.crossword = Number(/** @type {HTMLInputElement} */ (e.target).value);
  renderShown();
});
for (const input of document.querySelectorAll('input[name="stage"]')) {
  input.addEventListener('change', () => {
    shown.stage = /** @type {'orig' | 'refined'} */ (/** @type {HTMLInputElement} */ (input).value);
    renderShown();
  });
}

/** @param {number} x */
function formatNumber(x) {
  return x.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ---------- issues ----------

/** The settings field for each request path a problem can be reported on. */
const FIELDS = /** @type {Record<string, HTMLInputElement>} */ ({
  'target.darkThreshold': el.darkThreshold, 'objective.desiredAreaRatio': el.desiredAreaRatio,
  'objective.desiredHvRatio': el.desiredHvRatio, 'objective.pictureDistance': el.pictureDistance,
  'search.seed': el.seed, 'search.nXwords': el.nXwords, 'search.nIter': el.nIter,
  'search.maxAttemptsWord': el.maxAttemptsWord, 'search.maxAttemptsXword': el.maxAttemptsXword,
  ...Object.fromEntries(TERMS.map((t) => [`objective.weights.${t}`, weightInputs[t]])),
});

/** A field's name as its label shows it (a weight's, with "weight"), without a parenthetical hint. @param {HTMLInputElement} field */
function labelOf(field) {
  const label = /** @type {HTMLLabelElement} */ (field.closest('label'));
  const text = [...label.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ');
  return `${text.replace(/\s*\(.*\)\s*$/, '').trim()}${el.weights.contains(field) ? ' weight' : ''}`;
}

/** Where a problem is, in the page's words. @param {Issue} issue */
function describe(issue) {
  if (!issue.path) return issue.message;
  if (issue.path === 'entriesText') return issue.line ? `Line ${issue.line}: ${issue.message}` : `Answers and clues: ${issue.message}`;
  if (FIELDS[issue.path]) return `${labelOf(FIELDS[issue.path])}: ${issue.message}`;
  if (issue.path === 'target' || issue.path.startsWith('target.')) return `Target picture: ${issue.message}`;
  return `${issueLocation(issue)}: ${issue.message}`;
}

/** Lists a run's or the entries' problems and marks the settings fields they are on. @param {any} box @param {CrosswordError} error */
function showIssues(box, error) {
  const list = document.createElement('ul');
  /** @type {Issue[]} */
  const issues = error.issues.length ? error.issues : [{ code: error.code, path: '', message: error.message }];
  if (box === el.runIssues) markFields(issues);
  list.replaceChildren(...issues.map((issue) => Object.assign(document.createElement('li'), { textContent: describe(issue) })));
  if (error.code === 'unplaceable') list.prepend(Object.assign(document.createElement('li'), { textContent: error.message }));
  box.replaceChildren(list);
  box.hidden = false;
}

/** @param {Issue[]} issues */
function markFields(issues) {
  for (const [path, field] of Object.entries(FIELDS)) {
    if (issues.some((issue) => issue.path === path)) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
}

let checkTimer = 0;
function checkEntries() {
  try {
    const n = parseEntries(el.entries.value).length;
    el.entryCount.textContent = `${n} entries`;
    el.entryIssues.hidden = true;
    el.entries.removeAttribute('aria-invalid');
  } catch (error) {
    if (!(error instanceof CrosswordError)) throw error;
    el.entryCount.textContent = '';
    showIssues(el.entryIssues, error);
    el.entries.setAttribute('aria-invalid', 'true');
  }
  showStale();
}
el.entries.addEventListener('input', () => {
  window.clearTimeout(checkTimer);
  checkTimer = window.setTimeout(checkEntries, 200);
});

// ---------- target picture ----------

/** @param {string} label @param {{ width: number, height: number, data: string }} rgba @returns {Target} */
function rgbaTarget(label, rgba) {
  const bytes = Uint8ClampedArray.from(atob(rgba.data), (ch) => ch.charCodeAt(0));
  return { label, request: { rgba }, pixels: { width: rgba.width, height: rgba.height, data: bytes } };
}

/** @param {Target | null} next */
function setTarget(next) {
  target = next;
  showTarget();
  showStale();
}

/** The region to fill, drawn small, and how many pixels it has. */
function showTarget() {
  const ctx = el.targetPreview.getContext('2d');
  ctx.clearRect(0, 0, el.targetPreview.width, el.targetPreview.height);
  el.darkThreshold.disabled = !target?.pixels;
  if (!target) {
    el.targetStatus.textContent = 'No picture: the crossword is shaped by the other terms only.';
    return;
  }
  /** @type {{ width: number, height: number, data: Uint8Array }} */
  let mask;
  if ('mask' in target.request) {
    const rows = target.request.mask;
    mask = { width: rows[0].length, height: rows.length, data: Uint8Array.from(rows.join(''), (ch) => (ch === '#' ? 1 : 0)) };
  } else {
    const p = /** @type {NonNullable<Target['pixels']>} */ (target.pixels);
    mask = maskFromRgba(p.width, p.height, p.data, el.darkThreshold.valueAsNumber);
  }
  const filled = mask.data.reduce((a, b) => a + b, 0);
  el.targetStatus.textContent = `${target.label}: ${mask.width} × ${mask.height} pixels, ${filled.toLocaleString('en-US')} to fill.`;
  const scale = Math.min(el.targetPreview.width / mask.width, el.targetPreview.height / mask.height);
  const image = ctx.createImageData(mask.width, mask.height);
  mask.data.forEach((v, i) => {
    const shade = v ? 0 : 255;
    image.data.set([shade, shade, shade, 255], 4 * i);
  });
  const bitmap = new OffscreenCanvas(mask.width, mask.height);
  /** @type {OffscreenCanvasRenderingContext2D} */ (bitmap.getContext('2d')).putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, mask.width * scale, mask.height * scale);
}

el.darkThreshold.addEventListener('input', () => {
  showTarget();
  showStale();
});
el.targetFile.addEventListener('change', async () => {
  const file = el.targetFile.files?.[0];
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let binary = '';
    for (let i = 0; i < pixels.length; i += 0x8000) binary += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
    setTarget({ label: file.name, request: { rgba: { width: bitmap.width, height: bitmap.height, data: btoa(binary) } }, pixels: { width: bitmap.width, height: bitmap.height, data: pixels } });
  } catch {
    el.targetStatus.textContent = `${file.name} could not be read as an image.`;
  }
  el.targetFile.value = '';
});

async function exampleTarget() {
  const rows = (await (await fetch('examples/heart-notched.txt')).text()).trim().split('\n');
  setTarget({ label: 'Example heart', request: { mask: rows } });
}
byId('target-example').addEventListener('click', () => { dropUndo(); return exampleTarget(); });
byId('target-none').addEventListener('click', () => { dropUndo(); setTarget(null); });

// ---------- examples and exports ----------

/** @type {{ request: ReturnType<typeof currentRequest>, target: Target | null } | null} */
let replaced = null;

function dropUndo() {
  replaced = null;
  byId('undo-note').hidden = true;
}

/** @param {{ request: ReturnType<typeof currentRequest>, target: Target | null }} before @param {string} note */
function offerUndo(before, note) {
  replaced = before;
  byId('undo-text').textContent = note;
  byId('undo-note').hidden = false;
}

async function loadExample() {
  stopRun();
  const response = await fetch('examples/heart-example.json');
  if (!response.ok) throw new Error('The saved crossword example could not be loaded.');
  const { request, result: example } = await response.json();
  loadRequest(request);
  setTarget({ label: 'Example heart', request: request.target });
  showResult(example, request, pageInputs());
  el.status.textContent = `Loaded ${example.crosswords[0].refined.entries.length}-entry example`;
}
byId('load-example').addEventListener('click', async () => {
  const before = { request: currentRequest(), target };
  await loadExample();
  offerUndo(before, 'Replaced the entries, picture and settings with the example.');
});
byId('clear-entries').addEventListener('click', () => {
  const before = { request: currentRequest(), target };
  el.entries.value = '';
  checkEntries();
  offerUndo(before, 'Cleared the entries.');
});
byId('undo-replace').addEventListener('click', () => {
  if (!replaced) return;
  const before = replaced;
  loadRequest(before.request);
  setTarget(before.target);
  dropUndo();
});
// Undo restores exactly the last replacement until the user starts another edit.
document.querySelector('main')?.addEventListener('input', dropUndo);
byId('new-seed').addEventListener('click', () => {
  dropUndo();
  el.seed.value = String(Math.floor(Math.random() * 4294967296));
  showStale();
});
byId('settings-card').addEventListener('input', showStale);

/** @param {Pick} [pick] */
function exportSvgText({ crossword = shown.crossword, stage = shown.stage, style = 'filled' } = {}) {
  if (!result) throw new Error('there is no result yet');
  const cw = result.crosswords[crossword][stage];
  return style === 'puzzle' ? renderPuzzleSvg(cw) : renderSvg(cw, { style });
}

/** The same drawing as a PNG at twice the SVG's size. @param {Pick} [pick] @returns {Promise<Blob>} */
async function exportPngBlob(pick) {
  const svg = exportSvgText(pick);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: image.naturalWidth * 2, height: image.naturalHeight * 2 });
    /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(image, 0, 0, canvas.width, canvas.height);
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
const fileName = (/** @type {string} */ kind) => `crossword-${shown.crossword + 1}-${shown.stage}${kind}`;
byId('export-svg').addEventListener('click', () => download(fileName('.svg'), new Blob([exportSvgText()], { type: 'image/svg+xml' })));
byId('export-svg-blank').addEventListener('click', () => download(fileName('-blank.svg'), new Blob([exportSvgText({ style: 'blank' })], { type: 'image/svg+xml' })));
byId('export-png').addEventListener('click', async () => download(fileName('.png'), await exportPngBlob()));
byId('export-png-blank').addEventListener('click', async () => download(fileName('-blank.png'), await exportPngBlob({ style: 'blank' })));
byId('export-svg-puzzle').addEventListener('click', () => download(fileName('-puzzle.svg'), new Blob([exportSvgText({ style: 'puzzle' })], { type: 'image/svg+xml' })));
byId('export-png-puzzle').addEventListener('click', async () => download(fileName('-puzzle.png'), await exportPngBlob({ style: 'puzzle' })));
byId('export-result').addEventListener('click', () => download('crossword-result.json', new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })));
byId('export-request').addEventListener('click', () => download('crossword-request.json', new Blob([JSON.stringify(resultRequest, null, 2)], { type: 'application/json' })));

// ---------- API for scripts in the page ----------

/** @type {any} */ (window).Crossword = {
  /**
   * Runs a request (see api.md) in the worker, loads it into the page and shows the
   * result. An invalid request rejects with a CrosswordError and leaves the page as it was.
   * @param {object} request
   */
  async submit(request) {
    const next = await run(request);
    loadRequest(/** @type {Record<string, any>} */ (request));
    showResult(next, request, pageInputs());
    return next;
  },
  getRequest: currentRequest,
  getResult: () => result,
  exportSvgText,
  exportPngBlob,
  stop: stopRun,
};

await loadExample();
