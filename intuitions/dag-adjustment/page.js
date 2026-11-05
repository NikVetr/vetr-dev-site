// Page wiring for adjusting for the right variables: the playground (a graph, its
// coefficients, the exposure, outcome and adjustment set) and the many-collider panel,
// over compute(). Every number shown comes from compute.js.

import { formatNumber } from '../lib/format.js';
import { bindPair, installApi, integerField, onWidth } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { swatch } from '../lib/plot.js';
import { compute, DEFAULTS, ENTRY, PRESETS, resolveParams } from './compute.js';
import { colliderCurveFigure, colliderSchematic, dagFigure, sampleFigure } from './figure.js';

/** @typedef {import('./compute.js').Graph} Graph */
/** @typedef {import('./compute.js').PresetName} PresetName */
/** @typedef {'adjust' | 'colliders'} View */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const select = (/** @type {string} */ id) => /** @type {HTMLSelectElement} */ ($(id));
const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const signed = (/** @type {number} */ v) => (v > 0 ? `+${formatNumber(v)}` : formatNumber(v));
const setName = (/** @type {string[]} */ set) => (set.length ? `{${set.join(', ')}}` : 'nothing');
const PAGE_SAMPLE = { n: 300, seed: 1 };

/** @param {PresetName} name */
const fromPreset = (name) => {
  const p = PRESETS[name];
  return {
    preset: /** @type {PresetName | null} */ (name),
    graph: /** @type {Graph} */ (structuredClone(p.graph)),
    exposure: p.exposure,
    outcome: p.outcome,
    adjust: /** @type {string[]} */ ([]),
    mediator: p.mediator,
    noise: /** @type {import('./compute.js').Noise} */ ('unit'),
  };
};
const state = {
  view: /** @type {View} */ ('adjust'),
  adjust: fromPreset('confounder'),
  sample: { show: true, ...PAGE_SAMPLE },
  colliders: { ...DEFAULTS.colliders },
};

/** The request params a panel's controls describe. @param {View} view */
function paramsFor(view) {
  if (view === 'colliders') return { view, ...state.colliders };
  const a = state.adjust;
  return { view, graph: a.graph, exposure: a.exposure, outcome: a.outcome, adjust: a.adjust, mediator: a.mediator, noise: a.noise, sample: state.sample.show ? { n: state.sample.n, seed: state.sample.seed } : null };
}
for (const view of /** @type {View[]} */ (['adjust', 'colliders'])) {
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) $(view).addEventListener(type, () => { state.view = view; });
}

// ---------- 1. The playground ----------

const observed = () => state.adjust.graph.nodes.filter((n) => !n.latent).map((n) => n.id);
const candidates = () => observed().filter((id) => id !== state.adjust.exposure && id !== state.adjust.outcome);

/** Rebuilds the controls that depend on the graph's nodes and edges. */
function buildAdjustControls() {
  const a = state.adjust;
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="adjust-preset"]'))) radio.checked = radio.value === a.preset;
  const options = (/** @type {string[]} */ ids, /** @type {string} */ chosen) => ids.map((id) => `<option value="${id}"${id === chosen ? ' selected' : ''}>${id}</option>`).join('');
  select('adjust-exposure').innerHTML = options(observed(), a.exposure);
  select('adjust-outcome').innerHTML = options(observed(), a.outcome);
  select('adjust-mediator').innerHTML = `<option value="">none</option>${options(candidates(), a.mediator ?? '')}`;
  select('adjust-noise').value = a.noise;
  const latent = a.graph.nodes.filter((n) => n.latent).map((n) => n.id);
  $('adjust-set').innerHTML = candidates().map((id) => `<label><input type="checkbox" value="${id}"${a.adjust.includes(id) ? ' checked' : ''}> ${id}</label>`).join('') || '<span class="muted">No other observed variables.</span>';
  $('adjust-set-hint').textContent = latent.length ? `${latent.join(' and ')} ${latent.length === 1 ? 'is' : 'are'} unobserved, so ${latent.length === 1 ? 'it' : 'they'} cannot be adjusted for.` : '';
  $('adjust-coefficients').innerHTML = a.graph.edges.map((e, i) => `<div class="control">
      <div class="control-head">
        <label for="edge-${i}-number">${e.from} → ${e.to}</label>
        <input id="edge-${i}-number" type="number" min="-10" max="10" step="0.05">
      </div>
      <input id="edge-${i}-range" type="range" min="-2" max="2" step="0.05" aria-label="${e.from} → ${e.to}, slider">
    </div>`).join('');
  a.graph.edges.forEach((e, i) => {
    bindPair({ range: input(`edge-${i}-range`), number: input(`edge-${i}-number`), onInput: (v) => { e.coefficient = v; renderAdjust(); } }).set(e.coefficient);
  });
}

/** @type {any} */
let adjustResult = null;
function renderAdjust() {
  const a = state.adjust;
  /** @type {any} */
  let r;
  try {
    r = compute(paramsFor('adjust'));
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    $('adjust-issues').hidden = false;
    $('adjust-issues').innerHTML = `${error.issues.map((issue) => `<p>${issue.message.replace(/^the /, 'The ')}.</p>`).join('')}<p>Lower those coefficients or use unit noise. Until then the figures show the last graph that worked.</p>`;
    $('adjust').dataset.stale = 'true';
    return;
  }
  $('adjust-issues').hidden = true;
  delete $('adjust').dataset.stale;
  adjustResult = r;
  const box = $('dag-plot');
  if (box.clientWidth > 0) box.innerHTML = dagFigure(a, r, { width: box.clientWidth }).svg;
  const anyBias = r.paths.some((/** @type {any} */ p) => !p.causal && p.open);
  $('adjust-legend').innerHTML = [
    `<li><span class="key exposure">exposure</span></li>`,
    `<li><span class="key outcome">outcome</span></li>`,
    `<li><span class="key adjusted">adjusted</span></li>`,
    a.graph.nodes.some((n) => n.latent) ? `<li><span class="key latent">unobserved</span></li>` : '',
    anyBias ? `<li>${swatch({ line: 'dag-edge bias' })} on an open non-causal path</li>` : '',
  ].join('');
  $('dag-caption').textContent = `Arrows carry their coefficients${a.graph.edges.some((e) => e.coefficient === 0) ? '; a dashed grey arrow has coefficient 0 and counts as no arrow' : ''}. Click a node to adjust for it, or click it again to stop.`;

  const est = r.estimate;
  const verdict = $('adjust-verdict');
  const lead = a.adjust.length ? `Adjusting for ${a.adjust.join(', ')}` : 'With no adjustment';
  const openBackdoors = r.paths.filter((/** @type {any} */ p) => !p.causal && p.open).map((/** @type {any} */ p) => pathText(p));
  const reasons = [];
  if (openBackdoors.length) reasons.push(`${openBackdoors.length === 1 ? 'the non-causal path' : 'the non-causal paths'} ${openBackdoors.join(' and ')} ${openBackdoors.length === 1 ? 'is' : 'are'} open`);
  if (est.forbidden.length) reasons.push(`${est.forbidden.join(' and ')} ${est.forbidden.length === 1 ? 'lies' : 'lie'} on, or downstream of, a causal path, so adjusting removes part of the effect`);
  verdict.className = `verdict ${est.unbiased ? 'ok' : 'bad'}`;
  if (est.unbiased && est.valid) verdict.innerHTML = `<strong>✓ Unbiased.</strong> ${lead}, the regression of ${a.outcome} on ${a.exposure} gives ${formatNumber(est.coefficient, 3)}, the causal effect.`;
  else if (est.unbiased) verdict.innerHTML = `<strong>✓ Unbiased here, by coincidence.</strong> ${lead}, the regression gives ${formatNumber(est.coefficient, 3)}, the causal effect, but only because biases cancel at these coefficients: ${reasons.join('; ')}.`;
  else verdict.innerHTML = `<strong>✗ Biased.</strong> ${lead}, the regression of ${a.outcome} on ${a.exposure} gives ${formatNumber(est.coefficient, 3)}, but the causal effect is ${formatNumber(r.effect, 3)}: ${reasons.join('; ')}.`;
  $('adjust-stats').innerHTML = [
    stat('Causal effect', formatNumber(r.effect, 3)),
    stat('Regression coefficient', formatNumber(est.coefficient, 3)),
    stat('Bias', est.unbiased ? '0' : signed(est.bias)),
    stat(`Partial correlation of ${a.exposure} and ${a.outcome}${a.adjust.length ? ` given ${a.adjust.join(', ')}` : ''}`, formatNumber(est.partialCorrelation, 3)),
  ].join('');

  $('adjust-paths').innerHTML = r.paths.map((/** @type {any} */ p) => {
    const kind = p.causal ? 'causal' : 'non-causal';
    let status;
    if (p.open) status = p.openedBy.length ? `open: adjusting for ${p.openedBy.join(', ')} opens ${p.openedBy.length === 1 ? 'the collider' : 'the colliders'}` : 'open';
    else status = `blocked by ${p.blockedBy.join(', ')}${p.blockedBy.some((/** @type {string} */ b) => !a.adjust.includes(b)) ? ' (a collider not adjusted for)' : ''}`;
    const cls = p.open ? (p.causal ? 'path open causal' : 'path open bias') : 'path blocked';
    return `<li class="${cls}"><span class="path-glyph" aria-hidden="true">${p.open ? '●' : '○'}</span><span><span class="path-text">${pathText(p)}</span> <span class="path-status">${kind}, ${status}</span></span></li>`;
  }).join('') + (r.pathsTruncated ? '<li class="muted">… more paths not listed.</li>' : '');

  const table = $('adjust-sets');
  if (r.sets) {
    const head = '<thead><tr><th scope="col">Adjust for</th><th scope="col">Coefficient</th><th scope="col">Bias</th><th scope="col">Criterion</th></tr></thead>';
    const same = (/** @type {string[]} */ s) => s.length === a.adjust.length && s.every((x) => a.adjust.includes(x));
    const rows = r.sets.map((/** @type {any} */ s) => {
      const current = same(s.adjust);
      const verdictCell = s.valid ? '<span class="good">✓ met</span>' : `<span class="poor">✗ not met${s.unbiased ? ' (unbiased by coincidence)' : ''}</span>`;
      return `<tr${current ? ' class="current"' : ''}><th scope="row"><button type="button" class="set-button" data-set="${s.adjust.join(',')}" aria-pressed="${current}">${current ? '● ' : ''}${setName(s.adjust)}</button></th><td>${formatNumber(s.coefficient, 3)}</td><td>${s.unbiased ? '0' : signed(s.bias)}</td><td>${verdictCell}</td></tr>`;
    }).join('');
    table.innerHTML = `${head}<tbody>${rows}</tbody>`;
  } else table.innerHTML = '<tbody><tr><td>Too many candidate variables to list every set.</td></tr></tbody>';

  const fd = r.frontDoor;
  $('adjust-frontdoor').hidden = !fd;
  if (fd) {
    const m = fd.mediator;
    const value = `β(${m} ~ ${a.exposure}) × β(${a.outcome} ~ ${m} | ${a.exposure}) = ${formatNumber(fd.exposureToMediator, 3)} × ${formatNumber(fd.mediatorToOutcome, 3)} = ${formatNumber(fd.estimate, 3)}`;
    const failed = [!fd.conditions.intercepts && `${m} does not carry every causal path`, !fd.conditions.noBackdoorToMediator && `${a.exposure} and ${m} share an open non-causal path`, !fd.conditions.backdoorsBlockedByExposure && `${a.exposure} does not block every non-causal path from ${m} to ${a.outcome}`].filter(Boolean);
    $('adjust-frontdoor').innerHTML = fd.criterion
      ? `<strong>✓ Front door through ${m}:</strong> ${value}, the causal effect, without adjusting for anything unobserved.`
      : `<strong>✗ Front door through ${m}:</strong> ${value}${fd.unbiased ? ', which happens to equal the effect' : `, not the effect ${formatNumber(r.effect, 3)}`}; the front-door criterion fails because ${failed.join(' and ')}.`;
  }
  renderSample();
}

/** "X ← Z → Y". @param {{ nodes: string[], arrows: string[] }} p */
const pathText = (p) => p.nodes.map((n, i) => (i ? ` ${p.arrows[i - 1]} ${n}` : n)).join('');

function renderSample() {
  const r = adjustResult;
  const box = $('sample-plot');
  const show = state.sample.show && r?.sample;
  box.hidden = !show;
  $('sample-readout').textContent = show ? `The sample's slope is ${formatNumber(r.sample.coefficient, 3)}; the model's regression coefficient is ${formatNumber(r.estimate.coefficient, 3)} and the causal effect ${formatNumber(r.effect, 3)}.` : 'Tick Show to draw a sample from the graph.';
  $('sample-legend').innerHTML = show ? [
    `<li>${swatch({ line: 'ink-line' })} ${state.adjust.adjust.length ? 'adjusted ' : ''}regression coefficient</li>`,
    `<li>${swatch({ line: 'effect-line' })} causal effect</li>`,
  ].join('') : '';
  if (show && box.clientWidth > 0) box.innerHTML = sampleFigure(r, state.adjust, { width: box.clientWidth, height: Math.min(320, Math.max(240, box.clientWidth * 0.7)) });
}

/** Makes `id` the exposure or the outcome, swapping the two if needed. @param {'exposure' | 'outcome'} role @param {string} id */
function setRole(role, id) {
  const a = state.adjust;
  const other = role === 'exposure' ? 'outcome' : 'exposure';
  if (a[other] === id) a[other] = a[role];
  a[role] = id;
  a.adjust = a.adjust.filter((x) => x !== a.exposure && x !== a.outcome);
  if (a.mediator === a.exposure || a.mediator === a.outcome) a.mediator = null;
  buildAdjustControls();
  renderAdjust();
}
/** @param {string[]} set */
function setAdjust(set) {
  state.adjust.adjust = observed().filter((id) => set.includes(id));
  for (const box of /** @type {NodeListOf<HTMLInputElement>} */ ($('adjust-set').querySelectorAll('input'))) box.checked = state.adjust.adjust.includes(box.value);
  renderAdjust();
}

for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="adjust-preset"]'))) {
  radio.addEventListener('change', () => {
    state.adjust = fromPreset(/** @type {PresetName} */ (radio.value));
    buildAdjustControls();
    renderAdjust();
  });
}
select('adjust-exposure').addEventListener('change', () => setRole('exposure', select('adjust-exposure').value));
select('adjust-outcome').addEventListener('change', () => setRole('outcome', select('adjust-outcome').value));
select('adjust-mediator').addEventListener('change', () => { state.adjust.mediator = select('adjust-mediator').value || null; renderAdjust(); });
select('adjust-noise').addEventListener('change', () => { state.adjust.noise = /** @type {any} */ (select('adjust-noise').value); renderAdjust(); });
$('adjust-set').addEventListener('change', () => {
  setAdjust([...$('adjust-set').querySelectorAll('input:checked')].map((b) => /** @type {HTMLInputElement} */ (b).value));
});
$('adjust-sets').addEventListener('click', (event) => {
  const button = /** @type {HTMLElement} */ (event.target).closest('button[data-set]');
  if (button) setAdjust(/** @type {string} */ (button.getAttribute('data-set')).split(',').filter(Boolean));
});
$('dag-plot').addEventListener('click', (event) => {
  const node = /** @type {Element} */ (event.target).closest('[data-node]');
  if (!node) return;
  const id = /** @type {string} */ (node.getAttribute('data-node'));
  const set = state.adjust.adjust;
  setAdjust(set.includes(id) ? set.filter((x) => x !== id) : [...set, id]);
});
$('adjust-reset').addEventListener('click', () => {
  state.adjust = fromPreset(state.adjust.preset ?? 'confounder');
  buildAdjustControls();
  renderAdjust();
});
input('sample-show').addEventListener('change', () => { state.sample.show = input('sample-show').checked; renderAdjust(); });
integerField(input('sample-n'), (v) => { state.sample.n = v; renderAdjust(); });
integerField(input('sample-seed'), (v) => { state.sample.seed = v; renderAdjust(); });
$('sample-new-seed').addEventListener('click', () => {
  state.sample.seed = (state.sample.seed + 1) % 4294967296;
  input('sample-seed').value = String(state.sample.seed);
  renderAdjust();
});
onWidth($('dag-plot'), () => renderAdjust());
onWidth($('sample-plot'), () => renderSample());

// ---------- 2. Many colliders ----------

const colliderControls = {
  p: bindPair({
    range: input('colliders-p-range'), number: input('colliders-p-number'), onInput: (v) => { state.colliders.colliders = v; renderColliders(); },
    decimals: 0, integer: true, toRange: (v) => Math.log10(v), fromRange: (p) => Math.round(10 ** p),
  }),
  r: bindPair({ range: input('colliders-r-range'), number: input('colliders-r-number'), onInput: (v) => { state.colliders.rYX = v; renderColliders(); } }),
  share: bindPair({ range: input('colliders-share-range'), number: input('colliders-share-number'), onInput: (v) => { state.colliders.share = v; renderColliders(); }, decimals: 3 }),
};
function showColliderControls() {
  colliderControls.p.set(state.colliders.colliders);
  colliderControls.r.set(state.colliders.rYX);
  colliderControls.share.set(state.colliders.share);
}
function renderColliders() {
  const r = /** @type {any} */ (compute(paramsFor('colliders')));
  for (const [id, measure] of /** @type {const} */ ([['colliders-r2', 'r2'], ['colliders-partial', 'partialCorrelation']])) {
    const box = $(id);
    if (box.clientWidth > 0) box.innerHTML = colliderCurveFigure(r, measure, { width: box.clientWidth, height: box.clientWidth < 520 ? 230 : 260 });
  }
  const schematic = $('colliders-schematic');
  if (schematic.clientWidth > 0) schematic.innerHTML = colliderSchematic(r.colliders, { width: Math.min(schematic.clientWidth, 420) });
  const p = r.colliders.toLocaleString('en-US');
  $('colliders-readout').innerHTML = `Y and U are independent. Regressing Y on ${p} collider${r.colliders === 1 ? '' : 's'}, each correlated ${formatNumber(r.rYX)} with Y and ${formatNumber(r.rUX)} with U, explains ${formatNumber(r.r2 * 100, 1)}% of Y's variance, and given ${r.colliders === 1 ? 'it' : 'them'}, Y and U correlate ${formatNumber(r.partialCorrelation, 3)}.`;
  $('colliders-stats').innerHTML = [
    stat('Cor(X, U)', formatNumber(r.rUX, 3)),
    stat('Cor(X<sub><var>i</var></sub>, X<sub><var>j</var></sub>)', formatNumber(r.rXX, 3)),
    stat('R² of Y on the X\'s', formatNumber(r.r2, 3)),
    stat('Partial correlation of Y and U', formatNumber(r.partialCorrelation, 3)),
  ].join('');
}
$('colliders-reset').addEventListener('click', () => {
  state.colliders = { ...DEFAULTS.colliders };
  showColliderControls();
  renderColliders();
});
onWidth($('colliders-r2'), () => renderColliders());

// ---------- Start ----------

buildAdjustControls();
input('sample-n').value = String(state.sample.n);
input('sample-seed').value = String(state.sample.seed);
showColliderControls();

installApi({
  entry: ENTRY,
  load: (/** @type {any} */ p) => {
    state.view = p.view;
    if (p.view === 'colliders') {
      state.colliders = { colliders: p.colliders, rYX: p.rYX, share: p.share };
      showColliderControls();
      renderColliders();
    } else {
      const preset = p.graph.name && Object.hasOwn(PRESETS, p.graph.name) ? p.graph.name : null;
      state.adjust = { preset, graph: structuredClone(p.graph), exposure: p.exposure, outcome: p.outcome, adjust: [...p.adjust], mediator: p.mediator, noise: p.noise };
      state.sample = { show: p.sample !== null, n: p.sample?.n ?? state.sample.n, seed: p.sample?.seed ?? state.sample.seed };
      input('sample-show').checked = state.sample.show;
      input('sample-n').value = String(state.sample.n);
      input('sample-seed').value = String(state.sample.seed);
      buildAdjustControls();
      renderAdjust();
    }
    $(p.view).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor(state.view)),
});
