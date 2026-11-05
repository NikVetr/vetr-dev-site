// Page wiring for priors on transformed parameters: two panels over compute(), both closed
// form and computed on the page's thread. Every number shown comes from compute.js.

import { formatNumber } from '../lib/format.js';
import { bindPair, installApi, integerField, onWidth, setInvalid } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { swatch } from '../lib/plot.js';
import { compute, DEFAULTS, ENTRY, jointLogDensity, label, resolveParams, TRANSFORM_INFO, TRANSFORMS } from './compute.js';
import { planeFigure, quantitiesFigure, sampledFigure } from './figure.js';

/** @typedef {import('./compute.js').View} View */
/** @typedef {import('./compute.js').Transform} Transform */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const num = (/** @type {number} */ v, d = 2) => formatNumber(v, d);
/** A quantity's name with its letter as a variable: "log a" → "log <var>a</var>". @param {string} name */
const axis = (name) => name.replace(/\b([abcd])$/, '<var>$1</var>');

const fresh = () => ({
  transform: { transform: DEFAULTS.transform.transform, jacobian: DEFAULTS.transform.jacobian, df: DEFAULTS.transform.df },
  marginals: { ...DEFAULTS.marginals },
});
const state = { view: /** @type {View} */ ('transform'), ...fresh() };
for (const view of /** @type {View[]} */ (['transform', 'marginals'])) {
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) $(view).addEventListener(type, () => { state.view = view; });
}

/** The request params a panel's controls describe. @param {View} view */
function paramsFor(view) {
  if (view === 'transform') {
    const s = state.transform;
    return { view, transform: s.transform, jacobian: s.jacobian, ...(s.transform === 'square' ? { df: s.df } : {}) };
  }
  return { view, ...state.marginals };
}

/** @param {View} view @param {import('../lib/params.js').Issue[]} issues */
function showIssues(view, issues) {
  for (const field of /** @type {NodeListOf<HTMLInputElement>} */ ($(view).querySelectorAll('.panel-side input'))) setInvalid(field, false);
  const box = $(`${view}-issues`);
  box.hidden = !issues.length;
  box.innerHTML = issues.map((issue) => {
    const path = issue.path.replace(/^params\./, '');
    const target = document.getElementById(`${view}-${path}-number`) ?? document.getElementById(`${view}-${path}`);
    if (target) setInvalid(target, true);
    return `<p>${issue.message.replace(/-(?=\d)/g, '−')}.</p>`;
  }).join('');
}

/** Resolves a panel's params, or shows why it cannot. @param {View} view */
function resolved(view) {
  try {
    const p = resolveParams(paramsFor(view));
    showIssues(view, []);
    return p;
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    showIssues(view, error.issues);
    return null;
  }
}

// ---------- 1. With and without the Jacobian ----------

/** @type {any} */
let transformResult = null;
/** @type {any} */
let transformParams = null;

$('transform-transform').innerHTML = TRANSFORMS.map((t) => {
  const info = TRANSFORM_INFO[t];
  return `<label><input type="radio" name="transform-transform" value="${t}"> <span><span class="choice-main">${info.computed}</span> <span class="choice-sub">${info.statements.replace('df', '<var>k</var>')}</span></span></label>`;
}).join('');

const dfPair = bindPair({
  range: input('transform-df-range'), number: input('transform-df-number'), decimals: 0, integer: true,
  onInput: (value) => { state.transform.df = value; updateTransform(); },
});

function updateTransform() {
  const p = resolved('transform');
  if (!p) return;
  transformParams = p;
  transformResult = compute(p);
  renderTransform();
}

function renderTransform() {
  const r = transformResult;
  const p = transformParams;
  if (!r) return;
  const square = r.transform === 'square';
  $('transform-legend').innerHTML = [
    `<li>${swatch({ fill: 'k-soft k0', line: 'k-line k0' })} what the model samples</li>`,
    `<li>${swatch({ line: 'ink-line dashed' })} the prior stated for it</li>`,
    r.proper ? '' : `<li>${swatch({ line: 'improper-line' })} not a distribution: its shape only</li>`,
  ].join('');
  $('transform-sampled-title').innerHTML = square ? 'What Stan samples: <var>a</var>' : `What Stan samples: (${r.joint.x}, ${r.joint.y})`.replace(/log ([ab])/g, 'log <var>$1</var>').replace(/\(([ab]), ([ab])\)/, '(<var>$1</var>, <var>$2</var>)');
  const sampled = $('transform-sampled');
  if (sampled.clientWidth > 0) {
    const w = sampled.clientWidth;
    sampled.innerHTML = sampledFigure(r, jointLogDensity(p), { width: w, height: Math.round(Math.max(240, Math.min(380, w * (square ? 0.62 : 0.85)))), id: 'transform-sampled' });
  }
  const q = $('transform-quantities');
  if (q.clientWidth > 0) q.innerHTML = quantitiesFigure(r, { width: q.clientWidth, rowHeight: r.quantities.length > 3 ? 70 : square ? 96 : 84 });
  const quantities = 'Each quantity has its own axis and is scaled to its own peak.';
  $('transform-caption').innerHTML = square
    ? `${r.proper ? '' : 'Without a distribution, the density of <var>a</var> is drawn to an arbitrary scale. '}${quantities}`
    : `${r.proper ? 'The contours hold 50% (thick) and 90% of the mass' : 'The lines are at ½ (thick) and 1/20 of the highest density in the window, since there is no total mass to divide by'}${r.transform === 'product-lognormal' ? ', on the log scale' : ''}. ${quantities}`;
  $('transform-df-control').hidden = !square;
  $('transform-jacobian-hint').innerHTML = `The script's <code>${r.script}</code>, for ${r.factor}${r.constant ? ', a constant' : ''}.`;
  showVerdict(r);
}

/** The verdict and the readout for one transform. @param {any} r */
function showVerdict(r) {
  const verdict = $('transform-verdict');
  const off = r.quantities.filter((/** @type {any} */ q) => q.stated && q.matches === false);
  const constant = r.constant;
  const byName = Object.fromEntries(r.quantities.map((/** @type {any} */ q) => [q.quantity, q]));
  if (!r.proper) {
    verdict.className = 'verdict bad';
    verdict.innerHTML = `<strong>✗ Not a distribution.</strong> ${r.transform === 'square'
      ? 'The density of <var>a</var> is proportional to e<sup>−<var>a</var>²/2</sup>/<var>a</var>, whose integral diverges at <var>a</var> = 0.'
      : 'The density over (<var>a</var>, <var>b</var>) does not fall off along <var>a</var> = 0: integrating out <var>b</var> leaves φ(<var>a</var>)/|<var>a</var>|, whose integral diverges at <var>a</var> = 0.'}`;
  } else if (off.length) {
    verdict.className = 'verdict bad';
    verdict.innerHTML = `<strong>✗ Not as stated.</strong> ${off.map((/** @type {any} */ q) => `${axis(q.axis)} comes out ${label(q.implied)}, not the ${label(q.stated)} stated`).join('; ')}.`;
  } else {
    verdict.className = 'verdict ok';
    const stated = r.quantities.filter((/** @type {any} */ q) => q.stated).map((/** @type {any} */ q) => axis(q.axis));
    verdict.innerHTML = `<strong>✓ As stated.</strong> ${stated.join(' and ')} have the distributions written for them${constant && !r.jacobian ? ', since the Jacobian is a constant' : ''}.`;
  }
  /** @type {Record<Transform, string>} */
  const say = {
    sum: `The Jacobian of (<var>a</var>, <var>b</var>) → (<var>a</var>, <var>c</var>) is 1, so the term adds nothing. But <var>b</var>, which has no statement of its own, comes out N(0, √3), not N(0, 1): the two statements make <var>a</var> and <var>c</var> independent, so <var>b</var> = <var>c</var> − <var>a</var> has variance 1 + 2 = 3 and correlation −0.58 with <var>a</var>. Panel 2 is about this.`,
    'sum-difference': 'The map from (<var>a</var>, <var>b</var>) to (<var>c</var>, <var>d</var>) has determinant −2, a constant, so including its log or not changes nothing. <var>c</var> and <var>d</var> independent N(0, 1) make <var>a</var> = (<var>c</var> + <var>d</var>)/2 and <var>b</var> = (<var>c</var> − <var>d</var>)/2 independent with variance ½.',
    square: r.jacobian
      ? `With log 2<var>a</var>, <var>b</var> = <var>a</var>² is χ²(${r.statements.match(/\d+/)[0]}) as stated and <var>a</var> is its square root, a χ(${r.statements.match(/\d+/)[0]})${r.statements.includes('(1)') ? ', the half-normal' : ''}: median ${num(byName.a.summary.q50)}.`
      : r.proper
        ? `Without it the density of <var>a</var> lacks a factor of <var>a</var>, which makes <var>a</var> a χ(${byName.a.implied.df}) and <var>b</var> a χ²(${byName.b.implied.df}): one degree of freedom short. For <var>k</var> = 1 the shortfall leaves no distribution at all.`
        : 'Without it, the density of <var>a</var> is the χ²(1) density at <var>a</var>², about 1/<var>a</var> near 0, and its integral has no limit. A sampler drifts towards 0; Stan reports divergences.',
    'product-lognormal': r.jacobian
      ? 'With log <var>a</var>, log <var>a</var> ~ N(0, 1) and log <var>c</var> ~ N(0, 2) as stated, independent, so log <var>b</var> = log <var>c</var> − log <var>a</var> ~ N(0, 3).'
      : `Without it, the density over (<var>a</var>, <var>c</var>) carries an extra 1/<var>a</var>, which moves log <var>a</var> from N(0, 1) to N(−1, 1): <var>a</var>'s median falls from 1 to e<sup>−1</sup> = ${num(Math.exp(-1))}. <var>c</var> keeps the distribution stated for it, and log <var>b</var> becomes N(1, 3).`,
    'product-normal': r.jacobian
      ? 'With log|<var>a</var>|, <var>a</var> and <var>c</var> are independent standard normals as stated, and <var>b</var> = <var>c</var>/<var>a</var> is their ratio, a standard Cauchy: a normal prior on a product gives the other factor tails so heavy it has no mean.'
      : 'Without it the density over (<var>a</var>, <var>b</var>) is φ(<var>a</var>) φ(<var>ab</var>), which stays at φ(0)² all along <var>a</var> = 0: its mass is infinite. A sampler wanders off along <var>b</var>; the statements on <var>a</var> and <var>c</var> describe nothing.',
  };
  $('transform-readout').innerHTML = say[/** @type {Transform} */ (r.transform)];
}

for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="transform-transform"]'))) {
  radio.addEventListener('change', () => { state.transform.transform = /** @type {Transform} */ (radio.value); updateTransform(); });
}
for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="transform-jacobian"]'))) {
  radio.addEventListener('change', () => { state.transform.jacobian = radio.value === 'true'; updateTransform(); });
}

function showTransformControls() {
  const s = state.transform;
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="transform-transform"]'))) radio.checked = radio.value === s.transform;
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="transform-jacobian"]'))) radio.checked = radio.value === String(s.jacobian);
  dfPair.set(s.df);
}

$('transform-reset').addEventListener('click', () => { state.transform = fresh().transform; showTransformControls(); updateTransform(); });

// ---------- 2. Two marginals are not a joint ----------

/** @type {any} */
let marginalsResult = null;

const sdPair = bindPair({
  range: input('marginals-sdB-range'), number: input('marginals-sdB-number'), decimals: 2,
  onInput: (value) => { state.marginals.sdB = value; updateMarginals(); },
});
integerField(input('marginals-n-number'), (value) => { state.marginals.n = value; updateMarginals(); });
integerField(input('marginals-seed'), (value) => { state.marginals.seed = value; updateMarginals(); });
$('marginals-new-seed').addEventListener('click', () => {
  state.marginals.seed = (state.marginals.seed + 1) % 4294967296;
  input('marginals-seed').value = String(state.marginals.seed);
  updateMarginals();
});
for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="marginals-statement"]'))) {
  radio.addEventListener('change', () => { state.marginals.statement = /** @type {any} */ (radio.value); updateMarginals(); });
}

function updateMarginals() {
  const p = resolved('marginals');
  if (!p) return;
  marginalsResult = compute(p);
  renderMarginals();
}

function renderMarginals() {
  const r = marginalsResult;
  if (!r) return;
  $('marginals-legend').innerHTML = [
    `<li>${swatch({ line: 'k-line k0' })} as written</li>`,
    `<li>${swatch({ line: 'ink-line dashed' })} as meant</li>`,
    `<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><circle cx="13" cy="7" r="3" class="draw-dot"/></svg> <var>a</var> as data, one posterior draw of <var>b</var></li>`,
    `<li>${swatch({ line: 'k-line k2 conditional-line' })} <var>b</var>'s posterior mean given <var>a</var></li>`,
  ].join('');
  for (const pair of /** @type {const} */ (['ab', 'ac'])) {
    const box = $(`marginals-${pair}`);
    const w = box.clientWidth;
    if (w > 0) box.innerHTML = planeFigure(r, { width: w, height: Math.round(Math.max(240, Math.min(360, w * 0.8))), pair });
  }
  const s = r.sdB;
  const m = r.meant.covariance;
  const st = r.stated.covariance;
  const sd = (/** @type {number} */ v) => num(Math.sqrt(v));
  const rows = [
    ['SD of <var>b</var>', sd(m[1][1]), sd(st[1][1])],
    ['Correlation of <var>a</var> and <var>b</var>', num(r.meant.correlation.ab), num(r.stated.correlation.ab)],
    ['Correlation of <var>a</var> and <var>c</var>', num(r.meant.correlation.ac), num(r.stated.correlation.ac)],
    ['<var>b</var> given <var>a</var>', `N(0, ${num(s)})`, `N(${r.conditional.slope === 0 ? '0' : '−<var>a</var>'}, ${num(r.conditional.sd)})`],
  ];
  /** @type {HTMLElement} */ ($('marginals-table').querySelector('tbody')).innerHTML = rows.map(([name, a, b], i) => {
    const differs = i < 3 ? a !== b : r.statement === 'separate';
    return `<tr><th scope="row">${name}</th><td>${a}</td><td>${differs ? `<span class="poor">✗ ${b}</span>` : `<span class="good">✓ ${b}</span>`}</td></tr>`;
  }).join('');
  $('marginals-readout').innerHTML = r.statement === 'separate'
    ? `Written as two statements, <var>a</var> and <var>c</var> both have the distributions meant, but they are independent where they should correlate at ${num(r.meant.correlation.ac)}. So <var>b</var> = <var>c</var> − <var>a</var> has SD ${sd(st[1][1])} instead of ${num(s)}, and correlation ${num(r.stated.correlation.ab)} with <var>a</var>. With <var>a</var> as data, each <var>b</var>'s posterior centres on −<var>a</var>: the model cancels <var>a</var> out of <var>c</var>.`
    : `Written as one statement, (<var>a</var>, <var>c</var>) has the covariance meant, so <var>b</var> is N(0, ${num(s)}) and independent of <var>a</var>. With <var>a</var> as data, <var>b</var>'s posterior is its prior. The script's non-centred version, which whitens (<var>a</var>, <var>c</var>) by the Cholesky factor, is the same model.`;
  $('marginals-status').textContent = `${r.data.a.length.toLocaleString('en-US')} values of a, seed ${state.marginals.seed}.`;
}

function showMarginalsControls() {
  const s = state.marginals;
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="marginals-statement"]'))) radio.checked = radio.value === s.statement;
  sdPair.set(s.sdB);
  input('marginals-n-number').value = String(s.n);
  input('marginals-seed').value = String(s.seed);
}

$('marginals-reset').addEventListener('click', () => { state.marginals = fresh().marginals; showMarginalsControls(); updateMarginals(); });

onWidth($('transform-sampled'), renderTransform);
onWidth($('transform-quantities'), renderTransform);
onWidth($('marginals-ab'), renderMarginals);

// ---------- Start ----------

showTransformControls();
showMarginalsControls();
updateTransform();
updateMarginals();

installApi({
  entry: ENTRY,
  load: (/** @type {any} */ p, /** @type {any} */ result) => {
    const view = /** @type {View} */ (p.view);
    state.view = view;
    if (view === 'transform') {
      state.transform = { transform: p.transform, jacobian: p.jacobian, df: p.df ?? state.transform.df };
      showTransformControls();
      showIssues('transform', []);
      transformParams = p;
      transformResult = result;
      renderTransform();
    } else {
      state.marginals = { statement: p.statement, sdB: p.sdB, n: p.n, seed: p.seed };
      showMarginalsControls();
      showIssues('marginals', []);
      marginalsResult = result;
      renderMarginals();
    }
    $(view).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor(state.view)),
});
