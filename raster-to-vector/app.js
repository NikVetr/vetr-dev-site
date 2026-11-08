// The page: an image and options that build a request for the core's submit(),
// which runs in a worker (worker.js), and a view of its result.
// window.RasterToVector exposes the same submit() to scripts and agents
// running in the page.

import { DEFAULTS, RasterToVectorError } from './core/index.js';
import { EMOJI_SETTINGS } from './examples/emoji-settings.js';
import { createHistory, bindHistoryShortcuts, bindFormHistory, captureForm, restoreForm } from '../shared/history.js';

/**
 * @typedef {import('./core/index.js').Result} Result
 * @typedef {import('./core/index.js').Progress} Progress
 * @typedef {import('./core/request.js').Issue} Issue
 * @typedef {{ width: number, height: number, data: Uint8ClampedArray }} Image
 */

const EXAMPLES = { emoji: 'examples/emoji-compressed.jpg', cartoon: 'examples/cartoon_flat.png', logo: 'examples/logo_holes.png' };
/** The R defaults, except the longest side, which the page limits so that large photos stay quick. */
const PAGE_DEFAULTS = { ...structuredClone(DEFAULTS), preprocess: { ...DEFAULTS.preprocess, maxDim: 600 } };
const STAGES = /** @type {Record<string, string>} */ ({
  read: 'Preparing the image', quantize: 'Choosing colours', clean: 'Cleaning up', trace: 'Tracing outlines',
  smooth: 'Smoothing', order: 'Ordering shapes', svg: 'Writing the SVG',
});

const byId = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const el = {
  imageFile: byId('image-file'), imageInfo: byId('image-info'), convert: byId('convert'), stop: byId('stop'),
  status: byId('status'), issues: byId('issues'), inputPreview: byId('input-preview'), outputPreview: byId('output-preview'),
  outputCaption: byId('output-caption'), result: byId('result'), palette: byId('palette'), warnings: byId('warnings'),
  stale: byId('stale'), resultsCard: byId('results-card'),
  warningList: byId('warning-list'),
};
/** @type {HTMLElement[]} */
const fields = [...document.querySelectorAll('[data-path]')].map((f) => /** @type {HTMLElement} */ (f));

const state = {
  /** @type {Image | null} */ image: null,
  /** @type {string | null} */ name: null,
  /** @type {Result | null} */ result: null,
  svgUrl: '',
  /** What has changed since the SVG on view was made. @type {Set<'image' | 'options'>} */
  changed: new Set(),
  /** Whether the last conversion from the page failed, leaving an earlier SVG on view. */
  failed: false,
  /** @type {Issue[]} */ issues: [],
};
let revision = 0;
let historyReady = false;
let imageLoad = 0;
const form = /** @type {HTMLElement} */ (document.querySelector('main'));

// ---------- worker ----------

/** @type {Worker | null} */
let worker = null;
/** @type {((error: Error) => void) | null} */
let cancelRun = null;

/**
 * Runs a request in a fresh worker. Resolves with the result; rejects with a
 * RasterToVectorError, or an Error if stopped.
 * @param {object} request
 * @returns {Promise<Result>}
 */
function runInWorker(request) {
  cancelRun?.(new Error('stopped'));
  const started = performance.now();
  const w = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  worker = w;
  setRunning(true);
  showStatus('Starting…');
  return new Promise((resolve, reject) => {
    const finish = () => {
      w.terminate();
      if (worker === w) {
        worker = null;
        cancelRun = null;
        setRunning(false);
      }
    };
    cancelRun = (error) => {
      finish();
      showStatus('Stopped');
      reject(error);
    };
    w.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        showProgress(data.progress);
      } else if (data.type === 'result') {
        finish();
        showStatus(`Done in ${((performance.now() - started) / 1000).toFixed(1)} s`);
        resolve(data.result);
      } else {
        finish();
        showStatus('Not converted');
        reject(new RasterToVectorError(data.error.code, data.error.message, data.error.issues));
      }
    };
    w.onerror = (event) => {
      finish();
      showStatus('Failed');
      reject(new Error(`the converter failed: ${event.message}`));
    };
    w.postMessage({ request });
  });
}

/** @param {boolean} running */
function setRunning(running) {
  el.convert.disabled = running;
  el.stop.disabled = !running;
  if (running) document.documentElement.dataset.busy = 'true';
  else delete document.documentElement.dataset.busy;
}

/** @param {string} text */
function showStatus(text) {
  el.status.textContent = text;
}

/** @param {Progress} p */
function showProgress(p) {
  const label = STAGES[p.stage] ?? p.stage;
  showStatus(p.k === undefined ? `${label}…` : `${label}: k = ${p.k} (${/** @type {number} */ (p.step) + 1} of ${p.of})…`);
}

// ---------- images ----------

/**
 * Decodes an image (a Blob, or a URL to fetch) to RGBA pixels with the browser's
 * decoder, without colour-profile conversion.
 * @param {Blob | string} source
 * @returns {Promise<Image>}
 */
async function decodeImage(source) {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.drawImage(bitmap, 0, 0);
  const image = { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
  bitmap.close();
  return image;
}

/** @param {Image} image @param {string | null} name */
function showImage(image, name) {
  state.image = image;
  state.name = name;
  const canvas = el.inputPreview;
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(image.data), image.width, image.height), 0, 0);
  el.imageInfo.textContent = `${name ?? 'Given by the API'}: ${image.width} × ${image.height} px`;
}

/** @param {Blob | string} source @param {string} name */
async function loadImage(source, name) {
  const version = revision;
  const load = ++imageLoad;
  try {
    const image = await decodeImage(source);
    if (version !== revision || load !== imageLoad) return false;
    showImage(image, name);
    markChanged('image');
    return true;
  } catch (error) {
    if (version !== revision || load !== imageLoad) return false;
    showIssues([{ code: 'INVALID_IMAGE', path: 'image', message: `${name} could not be read as an image (${/** @type {Error} */ (error).message})` }]);
    return false;
  }
}

// ---------- request <-> page ----------

/** @param {string} text @returns {unknown} */
function intList(text) {
  const t = text.trim();
  const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(t);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])];
    return a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : t;
  }
  return /^\d+([\s,]+\d+)*$/.test(t) ? t.split(/[\s,]+/).map(Number) : t;
}

/** The field's value as the request takes it; anything unreadable is passed on for the core to report. @param {any} f */
function readField(f) {
  const v = f.value.trim();
  switch (f.dataset.type) {
    case 'int': case 'number': return v === '' || !Number.isFinite(Number(v)) ? v : Number(v);
    case 'int-or-null': return v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : v;
    case 'int-or-auto': return v === 'auto' ? 'auto' : v !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
    case 'int-list': return intList(v);
    default: return f.value;
  }
}

/** @param {any} f @param {unknown} value */
function writeField(f, value) {
  if (f.dataset.type === 'int-list' && Array.isArray(value)) {
    const contiguous = value.length > 2 && value.every((k, i) => i === 0 || k === value[i - 1] + 1);
    f.value = contiguous ? `${value[0]}-${value.at(-1)}` : value.join(', ');
  } else {
    f.value = value === null ? '' : String(value);
  }
}

/** @param {Record<string, any>} object @param {string} path */
const getPath = (object, path) => path.split('.').reduce((o, k) => o?.[k], object);

/** The options as request fields. */
function readOptions() {
  /** @type {Record<string, any>} */
  const out = {};
  for (const f of fields) {
    const keys = /** @type {string} */ (f.dataset.path).split('.');
    let o = out;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys.at(-1) ?? ''] = readField(f);
  }
  return out;
}

/** @param {Record<string, any>} settings */
function writeOptions(settings) {
  for (const f of fields) writeField(f, getPath(settings, /** @type {string} */ (f.dataset.path)));
}

function currentRequest() {
  return { image: state.image, ...readOptions() };
}

// ---------- running ----------

/**
 * Converts a request and shows the result. A request from the API that fails
 * leaves the page as it was.
 * @param {Record<string, any>} request @param {{ fromApi: boolean }} options
 */
async function run(request, { fromApi }) {
  const version = revision;
  if (!fromApi) showIssues([]);
  try {
    const result = await runInWorker(request);
    if (version !== revision) throw new Error('stopped');
    if (fromApi) {
      const { image } = request;
      if (image && typeof image === 'object') showImage({ width: image.width, height: image.height, data: Uint8ClampedArray.from(image.data) }, null);
      writeOptions(result.settings);
      showIssues([]);
    }
    showResult(result);
    state.changed.clear();
    state.failed = false;
    showStale();
    checkpoint();
    return result;
  } catch (error) {
    if (version === revision && !fromApi && error instanceof RasterToVectorError) {
      showIssues(error.issues.length ? error.issues : [{ code: error.code, path: '', message: error.message }]);
      state.failed = true;
      showStale();
    }
    throw error;
  }
}

async function convertFromPage() {
  if (!state.image) {
    showIssues([{ code: 'MISSING_FIELD', path: 'image', message: 'choose an image first' }]);
    return;
  }
  try {
    await run(currentRequest(), { fromApi: false });
  } catch {
    // shown in the issues box or the status
  }
}

// ---------- views ----------

/** An option's name as its label shows it, without the parenthetical hint. @param {HTMLElement} field */
function labelOf(field) {
  const label = /** @type {HTMLLabelElement} */ (field.closest('label'));
  const text = [...label.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ');
  return text.replace(/\s*\(.*\)\s*$/, '').trim();
}

/** Lists the problems by the options' labels (and the image), and marks those fields. @param {Issue[]} issues */
function showIssues(issues) {
  state.issues = issues.map(issue => ({ ...issue }));
  el.issues.hidden = issues.length === 0;
  el.issues.replaceChildren();
  for (const f of [...fields, el.imageFile]) f.removeAttribute('aria-invalid');
  if (!issues.length) return;
  const list = document.createElement('ul');
  for (const issue of issues) {
    const field = fields.find((f) => f.dataset.path === issue.path);
    const image = issue.path === 'image' || issue.path.startsWith('image.');
    (image ? el.imageFile : field)?.setAttribute('aria-invalid', 'true');
    const where = image ? 'Image' : field ? labelOf(field) : issue.path;
    const li = document.createElement('li');
    li.textContent = where ? `${where}: ${issue.message}` : issue.message;
    list.append(li);
  }
  el.issues.append(list);
}

/** Says whether, and why, the SVG on view no longer matches the page. */
function showStale() {
  const parts = ['image', 'options'].filter((part) => state.changed.has(/** @type {any} */ (part)));
  const what = parts.length ? `the ${parts.join(' and ')} changed since this was converted` : '';
  const reason = !state.result ? '' : state.failed
    ? `the last conversion failed (see the problems above)${what ? `, and ${what}` : ''}. This is the SVG from before it.`
    : what && `${what}; press Convert to update it.`;
  el.stale.hidden = !reason;
  el.stale.textContent = reason ? `Out of date: ${reason}` : '';
  el.resultsCard.toggleAttribute('data-stale', Boolean(reason));
}

/** @param {'image' | 'options'} part */
function markChanged(part) {
  state.changed.add(part);
  showStale();
}

/** @param {Result} result */
function showResult(result) {
  state.result = result;
  if (state.svgUrl) URL.revokeObjectURL(state.svgUrl);
  state.svgUrl = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }));
  el.outputPreview.src = state.svgUrl;
  el.outputPreview.hidden = false;
  el.outputCaption.textContent = `SVG: ${result.width} × ${result.height}, ${result.k} colour${result.k === 1 ? '' : 's'}, ${result.regions.length} region${result.regions.length === 1 ? '' : 's'}`;
  el.palette.replaceChildren(...result.palette.map((p) => {
    const li = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = p.hex;
    swatch.style.opacity = String(p.transparent ? 0 : p.alpha);
    const text = document.createElement('span');
    const alpha = p.transparent ? ', transparent, not painted' : p.alpha < 1 ? `, opacity ${p.alpha}` : '';
    text.innerHTML = `<code></code> ${(100 * p.share).toFixed(1)}% of pixels${alpha}`;
    /** @type {HTMLElement} */ (text.firstChild).textContent = p.hex;
    li.append(swatch, text);
    return li;
  }));
  el.warnings.hidden = result.warnings.length === 0;
  el.warningList.replaceChildren(...result.warnings.map((w) => {
    const li = document.createElement('li');
    li.textContent = `${w.code}: ${w.message}`;
    return li;
  }));
  el.result.hidden = false;
}

/** @param {string} name @param {Blob} blob */
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const baseName = () => (state.name ?? 'image').replace(/\.[^.]*$/, '') || 'image';

// ---------- events ----------

el.convert.addEventListener('click', convertFromPage);
el.stop.addEventListener('click', () => cancelRun?.(new Error('stopped')));
el.imageFile.addEventListener('change', async () => {
  const file = el.imageFile.files?.[0];
  if (file && await loadImage(file, file.name)) await convertFromPage();
});
byId('example-cartoon').addEventListener('click', async () => { if (await loadImage(EXAMPLES.cartoon, 'cartoon_flat.png')) await convertFromPage(); });
byId('example-emoji').addEventListener('click', async () => {
  if (await loadImage(EXAMPLES.emoji, 'emoji-compressed.jpg')) {
    writeOptions(EMOJI_SETTINGS);
    await convertFromPage();
  }
});
byId('example-logo').addEventListener('click', async () => { if (await loadImage(EXAMPLES.logo, 'logo_holes.png')) await convertFromPage(); });
byId('reset-options').addEventListener('click', () => {
  writeOptions(PAGE_DEFAULTS);
  showIssues([]);
  markChanged('options');
  checkpoint();
});
byId('options-card').addEventListener('input', () => markChanged('options'));
byId('export-svg').addEventListener('click', () => state.result && download(`${baseName()}.svg`, new Blob([state.result.svg], { type: 'image/svg+xml' })));
byId('export-result').addEventListener('click', () => state.result && download(`${baseName()}-vector.json`, new Blob([JSON.stringify(state.result, null, 2)], { type: 'application/json' })));

// Keep immutable decoded images/results by reference; URLs are view resources only.
function snapshotWork() {
  return { image: state.image, name: state.name, result: state.result, form: captureForm(form),
    changed: [...state.changed], failed: state.failed, issues: state.issues.slice(), status: worker ? 'Stopped' : el.status.textContent };
}
/** @param {ReturnType<typeof snapshotWork>} saved */
function restoreWork(saved) {
  revision++;
  imageLoad++;
  cancelRun?.(new Error('stopped'));
  restoreForm(form, saved.form);
  el.imageFile.value = '';
  if (saved.image) showImage(saved.image, saved.name);
  else {
    state.image = null;
    state.name = null;
    el.inputPreview.getContext('2d').clearRect(0, 0, el.inputPreview.width, el.inputPreview.height);
    el.imageInfo.textContent = 'No image loaded.';
  }
  if (saved.result) showResult(saved.result);
  else {
    if (state.svgUrl) URL.revokeObjectURL(state.svgUrl);
    state.svgUrl = '';
    state.result = null;
    el.outputPreview.removeAttribute('src');
    el.outputPreview.hidden = true;
    el.outputCaption.textContent = 'The SVG appears here.';
    el.result.hidden = true;
  }
  state.changed = new Set(saved.changed);
  state.failed = saved.failed;
  showIssues(saved.issues);
  showStale();
  showStatus(saved.status);
}
const history = createHistory({ capture: snapshotWork, restore: restoreWork, limit: 20,
  equal: (a, b) => a.image === b.image && a.result === b.result && a.name === b.name && JSON.stringify(a.form) === JSON.stringify(b.form),
  onChange: (h) => { byId('undo').disabled = !h.canUndo; byId('redo').disabled = !h.canRedo; },
});
function checkpoint() { if (historyReady) history.commit(); }
byId('undo').addEventListener('click', () => history.undo());
byId('redo').addEventListener('click', () => history.redo());
bindHistoryShortcuts(history, { filter: () => historyReady });
bindFormHistory(history, { root: form, filter: () => historyReady });

// ---------- API for scripts in the page ----------

/** @type {any} */ (window).RasterToVector = {
  /** Converts a request (see api.md) in the worker, loads its image and options into the page and resolves to the result. An invalid request rejects with a RasterToVectorError and leaves the page as it was. @param {Record<string, any>} request */
  submit: (request) => run(request, { fromApi: true }),
  getRequest: currentRequest,
  getResult: () => state.result,
  exportSvgText: () => state.result?.svg ?? null,
  decodeImage,
  undo: () => history.undo(), redo: () => history.redo(),
};

writeOptions(PAGE_DEFAULTS);
if (await loadImage(EXAMPLES.cartoon, 'cartoon_flat.png')) await convertFromPage();
historyReady = true;
history.reset();
document.documentElement.dataset.ready = 'true';
