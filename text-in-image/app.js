// The page: an image, a text and settings that build a request for the core's
// submit(), which runs in a worker (worker.js), and a view of its result.
// window.TextInImage exposes the same submit() to scripts and agents running
// in the page.

import { DEFAULTS, TextInImageError, parseColor } from './core/request.js';

/**
 * @typedef {import('./core/index.js').Result} Result
 * @typedef {import('./core/request.js').Image} Image
 * @typedef {import('./core/request.js').Issue} Issue
 */

const EXAMPLE = { image: 'examples/alice-drink-me.png', text: 'examples/alice-chapter-1.txt' };

const byId = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const el = {
  imageFile: byId('image-file'), maxSide: byId('max-side'), imageInfo: byId('image-info'), text: byId('text'),
  loadExample: byId('load-example'), charCount: byId('char-count'),
  quantizeOn: byId('quantize-on'), k: byId('k'), rotation: byId('rotation'), lineHeight: byId('line-height'),
  lineWidths: byId('line-widths'), nRounds: byId('n-rounds'), skipGaps: byId('skip-gaps'), justify: byId('justify'),
  ink: byId('ink'), background: byId('background'), scale: byId('scale'), seed: byId('seed'),
  render: byId('render'), status: byId('status'), issues: byId('issues'),
  noResult: byId('no-result'), result: byId('result'), stale: byId('stale'), output: byId('output'),
  fitStatus: byId('fit-status'), stats: byId('stats'), palette: byId('palette'),
  exportSvg: byId('export-svg'), exportPng: byId('export-png'),
};

/** Page state: the decoded image, where it came from, and every setting (the form shows most of them). */
const state = {
  /** @type {Image | null} */ image: null,
  /** @type {{ blob: Blob, name: string } | null} */ source: null,
  /** @type {Record<string, any>} */ settings: { ...structuredClone(DEFAULTS), color: { ...DEFAULTS.color, background: '#ffffff' } },
  /** @type {Result | null} */ result: null,
  svg: '',
  svgUrl: '',
  /** What has changed since the result on view was rendered. @type {Set<'image' | 'text' | 'settings'>} */
  changed: new Set(),
  /** Whether the last render from the page failed, leaving an earlier result on view. */
  failed: false,
};

// ---------- worker ----------

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let nextId = 0;
/** @type {Map<number, { resolve: (v: { result: Result, svg: string }) => void, reject: (e: Error) => void }>} */
const pending = new Map();
worker.onmessage = (/** @type {MessageEvent} */ { data }) => {
  const job = /** @type {NonNullable<ReturnType<typeof pending.get>>} */ (pending.get(data.id));
  pending.delete(data.id);
  if (data.error) job.reject(new TextInImageError(data.error.code, data.error.message, data.error.issues));
  else job.resolve(data);
};
worker.onerror = (/** @type {ErrorEvent} */ event) => {
  for (const job of pending.values()) job.reject(new Error(`the renderer failed: ${event.message}`));
  pending.clear();
};
/** @param {unknown} request @param {string} background */
const runInWorker = (request, background) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  worker.postMessage({ id, request, background });
});

// ---------- images ----------

/**
 * Decodes an image (a Blob, or a URL to fetch) to RGBA pixels with the
 * browser's decoder, without colour-profile conversion, scaled down so its
 * longer side is at most maxSide.
 * @param {Blob | string} source
 * @param {number} [maxSide]
 * @returns {Promise<Image>}
 */
async function decodeImage(source, maxSide = Infinity) {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  /** @type {ImageBitmapOptions} */
  const options = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
  let bitmap = await createImageBitmap(blob, options);
  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (s < 1) {
    bitmap = await createImageBitmap(blob, {
      ...options, resizeWidth: Math.max(1, Math.round(bitmap.width * s)), resizeHeight: Math.max(1, Math.round(bitmap.height * s)), resizeQuality: 'high',
    });
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

/** @param {Blob} blob @param {string} name */
async function loadImage(blob, name) {
  const maxSide = el.maxSide.valueAsNumber;
  if (!(maxSide >= 16)) throw new Error('the longest image side must be at least 16 px');
  state.image = await decodeImage(blob, maxSide);
  state.source = { blob, name };
  showImageInfo();
}

function showImageInfo() {
  if (!state.image) {
    el.imageInfo.textContent = 'No image loaded.';
    return;
  }
  const from = state.source ? `${state.source.name}, ` : 'given by the API, ';
  el.imageInfo.textContent = `${from}${state.image.width} × ${state.image.height} px`;
}

// ---------- request <-> page ----------

function readForm() {
  const s = state.settings;
  s.seed = el.seed.valueAsNumber;
  s.quantize = el.quantizeOn.checked ? { ...(s.quantize ?? DEFAULTS.quantize), k: el.k.valueAsNumber } : null;
  s.layout = {
    ...s.layout, rotation: el.rotation.valueAsNumber, line_height: el.lineHeight.valueAsNumber, line_widths: el.lineWidths.value,
    n_rounds: el.nRounds.valueAsNumber, skip_gaps: el.skipGaps.checked, justify: el.justify.checked,
  };
  s.color = { ...s.color, ink_compensation: el.ink.checked, background: el.background.value };
  s.render = { ...s.render, scale: el.scale.valueAsNumber };
}

/** @param {Record<string, any>} s */
function writeForm(s) {
  el.seed.value = String(s.seed);
  el.quantizeOn.checked = s.quantize !== null;
  el.k.value = String((s.quantize ?? DEFAULTS.quantize).k);
  el.rotation.value = String(s.layout.rotation);
  el.lineHeight.value = String(s.layout.line_height);
  el.lineWidths.value = s.layout.line_widths;
  el.nRounds.value = String(s.layout.n_rounds);
  el.skipGaps.checked = s.layout.skip_gaps;
  el.justify.checked = s.layout.justify;
  el.ink.checked = s.color.ink_compensation;
  const rgb = parseColor(s.color.background) ?? [0, 0, 0];
  el.background.value = `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  el.scale.value = String(s.render.scale);
  el.k.disabled = !el.quantizeOn.checked;
}

/** The request the page's image, text and settings describe. */
function currentRequest() {
  readForm();
  return { image: state.image, text: el.text.value, ...structuredClone(state.settings) };
}

function showCharCount() {
  const n = Array.from(el.text.value.replace(/\s+/g, ' ')).length;
  el.charCount.textContent = `${n.toLocaleString('en-US')} characters`;
}

// ---------- running ----------

/**
 * Runs a request in the worker and shows its result. On success the page
 * takes the request's image, text and settings; on failure it is unchanged.
 * @param {Record<string, any>} request
 * @param {{ fromApi: boolean }} how
 */
async function run(request, { fromApi }) {
  const statusBefore = el.status.textContent;
  el.render.disabled = true;
  el.status.textContent = 'Rendering…';
  document.documentElement.dataset.busy = 'true';
  try {
    const background = typeof request?.color?.background === 'string' ? request.color.background : 'black';
    const { result, svg } = await runInWorker(request, background);
    if (fromApi) {
      state.image = request.image;
      state.source = null;
      el.text.value = Array.isArray(request.text) ? request.text.join(' ') : request.text;
      showImageInfo();
      showCharCount();
    }
    state.settings = structuredClone(result.settings);
    writeForm(state.settings);
    showResult(result, svg);
    showIssues([]);
    state.changed.clear();
    state.failed = false;
    showStale();
    el.status.textContent = `Done in ${(Object.values(result.timings_ms).reduce((a, b) => a + b, 0) / 1000).toFixed(1)} s.`;
    return result;
  } catch (error) {
    if (fromApi) {
      el.status.textContent = statusBefore;
    } else {
      el.status.textContent = 'Not rendered.';
      showIssues(error instanceof TextInImageError ? error.issues : [{ path: '', message: /** @type {Error} */ (error).message }]);
      state.failed = true;
      showStale();
    }
    throw error;
  } finally {
    el.render.disabled = false;
    delete document.documentElement.dataset.busy;
  }
}

async function renderFromPage() {
  try {
    await run(currentRequest(), { fromApi: false });
  } catch {
    // shown in the issues box
  }
}

// ---------- views ----------

/** The form field for each request path a problem can be reported on. */
const FIELDS = {
  image: el.imageFile, text: el.text, seed: el.seed, quantize: el.quantizeOn, 'quantize.k': el.k,
  'layout.rotation': el.rotation, 'layout.line_height': el.lineHeight, 'layout.line_widths': el.lineWidths,
  'layout.n_rounds': el.nRounds, 'layout.skip_gaps': el.skipGaps, 'layout.justify': el.justify,
  'color.ink_compensation': el.ink, 'color.background': el.background, 'render.scale': el.scale,
};

/** The field a request path belongs to: its own, or that of the nearest enclosing path. @param {string} path */
function fieldFor(path) {
  for (let p = path; p; p = p.replace(/(\.[^.[]*|\[\d+\])$/, '')) {
    if (p in FIELDS) return /** @type {HTMLInputElement} */ (FIELDS[/** @type {keyof typeof FIELDS} */ (p)]);
    if (!/[.[]/.test(p)) break;
  }
  return null;
}

/** A field's name as its label shows it, without the parenthetical hint. @param {HTMLInputElement} field */
function labelOf(field) {
  const label = /** @type {HTMLLabelElement} */ (field.labels?.[0]);
  const text = [...label.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ');
  return text.replace(/\s*\(.*\)\s*$/, '').trim();
}

/** Lists the problems by the fields' labels, and marks those fields. @param {Pick<Issue, 'path' | 'message'>[]} issues */
function showIssues(issues) {
  for (const field of Object.values(FIELDS)) field.removeAttribute('aria-invalid');
  el.issues.hidden = issues.length === 0;
  el.issues.replaceChildren();
  if (!issues.length) return;
  const list = document.createElement('ul');
  for (const issue of issues) {
    const field = issue.path ? fieldFor(issue.path) : null;
    field?.setAttribute('aria-invalid', 'true');
    const item = document.createElement('li');
    item.textContent = field ? `${labelOf(field)}: ${issue.message}` : issue.path ? `${issue.path}: ${issue.message}` : issue.message;
    list.append(item);
  }
  el.issues.append(list);
}

/** Says whether, and why, the result on view no longer matches the page. */
function showStale() {
  const parts = ['image', 'text', 'settings'].filter((part) => state.changed.has(/** @type {any} */ (part)));
  const what = parts.length ? `the ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]} changed since this was rendered` : '';
  const reason = state.failed
    ? `the last render failed (see the problems above)${what ? `, and ${what}` : ''}. This is the result before it.`
    : what && `${what}; press Render to update it.`;
  el.stale.hidden = !reason;
  el.stale.textContent = reason ? `Out of date: ${reason}` : '';
  el.result.toggleAttribute('data-stale', Boolean(reason));
}

/** @param {'image' | 'text' | 'settings'} part */
function markChanged(part) {
  state.changed.add(part);
  if (state.result) showStale();
}

/** @param {Result} result @param {string} svg */
function showResult(result, svg) {
  state.result = result;
  state.svg = svg;
  if (state.svgUrl) URL.revokeObjectURL(state.svgUrl);
  state.svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  el.output.src = state.svgUrl;
  el.noResult.hidden = true;
  el.result.hidden = false;

  // The fit is worded from the counts, which a rounded percentage can contradict ("100.0%" of an
  // incomplete text), so the core's percentage warning is left out here.
  const placed = result.glyphs.filter((g) => g.placed).length;
  const total = result.glyphs.length;
  const count = `${placed.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} characters placed`;
  el.fitStatus.className = placed === total ? 'fit ok' : 'fit short';
  el.fitStatus.textContent = placed === total ? `✓ ${count}.` : `⚠ ${count}; the rest is left out.`;
  const rows = [
    ['Letter size', `${result.font_size_px.toFixed(1)} px (cex ${result.cex.toFixed(3)})`],
    ['Lines', String(result.lines)],
    ['Output size', `${result.canvas.width} × ${result.canvas.height} px`],
    ...(result.palette ? [['Colour error (OKLab)', `mean ${result.palette.error.mean.toFixed(3)}, 99th percentile ${result.palette.error.p99.toFixed(3)}`]] : []),
    ['Size rounds', result.history.map((h) => `${(12 * h.cex).toFixed(2)} px ${h.complete ? '✓' : '✗'}`).join(', ')],
    ...result.warnings.filter((w) => !w.startsWith('text did not fit')).map((w) => ['Warning', `⚠ ${w}`]),
  ];
  el.stats.replaceChildren(...rows.map(([term, value]) => {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = value;
    div.append(dt, dd);
    return div;
  }));
  el.palette.replaceChildren(...(result.palette
    ? result.palette.colors.map((color, i) => {
      const item = document.createElement('li');
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = color;
      item.append(swatch, `${color} · ${(100 * /** @type {NonNullable<Result['palette']>} */ (result.palette).proportions[i]).toFixed(1)}%`);
      return item;
    })
    : [Object.assign(document.createElement('li'), { textContent: 'The image\'s own colours (no colour reduction).' })]));
}

/** @returns {Promise<Blob>} */
async function pngBlob() {
  if (!state.result) throw new Error('nothing has been rendered yet');
  const img = new Image();
  img.src = state.svgUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = state.result.canvas.width;
  canvas.height = state.result.canvas.height;
  /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(img, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the PNG could not be made'))), 'image/png'));
}

/** @param {Blob} blob @param {string} name */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- events ----------

async function loadExample() {
  const [blob, text] = await Promise.all([
    fetch(EXAMPLE.image).then((r) => r.blob()),
    fetch(EXAMPLE.text).then((r) => r.text()),
  ]);
  el.text.value = text;
  showCharCount();
  await loadImage(blob, EXAMPLE.image.split('/').pop() ?? '');
}

el.imageFile.addEventListener('change', async () => {
  const file = el.imageFile.files?.[0];
  if (!file) return;
  try {
    await loadImage(file, file.name);
    showIssues([]);
    markChanged('image');
  } catch (error) {
    showIssues([{ path: 'image', message: `could not be read: ${/** @type {Error} */ (error).message}` }]);
  }
});
el.maxSide.addEventListener('change', async () => {
  if (!state.source) return;
  try {
    await loadImage(state.source.blob, state.source.name);
    showIssues([]);
    markChanged('image');
  } catch (error) {
    showIssues([{ path: 'image', message: /** @type {Error} */ (error).message }]);
  }
});
el.quantizeOn.addEventListener('change', () => { el.k.disabled = !el.quantizeOn.checked; });
el.text.addEventListener('input', () => {
  showCharCount();
  markChanged('text');
});
byId('settings-card').addEventListener('input', () => markChanged('settings'));
el.render.addEventListener('click', renderFromPage);
el.loadExample.addEventListener('click', async () => {
  await loadExample();
  await renderFromPage();
});
el.exportSvg.addEventListener('click', () => download(new Blob([state.svg], { type: 'image/svg+xml' }), 'text-in-image.svg'));
el.exportPng.addEventListener('click', async () => download(await pngBlob(), 'text-in-image.png'));

// ---------- API ----------

/** @type {any} */ (window).TextInImage = {
  /** Runs a request in the worker, shows it in the page and resolves to the result. Rejects with a TextInImageError and leaves the page unchanged when the request is invalid. @param {Record<string, any>} request */
  submit: (request) => run(request, { fromApi: true }),
  getRequest: currentRequest,
  getResult: () => state.result,
  exportSvgText: () => state.svg,
  exportPngBlob: pngBlob,
  decodeImage,
};

writeForm(state.settings);
await loadExample();
await renderFromPage();
document.documentElement.dataset.ready = 'true';
