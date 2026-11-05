// Page wiring for pooled vs stratified outlier removal: controls -> compute() ->
// figures and table. Everything numeric comes from compute.js.

import { formatRatio, formatShare } from '../lib/format.js';
import { bindPair, draggable, initTheme, installApi, onWidth } from '../lib/page.js';
import { marker, swatch } from '../lib/plot.js';
import { compute, DEFAULTS, ENTRY, RANGES, resolveParams } from './compute.js';
import { densityFigure, sweepFigure } from './figure.js';

/** The page always shows a sweep. @typedef {import('./compute.js').Params & { sweep: import('./compute.js').SweepParameter }} Params */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));

/** @type {Params} */
let params = { ...DEFAULTS };
/** @type {ReturnType<typeof compute>} */
let result = compute(params);
/** @type {ReturnType<typeof sweepFigure> | null} */
let sweepLayout = null;

const densityBox = $('density-plot');
const sweepBox = $('sweep-plot');
const sweepSelect = /** @type {HTMLSelectElement} */ ($('sweep'));
const logScale = input('log-scale');
const zoomSelect = /** @type {HTMLSelectElement} */ ($('zoom'));

// Sliders: the SD ratio slider is log2 of the ratio; the share is shown in percent.
const pairs = {
  meanDifference: bindPair({ range: input('meanDifference-range'), number: input('meanDifference-number'), onInput: (v) => update({ meanDifference: v }) }),
  sdRatio: bindPair({
    range: input('sdRatio-range'), number: input('sdRatio-number'), onInput: (v) => update({ sdRatio: v }),
    toRange: (v) => Math.log2(v), fromRange: (p) => 2 ** p,
  }),
  proportionA: bindPair({ range: input('proportionA-range'), number: input('proportionA-number'), onInput: (v) => update({ proportionA: v / 100 }), decimals: 0 }),
  z: bindPair({ range: input('z-range'), number: input('z-number'), onInput: (v) => update({ z: v }) }),
};

/** @param {Params} p */
function showControls(p) {
  pairs.meanDifference.set(p.meanDifference);
  pairs.sdRatio.set(p.sdRatio);
  pairs.proportionA.set(p.proportionA * 100);
  pairs.z.set(p.z);
  sweepSelect.value = p.sweep;
}

/** @param {Partial<Params>} change */
function update(change) {
  params = /** @type {Params} */ (resolveParams({ ...params, ...change }));
  result = compute(params);
  render();
}

const glyph = (/** @type {'circle' | 'triangle'} */ shape, /** @type {string} */ cls) => `<svg class="plot glyph" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">${marker(shape, 6, 6.5, 4, cls)}</svg>`;

function renderTable() {
  const [A, B] = result.groups;
  const o = result.overall;
  $('table-head').innerHTML = `<tr><th scope="col"><span class="visually-hidden">Measure</span></th>
    <th scope="col"><span class="group-tag">${glyph('circle', 'a-mark')} A</span></th>
    <th scope="col"><span class="group-tag">${glyph('triangle', 'b-mark')} B</span></th><th scope="col">All</th></tr>`;
  const rows = [
    ['Share of the data', formatShare(A.proportion), formatShare(B.proportion), '100%'],
    ['Stratified removes', formatShare(A.stratifiedRemoved), formatShare(B.stratifiedRemoved), formatShare(o.stratifiedRemoved)],
    ['Pooled removes', formatShare(A.pooledRemoved), formatShare(B.pooledRemoved), formatShare(o.pooledRemoved)],
    ['Pooled ÷ stratified', formatRatio(A.pooledRemoved / A.stratifiedRemoved), formatRatio(B.pooledRemoved / B.stratifiedRemoved), formatRatio(o.pooledRemoved / o.stratifiedRemoved)],
    ['Share of pooled removals', A.shareOfPooledRemovals === null ? '—' : formatShare(A.shareOfPooledRemovals), B.shareOfPooledRemovals === null ? '—' : formatShare(B.shareOfPooledRemovals), '100%'],
  ];
  $('table-body').innerHTML = rows.map(([label, ...cells]) => `<tr><th scope="row">${label}</th>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');

  const most = A.pooledRemoved / A.stratifiedRemoved >= B.pooledRemoved / B.stratifiedRemoved ? A : B;
  const ratio = most.pooledRemoved / most.stratifiedRemoved;
  const overall = o.pooledRemoved < o.stratifiedRemoved ? 'fewer' : 'more';
  $('readout').textContent = Math.abs(ratio - 1) < 0.005 && Math.abs(o.pooledRemoved / o.stratifiedRemoved - 1) < 0.005
    ? `The two rules agree: each removes ${formatShare(o.stratifiedRemoved)} of every group.`
    : `Pooling removes ${formatShare(o.pooledRemoved)} of all values (${overall} than the ${formatShare(o.stratifiedRemoved)} intended), and ${formatRatio(ratio).replace('×', '')} times the intended share from group ${most.group}, which is ${formatShare(most.proportion)} of the data but ${formatShare(/** @type {number} */ (most.shareOfPooledRemovals))} of what pooling removes.`;
  $('decomposition').textContent = `Of all values, ${formatShare(o.removedByBoth)} are removed by both rules, ${formatShare(o.onlyPooled)} only by pooling and ${formatShare(o.onlyStratified)} only by stratifying.`;
}

/** @param {number} [width] */
function renderDensity(width = densityBox.clientWidth) {
  const height = width < 520 ? 300 : 360;
  densityBox.innerHTML = densityFigure(result, { width, height, zoom: Number(zoomSelect.value) }).svg;
}

/** @param {number} [width] */
function renderSweep(width = sweepBox.clientWidth) {
  sweepLayout = sweepFigure(result, params, { width, height: width < 520 ? 280 : 320, log: logScale.checked });
  sweepBox.innerHTML = sweepLayout.svg;
}

function render() {
  renderDensity();
  renderSweep();
  renderTable();
}

$('density-legend').innerHTML = [
  `<li>${swatch({ line: 'a-line', shape: 'circle', mark: 'a-mark' })} Group A</li>`,
  `<li>${swatch({ line: 'b-line', shape: 'triangle', mark: 'b-mark' })} Group B</li>`,
  `<li>${swatch({ fill: 'a-strong' })}${swatch({ fill: 'b-strong' })} removed</li>`,
  `<li>${swatch({ line: 'cut-pooled' })} pooled cutoff</li>`,
].join('');
$('sweep-legend').innerHTML = [
  `<li>${swatch({ line: 'a-line', shape: 'circle', mark: 'a-mark' })} A, pooled</li>`,
  `<li>${swatch({ line: 'b-line', shape: 'triangle', mark: 'b-mark' })} B, pooled</li>`,
  `<li>${swatch({ line: 'ink-line', shape: 'square', mark: 'ink-mark' })} all, pooled</li>`,
  `<li>${swatch({ line: 'muted-line', shape: 'diamond', mark: 'hollow-mark' })} stratified, any group</li>`,
].join('');

sweepSelect.addEventListener('change', () => update({ sweep: /** @type {Params['sweep']} */ (sweepSelect.value) }));
logScale.addEventListener('change', () => renderSweep());
zoomSelect.addEventListener('change', () => renderDensity());
$('reset').addEventListener('click', () => {
  params = { ...DEFAULTS };
  showControls(params);
  update({});
});

// Dragging across the sweep chart sets the swept parameter, snapped to its slider's step.
const STEP = { meanDifference: 0.05, sdRatio: 0.01, proportionA: 0.01, z: 0.05 };
draggable(sweepBox, {
  onStart: (_target, x) => (sweepLayout && x >= sweepLayout.plot.left - 8 && x <= sweepLayout.plot.right + 8 ? 'scrub' : null),
  onMove: (_key, x) => {
    if (!sweepLayout) return;
    const p = params.sweep;
    const [lo, hi] = RANGES[p];
    const step = STEP[p];
    const raw = sweepLayout.x.invert(Math.max(sweepLayout.plot.left, Math.min(sweepLayout.plot.right, x)));
    const value = Math.min(hi, Math.max(lo, Math.round(raw / step) * step));
    const rounded = Number(value.toFixed(4));
    if (rounded === params[p]) return;
    update({ [p]: rounded });
    showControls(params);
  },
});

initTheme(/** @type {HTMLButtonElement} */ ($('theme-toggle')), render);
showControls(params);
onWidth(densityBox, renderDensity);
onWidth(sweepBox, renderSweep);
renderTable();

installApi({
  entry: ENTRY,
  load: (/** @type {import('./compute.js').Params} */ p) => {
    params = { ...p, sweep: p.sweep ?? params.sweep };
    result = compute(params);
    showControls(params);
    render();
  },
  getParams: () => ({ ...params }),
});
