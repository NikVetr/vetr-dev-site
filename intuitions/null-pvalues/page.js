// Page wiring for the null p-value lab: seven panels over compute(), each with its own
// controls and the same pair of figures, and one α for all of them. Closed-form panels
// compute on the page; Monte Carlo ones in a Web Worker, so a slider never freezes the
// page. Every number shown comes from compute.js.

import { formatNumber, formatRatio, formatShare } from '../lib/format.js';
import { bindPair, installApi, integerField, onWidth, setInvalid, workerRunner } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { swatch } from '../lib/plot.js';
import { compute, DEFAULTS, ENTRY, resolveParams, SCENARIOS } from './compute.js';
import { histogramFigure, histogramTop, rateFigure, ROLES } from './figure.js';

/** @typedef {import('./compute.js').Scenario} Scenario */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const count = (/** @type {number} */ v) => v.toLocaleString('en-US');
/** @type {Record<string, string>} */
const REMEDY = { 'effective-df': 'The effective-sample-size test', 'circular-shift': 'The circular-shift test', 'newey-west': 'The Newey–West test' };
/** A rate with its Monte Carlo error when it has one. @param {any} a */
const rate = (a) => (a.rejectionRate === null ? '—' : `${formatShare(a.rejectionRate)}${a.se ? ` <small>± ${formatShare(a.se)}</small>` : ''}`);
const plain = (/** @type {any} */ a) => (a.rejectionRate === null ? 'none' : formatShare(a.rejectionRate));
const key = (/** @type {'shortcut' | 'sound'} */ role) => swatch({ fill: ROLES[role].bar, shape: ROLES[role].shape, mark: ROLES[role].mark });

/** Scenarios that simulate, and the field that sets their size. */
const SIMULATED = /** @type {Record<string, 'replicates' | 'features'>} */ ({ stepwise: 'replicates', bootstrap: 'replicates', autocorrelation: 'replicates', 'two-step': 'features', pairing: 'replicates' });
const SIZE_MAX = { replicates: 100000, features: 100000 };

/** A panel's controls without α, which the page holds once for all of them. @param {Scenario} s */
const fresh = (s) => {
  const { alpha: _alpha, ...rest } = /** @type {Record<string, any>} */ (DEFAULTS[s]);
  return rest;
};
const state = {
  alpha: /** @type {number} */ (DEFAULTS.batch.alpha),
  scenario: /** @type {Scenario} */ ('batch'),
  panels: /** @type {Record<Scenario, Record<string, any>>} */ (Object.fromEntries(SCENARIOS.map((s) => [s, fresh(s)]))),
};
/** @type {Partial<Record<Scenario, any>>} */
const results = {};
const runners = Object.fromEntries(Object.keys(SIMULATED).map((s) => [s, workerRunner()]));

/** The request params a panel's controls describe. @param {Scenario} s */
const paramsFor = (s) => ({ scenario: s, alpha: state.alpha, ...state.panels[s] });

// Whichever panel was used last is the one window.Intuitions.getRequest() reports.
for (const s of SCENARIOS) {
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) $(s).addEventListener(type, () => { state.scenario = s; });
}

// ---------- The figure each panel shares ----------

for (const s of SCENARIOS) {
  $(`${s}-figure`).innerHTML = `
    <div class="hist-pair stale-dim">
      ${['shortcut', 'sound'].map((role) => `<div><p class="hist-title" id="${s}-${role}-title"></p><div id="${s}-${role}" class="plot-box"></div></div>`).join('')}
    </div>
    <div class="figure-head"><h3>Share of p-values at or below each threshold</h3></div>
    <ul class="legend" id="${s}-legend"></ul>
    <div id="${s}-rate" class="plot-box stale-dim"></div>
    <figcaption class="caption">Dashed: what a valid test gives. The marks on the vertical line are the false-positive rates at α. <a href="#reading">Reading the figures</a></figcaption>
    <p class="sim-status" id="${s}-status" aria-live="polite"></p>`;
}

/** Draws a panel's figures, titles and text from its last result. @param {Scenario} s */
function render(s) {
  const r = results[s];
  if (!r) return;
  const top = histogramTop([r.shortcut, r.sound]);
  for (const role of /** @type {const} */ (['shortcut', 'sound'])) {
    const a = r[role];
    $(`${s}-${role}-title`).innerHTML = `<span class="hist-name">${key(role)} ${a.name}</span><span class="hist-rate">${a.rejectionRate === null ? 'no p-values' : `${formatShare(a.rejectionRate)} at or below α`}</span>`;
    const box = $(`${s}-${role}`);
    const width = box.clientWidth;
    if (width > 0) box.innerHTML = a.count === 0 ? '<p class="hint empty-note">Nothing passed the first step, so there is nothing to test.</p>' : histogramFigure(a, role, { width, height: width < 260 ? 170 : 200, top, alpha: r.alpha });
  }
  $(`${s}-legend`).innerHTML = [
    `<li>${swatch({ line: ROLES.shortcut.line, shape: ROLES.shortcut.shape, mark: ROLES.shortcut.mark })} ${r.shortcut.name}</li>`,
    `<li>${swatch({ line: ROLES.sound.line, shape: ROLES.sound.shape, mark: ROLES.sound.mark })} ${r.sound.name}</li>`,
    `<li>${swatch({ line: 'ink-line dashed' })} a valid test</li>`,
  ].join('');
  const box = $(`${s}-rate`);
  if (box.clientWidth > 0) box.innerHTML = rateFigure(r, { width: box.clientWidth, height: box.clientWidth < 520 ? 250 : 290 });
  $(`${s}-readout`).innerHTML = READOUTS[s](r);
  $(`${s}-stats`).innerHTML = STATS[s](r).join('');
  $(`${s}-status`).textContent = statusText(s, r);
}

/** @param {Scenario} s @param {any} r */
function statusText(s, r) {
  if (s === 'enrichment') return `Exact. The Benjamini–Hochberg counts are from one sample of ${count(r.sample.pathways)} pathways, seed ${r.sample.seed}.`;
  if (!r.simulation) return 'Exact.';
  const size = r.simulation.features ? `${count(r.simulation.features)} simulated variants` : `${count(r.simulation.replicates)} replicates`;
  return `Monte Carlo: ${size}, seed ${r.simulation.seed}.${r.sound.method === 'exact' ? ' The sound analysis is exact.' : ''}`;
}

// ---------- Readouts ----------

/** @type {Record<Scenario, (r: any) => string>} */
const READOUTS = {
  batch: (r) => `Regressing the batch out first rejects a true null ${plain(r.shortcut)} of the time at α = ${r.alpha}, against ${plain(r.sound)} with the batch in the model: its <var>t</var> is ${formatNumber(r.tRatio, 3)} times the model's.${r.r2 > 0 ? ` The batches account for ${formatShare(r.r2)} of the treatment's variance.` : ''}`,
  stepwise: (r) => `After ${count(state.panels.stepwise.steps)} noise covariates are removed one at a time, the test of the treatment rejects a true null ${plain(r.shortcut)} of the time at α = ${r.alpha}. With all of them in one model it would reject exactly ${formatShare(r.alpha)}.`,
  bootstrap: (r) => `A <var>t</var>-test on ${count(state.panels.bootstrap.resamples)} bootstrap means rejects a true null ${plain(r.shortcut)} of the time at α = ${r.alpha}. The bootstrap distribution of the difference rejects ${plain(r.sound)}.`,
  autocorrelation: (r) => `With φ = ${state.panels.autocorrelation.phi}, the correlation of two unrelated series varies ${formatNumber(r.varianceInflation, 2)} times as much as ${state.panels.autocorrelation.naive === 'pearson' ? "Pearson's test" : "Fisher's z"} assumes, and it rejects ${plain(r.shortcut)} of the time at α = ${r.alpha}. ${REMEDY[state.panels.autocorrelation.fix]} rejects ${plain(r.sound)}.`,
  'two-step': (r) => (r.selected.shortcut === 0 && r.selected.sound === 0
    ? `None of the ${count(r.simulation.features)} variants passes the first step, by either group's test or by the pooled effect, so no interaction is tested.`
    : r.selected.shortcut === 0
    ? `None of the ${count(r.simulation.features)} variants pass the first step in either group, so the two-step analysis tests nothing. Filtering on the pooled effect keeps ${count(r.selected.sound)}, and their interaction test rejects ${plain(r.sound)} at α = ${r.alpha}.`
    : `Of ${count(r.simulation.features)} variants with no interaction, ${count(r.selected.shortcut)} pass the first step in either group, and the interaction test rejects ${plain(r.shortcut)} of those at α = ${r.alpha}; ${count(r.discoveries.shortcut)} survive Benjamini–Hochberg, all false. Filtering on the pooled effect keeps ${count(r.selected.sound)}, of which ${plain(r.sound)} are rejected.`),
  pairing: (r) => (state.panels.pairing.meanChange === 0
    ? `Ignoring the pairing, the two-sample test rejects a true null ${plain(r.shortcut)} of the time at α = ${r.alpha}: each person's two values correlate at ${formatNumber(r.correlation, 2)}, which it does not know. The paired test rejects ${plain(r.sound)}.`
    : `With a true mean change of ${state.panels.pairing.meanChange}, the paired test detects it ${plain(r.sound)} of the time at α = ${r.alpha} and the two-sample test ${plain(r.shortcut)}.`),
  enrichment: (r) => `${formatShare(r.nonEmptyShare)} of pathways hold at least one DE gene. Among them, ${plain(r.shortcut)} have p ≤ ${r.alpha}; among all pathways, ${plain(r.sound)}. In the sample, ${count(r.sample.nonEmpty)} of ${count(r.sample.pathways)} pathways have a hit, and Benjamini–Hochberg at ${r.alpha} finds ${count(r.sample.discoveries.shortcut)} among those and ${count(r.sample.discoveries.sound)} among all.`,
};

/** @type {Record<Scenario, (r: any) => string[]>} */
const STATS = {
  batch: (r) => [stat(`${key('shortcut')} Batch regressed out`, rate(r.shortcut)), stat(`${key('sound')} Batch in the model`, rate(r.sound)), stat('<var>t</var> inflated by', formatRatio(r.tRatio)), stat('Treatment variance from batch, <var>R</var>²', formatNumber(r.r2, 3))],
  stepwise: (r) => [stat(`${key('shortcut')} One at a time`, rate(r.shortcut)), stat(`${key('sound')} One model (exact)`, rate(r.sound)), stat('Final test df', String(r.df.final))],
  bootstrap: (r) => [stat(`${key('shortcut')} <var>t</var>-test on means`, rate(r.shortcut)), stat(`${key('sound')} Bootstrap difference`, rate(r.sound))],
  autocorrelation: (r) => [stat(`${key('shortcut')} ${r.shortcut.name}`, rate(r.shortcut)), stat(`${key('sound')} ${r.sound.name}`, rate(r.sound)), stat('Variance of <var>r</var>, times nominal', formatNumber(r.varianceInflation, 2))],
  'two-step': (r) => [stat(`${key('shortcut')} Kept by either group`, `${count(r.selected.shortcut)}`), stat('… interaction rejected', rate(r.shortcut)), stat(`${key('sound')} Kept by the pooled effect`, `${count(r.selected.sound)}`), stat('… interaction rejected', rate(r.sound))],
  pairing: (r) => [stat(`${key('shortcut')} Two-sample test`, rate(r.shortcut)), stat(`${key('sound')} Paired test`, rate(r.sound)), stat('Correlation of before and after', formatNumber(r.correlation, 2))],
  enrichment: (r) => [stat(`${key('shortcut')} Pathways with a hit`, rate(r.shortcut)), stat(`${key('sound')} All pathways`, rate(r.sound)), stat('Share of pathways with a hit', formatShare(r.nonEmptyShare)),
    stat('Sample: BH discoveries with a hit', count(r.sample.discoveries.shortcut)), stat('… among all', count(r.sample.discoveries.sound))],
};

// ---------- Computing ----------

/** Shows a request's issues against the panel's fields, or clears them. @param {Scenario} s @param {import('../lib/params.js').Issue[]} issues */
function showIssues(s, issues) {
  const box = $(`${s}-issues`);
  for (const field of /** @type {NodeListOf<HTMLInputElement>} */ ($(s).querySelectorAll('.panel-side input[type="number"]'))) {
    if (field.id !== 'alpha') setInvalid(field, false);
  }
  box.hidden = !issues.length;
  box.innerHTML = issues.map((issue) => {
    const field = issue.path.replace(/^params\./, '');
    const target = document.getElementById(`${s}-${field}-number`) ?? document.getElementById(`${s}-${field}`);
    if (target) setInvalid(target, true);
    return `<p>${issue.message.replace(/-(?=\d)/g, '−')}.</p>`;
  }).join('');
}

/** Recomputes a panel from its controls. @param {Scenario} s */
function update(s) {
  const figure = $(`${s}-figure`);
  let params;
  try {
    params = resolveParams(paramsFor(s));
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    showIssues(s, error.issues);
    figure.dataset.stale = 'true';
    return;
  }
  showIssues(s, []);
  if (!SIMULATED[s]) {
    results[s] = compute(params);
    delete figure.dataset.stale;
    render(s);
    return;
  }
  figure.dataset.stale = 'true';
  const size = /** @type {Record<string, any>} */ (params)[SIMULATED[s]];
  $(`${s}-status`).textContent = `Simulating ${count(size)} ${SIMULATED[s] === 'features' ? 'variants' : 'replicates'}…`;
  runners[s].run({ entry: ENTRY, params }).then((response) => {
    results[s] = response.result;
    delete figure.dataset.stale;
    render(s);
  });
}

// ---------- Controls ----------

/**
 * A slider-and-number pair for one numeric field of a panel.
 * @param {Scenario} s @param {string} field
 * @param {{ decimals?: number, integer?: boolean, log?: boolean }} [options]
 */
function pair(s, field, { decimals = 0, integer = decimals === 0, log = false } = {}) {
  return bindPair({
    range: input(`${s}-${field}-range`), number: input(`${s}-${field}-number`), decimals, integer,
    ...(log ? { toRange: (/** @type {number} */ v) => Math.log10(v), fromRange: (/** @type {number} */ p) => Math.round(10 ** p) } : {}),
    onInput: (v) => { state.panels[s][field] = v; update(s); },
  });
}

/** @type {Record<Scenario, Record<string, { set: (v: number) => void }>>} */
const pairs = {
  batch: { perBatch: pair('batch', 'perBatch'), batches: pair('batch', 'batches'), treatedShare: pair('batch', 'treatedShare', { decimals: 2 }) },
  stepwise: { n: pair('stepwise', 'n'), steps: pair('stepwise', 'steps') },
  bootstrap: { n: pair('bootstrap', 'n'), resamples: pair('bootstrap', 'resamples', { log: true }) },
  autocorrelation: { n: pair('autocorrelation', 'n'), phi: pair('autocorrelation', 'phi', { decimals: 2 }) },
  'two-step': { n: pair('two-step', 'n'), effect: pair('two-step', 'effect', { decimals: 2 }), q: pair('two-step', 'q', { decimals: 3 }) },
  pairing: {
    pairs: pair('pairing', 'pairs'), betweenSD: pair('pairing', 'betweenSD', { decimals: 2 }), changeSD: pair('pairing', 'changeSD', { decimals: 2 }),
    noiseSD: pair('pairing', 'noiseSD', { decimals: 2 }), meanChange: pair('pairing', 'meanChange', { decimals: 2 }),
  },
  enrichment: { genes: pair('enrichment', 'genes', { log: true }), de: pair('enrichment', 'de', { log: true }) },
};

/** Radio groups: name `${scenario}-${field}`. */
const RADIOS = { stepwise: ['finalDf'], autocorrelation: ['naive', 'fix'] };
for (const [s, fields] of Object.entries(RADIOS)) {
  for (const field of fields) {
    for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(`input[name="${s}-${field}"]`))) {
      radio.addEventListener('change', () => { state.panels[/** @type {Scenario} */ (s)][field] = radio.value; update(/** @type {Scenario} */ (s)); });
    }
  }
}

// The simulation size and seed of each Monte Carlo panel, with a button for ten times more.
for (const [s, size] of Object.entries(SIMULATED)) {
  const sc = /** @type {Scenario} */ (s);
  const box = /** @type {HTMLElement} */ (document.querySelector(`[data-sim="${s}"]`));
  box.innerHTML = `
    <div class="control-head">
      <label for="${s}-${size}">${size === 'features' ? 'Variants simulated' : 'Replicates simulated'}</label>
      <input id="${s}-${size}" type="number" min="100" max="${SIZE_MAX[size]}" step="100">
    </div>
    <div class="control-row">
      <button type="button" id="${s}-more">10× more</button>
      <label for="${s}-seed">Seed</label>
      <input id="${s}-seed" type="number" min="0" max="4294967295" step="1">
      <button type="button" id="${s}-new-seed">New seed</button>
    </div>`;
  integerField(input(`${s}-${size}`), (v) => { state.panels[sc][size] = v; showSim(sc); update(sc); });
  integerField(input(`${s}-seed`), (v) => { state.panels[sc].seed = v; update(sc); });
  $(`${s}-more`).addEventListener('click', () => {
    state.panels[sc][size] = Math.min(SIZE_MAX[size], state.panels[sc][size] * 10);
    showSim(sc);
    update(sc);
  });
  $(`${s}-new-seed`).addEventListener('click', () => {
    state.panels[sc].seed = (state.panels[sc].seed + 1) % 4294967296;
    showSim(sc);
    update(sc);
  });
}

/** @param {Scenario} s */
function showSim(s) {
  const size = SIMULATED[s];
  if (!size) return;
  input(`${s}-${size}`).value = String(state.panels[s][size]);
  input(`${s}-seed`).value = String(state.panels[s].seed);
  setInvalid(input(`${s}-${size}`), false);
  /** @type {HTMLButtonElement} */ ($(`${s}-more`)).disabled = state.panels[s][size] >= SIZE_MAX[size];
}

for (const field of ['minSize', 'maxSize', 'pathways', 'seed']) {
  integerField(input(`enrichment-${field}`), (v) => { state.panels.enrichment[field] = v; update('enrichment'); });
}
$('enrichment-new-seed').addEventListener('click', () => {
  state.panels.enrichment.seed = (state.panels.enrichment.seed + 1) % 4294967296;
  input('enrichment-seed').value = String(state.panels.enrichment.seed);
  update('enrichment');
});

/** Puts a panel's state into its controls. @param {Scenario} s */
function showControls(s) {
  const p = state.panels[s];
  for (const [field, control] of Object.entries(pairs[s])) control.set(p[field]);
  for (const field of /** @type {Record<string, string[]>} */ (RADIOS)[s] ?? []) {
    for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(`input[name="${s}-${field}"]`))) radio.checked = radio.value === p[field];
  }
  if (s === 'enrichment') for (const field of ['minSize', 'maxSize', 'pathways', 'seed']) input(`enrichment-${field}`).value = String(p[field]);
  showSim(s);
}

for (const s of SCENARIOS) {
  $(`${s}-reset`).addEventListener('click', () => {
    state.panels[s] = fresh(s);
    showControls(s);
    update(s);
  });
  for (const role of ['shortcut', 'sound']) onWidth($(`${s}-${role}`), () => render(s));
  onWidth($(`${s}-rate`), () => render(s));
}

const alphaField = input('alpha');
alphaField.addEventListener('input', () => {
  const v = Number(alphaField.value);
  const ok = alphaField.value.trim() !== '' && v >= 0.0001 && v <= 0.5;
  setInvalid(alphaField, !ok);
  if (!ok) return;
  state.alpha = v;
  for (const s of SCENARIOS) update(s);
});

// ---------- Start ----------

alphaField.value = String(state.alpha);
for (const s of SCENARIOS) {
  showControls(s);
  update(s);
}

installApi({
  entry: ENTRY,
  load: (/** @type {any} */ p, /** @type {any} */ result) => {
    const { scenario, alpha, ...rest } = p;
    const s = /** @type {Scenario} */ (scenario);
    state.scenario = s;
    state.panels[s] = rest;
    showControls(s);
    showIssues(s, []);
    results[s] = result;
    delete $(`${s}-figure`).dataset.stale;
    render(s);
    if (alpha !== state.alpha) {
      state.alpha = alpha;
      alphaField.value = String(alpha);
      for (const other of SCENARIOS) if (other !== s) update(other);
    }
    $(s).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor(state.scenario)),
});
