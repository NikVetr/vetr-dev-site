// Page wiring for the backpack fallacy: the curves are computed in a Web Worker, since a
// full request takes a few hundred milliseconds; moving the shared p-value recomputes only
// panel 2, on the page's thread. Every number shown comes from compute.js.

import { formatNumber } from '../lib/format.js';
import { bindPair, draggable, installApi, onWidth, setInvalid, workerRunner } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { seriesMark, swatch } from '../lib/plot.js';
import { atPoint, DEFAULTS, ENTRY, resolveParams } from './compute.js';
import { curvesFigure, pLabel, ridgeFigure } from './figure.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const percent = (/** @type {number} */ p) => `${formatNumber(p * 100, p > 0.995 || p < 0.005 ? 1 : 0)}%`;
const sd = (/** @type {number} */ v) => (v >= 100 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(Number(v.toPrecision(2))));

/** @typedef {{ prior: import('./compute.js').Prior, scale: number, sizes: number[], smaller: number, upTo: number, windowed: boolean, window: number, at: number }} State */
/** @returns {State} */
const fresh = () => ({ prior: DEFAULTS.prior, scale: DEFAULTS.scale, sizes: [...DEFAULTS.sizes], smaller: DEFAULTS.sizes[0], upTo: DEFAULTS.upTo, windowed: false, window: DEFAULTS.window, at: DEFAULTS.at });
let state = fresh();
/** @type {any} */
let result = null;
const runner = workerRunner();

/** The request the controls describe. */
const paramsFor = () => ({ prior: state.prior, scale: state.scale, sizes: state.sizes, upTo: state.upTo, window: state.windowed ? state.window : 0, at: state.at });

// ---------- Drawing ----------

function renderCurves() {
  const box = $('curves-plot');
  const width = box.clientWidth;
  if (!result || width <= 0) return;
  box.innerHTML = curvesFigure(result, { width, height: width < 520 ? 320 : 380, smaller: state.smaller, at: state.at, windowed: state.windowed });
  const k = (/** @type {number} */ n) => result.studies.findIndex((/** @type {any} */ s) => s.n === n);
  const larger = result.studies.filter((/** @type {any} */ s) => s.n > state.smaller);
  $('curves-legend').innerHTML = larger.map((/** @type {any} */ s) => `<li>${swatch({ line: `k-line k${k(s.n)}`, ...seriesMark(k(s.n)) })} ${state.smaller.toLocaleString('en-US')} vs ${s.n.toLocaleString('en-US')} per group</li>`).join('')
    + `<li>${swatch({ line: 'context-line' })} the other pairs</li>`
    + (state.windowed ? `<li>${swatch({ line: 'ink-line dashed' })} sliding average</li>` : '');
}

function renderAt() {
  const box = $('at-plot');
  const width = box.clientWidth;
  if (!result || width <= 0) return;
  const at = result.at;
  box.innerHTML = ridgeFigure(at, { width, height: Math.max(220, 60 + at.studies.length * 62) });
  const rows = at.studies.map((/** @type {any} */ s, /** @type {number} */ k) => {
    const m = seriesMark(k);
    return `<tr><th scope="row"><span class="group-tag">${swatch(m)} ${s.n.toLocaleString('en-US')}</span></th><td>${formatNumber(s.t, s.t < 100 ? 2 : 0)}</td><td>${sd(s.quantiles.q50)} SD</td><td>${sd(s.quantiles.q25)}–${sd(s.quantiles.q75)}</td></tr>`;
  });
  /** @type {HTMLElement} */ ($('at-table').querySelector('tbody')).innerHTML = rows.join('');
  const mine = at.pairs.filter((/** @type {any} */ p) => p.smaller === state.smaller);
  const holds = mine.every((/** @type {any} */ p) => p.matched > 0.5);
  const fails = mine.filter((/** @type {any} */ p) => p.matched < 0.5);
  const list = mine.map((/** @type {any} */ p) => `${percent(p.matched)} against ${p.larger.toLocaleString('en-US')}`).join(', ');
  $('at-readout').innerHTML = `When both report p = ${pLabel(at.x)}, the study with ${state.smaller.toLocaleString('en-US')} per group has the larger true difference with chance ${list}. `
    + (holds ? 'Here the backpack reasoning holds: the smaller study needed a larger effect to reach the same p-value.'
      : `Here it fails${fails.length < mine.length ? ' against the sizes below 50%' : ''}: true differences this large are rare, so the small study's p-value more likely came from noise on a modest effect.`);
  const pair = result.pairs.find((/** @type {any} */ p) => p.smaller === state.smaller);
  if (pair) {
    const upTo = result.x[result.x.length - 1];
    $('curves-readout').innerHTML = `${state.smaller.toLocaleString('en-US')} per group against ${pair.larger.toLocaleString('en-US')}: ${percent(pair.matched[0])} at p = 1, ${percent(mine[0].matched)} at p = ${pLabel(at.x)}, and ${percent(pair.matched[pair.matched.length - 1])} at p = ${pLabel(upTo)}.`;
  }
}

const renderAll = () => { renderCurves(); renderAt(); };

// ---------- Computing ----------

/** @param {import('../lib/params.js').Issue[]} issues */
function showIssues(issues) {
  for (const field of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('.panel-side input'))) setInvalid(field, false);
  const box = $('curves-issues');
  box.hidden = !issues.length;
  box.innerHTML = issues.map((issue) => {
    const path = issue.path.replace(/^params\./, '').replace(/\[\d+\]$/, '');
    const target = document.getElementById(`curves-${path}-number`) ?? document.getElementById(`curves-${path}`) ?? document.getElementById(`at-${path}-number`);
    if (target) setInvalid(target, true);
    return `<p>${issue.message.replace(/-(?=\d)/g, '−')}.</p>`;
  }).join('');
}

function update() {
  let params;
  try {
    params = resolveParams(paramsFor());
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    showIssues(error.issues);
    $('curves-figures').dataset.stale = 'true';
    $('at-figures').dataset.stale = 'true';
    return;
  }
  showIssues([]);
  $('curves-figures').dataset.stale = 'true';
  $('at-figures').dataset.stale = 'true';
  $('curves-status').textContent = 'Integrating…';
  runner.run({ entry: ENTRY, params }).then((response) => {
    result = { ...response.result, params: response.params };
    if (response.params.at !== state.at) result.at = atPoint({ ...response.params, at: state.at });
    delete $('curves-figures').dataset.stale;
    delete $('at-figures').dataset.stale;
    $('curves-status').textContent = `Computed exactly, by numerical integration, for ${response.params.sizes.length} study sizes.`;
    renderAll();
  });
}

/** A new shared p-value: panel 2 is recomputed here, panel 1 only redrawn. @param {number} value */
function setAt(value) {
  state.at = Math.max(0, Math.min(30, Math.round(value * 1000) / 1000));
  atPair.set(state.at);
  if (!result || $('curves-figures').dataset.stale) return; // the pending result picks it up
  result = { ...result, at: atPoint({ ...result.params, at: state.at }) };
  renderAll();
}

// ---------- Controls ----------

const scalePair = bindPair({
  range: input('curves-scale-range'), number: input('curves-scale-number'), decimals: 3,
  toRange: (v) => Math.log10(v), fromRange: (q) => Number((10 ** q).toPrecision(2)),
  onInput: (value) => { state.scale = value; showScaleHint(); update(); },
});
const upToPair = bindPair({ range: input('curves-upTo-range'), number: input('curves-upTo-number'), decimals: 0, integer: true, onInput: (value) => { state.upTo = value; update(); } });
const windowPair = bindPair({ range: input('curves-window-range'), number: input('curves-window-number'), decimals: 2, onInput: (value) => { state.window = value; if (state.windowed) update(); } });
const atPair = bindPair({ range: input('at-at-range'), number: input('at-at-number'), decimals: 3, onInput: (value) => setAt(value) });

for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="curves-prior"]'))) {
  radio.addEventListener('change', () => { state.prior = /** @type {any} */ (radio.value); showScaleHint(); update(); });
}
input('curves-windowed').addEventListener('change', () => { state.windowed = input('curves-windowed').checked; showWindow(); update(); });
input('curves-sizes').addEventListener('input', () => {
  const text = input('curves-sizes').value.trim();
  const sizes = text === '' ? [] : text.split(/[\s,]+/).filter(Boolean).map(Number);
  state.sizes = sizes;
  showSmaller();
  update();
});
$('curves-smaller').addEventListener('change', (event) => {
  state.smaller = Number(/** @type {HTMLInputElement} */ (event.target).value);
  renderAll();
});
for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('[data-at]'))) {
  button.addEventListener('click', () => setAt(Number(button.dataset.at)));
}
// Dragging across panel 1's figure moves the shared p-value.
draggable($('curves-plot'), {
  onStart: (target) => (target.closest('svg.scrub-plot') ? 'at' : null),
  onMove: (_key, px) => {
    const svg = $('curves-plot').querySelector('svg');
    if (!svg || !result) return;
    const width = svg.clientWidth;
    const left = 44;
    const right = 14;
    const upTo = result.x[result.x.length - 1];
    setAt(((Math.max(left, Math.min(width - right, px)) - left) / (width - right - left)) * upTo);
  },
});

function showScaleHint() {
  $('curves-scale-hint').textContent = state.prior === 'cauchy'
    ? `Half the true means lie within ±${sd(state.scale)} of 0, but a heavy tail of them is far larger.`
    : `About 95% of the true means lie within ±${sd(1.96 * state.scale)} of 0; the people in a group have SD 1.`;
}

function showSmaller() {
  const sizes = state.sizes.filter((n) => Number.isInteger(n) && n >= 2).sort((a, b) => a - b);
  const choices = sizes.slice(0, -1);
  if (choices.length && !choices.includes(state.smaller)) state.smaller = choices[0];
  $('curves-smaller').innerHTML = choices.map((n) => `<label><input type="radio" name="curves-smaller" value="${n}"${n === state.smaller ? ' checked' : ''}> ${n.toLocaleString('en-US')} per group</label>`).join('');
}

function showWindow() {
  input('curves-windowed').checked = state.windowed;
  input('curves-window-number').disabled = !state.windowed;
  input('curves-window-range').disabled = !state.windowed;
}

function showControls() {
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="curves-prior"]'))) radio.checked = radio.value === state.prior;
  scalePair.set(state.scale);
  upToPair.set(state.upTo);
  windowPair.set(state.window);
  atPair.set(state.at);
  input('curves-sizes').value = state.sizes.join(', ');
  showScaleHint();
  showSmaller();
  showWindow();
}

$('curves-reset').addEventListener('click', () => { state = fresh(); showControls(); update(); });
onWidth($('curves-plot'), renderCurves);
onWidth($('at-plot'), renderAt);

// ---------- Start ----------

showControls();
update();

installApi({
  entry: ENTRY,
  load: (/** @type {any} */ p, /** @type {any} */ r) => {
    Object.assign(state, { prior: p.prior, scale: p.scale, sizes: [...p.sizes], upTo: p.upTo, windowed: p.window > 0, window: p.window > 0 ? p.window : state.window, at: p.at });
    if (!state.sizes.includes(state.smaller) || state.smaller === Math.max(...state.sizes)) state.smaller = state.sizes[0];
    result = { ...r, params: p };
    showControls();
    showIssues([]);
    delete $('curves-figures').dataset.stale;
    delete $('at-figures').dataset.stale;
    renderAll();
    $('curves').scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor()),
});
