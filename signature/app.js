// The page: the signing pad, the settings, the corrected view with its brush,
// the downloads and the morph. Every correction is the core's submit(), as
// the CLI and window.Signature run it.

import { readSignature } from './core/input.js';
import { DEFAULTS, normalizeRequest, SignatureError } from './core/request.js';
import { submit } from './core/index.js';
import { checkerboard, fillPath, fillStrokes, fitView, pngBlob, pngSize, prepare, strokePolylines } from './draw.js';
import { Pad } from './pad.js';

/**
 * @typedef {import('./core/resample.js').RawPoint} RawPoint
 * @typedef {import('./core/index.js').Result} Result
 * @typedef {import('./core/request.js').LocalRegion} LocalRegion
 * @typedef {import('./core/input.js').Issue} Issue
 */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const MORPH_STEPS = 120; // frames each way; the R script's animation ran 2.5 s each way
const MORPH_SECONDS = 2.5;

/** The settings sections the page edits, as the request takes them. */
const fresh = () => {
  const { morph: _m, input: _i, ...rest } = structuredClone(DEFAULTS);
  return /** @type {Record<string, any>} */ (rest);
};
let settings = fresh();
/** @type {LocalRegion[]} */
let regions = [];
/** @type {Result | null} */
let result = null;
/** @type {RawPoint[][] | null} */
let target = null;
/** @type {{ p: number, strokes: { points: number[][] }[] }[] | null} */
let frames = null;

const theme = () => {
  const css = getComputedStyle(document.documentElement);
  const v = (/** @type {string} */ n) => css.getPropertyValue(n).trim();
  return { ink: v('--text'), guide: v('--border'), background: v('--surface-2'), surface: v('--surface'), muted: v('--muted') };
};

const pad = new Pad(/** @type {HTMLCanvasElement} */ ($('pad')), { onChange: padChanged, colors: theme });
const pad2 = new Pad(/** @type {HTMLCanvasElement} */ ($('pad2')), { onChange: () => { /** @type {HTMLButtonElement} */ ($('draw-done')).disabled = !pad2.strokes.length; }, colors: theme });

// ---------- settings controls ----------

/** @param {string} path */
const getAt = (path) => path.split('.').reduce((o, k) => o?.[k], settings);
/** @param {string} path @param {unknown} value */
const setAt = (path, value) => {
  const keys = path.split('.');
  const last = /** @type {string} */ (keys.pop());
  keys.reduce((o, k) => o[k], settings)[last] = value;
};

/** keepEnergy from the local-smoothing slider: 0 keeps 99.9999%, 30 keeps 99.9% (the default), 50 keeps 90%. @param {number} s */
const keepFromSlider = (s) => Number((1 - 10 ** (-6 + s / 10)).toPrecision(12));
const sliderFromKeep = (/** @type {number} */ k) => Math.round(10 * (6 + Math.log10(1 - k)));
const percent = (/** @type {number} */ v) => `${Number((v * 100).toPrecision(6))}%`;

const fields = /** @type {HTMLInputElement[]} */ ([...document.querySelectorAll('[data-path]')]);

/** Shows the settings in the controls. */
function showSettings() {
  for (const el of fields) {
    const v = getAt(/** @type {string} */ (el.dataset.path));
    const scale = Number(el.dataset.scale ?? 1);
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else el.value = typeof v === 'number' ? String(Number((v * scale).toPrecision(10))) : String(v);
  }
  input('wavelet-amount').value = String(sliderFromKeep(settings.smooth.wavelet.keepEnergy));
  showOutputs();
}

function showOutputs() {
  for (const out of document.querySelectorAll('output[data-out]')) {
    const path = /** @type {string} */ (/** @type {HTMLElement} */ (out).dataset.out);
    if (path === 'wavelet-amount') {
      out.textContent = settings.smooth.wavelet.rule === 'energy' ? `keeps ${percent(settings.smooth.wavelet.keepEnergy)}` : 'noise rule';
      continue;
    }
    const v = /** @type {number} */ (/** @type {unknown} */ (getAt(path)));
    const el = fields.find((f) => f.dataset.path === path);
    const scale = Number(el?.dataset.scale ?? 1);
    out.textContent = String(Number((v * scale).toFixed(2)));
  }
  input('wavelet-amount').disabled = settings.smooth.wavelet.rule !== 'energy';
  const src = settings.width.source;
  $('source-help').textContent = {
    auto: 'Automatic: signing speed when every point has a time (drawn here, or a CSV with t), otherwise curvature.',
    speed: 'Signing speed: slow stretches are wide, fast ones thin, measured from the times of the points and steadied by the curvature.',
    curvature: 'Curvature: the speed the two-thirds power law predicts from the shape, fast on straight runs and slow in tight turns. The exponent is 1/3 by the law; higher exaggerates it.',
    pressure: 'Pen pressure: light is thin, firm is wide. It needs a pen that reports pressure for every point.',
    constant: 'Constant: one width, the thickest, everywhere.',
  }[/** @type {'auto'} */ (src)];
}

for (const el of fields) {
  el.addEventListener(el.type === 'range' || el.type === 'checkbox' ? 'input' : 'change', () => {
    const path = /** @type {string} */ (el.dataset.path);
    const type = el.dataset.type;
    let v = /** @type {unknown} */ (el.value);
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'range' || type === 'number') v = Number(el.value) / Number(el.dataset.scale ?? 1);
    else if (type === 'int-or-auto') v = el.value.trim() === 'auto' ? 'auto' : Number(el.value);
    else if (type === 'number-or-auto') v = el.value.trim() === 'auto' ? 'auto' : Number(el.value);
    setAt(path, v);
    // the thinnest pen never passes the thickest: moving one past the other takes it along
    if (path === 'width.min' && settings.width.max < settings.width.min) settings.width.max = settings.width.min;
    if (path === 'width.max' && settings.width.min > settings.width.max) settings.width.min = settings.width.max;
    if (path === 'width.min' || path === 'width.max') showSettings();
    showOutputs();
    schedule();
  });
}
input('wavelet-amount').addEventListener('input', () => {
  settings.smooth.wavelet.keepEnergy = keepFromSlider(Number(input('wavelet-amount').value));
  showOutputs();
  schedule();
});
$('reset').addEventListener('click', () => {
  settings = fresh();
  showSettings();
  schedule();
});

// ---------- correcting ----------

/** The request the page describes (without the morph). */
function currentRequest() {
  const unit = /** @type {'mm' | 'in' | 'px'} */ (input('png-unit').value);
  const height = Number(input('png-height').value);
  return {
    strokes: pad.getStrokes().map((points) => ({ points })),
    ...structuredClone(settings),
    smooth: { ...structuredClone(settings.smooth), local: regions.map((r) => ({ ...r })) },
    output: { ...settings.output, color: input('ink').value, height: height > 0 ? height : null, unit },
  };
}

let pending = 0;
function schedule() {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(recompute);
}

function recompute() {
  const has = pad.strokes.length > 0;
  $('pad-empty').hidden = has;
  if (!has) {
    result = null;
    showIssues([]);
    render();
    return;
  }
  try {
    result = submit(currentRequest());
    showIssues([]);
  } catch (e) {
    if (!(e instanceof SignatureError)) throw e;
    showIssues(e.issues.length ? e.issues : [{ code: e.code, path: '', message: e.message }]);
  }
  render();
  scheduleMorph();
}

/** Lists problems and marks the fields they are on. @param {Issue[]} issues */
function showIssues(issues) {
  const box = $('issues');
  box.hidden = !issues.length;
  box.replaceChildren();
  if (issues.length) {
    const ul = document.createElement('ul');
    for (const i of issues) {
      const li = document.createElement('li');
      const field = fields.find((f) => f.dataset.path === i.path);
      const name = field ? (field.closest('label')?.firstChild?.textContent ?? i.path).trim() : i.path;
      li.textContent = name ? `${name}: ${i.message}` : i.message;
      ul.append(li);
    }
    box.append(ul);
  }
  for (const el of fields) {
    if (issues.some((i) => i.path === el.dataset.path)) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }
  const stale = issues.length > 0 && result !== null;
  $('results-card').toggleAttribute('data-stale', stale);
  $('stale').hidden = !stale;
  $('stale').textContent = stale ? 'The settings have a problem, so this is the last correction that worked.' : '';
}

function padChanged() {
  regions = regions.filter((r) => r.stroke < pad.strokes.length);
  const pts = pad.strokes.flat();
  const timed = pts.length > 0 && pts.every((p) => p.t !== undefined);
  const pen = pts.length > 0 && pts.every((p) => p.pressure !== undefined);
  $('pad-info').textContent = pts.length
    ? `${pad.strokes.length} stroke${pad.strokes.length === 1 ? '' : 's'}, ${pts.length} points${timed ? ', timed' : ', untimed'}${pen ? ', with pen pressure' : ''}`
    : '';
  /** @type {HTMLOptionElement} */ (document.querySelector('[data-path="width.source"] option[value="pressure"]')).disabled = !pen;
  /** @type {HTMLButtonElement} */ ($('undo')).disabled = !pad.history.length;
  /** @type {HTMLButtonElement} */ ($('clear')).disabled = !pts.length;
  /** @type {HTMLButtonElement} */ ($('replay')).disabled = !pts.length;
  showBrushInfo();
  schedule();
}

// ---------- the corrected view ----------

/** @type {import('./draw.js').View} */
let resultView = { s: 1, ox: 0, oy: 0 };
const resultCanvas = /** @type {HTMLCanvasElement} */ ($('result'));

function render() {
  const { ctx, dpr, w, h } = prepare(resultCanvas);
  checkerboard(ctx, w, h, Math.round(8 * dpr));
  $('result-empty').hidden = result !== null;
  for (const id of ['download-png', 'download-svg', 'download-json']) /** @type {HTMLButtonElement} */ ($(id)).disabled = !result;
  $('view-legend').hidden = !result || viewMode() !== 'both';
  if (!result) {
    $('status').textContent = '';
    $('png-size').textContent = '';
    return;
  }
  resultView = fitView(result.viewBox, w, h, 0.03);
  const mode = viewMode();
  const d = /** @type {RegExpMatchArray} */ (result.svg.match(/ d="([^"]*)"/))[1];
  if (mode !== 'before') fillPath(ctx, d, resultView, input('ink').value);
  if (mode !== 'after') strokePolylines(ctx, pad.getStrokes(), resultView, mode === 'both' ? '#d0312d' : input('ink').value, (mode === 'both' ? 0.8 : 2) * dpr);
  drawRegions(ctx, dpr);
  const src = { speed: 'signing speed', curvature: 'curvature', pressure: 'pen pressure', constant: 'one width' }[result.widthSource];
  $('status').textContent = `${result.strokes.length} stroke${result.strokes.length === 1 ? '' : 's'}, width from ${src}`;
  const ps = pngSize(result.viewBox, Number(input('png-height').value) || 1, /** @type {'mm'} */ (input('png-unit').value), Number(input('png-dpi').value) || 300);
  $('png-size').textContent = `PNG ${ps.width} × ${ps.height} px at ${input('png-dpi').value} dpi.`;
}

const viewMode = () => /** @type {HTMLInputElement} */ (document.querySelector('input[name="view"]:checked')).value;
for (const r of document.querySelectorAll('input[name="view"]')) r.addEventListener('change', render);
for (const id of ['ink', 'png-height', 'png-unit']) $(id).addEventListener('input', schedule);
$('ink').addEventListener('input', () => $('results-card').style.setProperty('--ink', input('ink').value));
$('png-dpi').addEventListener('input', render);
new ResizeObserver(() => { render(); drawMorph(); }).observe(resultCanvas);
document.addEventListener('themechange', () => { pad.draw(); pad2.draw(); render(); drawMorph(); drawFilmstrip(); });

// ---------- the brush ----------

const brushMode = () => /** @type {HTMLInputElement} */ (document.querySelector('input[name="brush"]:checked')).value;
/** @type {Map<number, Set<number>> | null} */
let painting = null;
/** @type {{ x: number, y: number }[]} */
let trail = [];

for (const r of document.querySelectorAll('input[name="brush"]')) {
  r.addEventListener('change', () => {
    resultCanvas.classList.toggle('brushing', brushMode() !== 'off');
  });
}
for (const id of ['brush-strength', 'brush-size']) {
  input(id).addEventListener('input', showBrushOutputs);
}
function showBrushOutputs() {
  $('brush-strength-out').textContent = `× ${input('brush-strength').value} or ÷ ${input('brush-strength').value}`;
  $('brush-size-out').textContent = `${input('brush-size').value} px`;
}

/** Signature coordinates of a pointer on the corrected view. @param {PointerEvent} e */
function resultPoint(e) {
  const r = resultCanvas.getBoundingClientRect();
  const dpr = resultCanvas.width / r.width;
  return { x: ((e.clientX - r.left) * dpr - resultView.ox) / resultView.s, y: ((e.clientY - r.top) * dpr - resultView.oy) / resultView.s };
}

/** Marks the corrected points under the brush. @param {PointerEvent} e */
function paint(e) {
  if (!result || !painting) return;
  const p = resultPoint(e);
  trail.push(p);
  const dpr = resultCanvas.width / resultCanvas.getBoundingClientRect().width;
  const radius = (Number(input('brush-size').value) / 2) * dpr / resultView.s;
  result.strokes.forEach((s, k) => {
    s.points.forEach((q, i) => {
      if (Math.hypot(q[0] - p.x, q[1] - p.y) <= radius) {
        if (!painting?.has(k)) painting?.set(k, new Set());
        painting?.get(k)?.add(i);
      }
    });
  });
  render();
}

resultCanvas.addEventListener('pointerdown', (e) => {
  if (brushMode() === 'off' || !result) return;
  e.preventDefault();
  resultCanvas.setPointerCapture(e.pointerId);
  painting = new Map();
  trail = [];
  paint(e);
});
resultCanvas.addEventListener('pointermove', (e) => { if (painting) paint(e); });
const endPaint = () => {
  if (!painting || !result) return;
  const k = Number(input('brush-strength').value);
  const strength = brushMode() === 'more' ? k : 1 / k;
  for (const [stroke, set] of painting) {
    const n = result.strokes[stroke].points.length;
    if (n < 2) continue;
    const idx = [...set].sort((a, b) => a - b);
    let start = idx[0];
    for (let j = 1; j <= idx.length; j++) {
      if (j === idx.length || idx[j] !== idx[j - 1] + 1) {
        regions.push({ stroke, from: start / (n - 1), to: idx[j - 1] / (n - 1), strength });
        start = idx[j];
      }
    }
  }
  painting = null;
  trail = [];
  showBrushInfo();
  schedule();
};
resultCanvas.addEventListener('pointerup', endPaint);
resultCanvas.addEventListener('pointercancel', endPaint);
$('brush-clear').addEventListener('click', () => {
  regions = [];
  showBrushInfo();
  schedule();
});

function showBrushInfo() {
  const more = regions.filter((r) => r.strength > 1).length;
  const less = regions.length - more;
  $('brush-info').textContent = regions.length
    ? [more && `＋ ${more} region${more === 1 ? '' : 's'} smoothed more`, less && `− ${less} smoothed less`].filter(Boolean).join(', ')
    : 'No brushed regions.';
  /** @type {HTMLButtonElement} */ ($('brush-clear')).disabled = !regions.length;
}

/** Brushed regions as halos: solid blue for more, dashed orange for less, and the stroke in progress. @param {CanvasRenderingContext2D} ctx @param {number} dpr */
function drawRegions(ctx, dpr) {
  if (!result) return;
  const v = resultView;
  ctx.save();
  ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const halo = (/** @type {number[][]} */ pts, /** @type {boolean} */ more) => {
    ctx.strokeStyle = more ? 'rgba(43, 102, 213, 0.32)' : 'rgba(214, 120, 0, 0.38)';
    ctx.lineWidth = (14 * dpr) / v.s;
    ctx.setLineDash(more ? [] : [(10 * dpr) / v.s, (7 * dpr) / v.s]);
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.stroke();
  };
  for (const r of regions) {
    const pts = result.strokes[r.stroke]?.points;
    if (!pts || pts.length < 2) continue;
    const n = pts.length - 1;
    halo(pts.slice(Math.floor(r.from * n), Math.ceil(r.to * n) + 1), r.strength > 1);
  }
  if (painting) {
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(120, 120, 120, 0.35)';
    ctx.lineWidth = (Number(input('brush-size').value) * dpr) / v.s;
    ctx.beginPath();
    trail.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    if (trail.length === 1) ctx.lineTo(trail[0].x + 1e-3, trail[0].y);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- the pad's buttons, examples and import ----------

$('undo').addEventListener('click', () => pad.undo());
$('clear').addEventListener('click', () => { regions = []; pad.clear(); });
$('replay').addEventListener('click', () => {
  const b = $('replay');
  if (pad.replayStop) {
    pad.stopReplay();
    return;
  }
  b.setAttribute('aria-pressed', 'true');
  b.textContent = '■ Stop';
  pad.replay(() => {
    b.setAttribute('aria-pressed', 'false');
    b.textContent = '▶ Replay';
  });
});

/** @param {string} file */
const fetchText = async (file) => {
  const res = await fetch(file);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return res.text();
};

/**
 * A signature file as a request: CSV, SVG, or JSON (a strokes array, or a
 * request with its settings).
 * @param {string} name @param {string} text @returns {Record<string, any>}
 */
function fileRequest(name, text) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return { csv: text };
  if (lower.endsWith('.svg') || text.trimStart().startsWith('<')) return { svg: text };
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? { strokes: v } : v;
  } catch {
    return { csv: text };
  }
}

/** Reads the signature of a request without the rest of it. @param {Record<string, any>} req @returns {RawPoint[][] | null} */
function signatureOf(req) {
  /** @type {Issue[]} */
  const issues = [];
  const strokes = readSignature(req, '', { penUpGap: req.input?.penUpGap ?? 50, yAxis: req.input?.yAxis ?? 'down' }, issues, []);
  if (issues.length) showIssues(issues);
  return strokes;
}

/** Loads a request into the page (signature and settings). @param {Record<string, any>} req */
function load(req) {
  const { strokes, settings: s } = normalizeRequest(req);
  const { morph: _m, input: _i, ...rest } = s;
  regions = rest.smooth.local.map((r) => ({ ...r }));
  settings = { ...rest, smooth: { ...rest.smooth, local: [] } };
  if (s.output.height !== null) {
    input('png-height').value = String(s.output.height);
    if (s.output.unit !== 'pt') input('png-unit').value = s.output.unit;
  }
  if (/^#[0-9a-f]{6}$/i.test(s.output.color)) input('ink').value = s.output.color;
  showSettings();
  pad.load(strokes);
  recompute();
  return /** @type {Result} */ (result);
}

$('example').addEventListener('click', async () => {
  const strokes = signatureOf({ csv: await fetchText('examples/avery-quill.csv') });
  if (strokes) { regions = []; pad.load(strokes); }
});
input('import').addEventListener('change', async () => {
  const file = input('import').files?.[0];
  if (!file) return;
  const req = fileRequest(file.name, await file.text());
  input('import').value = '';
  const settingsKeys = Object.keys(req).filter((k) => !['strokes', 'csv', 'matrix', 'svg'].includes(k));
  if (settingsKeys.length) {
    try {
      load(req);
    } catch (e) {
      if (e instanceof SignatureError) showIssues(e.issues);
      else throw e;
    }
    return;
  }
  const strokes = signatureOf(req);
  if (strokes) { regions = []; pad.load(strokes); }
});

// ---------- downloads ----------

/** @param {Blob} blob @param {string} name */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** @param {{ height?: number, unit?: 'mm' | 'in' | 'px', dpi?: number, color?: string }} [o] */
function exportPngBlob(o = {}) {
  if (!result) return Promise.reject(new Error('there is no corrected signature yet'));
  const d = /** @type {RegExpMatchArray} */ (result.svg.match(/ d="([^"]*)"/))[1];
  return pngBlob(d, result.viewBox, { height: o.height ?? 20, unit: o.unit ?? 'mm', dpi: o.dpi ?? 300, color: o.color ?? result.settings.output.color });
}

$('download-png').addEventListener('click', async () => {
  download(await exportPngBlob({ height: Number(input('png-height').value), unit: /** @type {'mm'} */ (input('png-unit').value), dpi: Number(input('png-dpi').value), color: input('ink').value }), 'signature.png');
});
$('download-svg').addEventListener('click', () => {
  if (result) download(new Blob([result.svg], { type: 'image/svg+xml' }), 'signature.svg');
});
$('download-json').addEventListener('click', () => {
  download(new Blob([`${JSON.stringify(currentRequest())}\n`], { type: 'application/json' }), 'signature-request.json');
});

// ---------- the morph ----------

const morphCanvas = /** @type {HTMLCanvasElement} */ ($('morph'));
const props = Array.from({ length: MORPH_STEPS + 1 }, (_, k) => k / MORPH_STEPS);
let morphTimer = 0;
let frameIndex = 0;

function scheduleMorph() {
  clearTimeout(morphTimer);
  if (!target) return;
  morphTimer = window.setTimeout(computeMorph, 120);
}

function computeMorph() {
  if (!target || !pad.strokes.length) return;
  try {
    const r = submit({
      ...currentRequest(),
      morph: {
        target: { strokes: target.map((points) => ({ points })) }, props,
        method: /** @type {HTMLSelectElement} */ ($('morph-method')).value,
        strokes: /** @type {HTMLSelectElement} */ ($('morph-strokes')).value,
        loop: Number(input('morph-loop').value),
      },
    });
    frames = /** @type {NonNullable<Result['morph']>} */ (r.morph).frames;
  } catch (e) {
    if (!(e instanceof SignatureError)) throw e;
    frames = null;
    $('morph-info').textContent = `The morph failed: ${e.message}`;
  }
  // one view for every frame, so the morph does not jump about
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of frames ?? []) {
    for (const s of f.strokes) {
      for (const [x, y, w] of s.points) {
        x0 = Math.min(x0, x - w); y0 = Math.min(y0, y - w); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + w);
      }
    }
  }
  morphExtent = [x0, y0, x1 - x0, y1 - y0];
  for (const id of ['morph-play', 'morph-p']) /** @type {HTMLInputElement} */ ($(id)).disabled = !frames;
  /** @type {HTMLButtonElement} */ ($('morph-record')).disabled = !frames || !recordable();
  $('morph-empty').hidden = Boolean(frames);
  drawMorph();
  drawFilmstrip();
}
let morphExtent = [0, 0, 1, 1];

/** Draws frame `k` (or the current one) on a canvas. @param {HTMLCanvasElement} canvas @param {number} k */
function drawFrame(canvas, k) {
  const { ctx, w, h } = prepare(canvas);
  const col = theme();
  ctx.fillStyle = col.surface;
  ctx.fillRect(0, 0, w, h);
  if (!frames) return;
  fillStrokes(ctx, frames[k].strokes, fitView(morphExtent, w, h, 0.04), col.ink);
}

function drawMorph() {
  drawFrame(morphCanvas, frameIndex);
  $('morph-p-out').textContent = `${Math.round((frameIndex / MORPH_STEPS) * 100)}%`;
}

function drawFilmstrip() {
  const list = $('filmstrip');
  list.replaceChildren();
  if (!frames) return;
  for (const k of [0, 30, 60, 90, 120]) {
    const li = document.createElement('li');
    const c = document.createElement('canvas');
    c.setAttribute('aria-label', `The morph at ${Math.round((k / MORPH_STEPS) * 100)}%`);
    const cap = document.createElement('span');
    cap.className = 'muted small';
    cap.textContent = `${Math.round((k / MORPH_STEPS) * 100)}%`;
    li.append(c, cap);
    list.append(li);
    drawFrame(c, k);
  }
}

input('morph-p').addEventListener('input', () => {
  stopPlay();
  frameIndex = Number(input('morph-p').value);
  drawMorph();
});
for (const id of ['morph-method', 'morph-strokes', 'morph-loop']) {
  $(id).addEventListener('input', () => {
    $('morph-loop-out').textContent = input('morph-loop').value;
    input('morph-loop').disabled = /** @type {HTMLSelectElement} */ ($('morph-method')).value !== 'wavelet';
    scheduleMorph();
  });
}
$('morph-loop-out').textContent = input('morph-loop').value;

/** @param {RawPoint[][] | null} strokes @param {string} label */
function setTarget(strokes, label) {
  if (!strokes) return;
  target = strokes;
  $('morph-info').textContent = `Second signature: ${label}, ${strokes.length} stroke${strokes.length === 1 ? '' : 's'}.`;
  frameIndex = 0;
  input('morph-p').value = '0';
  computeMorph();
}

$('morph-example').addEventListener('click', async () => setTarget(signatureOf({ csv: await fetchText('examples/juno-marsh.csv') }), 'the second example'));
input('morph-import').addEventListener('change', async () => {
  const file = input('morph-import').files?.[0];
  if (!file) return;
  const strokes = signatureOf(fileRequest(file.name, await file.text()));
  input('morph-import').value = '';
  setTarget(strokes, file.name);
});

let playId = 0;
let playStart = 0;
/** The animation, back and forth; once only when the system asks for reduced motion. */
function play() {
  const b = $('morph-play');
  b.setAttribute('aria-pressed', 'true');
  b.textContent = '❚❚ Pause';
  playStart = performance.now() - (frameIndex / MORPH_STEPS) * MORPH_SECONDS * 1000;
  const step = () => {
    const t = (performance.now() - playStart) / (MORPH_SECONDS * 1000);
    if (reducedMotion.matches && t >= 2) {
      frameIndex = 0;
      stopPlay();
      drawMorph();
      return;
    }
    const phase = t % 2;
    frameIndex = Math.round(MORPH_STEPS * (phase < 1 ? phase : 2 - phase));
    input('morph-p').value = String(frameIndex);
    drawMorph();
    playId = requestAnimationFrame(step);
  };
  playId = requestAnimationFrame(step);
}
function stopPlay() {
  if (!playId) return;
  cancelAnimationFrame(playId);
  playId = 0;
  const b = $('morph-play');
  b.setAttribute('aria-pressed', 'false');
  b.textContent = '▶ Play';
}
$('morph-play').addEventListener('click', () => (playId ? stopPlay() : play()));

const recordable = () => typeof MediaRecorder !== 'undefined' && typeof morphCanvas.captureStream === 'function' && MediaRecorder.isTypeSupported('video/webm');
$('morph-record').addEventListener('click', () => {
  if (!frames) return;
  stopPlay();
  const info = $('morph-record-info');
  const rec = new MediaRecorder(morphCanvas.captureStream(60), { mimeType: 'video/webm' });
  /** @type {Blob[]} */
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    download(new Blob(chunks, { type: 'video/webm' }), 'signature-morph.webm');
    info.textContent = 'Recorded one cycle, there and back.';
  };
  info.hidden = false;
  info.textContent = `Recording one cycle (${MORPH_SECONDS * 2} s)…`;
  frameIndex = 0;
  rec.start();
  const start = performance.now();
  const step = () => {
    const t = (performance.now() - start) / (MORPH_SECONDS * 1000);
    frameIndex = Math.round(MORPH_STEPS * (t < 1 ? t : Math.max(0, 2 - t)));
    drawMorph();
    if (t < 2) requestAnimationFrame(step);
    else rec.stop();
  };
  requestAnimationFrame(step);
});

// ---------- drawing the second signature ----------

const dialog = /** @type {HTMLDialogElement} */ ($('draw-dialog'));
$('morph-draw').addEventListener('click', () => {
  dialog.showModal();
  pad2.draw();
});
for (const b of dialog.querySelectorAll('[data-close]')) b.addEventListener('click', () => dialog.close());
$('undo2').addEventListener('click', () => pad2.undo());
$('clear2').addEventListener('click', () => pad2.clear());
$('draw-done').addEventListener('click', () => {
  setTarget(pad2.getStrokes(), 'drawn here');
  dialog.close();
});

// ---------- start ----------

showSettings();
$('results-card').style.setProperty('--ink', input('ink').value);
showBrushOutputs();
showBrushInfo();
padChanged();
input('morph-loop').disabled = false;
if (!recordable()) {
  $('morph-record-info').hidden = false;
  $('morph-record-info').textContent = 'This browser cannot record the canvas as WebM video.';
}

/** @type {any} */ (window).Signature = Object.freeze({
  submit,
  load,
  getRequest: currentRequest,
  getResult: () => result,
  exportSvgText: () => result?.svg ?? null,
  exportPngBlob,
});

// the example, so the page opens on a correction
fetchText('examples/avery-quill.csv').then((csv) => {
  if (!pad.strokes.length) {
    const strokes = signatureOf({ csv });
    if (strokes) pad.load(strokes);
  }
});
