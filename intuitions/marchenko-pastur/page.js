// Page wiring for Marchenko–Pastur: three panels over compute(), each simulated in its
// own Web Worker so that dragging a slider never freezes the page. Every number shown
// comes from compute.js.

import { formatNumber, formatShare } from '../lib/format.js';
import { bindPair, installApi, integerField, onWidth, setInvalid, workerRunner } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { swatch } from '../lib/plot.js';
import { DEFAULTS, ENTRY, resolveParams, VIEWS } from './compute.js';
import { binValues, differenceFigure, indexFigure, scatterFigure, screeFigure, spectrumFigure, transitionFigure } from './figure.js';

/** @typedef {import('./compute.js').View} View */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const count = (/** @type {number} */ v) => v.toLocaleString('en-US');
const SPIKE_SLOTS = 3;
const MAX_REPLICATES = { noise: 5000, spikes: 2000 };

/** A panel's controls; the spike view keeps three slots, 0 for an empty one. @param {View} v */
const fresh = (v) => {
  const d = /** @type {Record<string, any>} */ (DEFAULTS[v]);
  if (v !== 'spikes') return { ...d };
  return { ...d, spikes: Array.from({ length: SPIKE_SLOTS }, (_, i) => d.spikes[i] ?? 0) };
};
const state = { view: /** @type {View} */ ('noise'), panels: /** @type {Record<View, Record<string, any>>} */ (Object.fromEntries(VIEWS.map((v) => [v, fresh(v)]))) };
/** @type {Partial<Record<View, any>>} */
const results = {};
const runners = Object.fromEntries(VIEWS.map((v) => [v, workerRunner()]));

/** The request params a panel's controls describe (empty spike slots left out). @param {View} v */
function paramsFor(v) {
  const p = state.panels[v];
  return v === 'spikes' ? { view: v, ...p, spikes: p.spikes.filter((/** @type {number} */ s) => s > 0) } : { view: v, ...p };
}

for (const v of VIEWS) {
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) $(v).addEventListener(type, () => { state.view = v; });
}

// ---------- Drawing ----------

/** @param {string} id @param {(width: number) => string} draw */
function drawInto(id, draw) {
  const box = $(id);
  if (box.clientWidth > 0) box.innerHTML = draw(box.clientWidth);
}

/** @type {Record<View, (r: any) => void>} */
const RENDER = {
  noise: (r) => {
    drawInto('noise-spectrum', (w) => spectrumFigure({ histogram: r.sample.histogram, curve: r.curve, edges: r.edges, variance: state.panels.noise.variance, zeroShare: r.zeroShare }, { width: w, height: w < 520 ? 250 : 290 }));
    drawInto('noise-index', (w) => indexFigure(r, { width: w, height: w < 520 ? 230 : 260 }));
    const l = r.sample.largest;
    $('noise-readout').innerHTML = `With <var>n</var> = ${count(state.panels.noise.n)} observations of <var>p</var> = ${count(state.panels.noise.p)} variables, every one of variance ${state.panels.noise.variance}, the sample eigenvalues spread from ${formatNumber(r.zeroShare > 0 ? 0 : r.edges.lower, 3)} to ${formatNumber(r.edges.upper, 3)}. The largest averages ${formatNumber(l.mean, 3)}, and in ${formatShare(l.aboveEdge)} of the samples it lies beyond the upper edge, so an eigenvalue just past the edge is weak evidence of anything.`;
    $('noise-stats').innerHTML = [
      stat('γ = <var>p</var>/(<var>n</var> − 1)', formatNumber(r.gamma, 3)),
      stat('Edges, σ²(1 ∓ √γ)²', `${formatNumber(r.edges.lower, 3)} to ${formatNumber(r.edges.upper, 3)}`),
      stat('Largest eigenvalue, 5–95%', `${formatNumber(l.lo, 3)} to ${formatNumber(l.hi, 3)}`),
      stat('Samples with the largest past the edge', formatShare(l.aboveEdge)),
      r.zeroShare > 0 ? stat('Eigenvalues exactly 0', formatShare(r.zeroShare)) : '',
    ].join('');
    $('noise-status').textContent = `Monte Carlo: ${count(r.sample.replicates)} samples, seed ${r.sample.seed}. The law is exact.`;
  },
  spikes: (r) => {
    $('spikes-legend').innerHTML = [
      `<li>${swatch({ fill: 'hist-bar' })} one sample's eigenvalues</li>`,
      `<li>${swatch({ line: 'ink-line' })} the law, and the limits</li>`,
      `<li>${swatch({ shape: 'triangle', mark: 'b-mark' })} spike past the threshold</li>`,
      `<li>${swatch({ shape: 'triangle', mark: 'hollow-b' })} spike below it</li>`,
    ].join('');
    const first = r.sample.first.filter((/** @type {number} */ v) => v > 0);
    const top = Math.max(r.edges.upper * 1.12, ...first) * 1.02;
    const marks = r.spikes.map((/** @type {any} */ s, /** @type {number} */ k) => ({ x: r.sample.first[k], detectable: s.detectable }));
    drawInto('spikes-spectrum', (w) => spectrumFigure({ histogram: binValues(first, top, 50, 1 - r.zeroShare), curve: r.curve, edges: r.edges, variance: 1, zeroShare: r.zeroShare, marks }, { width: w, height: w < 520 ? 230 : 260 }));
    drawInto('spikes-eigenvalue', (w) => transitionFigure(r, 'eigenvalue', { width: w, height: w < 520 ? 240 : 270 }));
    drawInto('spikes-overlap', (w) => transitionFigure(r, 'overlap', { width: w, height: w < 520 ? 200 : 220 }));
    const parts = [`γ = ${formatNumber(r.gamma, 3)}, so a spike must exceed √γ = ${formatNumber(r.threshold, 3)} to leave the bulk, whose upper edge is ${formatNumber(r.edges.upper, 3)}.`];
    for (const s of r.spikes) {
      parts.push(s.detectable
        ? `θ = ${s.strength} (population ${formatNumber(s.population, 2)}) comes out at ${formatNumber(s.sample.median, 2)}, near its limit ${formatNumber(s.eigenvalue, 2)}, with its eigenvector at a squared cosine of ${formatNumber(s.sample.overlap, 2)} to the truth.`
        : `θ = ${s.strength} stays in the bulk (median ${formatNumber(s.sample.median, 2)}), and its eigenvector's squared cosine to the truth is only ${formatNumber(s.sample.overlap, 2)}.`);
    }
    if (!r.spikes.length) parts.push('With no spikes, every eigenvalue is noise.');
    $('spikes-readout').innerHTML = parts.join(' ');
    $('spikes-stats').innerHTML = [
      stat('Threshold √γ', formatNumber(r.threshold, 3)),
      stat('Upper edge', formatNumber(r.edges.upper, 3)),
      ...r.spikes.map((/** @type {any} */ s) => stat(`θ = ${s.strength}: ${s.detectable ? '▲ leaves the bulk' : '△ stays in it'}`, `${formatNumber(s.sample.median, 2)} <small>limit ${formatNumber(s.eigenvalue, 2)}</small>`)),
    ].join('');
    $('spikes-status').textContent = `Monte Carlo: ${count(r.sample.replicates)} samples, seed ${r.sample.seed}. The limits are exact.`;
  },
  pcs: (r) => {
    $('pcs-legend').innerHTML = `<li>${swatch({ shape: 'circle', mark: 'a-mark' })} batch 1</li><li>${swatch({ shape: 'triangle', mark: 'b-mark' })} batch 2</li>`;
    const size = (/** @type {number} */ w) => ({ width: w, height: Math.min(w, 300) });
    drawInto('pcs-before', (w) => scatterFigure(r.uncorrected.scores, r.batch, { ...size(w), label: `The samples on the first two principal components as measured: the batches are ${formatNumber(Math.abs(r.uncorrected.batchDifference[0]), 2)} SDs apart on PC 1.` }));
    drawInto('pcs-after', (w) => scatterFigure(r.corrected.scores, r.batch, { ...size(w), label: 'The samples on the first two principal components after the batch is regressed out: the batches overlap.' }));
    drawInto('pcs-difference', (w) => differenceFigure(r, { width: w, height: 200 }));
    drawInto('pcs-scree', (w) => screeFigure(r, { width: w, height: w < 520 ? 240 : 270 }));
    const v = r.variance;
    const total = v.factors + v.interactions + v.batch + v.noise;
    const p = state.panels.pcs;
    $('pcs-readout').innerHTML = `The batch is ${formatShare(v.batch / total)} of each feature's variance, yet on the first component the batches are ${formatNumber(Math.abs(r.uncorrected.batchDifference[0]), 2)} SDs apart: its shift, shared by all ${count(p.p)} features, adds up to a spike of about ${formatNumber((v.batch * p.p), 0)} against ${formatNumber(p.p, 0)} for each factor. ${count(r.uncorrected.aboveEdge)} eigenvalues lie above the noise's edge of ${formatNumber(r.edges.upper, 1)} as measured, and ${count(r.corrected.aboveEdge)} with the batch regressed out.`;
    $('pcs-stats').innerHTML = [
      stat('PC 1, batch difference', `${formatNumber(Math.abs(r.uncorrected.batchDifference[0]), 2)} SD`),
      stat('After regressing it out', `${formatNumber(Math.abs(r.corrected.batchDifference[0]), 2)} SD`),
      stat('Batch share of a feature\'s variance', formatShare(v.batch / total)),
      stat('Eigenvalues above the noise edge', `${count(r.uncorrected.aboveEdge)} <small>then ${count(r.corrected.aboveEdge)}</small>`),
    ].join('');
    $('pcs-status').textContent = `One simulated data set, seed ${p.seed}.`;
  },
};

/** @param {View} v */
function render(v) {
  if (results[v]) RENDER[v](results[v]);
}

// ---------- Computing ----------

/** @param {View} v @param {import('../lib/params.js').Issue[]} issues */
function showIssues(v, issues) {
  const box = $(`${v}-issues`);
  for (const field of /** @type {NodeListOf<HTMLInputElement>} */ ($(v).querySelectorAll('.panel-side input[type="number"]'))) setInvalid(field, false);
  box.hidden = !issues.length;
  box.innerHTML = issues.map((issue) => {
    const path = issue.path.replace(/^params\./, '').replace(/^spikes\[(\d+)\]$/, 's$1');
    const target = document.getElementById(`${v}-${path}-number`) ?? document.getElementById(`${v}-${path}`);
    if (target) setInvalid(target, true);
    return `<p>${issue.message.replace(/-(?=\d)/g, '−')}.</p>`;
  }).join('');
}

/** @param {View} v */
function update(v) {
  const figure = $(`${v}-figures`);
  let params;
  try {
    params = resolveParams(paramsFor(v));
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    showIssues(v, error.issues);
    figure.dataset.stale = 'true';
    return;
  }
  showIssues(v, []);
  figure.dataset.stale = 'true';
  $(`${v}-status`).textContent = v === 'pcs' ? 'Simulating…' : `Simulating ${count(/** @type {any} */ (params).replicates)} samples…`;
  runners[v].run({ entry: ENTRY, params }).then((response) => {
    results[v] = response.result;
    delete figure.dataset.stale;
    render(v);
  });
}

// ---------- Controls ----------

/**
 * @param {View} v @param {string} field
 * @param {{ decimals?: number, log?: boolean, set?: (value: number) => void }} [options]
 */
function pair(v, field, { decimals = 0, log = false, set } = {}) {
  return bindPair({
    range: input(`${v}-${field}-range`), number: input(`${v}-${field}-number`), decimals, integer: decimals === 0,
    ...(log ? { toRange: (/** @type {number} */ x) => Math.log10(x), fromRange: (/** @type {number} */ q) => Math.round(10 ** q) } : {}),
    onInput: (value) => {
      if (set) set(value);
      else state.panels[v][field] = value;
      update(v);
    },
  });
}

/** @type {Record<View, Record<string, { set: (v: number) => void }>>} */
const pairs = {
  noise: { n: pair('noise', 'n', { log: true }), p: pair('noise', 'p', { log: true }), variance: pair('noise', 'variance', { decimals: 2 }) },
  spikes: {
    n: pair('spikes', 'n', { log: true }),
    p: pair('spikes', 'p', { log: true }),
    ...Object.fromEntries(Array.from({ length: SPIKE_SLOTS }, (_, i) => [`s${i}`, pair('spikes', `s${i}`, { decimals: 2, set: (value) => { state.panels.spikes.spikes[i] = value; } })])),
  },
  pcs: {
    n: pair('pcs', 'n'), p: pair('pcs', 'p', { log: true }), factors: pair('pcs', 'factors'),
    batchVariance: pair('pcs', 'batchVariance', { decimals: 1 }), noiseVariance: pair('pcs', 'noiseVariance', { decimals: 2 }),
  },
};

for (const v of /** @type {const} */ (['noise', 'spikes'])) {
  const box = /** @type {HTMLElement} */ (document.querySelector(`[data-sim="${v}"]`));
  box.innerHTML = `
    <div class="control-head">
      <label for="${v}-replicates">Samples simulated</label>
      <input id="${v}-replicates" type="number" min="1" max="${MAX_REPLICATES[v]}" step="10">
    </div>
    <div class="control-row">
      <button type="button" id="${v}-more">10× more</button>
      <label for="${v}-seed">Seed</label>
      <input id="${v}-seed" type="number" min="0" max="4294967295" step="1">
      <button type="button" id="${v}-new-seed">New seed</button>
    </div>`;
  integerField(input(`${v}-replicates`), (value) => { state.panels[v].replicates = value; showSim(v); update(v); });
  $(`${v}-more`).addEventListener('click', () => {
    state.panels[v].replicates = Math.min(MAX_REPLICATES[v], state.panels[v].replicates * 10);
    showSim(v);
    update(v);
  });
}
for (const v of VIEWS) {
  integerField(input(`${v}-seed`), (value) => { state.panels[v].seed = value; update(v); });
  $(`${v}-new-seed`).addEventListener('click', () => {
    state.panels[v].seed = (state.panels[v].seed + 1) % 4294967296;
    input(`${v}-seed`).value = String(state.panels[v].seed);
    update(v);
  });
}
input('pcs-interactions').addEventListener('change', () => { state.panels.pcs.interactions = input('pcs-interactions').checked; update('pcs'); });

/** @param {View} v */
function showSim(v) {
  if (v === 'pcs') return;
  const max = MAX_REPLICATES[v];
  input(`${v}-replicates`).value = String(state.panels[v].replicates);
  setInvalid(input(`${v}-replicates`), false);
  /** @type {HTMLButtonElement} */ ($(`${v}-more`)).disabled = state.panels[v].replicates >= max;
}

/** @param {View} v */
function showControls(v) {
  const p = state.panels[v];
  for (const [field, control] of Object.entries(pairs[v])) control.set(/^s\d$/.test(field) ? p.spikes[Number(field.slice(1))] : p[field]);
  input(`${v}-seed`).value = String(p.seed);
  if (v === 'pcs') input('pcs-interactions').checked = p.interactions;
  showSim(v);
}

const BOXES = { noise: ['noise-spectrum', 'noise-index'], spikes: ['spikes-spectrum', 'spikes-eigenvalue', 'spikes-overlap'], pcs: ['pcs-before', 'pcs-after', 'pcs-difference', 'pcs-scree'] };
for (const v of VIEWS) {
  $(`${v}-reset`).addEventListener('click', () => {
    state.panels[v] = fresh(v);
    showControls(v);
    update(v);
  });
  for (const id of BOXES[v]) onWidth($(id), () => render(v));
}

// ---------- Start ----------

for (const v of VIEWS) {
  showControls(v);
  update(v);
}

installApi({
  entry: ENTRY,
  load: (/** @type {any} */ p, /** @type {any} */ result) => {
    const { view, ...rest } = p;
    const v = /** @type {View} */ (view);
    state.view = v;
    // A request may carry up to five spikes; the page has three slots, keeps the strongest
    // and recomputes for them.
    const trimmed = v === 'spikes' && rest.spikes.length > SPIKE_SLOTS;
    state.panels[v] = v === 'spikes' ? { ...rest, spikes: Array.from({ length: SPIKE_SLOTS }, (_, i) => [...rest.spikes].sort((a, b) => b - a)[i] ?? 0) } : rest;
    showControls(v);
    if (trimmed) update(v);
    else {
      showIssues(v, []);
      results[v] = result;
      delete $(`${v}-figures`).dataset.stale;
      render(v);
    }
    $(v).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor(state.view)),
});
