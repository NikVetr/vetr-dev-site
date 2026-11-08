// Page wiring for where the probability mass is: four panels over compute(), each
// with its own controls and figures. Every number shown comes from compute.js.

import { formatNumber, formatShare } from '../lib/format.js';
import { bindPair, installApi, integerField, onWidth, setInvalid } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { swatch } from '../lib/plot.js';
import { compute, CUBE_DIMENSIONS, DEFAULTS, ENTRY, PRESETS, resolveParams } from './compute.js';
import { coverageFigure, cubeFigure, formatTinyShare, modesFigure, powerOfTen, shellFigure, shellSweepFigure, sphereFigure } from './figure.js';

/** @typedef {import('./compute.js').View} View */
/** @typedef {import('./compute.js').Component} Component */
/** @typedef {import('./compute.js').Family} Family */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const FAMILY_NAMES = { normal: 'normal', laplace: 'Laplace', uniform: 'uniform', logistic: 'logistic', t3: 't with 3 degrees of freedom', cauchy: 'Cauchy' };
const PAGE_SAMPLE = { cube: { n: 400, seed: 1 }, sphere: { n: 2000, seed: 1 } };

const fresh = () => ({
  shell: { ...DEFAULTS.shell },
  cube: { family: DEFAULTS.cube.family, ...PAGE_SAMPLE.cube, k: 64 },
  modes: { components: /** @type {Component[]} */ (PRESETS.bathtub.map((c) => ({ ...c }))), level: DEFAULTS.modes.level },
  sphere: { k: DEFAULTS.sphere.k, band: DEFAULTS.sphere.band, ...PAGE_SAMPLE.sphere },
});
const state = { view: /** @type {View} */ ('shell'), ...fresh() };

/** The request params a panel's controls describe. @param {View} view */
function paramsFor(view) {
  if (view === 'shell') return { view, ...state.shell };
  if (view === 'cube') return { view, family: state.cube.family, sample: state.cube.n > 0 ? { n: state.cube.n, seed: state.cube.seed } : null };
  if (view === 'modes') return { view, components: state.modes.components, level: state.modes.level };
  return { view, k: state.sphere.k, band: state.sphere.band, sample: state.sphere.n > 0 ? { n: state.sphere.n, seed: state.sphere.seed } : null };
}

// Whichever panel was used last is the one window.Intuitions.getRequest() reports.
for (const view of /** @type {View[]} */ (['shell', 'cube', 'modes', 'sphere'])) {
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) $(view).addEventListener(type, () => { state.view = view; });
}

/** A k slider on a log10 scale. @param {string} id @param {(v: number) => void} onInput */
const kPair = (id, onInput) => bindPair({
  range: input(`${id}-range`), number: input(`${id}-number`), onInput, decimals: 0, integer: true,
  toRange: (v) => Math.log10(v), fromRange: (p) => Math.round(10 ** p),
});

// ---------- 1. Density × volume ----------

const shellControls = {
  k: kPair('shell-k', (v) => { state.shell.k = v; renderShell(); }),
  coverage: bindPair({ range: input('shell-coverage-range'), number: input('shell-coverage-number'), onInput: (v) => { state.shell.coverage = v / 100; renderShell(); }, decimals: 0 }),
  radius: bindPair({ range: input('shell-radius-range'), number: input('shell-radius-number'), onInput: (v) => { state.shell.radius = v; renderShell(); }, decimals: 1 }),
};
function showShellControls() {
  shellControls.k.set(state.shell.k);
  shellControls.coverage.set(state.shell.coverage * 100);
  shellControls.radius.set(state.shell.radius);
}
function renderShell() {
  const r = /** @type {any} */ (compute(paramsFor('shell')));
  $('shell-legend').innerHTML = [
    `<li>${swatch({ line: 'a-line', shape: 'circle', mark: 'a-mark' })} density</li>`,
    `<li>${swatch({ line: 'b-line dashed', shape: 'triangle', mark: 'b-mark' })} volume at distance r</li>`,
    `<li>${swatch({ fill: 'mass-swatch', line: 'ink-line' })} mass, their product</li>`,
    `<li>${swatch({ fill: 'shell-fill' })} shell holding ${formatShare(r.coverage)}</li>`,
  ].join('');
  const box = $('shell-plot');
  const width = box.clientWidth;
  if (width > 0) box.innerHTML = shellFigure(r, { width, height: width < 520 ? 270 : 320 });
  const sweep = $('shell-sweep');
  if (sweep.clientWidth > 0) sweep.innerHTML = shellSweepFigure(r, { width: sweep.clientWidth, height: sweep.clientWidth < 520 ? 240 : 280 });
  const ball = formatTinyShare(r.ball.mass, r.ball.log10Mass);
  const ratio = r.log10DensityRatio > -2 ? `${formatNumber(10 ** r.log10DensityRatio, 3)} times` : `about ${powerOfTen(Math.round(r.log10DensityRatio))} times`;
  $('shell-readout').innerHTML = r.k === 1
    ? `In one dimension the mass is greatest at the mode: there is no volume to grow. ${formatShare(r.coverage)} of it lies within ${formatNumber(r.hdrRadius)} of the mode.`
    : `In ${r.k.toLocaleString('en-US')} dimensions, ${formatShare(r.coverage)} of the mass lies between <var>r</var> = ${formatNumber(r.shell.lo)} and ${formatNumber(r.shell.hi)}. At the mass's peak, <var>r</var> = ${formatNumber(r.mode)}, the density is ${ratio} its value at the mode. A ball of radius ${formatNumber(r.ball.radius, 1)} around the mode holds ${ball} of the mass.`;
  $('shell-stats').innerHTML = [
    stat('Mass peaks at √(<var>k</var> − 1)', formatNumber(r.mode)),
    stat('Mean distance', formatNumber(r.mean)),
    stat('SD of the distance', formatNumber(r.sd, 3)),
    stat(`Ball holding ${formatShare(r.coverage)}`, `<var>r</var> ≤ ${formatNumber(r.hdrRadius)}`),
  ].join('');
}
$('shell-reset').addEventListener('click', () => {
  state.shell = fresh().shell;
  showShellControls();
  renderShell();
});
onWidth($('shell-plot'), () => renderShell());
onWidth($('shell-sweep'), () => renderShell());

// ---------- 2. The cube criterion ----------

const cubeK = /** @type {HTMLSelectElement} */ ($('cube-k'));
cubeK.innerHTML = CUBE_DIMENSIONS.map((k) => `<option value="${k}">${k.toLocaleString('en-US')}</option>`).join('');
/** @type {any} */
let cubeResult = null;
function showCubeControls() {
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="cube-family"]'))) radio.checked = radio.value === state.cube.family;
  input('cube-n').value = String(state.cube.n);
  input('cube-seed').value = String(state.cube.seed);
  cubeK.value = String(state.cube.k);
}
function computeCube() {
  cubeResult = compute(paramsFor('cube'));
  renderCube();
}
function renderCube() {
  const r = cubeResult;
  $('cube-legend').innerHTML = [
    `<li>${swatch({ line: 'ink-line dashed' })} cube corner, a*√k</li>`,
    r.sample ? `<li>${swatch({ line: 'a-range', shape: 'circle', mark: 'a-mark' })} sampled radius, median and 5–95%</li>` : '',
    r.exact ? `<li>${swatch({ line: 'c-line' })} exact median (normal)</li>` : '',
  ].join('');
  const box = $('cube-plot');
  const width = box.clientWidth;
  if (width > 0) box.innerHTML = cubeFigure(r, { width, height: width < 520 ? 280 : 340 });
  const i = CUBE_DIMENSIONS.indexOf(state.cube.k);
  const k = state.cube.k;
  const name = FAMILY_NAMES[/** @type {Family} */ (r.family)];
  const held = formatTinyShare(10 ** r.log10CubeMass[i], r.log10CubeMass[i]);
  let text = `For the ${name}, a·d(a) is largest at <var>a</var>* = ${formatNumber(r.halfWidth, 3)}, so the cube criterion puts the mass at ${formatNumber(r.distance[i], 2)} from the centre when <var>k</var> = ${k.toLocaleString('en-US')}. That cube holds only ${held} of the mass.`;
  if (r.sample) {
    text += ` The sampled points have median distance ${formatNumber(r.sample.median[i], 2)}`;
    text += r.sd === null ? ', and with no finite variance the Cauchy\'s distance grows like k, not √k.' : `, near σ√k = ${formatNumber(r.sd * Math.sqrt(k), 2)}.`;
  }
  $('cube-readout').innerHTML = text;
  $('cube-stats').innerHTML = [
    stat('Half-width <var>a</var>*', formatNumber(r.halfWidth, 3)),
    stat('One coordinate within ±<var>a</var>*', formatShare(r.withinHalfWidth)),
    stat('SD of one coordinate', r.sd === null ? 'none (Cauchy)' : formatNumber(r.sd, 3)),
    r.sample ? stat(`Sampled 5–95%, <var>k</var> = ${k.toLocaleString('en-US')}`, `${formatNumber(r.sample.lo[i], 1)} to ${formatNumber(r.sample.hi[i], 1)}`) : '',
  ].join('');
}
for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="cube-family"]'))) {
  radio.addEventListener('change', () => { state.cube.family = /** @type {Family} */ (radio.value); computeCube(); });
}
integerField(input('cube-n'), (v) => { state.cube.n = v; computeCube(); });
integerField(input('cube-seed'), (v) => { state.cube.seed = v; computeCube(); });
$('cube-new-seed').addEventListener('click', () => {
  state.cube.seed = (state.cube.seed + 1) % 4294967296;
  input('cube-seed').value = String(state.cube.seed);
  computeCube();
});
cubeK.addEventListener('change', () => { state.cube.k = Number(cubeK.value); renderCube(); });
$('cube-reset').addEventListener('click', () => {
  state.cube = fresh().cube;
  showCubeControls();
  computeCube();
});
onWidth($('cube-plot'), () => { if (cubeResult) renderCube(); });

// ---------- 3. When the mode misleads ----------

const levelPair = bindPair({ range: input('modes-level-range'), number: input('modes-level-number'), onInput: (v) => { state.modes.level = v / 100; renderModes(); }, decimals: 0 });
const grid = $('modes-components');
/** @type {[keyof Component, string, number, number, number][]} */
const COMPONENT_FIELDS = [['weight', 'Weight', 0.001, 1000, 0.1], ['location', 'Location', -100, 100, 0.5], ['scale', 'Scale', 0.001, 100, 0.1]];

function buildComponents() {
  const head = `<thead><tr><th scope="col"><span class="visually-hidden">Component</span></th>${COMPONENT_FIELDS.map(([, label]) => `<th scope="col">${label}</th>`).join('')}<th scope="col">Shape</th></tr></thead>`;
  const rows = state.modes.components.map((c, i) => `<tr><th scope="row">${i + 1}</th>${COMPONENT_FIELDS.map(([key, label, min, max, step]) => `<td><input type="number" min="${min}" max="${max}" step="${step}" value="${c[key]}" data-index="${i}" data-key="${key}" aria-label="${label}, component ${i + 1}"></td>`).join('')}<td><select data-index="${i}" data-key="shape" aria-label="Shape, component ${i + 1}"><option value="normal"${c.shape === 'normal' ? ' selected' : ''}>normal</option><option value="laplace"${c.shape === 'laplace' ? ' selected' : ''}>Laplace</option></select></td></tr>`).join('');
  grid.innerHTML = `<caption class="visually-hidden">Mixture components</caption>${head}<tbody>${rows}</tbody>`;
  /** @type {HTMLButtonElement} */ ($('modes-add')).disabled = state.modes.components.length >= 3;
  /** @type {HTMLButtonElement} */ ($('modes-remove')).disabled = state.modes.components.length <= 1;
}
function showModesControls() {
  levelPair.set(state.modes.level * 100);
  buildComponents();
}
function renderModes() {
  /** @type {any} */
  let r;
  for (const field of grid.querySelectorAll('input')) setInvalid(field, false);
  try {
    r = compute(paramsFor('modes'));
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    const box = $('modes-issues');
    box.hidden = false;
    box.innerHTML = error.issues.map((issue) => {
      const m = /components\[(\d+)\]\.(\w+)/.exec(issue.path);
      if (m) {
        const field = grid.querySelector(`[data-index="${m[1]}"][data-key="${m[2]}"]`);
        if (field) setInvalid(/** @type {HTMLElement} */ (field), true);
        return `<p>Component ${Number(m[1]) + 1}, ${m[2]}: ${issue.message.replace(/-(?=\d)/g, '−')}.</p>`;
      }
      return `<p>${issue.message}.</p>`;
    }).join('');
    $('modes-figures').dataset.stale = 'true';
    return;
  }
  $('modes-issues').hidden = true;
  delete $('modes-figures').dataset.stale;
  const box = $('modes-plot');
  const width = box.clientWidth;
  if (width > 0) box.innerHTML = modesFigure(r, { width, height: width < 520 ? 260 : 300 });
  const cov = $('coverage-plot');
  if (cov.clientWidth > 0) cov.innerHTML = coverageFigure(r, { width: cov.clientWidth, height: 200 });
  const modeRegion = r.regions.find((/** @type {any} */ g) => g.containsMode);
  const parts = [];
  if (r.level > 0 && r.level < 1) {
    parts.push(`At ${formatShare(r.level)} of the peak the water covers ${formatShare(r.covered)} of the mass, in ${r.regions.length === 1 ? 'one region' : `${r.regions.length} separate regions`}.`);
    if (modeRegion && r.regions.length > 1) parts.push(`The region around the mode holds ${formatShare(modeRegion.mass)}.`);
  } else parts.push(r.level === 0 ? 'At level 0 the region is the whole line.' : 'At the peak nothing is above the water.');
  if (r.densityAtMean < 0.01) parts.push(`The mean, ${formatNumber(r.mean)}, sits where the density is under 1% of its peak.`);
  $('modes-readout').innerHTML = parts.join(' ');
  $('modes-stats').innerHTML = [
    stat('Mode ▲', formatNumber(r.mode)),
    stat('Mean ◆', formatNumber(r.mean)),
    stat('Median ■', formatNumber(r.median)),
    stat('Covered', formatShare(r.covered)),
  ].join('');
}
grid.addEventListener('input', (event) => {
  const field = /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target);
  const i = Number(field.dataset.index);
  const key = /** @type {keyof Component} */ (field.dataset.key);
  const c = /** @type {Record<string, any>} */ (state.modes.components[i]);
  c[key] = key === 'shape' ? field.value : field.value.trim() === '' ? NaN : Number(field.value);
  renderModes();
});
for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('[data-preset]'))) {
  button.addEventListener('click', () => {
    state.modes.components = PRESETS[/** @type {keyof typeof PRESETS} */ (button.dataset.preset)].map((c) => ({ ...c }));
    buildComponents();
    renderModes();
  });
}
$('modes-add').addEventListener('click', () => {
  const last = state.modes.components[state.modes.components.length - 1];
  state.modes.components.push({ weight: 0.2, location: Number.isFinite(last.location) ? Math.min(100, last.location + 4) : 0, scale: 1, shape: 'normal' });
  buildComponents();
  renderModes();
});
$('modes-remove').addEventListener('click', () => {
  state.modes.components.pop();
  buildComponents();
  renderModes();
});
onWidth($('modes-plot'), () => renderModes());

// ---------- 4. A sphere's points crowd its equator ----------

const sphereControls = {
  k: kPair('sphere-k', (v) => { state.sphere.k = v; renderSphere(); }),
  band: bindPair({ range: input('sphere-band-range'), number: input('sphere-band-number'), onInput: (v) => { state.sphere.band = v; renderSphere(); } }),
};
function showSphereControls() {
  sphereControls.k.set(state.sphere.k);
  sphereControls.band.set(state.sphere.band);
  input('sphere-n').value = String(state.sphere.n);
  input('sphere-seed').value = String(state.sphere.seed);
}
function renderSphere() {
  const r = /** @type {any} */ (compute(paramsFor('sphere')));
  const box = $('sphere-plot');
  const width = box.clientWidth;
  if (width > 0) box.innerHTML = sphereFigure(r, { width, height: width < 520 ? 250 : 300 });
  const band = formatNumber(r.band);
  $('sphere-readout').innerHTML = `In ${r.k.toLocaleString('en-US')} dimensions ${formatShare(r.bandMass)} of the sphere's points have |<var>x</var>₁| < ${band}${r.k === 3 ? ' (exactly the band\'s share of [−1, 1], as Archimedes found)' : ''}.${r.sample ? ` Of the ${r.sample.n.toLocaleString('en-US')} sampled points, ${formatShare(r.sample.bandShare)} do.` : ''}`;
  $('sphere-stats').innerHTML = [
    stat('SD of <var>x</var>₁, 1/√<var>k</var>', formatNumber(r.sd, 3)),
    stat(`Exact share within ±${band}`, formatShare(r.bandMass)),
    r.sample ? stat('Sampled share (Monte Carlo)', formatShare(r.sample.bandShare)) : '',
    stat('Normal approximation', formatShare(r.normalBandMass)),
  ].join('');
}
integerField(input('sphere-n'), (v) => { state.sphere.n = v; renderSphere(); });
integerField(input('sphere-seed'), (v) => { state.sphere.seed = v; renderSphere(); });
$('sphere-new-seed').addEventListener('click', () => {
  state.sphere.seed = (state.sphere.seed + 1) % 4294967296;
  input('sphere-seed').value = String(state.sphere.seed);
  renderSphere();
});
$('sphere-reset').addEventListener('click', () => {
  state.sphere = fresh().sphere;
  showSphereControls();
  renderSphere();
});
onWidth($('sphere-plot'), () => renderSphere());

// ---------- Start ----------

showShellControls();
showCubeControls();
showModesControls();
showSphereControls();
computeCube();

installApi({
  presentation: {
    capture: () => ({ cubeK: state.cube.k }),
    restore: (saved) => { state.cube.k = saved.cubeK; showCubeControls(); renderCube(); },
  },
  entry: ENTRY,
  load: (/** @type {any} */ p) => {
    state.view = p.view;
    if (p.view === 'shell') {
      state.shell = { k: p.k, coverage: p.coverage, radius: p.radius };
      showShellControls();
      renderShell();
    } else if (p.view === 'cube') {
      state.cube = { ...state.cube, family: p.family, n: p.sample?.n ?? 0, seed: p.sample?.seed ?? state.cube.seed };
      showCubeControls();
      computeCube();
    } else if (p.view === 'modes') {
      state.modes = { components: p.components.map((/** @type {Component} */ c) => ({ ...c })), level: p.level };
      showModesControls();
      renderModes();
    } else {
      state.sphere = { k: p.k, band: p.band, n: p.sample?.n ?? 0, seed: p.sample?.seed ?? state.sphere.seed };
      showSphereControls();
      renderSphere();
    }
    $(p.view).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor(state.view)),
});
