// The page: controls that describe a request, a live preview of submit()'s SVG, presets and
// downloads. All drawing is the core's (core/index.js); this file reads and writes the
// controls, shows the result or the problems, and exports. window.Helix exposes the same.

import { BRAID_DEFAULTS, HELIX_DEFAULTS, HelixError, OUTPUT_DEFAULTS, submit } from './core/index.js';

/**
 * @typedef {ReturnType<typeof submit>} Result
 * @typedef {'filled' | 'outline' | 'strokes'} Style
 */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const fields = /** @type {(HTMLInputElement | HTMLSelectElement)[]} */ ([...document.querySelectorAll('[data-path]')]);
const preview = $('preview');
const issuesBox = $('issues');
const stale = $('stale');
const status = $('status');
const summary = $('summary');
const strandCount = /** @type {HTMLInputElement} */ ($('strand-count'));
const strandCountRange = /** @type {HTMLInputElement} */ ($('strand-count-range'));
const backgroundOn = /** @type {HTMLInputElement} */ ($('background-on'));
const braidColours = $('braid-colours');

// colours for strands added to a braid: the R example's five, then more of the same set
const MORE_COLOURS = ['#E41A1C', '#377EB8', '#4DAF4A', '#984EA3', '#FF7F00', '#A65628', '#F781BF', '#999999', '#1B9E77', '#D95F02', '#7570B3', '#E7298A'];

/** @type {Record<'helix' | 'braid', { name: string, title: string, settings: object }[]>} */
const PRESETS = {
  helix: [
    { name: 'R default', title: 'draw_DNA() as it stands: 2.5 turns, upright', settings: {} },
    { name: 'Bold, sideways', title: 'A sideways helix with bold edges', settings: { rotation: 270, strandThickness: 0.64, edgeWidth: 0.8, basePairThickness: 1.25 } },
    { name: 'Ladder end', title: 'The function\'s example: turned 135°, both strands running on as a ladder', settings: { rotation: 135, extension: { strands: 'both', length: 1, taper: false }, box: { width: 80, height: 140, fit: 'contain', includeExtension: true } } },
    { name: 'Underline', title: 'On its side, strand 1 running on to underline a word, as on the name tags', settings: { turns: 1.5, rotation: 90, strandThickness: 2, extension: { strands: 'strand1', length: 2.5, taper: true }, box: { width: 40, height: 20, fit: 'contain', includeExtension: false } } },
    { name: 'Grooves', title: 'Strands 140° apart, as in B-DNA\'s major and minor grooves, 10.5 base pairs a turn', settings: { phaseShift: 140, basePairsPerTurn: 10.5, turns: 3, strandThickness: 1.5 } },
    { name: 'Two colours', title: 'Thick strands in two colours, grey base pairs, for a logo', settings: { turns: 1.5, rotation: 30, strandThickness: 4, basePairsPerTurn: 8, basePairThickness: 0.6, squareWave: 0, crossingGap: 0.5, colors: { strand1: '#2b66d5', strand2: '#d5462b', basePairs: '#8a8a8a' } } },
    { name: 'Alternating', title: 'Every second base pair hangs from strand 2, floating half way', settings: { alternateSides: true, partialDisplacement: true, basePairGap: 0.35, strandThickness: 1.5 } },
  ],
  braid: [
    { name: 'R example', title: 'braid_segment()\'s defaults with three of its example\'s colours', settings: {} },
    { name: 'Two-strand rope', title: 'Two strands, three twists, as in the R test', settings: { colors: ['#E41A1C', '#377EB8'], twists: 3, width: 14 } },
    { name: 'Five strands', title: 'Five strands, five twists', settings: { colors: ['#E41A1C', '#377EB8', '#4DAF4A', '#984EA3', '#FF7F00'], twists: 5, length: 150 } },
    { name: 'Left-handed', title: 'Three strands twisting the other way', settings: { twists: -3 } },
    { name: 'Cord', title: 'Four strands in one colour: preview it as an outline to see the crossings', settings: { colors: ['#1b1b1b', '#1b1b1b', '#1b1b1b', '#1b1b1b'], twists: 4, width: 12, minSegments: 120 } },
  ],
};

/** @type {Result | null} */
let result = null;
let braidPalette = [...BRAID_DEFAULTS.colors];

// ---------- reading and writing the controls ----------

/** @param {Record<string, any>} obj @param {string} path @returns {any} */
const getPath = (obj, path) => path.split('.').reduce((/** @type {any} */ o, k) => (o == null ? undefined : o[k]), obj);
/** @param {Record<string, any>} obj @param {string} path @param {unknown} value */
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys[keys.length - 1]] = value;
}

const mode = () => /** @type {'helix' | 'braid'} */ (/** @type {HTMLInputElement} */ (document.querySelector('input[name="mode"]:checked')).value);
const previewStyle = () => /** @type {Style} */ (/** @type {HTMLInputElement} */ (document.querySelector('input[name="style"]:checked')).value);

/** The request the controls describe. */
function getRequest() {
  const m = mode();
  /** @type {Record<string, any>} */
  const req = { mode: m };
  for (const el of fields) {
    const path = /** @type {string} */ (el.dataset.path);
    if (!path.startsWith(`${m}.`) && !path.startsWith('output.')) continue;
    if (el instanceof HTMLInputElement && el.type === 'range') continue; // the number beside it holds the value
    if (path === 'output.background') {
      setPath(req, path, backgroundOn.checked ? el.value : null);
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      setPath(req, path, el.checked);
    } else if (el instanceof HTMLInputElement && el.type === 'number') {
      setPath(req, path, el.value.trim() === '' ? null : Number(el.value)); // blank: automatic, or a problem
    } else {
      setPath(req, path, el.value);
    }
  }
  if (m === 'braid') req.braid.colors = braidPalette.slice();
  req.output.style = previewStyle();
  return req;
}

/** #rgb or #RRGGBB as the #rrggbb a colour input takes. @param {string} c */
const sixDigits = (c) => (c.length === 4 ? `#${[...c.slice(1)].map((d) => d + d).join('')}` : c).toLowerCase();

/** Puts a complete (validated) request into the controls. @param {any} req */
function setControls(req) {
  /** @type {HTMLInputElement} */ (document.querySelector(`input[name="mode"][value="${req.mode}"]`)).checked = true;
  /** @type {HTMLInputElement} */ (document.querySelector(`input[name="style"][value="${req.output.style}"]`)).checked = true;
  for (const el of fields) {
    const path = /** @type {string} */ (el.dataset.path);
    if (!path.startsWith(`${req.mode}.`) && !path.startsWith('output.')) continue;
    const v = getPath(req, path);
    if (path === 'output.background') {
      backgroundOn.checked = v !== null;
      if (v !== null) el.value = sixDigits(v);
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = Boolean(v);
    } else if (el instanceof HTMLInputElement && el.type === 'color') {
      el.value = sixDigits(v);
    } else {
      el.value = v === null ? '' : String(v);
    }
  }
  if (req.mode === 'braid') {
    braidPalette = req.braid.colors.map(sixDigits);
    showBraidColours();
  }
  showMode();
  showDependents();
}

/** One colour input per braid strand. */
function showBraidColours() {
  strandCount.value = String(braidPalette.length);
  strandCountRange.value = String(braidPalette.length);
  braidColours.replaceChildren(...braidPalette.map((c, i) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'color';
    input.value = sixDigits(c);
    input.addEventListener('input', () => { braidPalette[i] = input.value; schedule(); });
    label.append(input, ` Strand ${i + 1}`);
    return label;
  }));
}

/** @param {number} n */
function setStrandCount(n) {
  if (!Number.isInteger(n) || n < 1 || n > 24) return;
  while (braidPalette.length < n) braidPalette.push(MORE_COLOURS[braidPalette.length % MORE_COLOURS.length]);
  braidPalette.length = n;
  showBraidColours();
  schedule();
}

/** Settings that only matter when another is set are greyed out until then. */
function showDependents() {
  const value = (/** @type {string} */ path) => /** @type {HTMLInputElement} */ (document.querySelector(`[data-path="${path}"]`));
  const extending = value('helix.extension.strands').value !== 'none';
  for (const path of ['helix.extension.length', 'helix.extension.taper', 'helix.box.includeExtension']) {
    for (const el of fields) if (el.dataset.path === path) el.disabled = !extending;
  }
  value('helix.partialDisplacement').disabled = !value('helix.alternateSides').checked;
}

function showMode() {
  const m = mode();
  for (const el of /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-mode]')])) el.hidden = el.dataset.mode !== m;
  const presets = $('presets');
  presets.replaceChildren(...PRESETS[m].map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.name;
    b.title = p.title;
    b.addEventListener('click', () => loadPreset(p.settings));
    return b;
  }));
}

/** A preset's settings over the mode's defaults, keeping the output settings. @param {object} settings */
function loadPreset(settings) {
  const m = mode();
  const base = m === 'helix' ? HELIX_DEFAULTS : BRAID_DEFAULTS;
  const merged = JSON.parse(JSON.stringify(base));
  for (const [k, v] of Object.entries(settings)) merged[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...merged[k], ...v } : v;
  load({ mode: m, [m]: merged, output: getRequest().output });
}

// ---------- drawing ----------

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    draw();
  });
}

function draw() {
  for (const el of fields) el.removeAttribute('aria-invalid');
  strandCount.removeAttribute('aria-invalid');
  try {
    show(submit(getRequest()));
  } catch (error) {
    if (!(error instanceof HelixError)) throw error;
    showIssues(error);
  }
}

/** @param {Result} r */
function show(r) {
  result = r;
  preview.innerHTML = r.svg.replace(/^<\?xml[^>]*>\s*/, '');
  const g = /** @type {any} */ (r.geometry);
  const size = `${num(r.width)} × ${num(r.height)} ${r.unit}`;
  let text;
  if (r.request.mode === 'helix') {
    text = `Helix, ${r.request.helix.turns} turns, ${g.basePairs.length} base pairs, ${size}`;
  } else {
    const b = r.request.braid;
    text = `Braid of ${b.colors.length} strand${b.colors.length > 1 ? 's' : ''}, ${b.twists} twists, ${g.crossings.length} crossings, ${size}`;
  }
  preview.setAttribute('aria-label', text);
  preview.dataset.style = r.request.output.style;
  // hairlines are thinner than a pixel at this size, so the preview draws them wider
  summary.textContent = r.request.output.style === 'outline' ? `${text}. The outlines are shown 1.5 pixels wide here.` : `${text}.`;
  issuesBox.hidden = true;
  stale.hidden = true;
  $('result').removeAttribute('data-stale');
  status.textContent = '';
  for (const id of ['export-svg', 'export-outline', 'export-strokes', 'export-png']) /** @type {HTMLButtonElement} */ ($(id)).disabled = false;
}

/** @param {HelixError} error */
function showIssues(error) {
  const list = document.createElement('ul');
  for (const issue of error.issues) {
    const li = document.createElement('li');
    li.textContent = `${label(issue.path)}: ${issue.message}`;
    list.append(li);
    for (const el of fields) if (el.dataset.path === issue.path) el.setAttribute('aria-invalid', 'true');
    if (issue.path.startsWith('braid.colors') || issue.path === 'braid') strandCount.setAttribute('aria-invalid', 'true');
  }
  issuesBox.replaceChildren(list);
  issuesBox.hidden = false;
  if (result) {
    stale.textContent = 'The drawing below is for the last settings that worked. Correct the marked fields to update it.';
    stale.hidden = false;
    $('result').setAttribute('data-stale', '');
  }
  status.textContent = 'Not drawn';
  for (const id of ['export-svg', 'export-outline', 'export-strokes', 'export-png']) /** @type {HTMLButtonElement} */ ($(id)).disabled = true;
}

/** A field's label on the page, for a problem's path. @param {string} path */
function label(path) {
  const el = fields.find((f) => f.dataset.path === path && !(f instanceof HTMLInputElement && f.type === 'range'));
  const own = [...(el?.closest('label')?.childNodes ?? [])].filter((n) => n.nodeType === Node.TEXT_NODE);
  return own.map((n) => n.textContent).join(' ').trim() || path;
}

const num = (/** @type {number} */ v) => String(Number(v.toPrecision(4)));

// ---------- exports ----------

/** @param {Style} [style] */
function exportSvgText(style = previewStyle()) {
  if (!result) return null;
  return submit({ ...result.request, output: { ...result.request.output, style } }).svg;
}

/** @param {{ width?: number, background?: string | null }} [options] */
async function exportPngBlob({ width = 2000, background } = {}) {
  if (!result) return null;
  const r = submit({ ...result.request, output: { ...result.request.output, style: 'filled', background: background === undefined ? result.request.output.background : background } });
  const url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.max(1, Math.round(width * r.height / r.width));
    /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @param {Blob} blob @param {string} name */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fileBase = () => (result ? result.request.mode : 'helix');
/** @param {Style} style @param {string} suffix */
function saveSvg(style, suffix) {
  const svg = exportSvgText(style);
  if (svg) download(new Blob([svg], { type: 'image/svg+xml' }), `${fileBase()}${suffix}.svg`);
}

// ---------- the page's API ----------

/** Puts a request into the page and draws it. @param {unknown} request */
function load(request) {
  const r = submit(request); // throws HelixError, leaving the page as it is
  setControls(r.request);
  show(r);
  return r;
}

/** @type {any} */ (window).Helix = {
  submit,
  load,
  getRequest,
  getResult: () => result,
  exportSvgText,
  exportPngBlob,
};

// ---------- wiring ----------

for (const el of fields) {
  el.addEventListener('input', () => {
    // a slider and its number box show one value
    const twin = fields.find((f) => f !== el && f.dataset.path === el.dataset.path);
    if (twin && el.value !== '') twin.value = el.value;
    showDependents();
    schedule();
  });
}
backgroundOn.addEventListener('input', schedule);
for (const el of document.querySelectorAll('input[name="mode"]')) el.addEventListener('change', () => { showMode(); if (mode() === 'braid') showBraidColours(); schedule(); });
for (const el of document.querySelectorAll('input[name="style"]')) el.addEventListener('change', schedule);
strandCount.addEventListener('input', () => setStrandCount(Number(strandCount.value)));
strandCountRange.addEventListener('input', () => setStrandCount(Number(strandCountRange.value)));
$('export-svg').addEventListener('click', () => saveSvg('filled', ''));
$('export-outline').addEventListener('click', () => saveSvg('outline', '-outline'));
$('export-strokes').addEventListener('click', () => saveSvg('strokes', '-strokes'));
$('export-png').addEventListener('click', async () => {
  const width = Number(/** @type {HTMLInputElement} */ ($('png-width')).value);
  if (!(width >= 16 && width <= 10000)) {
    /** @type {HTMLInputElement} */ ($('png-width')).setAttribute('aria-invalid', 'true');
    status.textContent = 'The PNG width must be from 16 to 10,000 pixels';
    return;
  }
  /** @type {HTMLInputElement} */ ($('png-width')).removeAttribute('aria-invalid');
  const blob = await exportPngBlob({ width });
  if (blob) download(blob, `${fileBase()}.png`);
});
$('export-request').addEventListener('click', () => {
  const req = getRequest();
  download(new Blob([`${JSON.stringify(req, null, 2)}\n`], { type: 'application/json' }), `${req.mode}-request.json`);
});
/** Both modes' defaults in the controls, then one mode drawn. @param {'helix' | 'braid'} m */
function reset(m) {
  setControls({ mode: 'braid', braid: { ...BRAID_DEFAULTS, colors: [...BRAID_DEFAULTS.colors] }, output: { ...OUTPUT_DEFAULTS } });
  load({ mode: m });
}
$('reset').addEventListener('click', () => reset(mode()));
reset('helix');
document.documentElement.dataset.ready = 'true';
