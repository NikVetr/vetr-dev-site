// Page wiring for the geometry of correlation: five panels over compute(), each
// with its own controls and figures. Every number shown comes from compute.js.

import { attachRotation, orientation } from '../lib/geom3d.js';
import { formatNumber } from '../lib/format.js';
import { bindPair, draggable, installApi, onWidth, setInvalid } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { swatch } from '../lib/plot.js';
import {
  arrowOf, circleAngle, circleArrow, compute, cosineRuleInterval, det3, DEFAULTS, ENTRY, LIMITS, resolveParams, sampleMatrix, uniformMatrix,
} from './compute.js';
import {
  arrowsScene, coneScene, cosineScene, eigenFigure, intervalFigure, scatterFigure, sceneCamera, simplexScene, twoObservationsFigure, widthCurveFigure, zeroPairFigure,
} from './figure.js';

/** @typedef {import('./compute.js').View} View */
/** @typedef {import('../lib/geom3d.js').Quat} Quat */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const LETTERS = 'ABCDEFGH';
const MAX_PAGE_P = 8;
const deg = (/** @type {number} */ v) => `${formatNumber(v, 1)}°`;
const r6 = (/** @type {number} */ v) => Number(v.toFixed(6));
const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
/** r with a two-letter subscript, as HTML. @param {string} pair */
const rSub = (pair) => `<var>r</var><sub>${pair}</sub>`;

const fresh = () => ({
  arrows: { a: [...DEFAULTS.arrows.a], b: [...DEFAULTS.arrows.b], saved: { a: [...DEFAULTS.arrows.a], b: [...DEFAULTS.arrows.b] } },
  cone: { angleB: 60, angleA: 150, rBC: /** @type {number} */ (DEFAULTS.cone.rBC) },
  cosine: { rAB: /** @type {number} */ (DEFAULTS['cosine-rule'].rAB), rBC: /** @type {number} */ (DEFAULTS['cosine-rule'].rBC), phi: 120 },
  equi: { zeroPair: false, k: /** @type {number} */ (DEFAULTS.equicorrelation.k), r: /** @type {number} */ (DEFAULTS.equicorrelation.r), c: 0.5 },
  entry: {
    matrix: DEFAULTS['entry-range'].matrix.map((row) => [...row]),
    cell: /** @type {[number, number]} */ ([...DEFAULTS['entry-range'].cell]),
    observations: /** @type {number} */ (DEFAULTS['entry-range'].observations),
    source: 'An example matrix.',
    seed: 1,
  },
});
const state = { view: /** @type {View} */ ('arrows'), ...fresh() };

/** The request params a panel's controls describe. @param {View} view */
function paramsFor(view) {
  if (view === 'arrows') return { view, a: state.arrows.a, b: state.arrows.b };
  if (view === 'cone') return { view, b: circleArrow(state.cone.angleB).map(r6), a: circleArrow(state.cone.angleA).map(r6), rBC: state.cone.rBC };
  if (view === 'cosine-rule') return { view, rAB: state.cosine.rAB, rBC: state.cosine.rBC, rAC: cosineValue() };
  if (view === 'equicorrelation') return { view, k: state.equi.k, r: state.equi.zeroPair ? state.equi.c : state.equi.r, zeroPair: state.equi.zeroPair };
  return { view, matrix: state.entry.matrix, cell: state.entry.cell, observations: state.entry.observations };
}

// Whichever panel was used last is the one window.Intuitions.getRequest() reports.
for (const view of /** @type {View[]} */ (['arrows', 'cone', 'cosine-rule', 'equicorrelation', 'entry-range'])) {
  for (const type of ['input', 'pointerdown', 'keydown']) $(view).addEventListener(type, () => { state.view = view; });
}

// ---------- 3-D scenes ----------

const TURNS = /** @type {const} */ ([['left', '◀', 'Turn left'], ['right', '▶', 'Turn right'], ['up', '▲', 'Tilt up'], ['down', '▼', 'Tilt down']]);

/** @type {{capture:()=>Quat,restore:(saved:Quat)=>void}[]} */
const sceneHistory = [];
/**
 * A rotatable scene in `<id>-scene` with its turn buttons in `<id>-view`. `draw`
 * gets a camera and returns the SVG. Returns the redraw function.
 * @param {string} id @param {Quat} start @param {(camera: import('../lib/geom3d.js').Camera) => string} draw
 */
function scene(id, start, draw) {
  const box = $(`${id}-scene`);
  let rotation = start;
  const render = () => {
    const width = box.clientWidth;
    if (width <= 0) return;
    box.innerHTML = draw(sceneCamera(rotation, width, Math.round(Math.max(260, Math.min(440, width * 0.86)))));
  };
  const control = attachRotation(box, { get: () => rotation, set: (q) => { rotation = q; render(); } });
  const bar = $(`${id}-view`);
  bar.innerHTML = `${TURNS.map(([dir, glyph, label]) => `<button type="button" class="icon" data-turn="${dir}" aria-label="${label}" title="${label}">${glyph}</button>`).join('')}<button type="button" data-turn="reset">Reset view</button><span class="hint">Drag, or focus the figure and use the arrow keys.</span>`;
  bar.addEventListener('click', (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('button');
    if (!button) return;
    const dir = button.dataset.turn;
    if (dir === 'reset') {
      rotation = start;
      render();
    } else control.turnBy(/** @type {'left' | 'right' | 'up' | 'down'} */ (dir));
  });
  onWidth(box, render);
  sceneHistory.push({ capture: () => /** @type {Quat} */ ([...rotation]), restore: (saved) => { rotation = saved; render(); } });
  return render;
}

/**
 * Wraps a compute call for a panel: on an invalid request, shows the issues in
 * `issuesBox` and returns null.
 * @param {object} params @param {HTMLElement} issuesBox @param {(issue: import('../lib/params.js').Issue) => string} describe
 */
function attempt(params, issuesBox, describe) {
  try {
    const out = /** @type {any} */ (compute(params));
    issuesBox.hidden = true;
    return out;
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    issuesBox.hidden = false;
    issuesBox.innerHTML = error.issues.map((issue) => `<p>${describe(issue)}</p>`).join('');
    return null;
  }
}

// ---------- 1. A variable is an arrow ----------

const arrowsPanel = {
  scatter: $('arrows-scatter'),
  /** @type {ReturnType<typeof scatterFigure> | null} */
  layout: null,
  /** The scatterplot's scale is held still while a point is dragged. @type {ReturnType<typeof scatterFigure>['domain'] | undefined} */
  frozen: undefined,
  /** @type {any} */
  result: null,
};
const arrowsIssues = document.createElement('div');
arrowsIssues.className = 'issues';
arrowsIssues.setAttribute('role', 'alert');
arrowsIssues.hidden = true;
$('arrows-readout').before(arrowsIssues);

const renderArrowsScene = scene('arrows', orientation(-20, 30), (camera) => {
  const r = arrowsPanel.result;
  if (!r) return '';
  if (r.n === 2) return twoObservationsFigure(r, { width: camera.width, height: Math.min(camera.height, 340) });
  return arrowsScene(r, camera);
});

function buildArrowsTable() {
  const { a, b } = state.arrows;
  $('arrows-data').innerHTML = `<caption class="visually-hidden">Observations of A and B</caption><thead><tr><th scope="col">Obs.</th><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody>${a.map((x, i) => `<tr><th scope="row">${i + 1}</th>${[x, b[i]].map((v, k) => `<td><input type="number" step="0.5" min="${-LIMITS.value}" max="${LIMITS.value}" value="${v}" data-obs="${i}" data-var="${k ? 'b' : 'a'}" aria-label="${k ? 'B' : 'A'}, observation ${i + 1}"></td>`).join('')}</tr>`).join('')}</tbody>`;
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="arrows-n"]'))) radio.checked = Number(radio.value) === a.length;
}

function showArrowValues() {
  for (const field of /** @type {NodeListOf<HTMLInputElement>} */ ($('arrows-data').querySelectorAll('input'))) {
    if (document.activeElement === field) continue;
    const list = state.arrows[/** @type {'a' | 'b'} */ (field.dataset.var)];
    field.value = String(list[Number(field.dataset.obs)]);
  }
}

function renderArrows() {
  arrowsPanel.result = attempt(paramsFor('arrows'), arrowsIssues, (issue) => `${issue.path.endsWith('a') ? 'A' : 'B'} ${issue.message}.`);
  const r = arrowsPanel.result;
  const width = arrowsPanel.scatter.clientWidth;
  if (width > 0) {
    arrowsPanel.layout = scatterFigure(state.arrows, { width, height: Math.min(220, Math.max(170, width * 0.8)), domain: arrowsPanel.frozen });
    arrowsPanel.scatter.innerHTML = arrowsPanel.layout.svg;
  }
  const box = $('arrows-scene');
  const three = r?.n === 3;
  box.toggleAttribute('tabindex', three);
  if (three) box.setAttribute('tabindex', '0');
  $('arrows-view').hidden = !three;
  renderArrowsScene();
  if (!r) {
    $('arrows-readout').textContent = '';
    $('arrows-caption').textContent = '';
    return;
  }
  const vec = (/** @type {number[]} */ v) => `(${v.map((x) => formatNumber(x)).join(', ')})`;
  if (r.n === 2) {
    $('arrows-readout').innerHTML = `With two observations every centred variable becomes (√½, −√½) or (−√½, √½), so <var>r</var> can only be 1 or −1. Here A and B ${r.r > 0 ? 'rise together' : 'move in opposite directions'}: <var>r</var> = ${formatNumber(r.r, 0)}.`;
    $('arrows-caption').innerHTML = 'Observation space for two observations, one axis per observation. The dashed line is where the two coordinates sum to 0; it meets the unit circle at the only two centred arrows.';
  } else {
    $('arrows-readout').innerHTML = `<var>r</var> = ${formatNumber(r.r, 3)} = cos ${deg(r.angle)}. A's arrow is ${vec(r.vectors[0])} and B's is ${vec(r.vectors[1])}; their dot product is <var>r</var>.`;
    $('arrows-caption').innerHTML = 'Observation space for three observations: the unit sphere, the plane where the coordinates sum to 0 (shaded) and the great circle where they meet. Every centred arrow lies on that circle. Faint lines are on the far side.';
  }
}

$('arrows-data').addEventListener('input', (event) => {
  const field = /** @type {HTMLInputElement} */ (event.target);
  const v = Number(field.value);
  const ok = field.value.trim() !== '' && Number.isFinite(v) && Math.abs(v) <= LIMITS.value;
  setInvalid(field, !ok);
  if (!ok) return;
  state.arrows[/** @type {'a' | 'b'} */ (field.dataset.var)][Number(field.dataset.obs)] = v;
  renderArrows();
});
for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="arrows-n"]'))) {
  radio.addEventListener('change', () => {
    const n = Number(radio.value);
    const s = state.arrows;
    if (n === s.a.length) return;
    if (n === 2) {
      s.saved = { a: [...s.a], b: [...s.b] };
      s.a = s.a.slice(0, 2);
      s.b = s.b.slice(0, 2);
    } else {
      s.a = [...s.a, s.saved.a[2]];
      s.b = [...s.b, s.saved.b[2]];
    }
    buildArrowsTable();
    renderArrows();
  });
}
draggable(arrowsPanel.scatter, {
  onStart: (target) => {
    const key = target.closest('[data-drag]')?.getAttribute('data-drag') ?? null;
    if (key) arrowsPanel.frozen = arrowsPanel.layout?.domain;
    return key;
  },
  onMove: (key, px, py) => {
    const layout = arrowsPanel.layout;
    if (!layout) return;
    const i = Number(key.slice(1));
    const clamp = (/** @type {number} */ v, /** @type {[number, number]} */ d) => Math.round(Math.max(d[0], Math.min(d[1], v)) * 10) / 10;
    state.arrows.a[i] = clamp(layout.x.invert(px), layout.domain.a);
    state.arrows.b[i] = clamp(layout.y.invert(py), layout.domain.b);
    showArrowValues();
    renderArrows();
  },
  onEnd: () => {
    arrowsPanel.frozen = undefined;
    renderArrows();
  },
});
$('arrows-reset').addEventListener('click', () => {
  state.arrows = fresh().arrows;
  buildArrowsTable();
  renderArrows();
});

// ---------- 2. Fixing a correlation draws a cone ----------

/** @type {any} */
let coneResult = null;
const coneControls = {
  r: bindPair({ range: input('cone-r-range'), number: input('cone-r-number'), onInput: (v) => { state.cone.rBC = v; renderCone(); } }),
  b: bindPair({ range: input('cone-b-range'), number: input('cone-b-number'), onInput: (v) => { state.cone.angleB = v; renderCone(); }, decimals: 0 }),
  a: bindPair({ range: input('cone-a-range'), number: input('cone-a-number'), onInput: (v) => { state.cone.angleA = v; renderCone(); }, decimals: 0 }),
};
const renderConeScene = scene('cone', orientation(-20, 30), (camera) => (coneResult ? coneScene(coneResult, camera) : ''));
function showConeControls() {
  coneControls.r.set(state.cone.rBC);
  coneControls.b.set(state.cone.angleB);
  coneControls.a.set(state.cone.angleA);
}
function renderCone() {
  coneResult = compute(paramsFor('cone'));
  renderConeScene();
  const [w1, w2] = coneResult.withA;
  const same = Math.abs(state.cone.rBC) > 0.9999;
  $('cone-readout').innerHTML = same
    ? `With ${rSub('BC')} = ${formatNumber(state.cone.rBC, 0)}, C is ${state.cone.rBC > 0 ? 'B itself' : 'B reversed'}, so ${rSub('AC')} = ${formatNumber(w1)}.`
    : `C must be C₁ or C₂, so ${rSub('AC')} is ${formatNumber(w1)} or ${formatNumber(w2)}: nothing in between.`;
  $('cone-stats').innerHTML = [
    stat(`${rSub('AB')}`, formatNumber(coneResult.rAB)),
    stat('Cone half-angle', deg(coneResult.halfAngle)),
    stat(`A to C₁, θ₁`, `${deg(coneResult.anglesWithA[0])}`),
    stat(`A to C₂, θ₂`, `${deg(coneResult.anglesWithA[1])}`),
  ].join('');
}
$('cone-reset').addEventListener('click', () => {
  state.cone = fresh().cone;
  showConeControls();
  renderCone();
});

// ---------- 3. The cosine rule ----------

/** r_AC for C at angle φ around B's cone. */
function cosineValue() {
  const { centre, halfWidth } = cosineRuleInterval(state.cosine.rAB, state.cosine.rBC);
  return centre + halfWidth * Math.cos((state.cosine.phi * Math.PI) / 180);
}
const cosineControls = {
  ab: bindPair({ range: input('cos-ab-range'), number: input('cos-ab-number'), onInput: (v) => { state.cosine.rAB = v; renderCosine(); } }),
  bc: bindPair({ range: input('cos-bc-range'), number: input('cos-bc-number'), onInput: (v) => { state.cosine.rBC = v; renderCosine(); } }),
  phi: bindPair({ range: input('cos-phi-range'), number: input('cos-phi-number'), onInput: (v) => { state.cosine.phi = v; renderCosine(); }, decimals: 0 }),
};
const renderCosineScene = scene('cosine', orientation(-62, 26), (camera) => cosineScene(state.cosine, camera));
function showCosineControls() {
  cosineControls.ab.set(state.cosine.rAB);
  cosineControls.bc.set(state.cosine.rBC);
  cosineControls.phi.set(state.cosine.phi);
}
/** @param {string} [note] a message from window.Intuitions.submit */
function renderCosine(note) {
  const out = /** @type {any} */ (compute(paramsFor('cosine-rule')));
  const { rAB, rBC } = state.cosine;
  const [lo, hi] = out.interval;
  renderCosineScene();
  $('cosine-readout').innerHTML = `Here ${rSub('AC')} = ${formatNumber(out.rAC.value)}. Given ${rSub('AB')} and ${rSub('BC')} it can be anything from ${formatNumber(lo)} to ${formatNumber(hi)}, and nothing outside.`;
  const sumSquares = formatNumber(rAB * rAB + rBC * rBC);
  const [alpha, beta] = [out.angles.AB, out.angles.BC];
  const forced = out.forcedSign;
  let text;
  if (forced === 'positive') text = `<strong>Forced positive.</strong> ${rSub('AB')}² + ${rSub('BC')}² = ${sumSquares} is more than 1 and the two have the same sign, so even C's farthest position, <var>α</var> + <var>β</var> = ${deg(alpha + beta)} from A, is within 90°.`;
  else if (forced === 'negative') text = `<strong>Forced negative.</strong> ${rSub('AB')}² + ${rSub('BC')}² = ${sumSquares} is more than 1 and the two have opposite signs, so even C's nearest position, |<var>α</var> − <var>β</var>| = ${deg(Math.abs(alpha - beta))} from A, is beyond 90°.`;
  else text = `<strong>Either sign.</strong> ${rSub('AB')}² + ${rSub('BC')}² = ${sumSquares} is at most 1, so C can be at right angles to A. Above 1, ${rSub('AC')} would be forced to the sign of ${rSub('AB')}${rSub('BC')}.`;
  $('cosine-forced').innerHTML = note ? `${note} ${text}` : text;
  const box = $('cosine-interval');
  const width = box.clientWidth;
  if (width > 0) {
    box.innerHTML = intervalFigure({ lo, hi, centre: out.centre, value: out.rAC.value, detAt: (r) => det3(rAB, rBC, r), detMax: out.detMax, name: 'r(A,C)' }, { width, height: 230 });
  }
}
onWidth($('cosine-interval'), () => renderCosine());
$('cosine-reset').addEventListener('click', () => {
  state.cosine = fresh().cosine;
  showCosineControls();
  renderCosine();
});

// ---------- 4. How far apart can k arrows be? ----------

const equiControls = {
  k: bindPair({ range: input('equi-k-range'), number: input('equi-k-number'), onInput: (v) => { state.equi.k = v; renderEqui(); }, decimals: 0 }),
  r: bindPair({
    range: input('equi-r-range'), number: input('equi-r-number'),
    onInput: (v) => { if (state.equi.zeroPair) state.equi.c = v; else state.equi.r = v; renderEqui(); },
  }),
};
const tabs = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('#equicorrelation [role="tab"]')]);
/** @type {any} */
let equiDrawn = null;
const renderEquiScene = scene('equi', orientation(-20, 24), (camera) => (equiDrawn ? simplexScene(equiDrawn, camera) : ''));
function showEquiControls() {
  const { zeroPair, k } = state.equi;
  tabs.forEach((tab) => {
    const on = (tab.id === 'tab-zero') === zeroPair;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  $('equi-equal').hidden = zeroPair;
  $('equi-zero').hidden = !zeroPair;
  input('equi-k-range').min = input('equi-k-number').min = String(zeroPair ? 3 : 2);
  equiControls.k.set(k);
  equiControls.r.set(zeroPair ? state.equi.c : state.equi.r);
  $('equi-r-label').innerHTML = zeroPair ? 'Common correlation of the other pairs, <var>c</var>' : 'Common correlation, <var>r</var>';
  $('equi-low').textContent = zeroPair ? 'Go to the lowest c' : 'Go to the limit, −1/(k − 1)';
  $('equi-high').hidden = !zeroPair;
}
/** @param {boolean} zeroPair @param {boolean} [focus] */
function setMode(zeroPair, focus = false) {
  state.equi.zeroPair = zeroPair;
  if (zeroPair && state.equi.k < 3) state.equi.k = 3;
  showEquiControls();
  renderEqui();
  if (focus) tabs[zeroPair ? 1 : 0].focus();
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => setMode(i === 1));
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    setMode(i === 0, true);
  });
});
function renderEqui() {
  const out = /** @type {any} */ (compute(paramsFor('equicorrelation')));
  const { k, zeroPair } = out;
  const value = out.r;
  const [lo, hi] = out.range;
  const name = zeroPair ? '<var>c</var>' : '<var>r</var>';
  if (!zeroPair) {
    // Out of range there are no such arrows; the figure shows the nearest possible.
    const drawnR = Math.max(lo, value);
    equiDrawn = { k, r: drawnR, arrows: /** @type {any} */ (compute({ view: 'equicorrelation', k, r: drawnR })).arrows };
    renderEquiScene();
    $('equi-caption').innerHTML = k <= 3
      ? `Every pair of arrows is ${deg(Math.acos(drawnR) * (180 / Math.PI))} apart. Each arrow rises ${formatNumber(equiDrawn.arrows.along)} along the common direction (dashed); the parts across it form a ${k === 2 ? 'line segment' : 'triangle'}. The drawing is to scale.`
      : `Each arrow rises ${formatNumber(equiDrawn.arrows.along)} along the common direction (dashed); the parts across it form a regular simplex with ${k} corners. That simplex needs ${k - 1} dimensions, so it is drawn projected onto the shaded plane: the arrows look shorter than 1 and their drawn angles are not the true ${deg(Math.acos(drawnR) * (180 / Math.PI))}.`;
  } else {
    const box = $('zero-plot');
    const width = box.clientWidth;
    if (width > 0) box.innerHTML = zeroPairFigure(k, value, { width, height: Math.round(Math.max(260, Math.min(400, width * 0.7))) });
  }
  $('equi-readout').innerHTML = zeroPair
    ? `With variables 1 and 2 at right angles, the other pairs of ${k} variables can share any ${name} from ${formatNumber(lo, 3)} to ${formatNumber(hi, 3)}.`
    : `${k} arrows can all be ${deg(out.widestAngle)} apart at most (${name} = −1/${k - 1} = ${formatNumber(lo, 3)}). ${out.feasible ? `Here they are ${deg(out.angle)} apart.` : `They cannot all be ${deg(out.angle)} apart.`}`;
  const issue = $('equi-issue');
  issue.hidden = out.feasible;
  if (!out.feasible) {
    issue.innerHTML = `<p>No ${k} arrows can have ${zeroPair ? 'this pattern with ' : 'every '}${name} = ${formatNumber(value)}: the smallest eigenvalue is ${formatNumber(out.smallestEigenvalue, 3)}, below 0.${zeroPair ? '' : ` The figure shows the lowest possible, ${name} = ${formatNumber(lo, 3)}.`}</p>`;
  }
  const box = $('equi-eigen');
  const width = box.clientWidth;
  if (width > 0) box.innerHTML = eigenFigure(out.eigenvalues, k, { width, height: 190 });
  $('equi-eigen-caption').innerHTML = zeroPair
    ? `Eigenvalues of this ${k} × ${k} matrix: 1 (variables 1 and 2 against each other)${k > 3 ? `, 1 − <var>c</var> ${k - 3 === 1 ? 'once' : `${k - 3} times`} (contrasts among the others)` : ''} and two from the rest, the smaller of which reaches 0 at both ends of <var>c</var>'s range.`
    : `Eigenvalues: 1 + (<var>k</var> − 1)<var>r</var> once (the arrows' sum) and 1 − <var>r</var> ${k - 1 === 1 ? 'once' : `${k - 1} times`} (contrasts between them). The first reaches 0 at <var>r</var> = −1/(<var>k</var> − 1), the second at <var>r</var> = 1. A negative bar (⚠) means no such arrows exist.`;
}
$('equi-low').addEventListener('click', () => {
  const out = /** @type {any} */ (compute(paramsFor('equicorrelation')));
  if (state.equi.zeroPair) state.equi.c = out.range[0];
  else state.equi.r = out.range[0];
  showEquiControls();
  renderEqui();
});
$('equi-high').addEventListener('click', () => {
  state.equi.c = /** @type {any} */ (compute(paramsFor('equicorrelation'))).range[1];
  showEquiControls();
  renderEqui();
});
onWidth($('zero-plot'), () => renderEqui());
onWidth($('equi-eigen'), () => renderEqui());
$('equi-reset').addEventListener('click', () => {
  state.equi = fresh().equi;
  showEquiControls();
  renderEqui();
});

// ---------- 5. One entry's room to move ----------

const entrySelect = /** @type {HTMLSelectElement} */ ($('entry-p'));
entrySelect.innerHTML = Array.from({ length: MAX_PAGE_P - 1 }, (_, i) => `<option value="${i + 2}">${i + 2}</option>`).join('');
const pairName = (/** @type {number} */ i, /** @type {number} */ j) => `${LETTERS[i]}${LETTERS[j]}`;
const obsPair = bindPair({ range: input('entry-obs-range'), number: input('entry-obs-number'), onInput: (v) => { state.entry.observations = v; renderEntry(); }, decimals: 0 });

function buildEntryGrid() {
  const { matrix } = state.entry;
  const p = matrix.length;
  entrySelect.value = String(p);
  const head = `<thead><tr><th scope="col"><span class="visually-hidden">Variable</span></th>${matrix.map((_, j) => `<th scope="col">${LETTERS[j]}</th>`).join('')}</tr></thead>`;
  const body = matrix.map((row, i) => `<tr><th scope="row">${LETTERS[i]}</th>${row.map((x, j) => (i === j
    ? '<td class="diag">1</td>'
    : `<td data-cell="${i},${j}"><input type="number" min="-1" max="1" step="0.05" value="${Number(x.toFixed(2))}" data-cell="${i},${j}" aria-label="Correlation of ${LETTERS[i]} and ${LETTERS[j]}"><span class="cell-width"></span></td>`)).join('')}</tr>`).join('');
  $('entry-grid').innerHTML = `<caption class="visually-hidden">Correlation matrix; choose a cell to see its interval</caption>${head}<tbody>${body}</tbody>`;
}

/** @param {import('../lib/params.js').Issue} issue */
const describeEntry = (issue) => (issue.code === 'not_positive_semidefinite'
  ? `The matrix ${issue.message.replace(/-(?=\d)/g, '−')}. Change an entry to bring it back.`
  : `${issue.message}.`);

function renderEntry() {
  const out = attempt(paramsFor('entry-range'), $('entry-issues'), describeEntry);
  $('entry-result').hidden = !out;
  const [ci, cj] = state.entry.cell;
  for (const td of /** @type {NodeListOf<HTMLElement>} */ ($('entry-grid').querySelectorAll('td[data-cell]'))) {
    const [i, j] = /** @type {string} */ (td.dataset.cell).split(',').map(Number);
    const chosen = (i === ci && j === cj) || (i === cj && j === ci);
    td.classList.toggle('chosen', chosen);
    td.classList.toggle('primary', i === ci && j === cj);
    const w = out ? out.widths[i][j] : null;
    td.dataset.shade = w === null ? '' : String(Math.min(6, Math.floor((w / 2) * 6.999)));
    const label = /** @type {HTMLElement} */ (td.querySelector('.cell-width'));
    label.textContent = w === null ? '' : `${chosen ? '● ' : ''}w ${formatNumber(w)}`;
    const field = /** @type {HTMLInputElement} */ (td.querySelector('input'));
    if (document.activeElement !== field) field.value = String(Number(state.entry.matrix[i][j].toFixed(2)));
  }
  $('entry-source').textContent = state.entry.source;
  const n = state.entry.observations;
  $('entry-sample-n').textContent = String(n);
  $('entry-legend').innerHTML = [
    `<li>${swatch({ line: 'ink-line' })} uniform over all correlation matrices</li>`,
    `<li>${swatch({ line: 'c-line' })} sample of ${n} observations</li>`,
    `<li>${swatch({ shape: 'diamond', mark: 'hollow-strong' })} the matrix above</li>`,
  ].join('');
  if (!out) return;
  const name = pairName(ci, cj);
  const [lo, hi] = out.interval;
  const explained = out.unexplained.map((/** @type {number} */ u) => `${Math.round((1 - u) * 100)}%`);
  let message;
  if (out.width < 1e-9) message = `${rSub(name)} = ${formatNumber(out.value)} cannot move at all: the other variables already fix both arrows (they explain all of ${LETTERS[ci]} or of ${LETTERS[cj]}), so the interval has width 0.`;
  else {
    message = `${rSub(name)} = ${formatNumber(out.value)} can move anywhere from ${formatNumber(lo)} to ${formatNumber(hi)} and the matrix stays a correlation matrix. The other variables explain ${explained[0]} of ${LETTERS[ci]} and ${explained[1]} of ${LETTERS[cj]}.`;
    if (out.singular && out.position !== null && (out.position < 1e-6 || out.position > 1 - 1e-6)) message += ' It sits at an end: det R = 0, so the arrows are linearly dependent.';
  }
  $('entry-readout').innerHTML = message;
  const box = $('entry-interval');
  const width = box.clientWidth;
  if (width > 0) {
    box.innerHTML = intervalFigure({
      lo, hi, centre: out.centre, value: out.value, detMax: out.detMax, name: `r(${LETTERS[ci]},${LETTERS[cj]})`,
      detAt: (r) => out.detOthers * ((out.width / 2) ** 2 - (r - out.centre) ** 2),
    }, { width, height: 230 });
  }
  $('entry-caption').innerHTML = out.detOthers < 1e-12
    ? `The other variables are linearly dependent among themselves, so det <var>R</var> = 0 whatever ${rSub(name)} is; the bar still shows where the matrix stays positive semidefinite.`
    : out.width < 1e-9 ? `The interval is a single point, ${formatNumber(out.centre)}: there det <var>R</var> = 0, and any other value makes it negative.`
    : `det <var>R</var> as ${rSub(name)} varies with the other entries fixed: 0 at both ends of the bar, largest at the centre ${formatNumber(out.centre)} (◇), the value a maximum-determinant completion would choose. The dot is the current value.`;
  $('entry-stats').innerHTML = [
    stat('Interval width', formatNumber(out.width)),
    stat('det <var>R</var>', formatNumber(out.det, 4)),
    stat('Smallest eigenvalue', formatNumber(out.eigenvalues[out.eigenvalues.length - 1], 3)),
    stat('Mean width, all cells', formatNumber(out.meanWidth)),
  ].join('');
  const curve = $('entry-curve');
  const cw = curve.clientWidth;
  if (cw > 0) curve.innerHTML = widthCurveFigure(out.expectedWidth, { p: out.p, meanWidth: out.meanWidth }, { width: cw, height: cw < 520 ? 260 : 320 });
}

/** @param {number[][]} matrix @param {string} source */
function setMatrix(matrix, source) {
  state.entry.matrix = matrix;
  state.entry.source = source;
  const p = matrix.length;
  if (state.entry.cell[0] >= p || state.entry.cell[1] >= p) state.entry.cell = [0, p - 1];
  buildEntryGrid();
  renderEntry();
}

$('entry-grid').addEventListener('input', (event) => {
  const field = /** @type {HTMLInputElement} */ (event.target);
  const [i, j] = /** @type {string} */ (field.dataset.cell).split(',').map(Number);
  const v = Number(field.value);
  const ok = field.value.trim() !== '' && Number.isFinite(v) && v >= -1 && v <= 1;
  setInvalid(field, !ok);
  if (!ok) return;
  state.entry.matrix[i][j] = state.entry.matrix[j][i] = v;
  state.entry.cell = [i, j];
  state.entry.source = 'Edited.';
  renderEntry();
});
$('entry-grid').addEventListener('focusin', (event) => {
  const field = /** @type {HTMLElement} */ (event.target);
  if (!field.dataset.cell) return;
  const [i, j] = field.dataset.cell.split(',').map(Number);
  if (i === state.entry.cell[0] && j === state.entry.cell[1]) return;
  state.entry.cell = [i, j];
  renderEntry();
});
entrySelect.addEventListener('change', () => {
  const p = Number(entrySelect.value);
  const old = state.entry.matrix;
  // A corner of a correlation matrix is one, and so is adding uncorrelated variables.
  setMatrix(Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? 1 : old[i]?.[j] ?? 0))), p < old.length ? `The first ${p} variables of the previous matrix.` : 'The previous matrix with uncorrelated variables added.');
});
$('entry-uniform').addEventListener('click', () => {
  const p = state.entry.matrix.length;
  const seed = state.entry.seed++;
  setMatrix(uniformMatrix(p, seed), `Drawn uniformly from all ${p} × ${p} correlation matrices (onion method, seed ${seed}).`);
});
$('entry-sample').addEventListener('click', () => {
  const p = state.entry.matrix.length;
  const n = state.entry.observations;
  const seed = state.entry.seed++;
  setMatrix(sampleMatrix(p, n, seed), `Sample correlation of ${n} observations of ${p} independent normal variables (seed ${seed})${p >= n ? `; with p ≥ n it is singular` : ''}.`);
});
$('entry-reset').addEventListener('click', () => {
  state.entry = fresh().entry;
  showEntryControls();
  buildEntryGrid();
  renderEntry();
});
function showEntryControls() {
  obsPair.set(state.entry.observations);
}
onWidth($('entry-interval'), () => renderEntry());
onWidth($('entry-curve'), () => renderEntry());

// ---------- Start ----------

buildArrowsTable();
showConeControls();
showCosineControls();
showEquiControls();
showEntryControls();
buildEntryGrid();
renderEntry();
onWidth(arrowsPanel.scatter, () => renderArrows());
renderCone();

installApi({
  presentation: {
    capture: () => sceneHistory.map((scene) => scene.capture()),
    restore: (saved) => sceneHistory.forEach((scene, i) => scene.restore(saved[i])),
  },
  entry: ENTRY,
  load: (/** @type {any} */ p) => {
    state.view = p.view;
    if (p.view === 'arrows') {
      state.arrows = { a: [...p.a], b: [...p.b], saved: p.a.length === 3 ? { a: [...p.a], b: [...p.b] } : state.arrows.saved };
      buildArrowsTable();
      renderArrows();
    } else if (p.view === 'cone') {
      state.cone = { angleB: Math.round(circleAngle(arrowOf(p.b))) % 360, angleA: Math.round(circleAngle(arrowOf(p.a))) % 360, rBC: p.rBC };
      showConeControls();
      renderCone();
    } else if (p.view === 'cosine-rule') {
      const { lo, hi, centre, halfWidth } = cosineRuleInterval(p.rAB, p.rBC);
      let note = '';
      let target = p.rAC ?? centre;
      if (target < lo - 1e-12 || target > hi + 1e-12) {
        note = `${rSub('AC')} = ${formatNumber(target)} is impossible with these two (det R = ${formatNumber(det3(p.rAB, p.rBC, target), 3)}); C is shown at the nearest end.`;
        target = Math.min(hi, Math.max(lo, target));
      }
      state.cosine = { rAB: p.rAB, rBC: p.rBC, phi: halfWidth > 0 ? (Math.acos(Math.max(-1, Math.min(1, (target - centre) / halfWidth))) * 180) / Math.PI : 0 };
      showCosineControls();
      renderCosine(note);
    } else if (p.view === 'equicorrelation') {
      state.equi.zeroPair = p.zeroPair;
      state.equi.k = p.k;
      if (p.zeroPair) state.equi.c = p.r;
      else state.equi.r = p.r;
      showEquiControls();
      renderEqui();
    } else {
      state.entry.matrix = p.matrix.map((/** @type {number[]} */ row) => [...row]);
      state.entry.cell = /** @type {[number, number]} */ ([...p.cell]);
      state.entry.observations = p.observations;
      state.entry.source = 'Loaded through window.Intuitions.';
      showEntryControls();
      buildEntryGrid();
      renderEntry();
    }
    $(p.view).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor(state.view)),
});
