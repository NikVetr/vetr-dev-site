// Page wiring for the samplers: three panels, each run in its own Web Worker. A chain is
// shown whole when it arrives; Play replays it from the start, iteration by iteration, with
// each HMC trajectory drawn step by step. Every number shown comes from compute.js.

import { formatNumber, formatShare } from '../lib/format.js';
import { bindPair, installApi, integerField, onWidth, playback, setInvalid, workerRunner } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { swatch } from '../lib/plot.js';
import { DEFAULTS, ENTRY, funnelSpace, logNormalDensity, marginalDensities, normalSpace, resolveParams, smileySpace, STEPS, VIEWS } from './compute.js';
import { chainFigure, chainLayer, histogramFigure, settledContours, traceFigure } from './figure.js';

/** @typedef {import('./compute.js').View} View */
/** @typedef {[number, number]} Point */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const count = (/** @type {number} */ v) => v.toLocaleString('en-US');
const num = (/** @type {number} */ v, d = 2) => formatNumber(v, d);
const ess = (/** @type {number | null} */ v) => (v === null ? '—' : count(Math.round(v)));
const PER_SECOND = 5;
const MAX_PAGE_ITERATIONS = 10000;

/** A panel's controls: its defaults, with the step its sampler uses by default. @param {View} v */
const fresh = (v) => {
  const d = /** @type {Record<string, any>} */ ({ ...DEFAULTS[v] });
  d.start = [...d.start];
  d.step = v === 'hastings' ? d.step : STEPS[/** @type {'rwm' | 'hmc'} */ (d.sampler)];
  return d;
};
const state = { view: /** @type {View} */ ('funnel'), panels: /** @type {Record<View, Record<string, any>>} */ (Object.fromEntries(VIEWS.map((v) => [v, fresh(v)]))) };
/** @type {Partial<Record<View, { params: any, result: any }>>} */
const results = {};
const runners = Object.fromEntries(VIEWS.map((v) => [v, workerRunner()]));
for (const v of VIEWS) {
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) $(v).addEventListener(type, () => { state.view = v; });
}

// ---------- Drawing ----------

/** The plotted window of each space. @param {any} p @returns {{ x: [number, number], y: [number, number] }} */
function domainOf(p, space = false) {
  if (p.view === 'funnel') {
    if (space && p.coordinates === 'non-centred') return { x: [-3.6, 3.6], y: [-3.6, 3.6] };
    if (space && p.coordinates === 'quantile') return { x: [-5.5, 5.5], y: [-5.5, 5.5] };
    const X = 1.96 * Math.exp(1.645 * p.sdY);
    return { x: [-X, X], y: [-3 * p.sdY, 3 * p.sdY] };
  }
  if (p.view === 'hastings') {
    const top = Math.exp(2.8 * p.sd);
    return { x: [0, top], y: [0, top] };
  }
  if (p.target === 'normal') return { x: [-2, 8], y: [-4.8, 1.8] };
  return { x: [-3.6, 3.6], y: [-2.5, 8] };
}

/** @type {Record<string, { x: any, y: any, chain: any }>} */
const drawn = {};

/**
 * Draws a chain figure's still part into a box and remembers its scales.
 * @param {string} id @param {any} options @param {any} chain
 */
function drawChain(id, options, chain) {
  const box = $(id);
  const width = box.clientWidth;
  if (width <= 0) return;
  const height = Math.round(Math.max(260, Math.min(420, width * (options.tall ? 0.95 : 0.8))));
  const fig = chainFigure({ ...options, width, height, id });
  box.innerHTML = fig.svg;
  drawn[id] = { x: fig.x, y: fig.y, chain };
}

/** Redraws the moving part of a chain figure. @param {string} id @param {number} t */
function moveChain(id, t) {
  const d = drawn[id];
  const group = document.getElementById(`${id}-chain`);
  if (d && group) group.innerHTML = chainLayer(d.chain, d.x, d.y, t);
}

/** @param {string} id @param {(width: number) => string} draw */
function drawInto(id, draw) {
  const box = $(id);
  if (box.clientWidth > 0) box.innerHTML = draw(box.clientWidth);
}

const LABELS = {
  centred: ['x', 'y'], 'non-centred': ['x raw = x e⁻ʸ', 'y raw = y/σ'], quantile: ['logit Φ(x e⁻ʸ)', 'logit Φ(y/σ)'],
};

function legend(/** @type {View} */ v, /** @type {any} */ r) {
  const items = [
    `<li>${swatch({ shape: 'circle', mark: 'current-mark' })} the chain now</li>`,
    `<li>${swatch({ line: 'chain-path' })} its path</li>`,
    r.trajectories ? `<li>${swatch({ line: 'trajectory', shape: 'circle', mark: 'move-mark' })} a trajectory, accepted</li><li>${swatch({ line: 'trajectory rejected', shape: 'circle', mark: 'move-hollow' })} rejected</li>`
      : r.proposals ? `<li>${swatch({ line: 'proposal', shape: 'circle', mark: 'move-mark' })} a proposal, accepted</li><li>${swatch({ line: 'proposal rejected', shape: 'circle', mark: 'move-hollow' })} rejected</li>` : '',
    r.trajectories ? `<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><path d="M9 3L17 11M9 11L17 3" class="divergent-mark"/></svg> divergent</li>` : '',
    v === 'hastings' && r.exact.settled.shift !== 0 ? `<li>${swatch({ line: 'settled-contour' })} where this chain settles</li>` : '',
  ];
  $(`${v}-legend`).innerHTML = items.join('');
}

/** @type {Record<View, () => void>} */
const RENDER = {
  funnel: () => {
    const entry = results.funnel;
    if (!entry) return;
    const { params: p, result: r } = entry;
    const centred = p.coordinates === 'centred';
    $('funnel-space-block').hidden = centred;
    $('funnel-row').classList.toggle('single', centred);
    const target = { a: r.draws.x, b: r.draws.y, accepted: r.accepted, divergent: r.divergent, trajectories: centred ? r.trajectories : null, proposals: centred ? r.proposals : null };
    drawChain('funnel-target', { domain: domainOf(p), walls: 0, xLabel: 'x', yLabel: 'y', tall: true, label: `Neal's funnel with σ = ${p.sdY}, and the chain's path through it.` }, target);
    if (!centred) {
      const [xl, yl] = LABELS[/** @type {'non-centred' | 'quantile'} */ (p.coordinates)];
      $('funnel-space-title').textContent = p.coordinates === 'quantile' ? 'Where the sampler moves: the quantiles, on the logit scale' : 'Where the sampler moves: two standard normals';
      drawChain('funnel-space', { domain: domainOf(p, true), logDensity: funnelSpace(p.coordinates, p.sdY).logDensity, xLabel: xl, yLabel: yl, tall: true, label: `The funnel in ${p.coordinates} coordinates, a round target, and the chain's path through it.` },
        { a: r.space.a, b: r.space.b, accepted: r.accepted, divergent: r.divergent, trajectories: r.trajectories, proposals: r.proposals });
    }
    legend('funnel', r);
    describe('funnel');
    showTime('funnel', players.funnel.time);
  },
  hastings: () => {
    const entry = results.hastings;
    if (!entry) return;
    const { params: p, result: r } = entry;
    const domain = domainOf(p);
    // The chain is stored as log x; the figure is in x.
    drawChain('hastings-plot', { domain, logDensity: logNormalDensity(p.sd, p.correlation), xLabel: 'x₁', yLabel: 'x₂', label: `A log-normal pair (log SD ${p.sd}, correlation ${p.correlation}) and a multiplier chain through it, its Hastings ratio ${p.correction === 'correct' ? 'included' : p.correction === 'missing' ? 'left out' : 'reversed'}.` },
      { a: r.draws.x, b: r.draws.y, accepted: r.accepted, divergent: [], trajectories: null, proposals: r.proposals ? { a: r.proposals.a.map(Math.exp), b: r.proposals.b.map(Math.exp) } : null });
    const shift = r.exact.settled.shift;
    const group = document.getElementById('hastings-plot-settled');
    const d = drawn['hastings-plot'];
    if (group && d && shift !== 0) group.innerHTML = settledContours({ x: d.x, y: d.y, domain, logDensity: logNormalDensity(p.sd, p.correlation, shift) });
    legend('hastings', r);
    describe('hastings');
    showTime('hastings', players.hastings.time);
  },
  target: () => {
    const entry = results.target;
    if (!entry) return;
    const { params: p, result: r } = entry;
    const space = p.target === 'normal' ? normalSpace() : smileySpace();
    drawChain('target-plot', { domain: domainOf(p), logDensity: space.logDensity, xLabel: 'x', yLabel: 'y', label: `${p.target === 'normal' ? 'MCMC_Demo.R\'s correlated normal' : 'The evil smiley'} and the chain's path through it.` },
      { a: r.draws.x, b: r.draws.y, accepted: r.accepted, divergent: r.divergent, trajectories: r.trajectories, proposals: r.proposals });
    legend('target', r);
    describe('target');
    showTime('target', players.target.time);
  },
};

/** The iteration shown, and the moving figures at it. @param {View} v @param {number} t */
function showTime(v, t) {
  const entry = results[v];
  if (!entry) return;
  const { params: p, result: r } = entry;
  const dens = marginalDensities(p);
  if (v === 'funnel') {
    moveChain('funnel-target', t);
    if (p.coordinates !== 'centred') moveChain('funnel-space', t);
    const q = r.exact.y.quantiles;
    const range = /** @type {[number, number]} */ ([-3.2 * p.sdY, 3.2 * p.sdY]);
    drawInto('funnel-trace', (w) => traceFigure(r.draws.y, { width: w, height: 200, t, range, id: 'funnel-trace', yLabel: 'y', quantiles: [{ value: q.q05, label: '5%' }, { value: q.q50, label: '50%' }, { value: q.q95, label: '95%' }], label: 'The chain\'s y at each iteration, against y\'s exact 5%, 50% and 95% quantiles.' }));
    drawInto('funnel-hist', (w) => histogramFigure(r.draws.y, { width: w, height: 200, t, range, density: dens.y, xLabel: 'y', label: 'A histogram of the chain\'s y so far, against y\'s exact normal density.' }));
  } else if (v === 'hastings') {
    moveChain('hastings-plot', t);
    const top = Math.exp(2.8 * p.sd);
    drawInto('hastings-hist', (w) => histogramFigure(r.draws.x, { width: w, height: 210, t, range: [0, top], density: dens.x, settled: dens.settled?.x ?? null, xLabel: 'x₁', label: 'A histogram of the chain\'s first coordinate so far, against the log-normal it should follow and the one it settles on.' }));
  } else {
    moveChain('target-plot', t);
    const domain = domainOf(p);
    drawInto('target-hist-x', (w) => histogramFigure(r.draws.x, { width: w, height: 190, t, range: domain.x, density: dens.x, xLabel: 'x', label: 'A histogram of the chain\'s x so far, against its exact marginal density.' }));
    drawInto('target-hist-y', (w) => histogramFigure(r.draws.y, { width: w, height: 190, t, range: domain.y, density: dens.y, xLabel: 'y', label: 'A histogram of the chain\'s y so far, against its exact marginal density.' }));
  }
}

/** The readout and the numbers. @param {View} v */
function describe(v) {
  const entry = results[v];
  if (!entry) return;
  const { params: p, result: r } = entry;
  const s = r.stats;
  const n = p.iterations;
  const hmc = r.sampler === 'hmc';
  if (v === 'funnel') {
    const below = s.tails.below05;
    const q05 = r.exact.y.quantiles.q05;
    const div = hmc ? (s.divergences ? `${count(s.divergences)} of its ${count(n)} transitions diverged, ` : 'No transition diverged, ') : '';
    const verdict = below < 0.035 ? `only ${formatShare(below)} of its draws are below y = ${num(q05)}, the exact 5% quantile: it has not reached the neck` : below > 0.07 ? `${formatShare(below)} of its draws are below y = ${num(q05)}, the exact 5% quantile: it is stuck in the neck` : `${formatShare(below)} of its draws are below y = ${num(q05)}, the exact 5% quantile, close to 5%`;
    $('funnel-readout').innerHTML = `${div}${div ? '' : 'In '}${div ? 'and ' : `${count(n)} iterations, `}${verdict}. Its draws of y are worth about ${ess(s.ess.y)} independent ones.`;
    $('funnel-stats').innerHTML = [
      stat('Accepted', formatShare(s.acceptance)),
      hmc ? stat('Divergent', `<span class="${s.divergences ? 'poor' : ''}">${s.divergences ? '× ' : ''}${count(s.divergences)}</span>`) : '',
      stat('ESS of <var>y</var>', ess(s.ess.y)),
      stat('ESS of <var>x</var>', ess(s.ess.x)),
      stat('Below <var>y</var>\'s 5% quantile', `${formatShare(below)} <small>of 5%</small>`),
      stat('KS distance, <var>y</var>', num(s.ks.y, 3)),
    ].join('');
    $('funnel-status').textContent = `Seed ${p.seed}, starting at (${num(p.start[0])}, ${num(p.start[1])}).${hmc ? ` ${count(s.gradients)} gradient evaluations.` : ''}`;
  } else if (v === 'hastings') {
    const settled = r.exact.settled;
    const verdict = p.correction === 'correct'
      ? `With the ratio, the chain samples the log-normal: the mean of x₁ is ${num(s.mean.x)}, against ${num(r.exact.mean)} exactly.`
      : `Without the right ratio the chain samples a different log-normal, shifted by ${num(settled.shift)} on the log scale (${p.correction === 'missing' ? '−(1 + ρ)s²' : '−2(1 + ρ)s²'}): the mean of x₁ is ${num(s.mean.x)}, near that distribution's ${num(settled.mean)} and far from the target's ${num(r.exact.mean)}.`;
    $('hastings-readout').innerHTML = verdict;
    $('hastings-stats').innerHTML = [
      stat('Accepted', formatShare(s.acceptance)),
      stat('ESS of <var>x</var>₁', ess(s.ess.x)),
      stat('Mean of <var>x</var>₁', `${num(s.mean.x)} <small>target ${num(r.exact.mean)}</small>`),
      stat('KS distance to the target', num(s.ks.x, 3)),
      s.settledKs ? stat('KS distance to where it settles', num(s.settledKs.x, 3)) : '',
    ].join('');
    $('hastings-status').textContent = `Seed ${p.seed}, starting at (${num(p.start[0])}, ${num(p.start[1])}).`;
  } else {
    const what = p.target === 'normal' ? 'the normal' : 'the smiley';
    $('target-readout').innerHTML = `${r.sampler === 'gibbs' ? 'Every Gibbs move is accepted. ' : `${formatShare(s.acceptance)} of the moves were accepted. `}Over ${count(n)} iterations, the chain's draws of ${what} are worth about ${ess(s.ess.x)} independent draws of x and ${ess(s.ess.y)} of y${hmc && s.divergences ? `, and ${count(s.divergences)} transitions diverged` : ''}.`;
    $('target-stats').innerHTML = [
      stat('Accepted', formatShare(s.acceptance)),
      hmc ? stat('Divergent', count(s.divergences)) : '',
      stat('ESS of <var>x</var>, <var>y</var>', `${ess(s.ess.x)}, ${ess(s.ess.y)}`),
      stat('KS distance, <var>x</var> and <var>y</var>', `${num(s.ks.x, 3)}, ${num(s.ks.y, 3)}`),
    ].join('');
    $('target-status').textContent = `Seed ${p.seed}, starting at (${num(p.start[0])}, ${num(p.start[1])}).${hmc ? ` ${count(s.gradients)} gradient evaluations.` : ''}`;
  }
}

const players = Object.fromEntries(VIEWS.map((v) => [v, playback(v, {
  max: () => results[v]?.params.iterations ?? 1,
  seconds: () => (results[v]?.params.iterations ?? 100) / PER_SECOND,
  label: 'Iteration',
  format: (t) => `${count(Math.floor(t))} of ${count(results[v]?.params.iterations ?? 0)}`,
  onTime: (t) => showTime(v, t),
  speedLabel: 'Speed',
  speeds: [[1, '5 a second'], [5, '25 a second', true], [25, '125 a second'], [200, '1,000 a second']],
})]));

// ---------- Computing ----------

/** @param {View} v @param {import('../lib/params.js').Issue[]} issues */
function showIssues(v, issues) {
  for (const field of /** @type {NodeListOf<HTMLInputElement>} */ ($(v).querySelectorAll('.panel-side input'))) setInvalid(field, false);
  const box = $(`${v}-issues`);
  box.hidden = !issues.length;
  box.innerHTML = issues.map((issue) => {
    const path = issue.path.replace(/^params\./, '');
    const target = document.getElementById(`${v}-${path}-number`) ?? document.getElementById(`${v}-${path}`);
    if (target) setInvalid(target, true);
    return `<p>${issue.message.replace(/-(?=\d)/g, '−')}.</p>`;
  }).join('');
}

/** @param {View} v */
function paramsFor(v) {
  const rest = { ...state.panels[v] };
  if (v !== 'hastings' && rest.sampler !== 'hmc') delete rest.leapfrog;
  return { view: v, ...rest, ...(v !== 'hastings' && rest.sampler === 'gibbs' ? { step: STEPS.gibbs } : {}) };
}

/** @param {View} v */
function update(v) {
  let params;
  try {
    params = resolveParams(paramsFor(v));
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    showIssues(v, error.issues);
    $(`${v}-figures`).dataset.stale = 'true';
    return;
  }
  if (params.iterations > MAX_PAGE_ITERATIONS) {
    showIssues(v, [{ code: 'out_of_range', path: 'params.iterations', message: `this page plays up to ${count(MAX_PAGE_ITERATIONS)} iterations; the API runs up to 100,000` }]);
    $(`${v}-figures`).dataset.stale = 'true';
    return;
  }
  showIssues(v, []);
  $(`${v}-figures`).dataset.stale = 'true';
  $(`${v}-status`).textContent = 'Running the chain…';
  runners[v].run({ entry: ENTRY, params }).then((response) => {
    results[v] = { params: response.params, result: response.result };
    delete $(`${v}-figures`).dataset.stale;
    players[v].reset();
    RENDER[v]();
  });
}

// ---------- Controls ----------

/** Step, leapfrog and run controls, built the same for every panel. */
for (const v of VIEWS) {
  const step = /** @type {HTMLElement} */ (document.querySelector(`[data-step="${v}"]`));
  step.innerHTML = `<div class="control-head"><label for="${v}-step-number" id="${v}-step-label"></label><input id="${v}-step-number" type="number" min="0.001" max="10" step="0.01"></div>
    <input id="${v}-step-range" type="range" min="-2" max="0.7" step="0.01" aria-label="Step, slider (log scale)"><p class="hint" id="${v}-step-hint"></p>`;
  const leap = document.querySelector(`[data-leapfrog="${v}"]`);
  if (leap) {
    leap.innerHTML = `<div class="control-head"><label for="${v}-leapfrog-number">Leapfrog steps, <var>L</var></label><input id="${v}-leapfrog-number" type="number" min="1" max="500" step="1"></div>
      <input id="${v}-leapfrog-range" type="range" min="1" max="100" step="1" aria-label="Leapfrog steps, slider"><p class="hint" id="${v}-leapfrog-hint"></p>`;
  }
  const run = /** @type {HTMLElement} */ (document.querySelector(`[data-run="${v}"]`));
  run.classList.add('stacked');
  run.innerHTML = `<div class="control-head"><label for="${v}-iterations-number">Iterations</label><input id="${v}-iterations-number" type="number" min="10" max="${MAX_PAGE_ITERATIONS}" step="10"></div>
    <input id="${v}-iterations-range" type="range" min="1" max="4" step="0.01" aria-label="Iterations, slider (log scale)">
    <div class="control-row"><label for="${v}-seed">Seed</label><input id="${v}-seed" type="number" min="0" max="4294967295" step="1"><button type="button" id="${v}-new-seed">New chain</button></div>`;
}

const pairs = Object.fromEntries(VIEWS.map((v) => {
  const s = () => state.panels[v];
  const out = {
    step: bindPair({ range: input(`${v}-step-range`), number: input(`${v}-step-number`), decimals: 3, toRange: Math.log10, fromRange: (q) => Number((10 ** q).toPrecision(2)), onInput: (value) => { s().step = value; showHints(v); update(v); } }),
    iterations: bindPair({ range: input(`${v}-iterations-range`), number: input(`${v}-iterations-number`), decimals: 0, integer: true, toRange: Math.log10, fromRange: (q) => Math.round(10 ** q / 10) * 10, onInput: (value) => { s().iterations = value; update(v); } }),
    leapfrog: document.getElementById(`${v}-leapfrog-number`) ? bindPair({ range: input(`${v}-leapfrog-range`), number: input(`${v}-leapfrog-number`), decimals: 0, integer: true, onInput: (value) => { s().leapfrog = value; showHints(v); update(v); } }) : null,
  };
  integerField(input(`${v}-seed`), (value) => { s().seed = value; update(v); });
  $(`${v}-new-seed`).addEventListener('click', () => {
    s().seed = (s().seed + 1) % 4294967296;
    input(`${v}-seed`).value = String(s().seed);
    update(v);
  });
  return [v, out];
}));
const extra = {
  sdY: bindPair({ range: input('funnel-sdY-range'), number: input('funnel-sdY-number'), decimals: 2, onInput: (value) => { state.panels.funnel.sdY = value; update('funnel'); } }),
  sd: bindPair({ range: input('hastings-sd-range'), number: input('hastings-sd-number'), decimals: 2, onInput: (value) => { state.panels.hastings.sd = value; update('hastings'); } }),
  correlation: bindPair({ range: input('hastings-correlation-range'), number: input('hastings-correlation-number'), decimals: 2, onInput: (value) => { state.panels.hastings.correlation = value; update('hastings'); } }),
};

/** Radio groups: name → panel field; a new sampler takes its default step. */
for (const [v, field] of /** @type {const} */ ([['funnel', 'coordinates'], ['funnel', 'sampler'], ['hastings', 'correction'], ['target', 'target'], ['target', 'sampler']])) {
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(`input[name="${v}-${field}"]`))) {
    radio.addEventListener('change', () => {
      const s = state.panels[v];
      s[field] = radio.value;
      if (field === 'sampler') s.step = STEPS[/** @type {'rwm' | 'hmc' | 'gibbs'} */ (radio.value)];
      if (v === 'target' && field === 'target' && radio.value === 'smiley' && s.sampler === 'gibbs') { s.sampler = 'rwm'; s.step = STEPS.rwm; }
      showControls(v);
      update(v);
    });
  }
}

/** @param {View} v */
function showHints(v) {
  const s = state.panels[v];
  const hmc = v !== 'hastings' && s.sampler === 'hmc';
  $(`${v}-step-label`).innerHTML = v === 'hastings' ? 'Multiplier\'s log SD, λ' : hmc ? 'Step size, ε' : 'Proposal SD';
  $(`${v}-step-hint`).textContent = v === 'hastings' ? `Each coordinate is multiplied by e^(λZ), between ×${num(Math.exp(-1.96 * s.step))} and ×${num(Math.exp(1.96 * s.step))} 95% of the time.`
    : hmc ? 'The length of one leapfrog step.' : s.sampler === 'gibbs' ? 'Gibbs needs no step.' : 'The SD of the normal step in each coordinate.';
  if (v !== 'hastings') {
    $(`${v}-leapfrog-hint`).textContent = hmc ? `Path length εL = ${num(s.step * s.leapfrog)}.` : '';
    /** @type {HTMLElement} */ (document.querySelector(`[data-leapfrog="${v}"]`)).hidden = !hmc;
    /** @type {HTMLElement} */ (document.querySelector(`[data-step="${v}"]`)).hidden = s.sampler === 'gibbs';
  }
}

/** @param {View} v */
function showControls(v) {
  const s = state.panels[v];
  for (const field of ['coordinates', 'sampler', 'correction', 'target']) {
    for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(`input[name="${v}-${field}"]`))) radio.checked = radio.value === s[field];
  }
  if (v === 'target') {
    const gibbs = /** @type {HTMLInputElement} */ (document.querySelector('input[name="target-sampler"][value="gibbs"]'));
    gibbs.disabled = s.target !== 'normal';
    $('target-gibbs-hint').hidden = s.target === 'normal';
  }
  pairs[v].step.set(s.step);
  pairs[v].iterations.set(s.iterations);
  pairs[v].leapfrog?.set(s.leapfrog);
  input(`${v}-seed`).value = String(s.seed);
  if (v === 'funnel') extra.sdY.set(s.sdY);
  if (v === 'hastings') { extra.sd.set(s.sd); extra.correlation.set(s.correlation); }
  showHints(v);
}

for (const v of VIEWS) {
  $(`${v}-reset`).addEventListener('click', () => {
    state.panels[v] = fresh(v);
    showControls(v);
    update(v);
  });
}
onWidth($('funnel-target'), () => RENDER.funnel());
onWidth($('funnel-space'), () => RENDER.funnel());
onWidth($('funnel-trace'), () => showTime('funnel', players.funnel.time));
onWidth($('hastings-plot'), () => RENDER.hastings());
onWidth($('target-plot'), () => RENDER.target());
onWidth($('target-hist-x'), () => showTime('target', players.target.time));

// ---------- Start ----------

for (const v of VIEWS) {
  showControls(v);
  update(v);
}

installApi({
  entry: ENTRY,
  load: (/** @type {any} */ p, /** @type {any} */ result) => {
    const v = /** @type {View} */ (p.view);
    state.view = v;
    const rest = { ...p };
    delete rest.view;
    state.panels[v] = { ...fresh(v), ...rest, start: [...p.start] };
    showControls(v);
    showIssues(v, []);
    if (p.iterations > MAX_PAGE_ITERATIONS) {
      update(v);
    } else {
      results[v] = { params: p, result };
      delete $(`${v}-figures`).dataset.stale;
      players[v].reset();
      RENDER[v]();
    }
    $(v).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor(state.view)),
});

