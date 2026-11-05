// Page wiring for traits on a tree: three panels over compute(), each with a playback
// control. Playback only moves when the reader presses Play; with reduced motion asked for,
// it moves in steps rather than continuously. Every number shown comes from compute.js.

import { orientation, attachRotation } from '../lib/geom3d.js';
import { formatNumber } from '../lib/format.js';
import { bindPair, installApi, integerField, onWidth, setInvalid, workerRunner } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { swatch } from '../lib/plot.js';
import { parseNewick, tipsBelow } from '../lib/tree.js';
import { compute, ENTRY, MODEL_FIELDS, PLOTS_TREE, resolveParams } from './compute.js';
import { bivariateScene, bridgeFigure, phenogramFigure, phenogramFront, rateFigure, treeFigure } from './figure.js';

/** @typedef {'tree' | 'bivariate' | 'bridge'} View */
/** @typedef {import('./compute.js').Model} Model */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const num = (/** @type {number} */ v, d = 2) => formatNumber(v, d);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const MODEL_VALUES = { drift: 2, alpha: 4, theta: 1.5, theta2: -1.5, change: -4, burstAt: 0.5, delta2: 5, lambda: 8 };
const freshTree = () => ({ source: 'yule', tips: 12, treeSeed: 1, newick: '((A:1,B:1):1,C:2);', layout: 'rectangular', model: /** @type {Model} */ ('bm'), sigma2: 1, root: 0, steps: 300, seed: 1, clade: /** @type {string[] | null} */ (null), ...MODEL_VALUES });
const freshBivariate = () => ({ source: 'newick', tips: 6, treeSeed: 1, newick: PLOTS_TREE, v1: 1, v2: 2, rho: 0.5 / Math.SQRT2, root: [4, 4], steps: 125, seed: 1 });
const BRIDGE_PRESETS = {
  disc: { start: [-5, -4], end: [4, 4.5], length: 50, levels: 4, paths: 500, region: 'disc' },
  dumbbell: { start: [-12, -6], end: [14, 4], length: 40, levels: 9, paths: 50, region: 'dumbbell' },
  none: { start: [-5, -4], end: [4, 4.5], length: 50, levels: 6, paths: 200, region: 'none' },
};
const freshBridge = () => ({ ...BRIDGE_PRESETS.disc, start: [...BRIDGE_PRESETS.disc.start], end: [...BRIDGE_PRESETS.disc.end], rate: [[2, 1], [1, 3]], method: 'stagewise', seed: 1 });

const state = { view: /** @type {View} */ ('tree'), tree: freshTree(), bivariate: freshBivariate(), bridge: freshBridge() };
/** @type {Record<View, any>} */
const results = { tree: null, bivariate: null, bridge: null };
for (const v of /** @type {View[]} */ (['tree', 'bivariate', 'bridge'])) {
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) $(v).addEventListener(type, () => { state.view = v; });
}

// ---------- Requests ----------

/** The tree spec a panel's controls describe. @param {{ source: string, tips: number, treeSeed: number, newick: string }} s */
const treeSpec = (s) => (s.source === 'yule' ? { tips: s.tips, seed: s.treeSeed } : { newick: s.newick });

/** @param {View} v */
function paramsFor(v) {
  if (v === 'tree') {
    const s = state.tree;
    /** @type {Record<string, any>} */
    const p = { view: 'tree', tree: treeSpec(s), model: s.model, sigma2: s.sigma2, root: s.root, steps: s.steps, seed: s.seed };
    for (const f of MODEL_FIELDS[s.model]) {
      if (f === 'clade') {
        if (s.clade) p.clade = s.clade;
      } else p[f] = /** @type {Record<string, any>} */ (s)[f];
    }
    return p;
  }
  if (v === 'bivariate') {
    const s = state.bivariate;
    const c = s.rho * Math.sqrt(s.v1 * s.v2);
    return { view: 'bivariate', tree: treeSpec(s), rate: [[s.v1, c], [c, s.v2]], root: s.root, steps: s.steps, seed: s.seed };
  }
  const { start, end, rate, length, levels, paths, region, method, seed } = state.bridge;
  return { view: 'bridge', start, end, rate, length, levels, paths, region, method, seed };
}

/** @param {View} v @param {import('../lib/params.js').Issue[]} issues */
function showIssues(v, issues) {
  const box = $(`${v}-issues`);
  for (const field of /** @type {NodeListOf<HTMLElement>} */ ($(v).querySelectorAll('.panel-side input, .panel-side textarea'))) setInvalid(field, false);
  box.hidden = !issues.length;
  box.innerHTML = issues.map((issue) => {
    const path = issue.path.replace(/^params\./, '');
    const id = { 'tree.newick': `${v}-newick`, 'tree.tips': `${v}-tips-number`, 'tree.seed': `${v}-tree-seed`, 'start[0]': 'bridge-start-x', 'start[1]': 'bridge-start-y', 'end[0]': 'bridge-end-x', 'end[1]': 'bridge-end-y', start: 'bridge-start-x', end: 'bridge-end-x' }[path] ?? `${v}-${path}-number`;
    const target = document.getElementById(id) ?? document.getElementById(`${v}-${path}`);
    if (target) setInvalid(target, true);
    return `<p>${issue.message.replace(/-(?=\d)/g, '−')}.</p>`;
  }).join('');
}

/** Recomputes a panel; on an invalid request keeps the last result, dimmed. @param {View} v */
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
  showIssues(v, []);
  if (v === 'bridge' && params.view === 'bridge') {
    // The bridge can take a few hundred milliseconds, and with a region it is drawn both
    // ways for the comparison, so it runs in workers.
    $('bridge-status').textContent = 'Drawing the paths…';
    $('bridge-figures').dataset.stale = 'true';
    const other = params.region === 'none' ? Promise.resolve(null)
      : bridgeRunners.other.run({ entry: ENTRY, params: { ...params, method: params.method === 'stagewise' ? 'whole-path' : 'stagewise' } }).then((r) => r.result);
    Promise.all([bridgeRunners.main.run({ entry: ENTRY, params }), other]).then(([response, otherResult]) => {
      results.bridge = { params, result: response.result, other: otherResult };
      delete $('bridge-figures').dataset.stale;
      players.bridge.reset();
      render('bridge');
    });
    return;
  }
  delete $(`${v}-figures`).dataset.stale;
  results[v] = { params, result: compute(params) };
  players[v].reset();
  render(v);
}

const bridgeRunners = { main: workerRunner(), other: workerRunner() };

// ---------- Playback ----------

/**
 * A Play/Pause button, a restart button, a time slider and a speed choice in
 * `#<id>-playback`. `max()` is the end; `discrete` plays whole steps of 1 (the bridge's
 * levels). Nothing moves until Play is pressed. With reduced motion, playback jumps a
 * tenth of the way at a time instead of moving continuously.
 * @param {View} id @param {{ max: () => number, seconds: number, discrete?: boolean, label: string, format: (t: number, max: number) => string, onTime: (t: number) => void }} options
 */
function player(id, { max, seconds, discrete = false, label, format, onTime }) {
  const box = $(`${id}-playback`);
  box.innerHTML = `
    <button type="button" class="play" id="${id}-play" aria-pressed="false"><span class="glyph" aria-hidden="true">▶</span> <span class="play-text">Play</span></button>
    <button type="button" id="${id}-restart">Back to the start</button>
    <label class="time-field" for="${id}-time">${label} <output id="${id}-time-out" for="${id}-time"></output></label>
    <input type="range" id="${id}-time" min="0" max="1" step="any">
    <label class="speed-field" for="${id}-speed">Speed <select id="${id}-speed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
    <p class="hint reduced-note" id="${id}-reduced" hidden>Your system asks for reduced motion, so playback moves in steps.</p>`;
  const play = /** @type {HTMLButtonElement} */ ($(`${id}-play`));
  const slider = input(`${id}-time`);
  const speed = /** @type {HTMLSelectElement} */ ($(`${id}-speed`));
  const out = /** @type {HTMLOutputElement} */ ($(`${id}-time-out`));
  let t = 0;
  let playing = false;
  let frame = 0;
  let timer = 0;
  const show = () => {
    const m = max();
    slider.max = String(m);
    slider.step = discrete ? '1' : String(m / 500);
    slider.value = String(t);
    out.textContent = format(t, m);
    play.setAttribute('aria-pressed', String(playing));
    /** @type {HTMLElement} */ (play.querySelector('.glyph')).textContent = playing ? '⏸' : '▶';
    /** @type {HTMLElement} */ (play.querySelector('.play-text')).textContent = playing ? 'Pause' : 'Play';
    $(`${id}-reduced`).hidden = !reducedMotion.matches;
  };
  const set = (/** @type {number} */ value) => {
    t = Math.max(0, Math.min(max(), value));
    show();
    onTime(t);
  };
  const stop = () => {
    playing = false;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    show();
  };
  const start = () => {
    const m = max();
    if (t >= m - 1e-9) set(0);
    playing = true;
    show();
    if (discrete || reducedMotion.matches) {
      const jump = discrete ? 1 : m / 10;
      const tick = () => {
        if (!playing) return;
        set(Math.min(m, discrete ? Math.floor(t + jump) : t + jump));
        if (t >= m - 1e-9) stop();
        else timer = window.setTimeout(tick, 900 / Number(speed.value));
      };
      timer = window.setTimeout(tick, discrete ? 600 / Number(speed.value) : 400);
      return;
    }
    let last = performance.now();
    const step = (/** @type {number} */ now) => {
      if (!playing) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      set(t + (dt * m * Number(speed.value)) / seconds);
      if (t >= m - 1e-9) stop();
      else frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  play.addEventListener('click', () => (playing ? stop() : start()));
  $(`${id}-restart`).addEventListener('click', () => { stop(); set(0); });
  slider.addEventListener('input', () => {
    const value = Number(slider.value); // stop() redraws the slider, so read it first
    stop();
    set(value);
  });
  reducedMotion.addEventListener('change', show);
  return {
    get time() { return t; },
    /** After a new result: stop, and show the whole run. */
    reset() { stop(); t = max(); show(); },
    show,
  };
}

// ---------- Panel 1: one trait ----------

/** @type {{ treeFig: any, pheno: any, rateOn: boolean }} */
const drawn = { treeFig: null, pheno: null, rateOn: false };

function renderTree() {
  const r = results.tree?.result;
  if (!r) return;
  const p = results.tree.params;
  const s = state.tree;
  const treeBox = $('tree-tree');
  const width = treeBox.clientWidth;
  if (width <= 0) return;
  const tips = r.tips.length;
  const fan = s.layout === 'fan';
  const treeHeightPx = fan ? Math.min(width, 440) : Math.round(Math.max(110, Math.min(320, tips * 18 + 24)));
  drawn.treeFig = treeFigure(r, { width, height: treeHeightPx, layout: fan ? 'fan' : 'rectangular', id: 'tree-tree' });
  treeBox.innerHTML = drawn.treeFig.svg;
  const phenoHeight = width < 520 ? 300 : 360;
  drawn.pheno = phenogramFigure(r, { width, height: phenoHeight, id: 'tree-pheno', params: p });
  drawn.pheno.height = phenoHeight;
  $('tree-phenogram').innerHTML = drawn.pheno.svg;
  drawn.rateOn = s.model === 'eb' || s.model === 'burst';
  $('tree-rate-block').hidden = !drawn.rateOn;
  if (drawn.rateOn) $('tree-rate').innerHTML = rateFigure(r, { width, height: 90, id: 'tree-rate' });
  const clade = s.model === 'shift';
  $('tree-legend').innerHTML = [
    `<li>${swatch({ line: 'ink-line' })} ${clade ? 'the rest of the tree, pulled to θ₁' : 'a lineage'}</li>`,
    clade ? `<li>${swatch({ line: 'b-line' })} the clade (bracketed), pulled to θ₂</li>` : '',
    `<li>${swatch({ fill: clade ? 'band-swatch ink' : 'band-swatch' })} 95% of one lineage${clade ? ', in each regime' : ''}</li>`,
    `<li>${swatch({ shape: 'circle', mark: 'front-dot' })} a lineage at the time shown</li>`,
  ].join('');
  showTreeTime(players.tree.time);
}

/** @param {number} t */
function showTreeTime(t) {
  const r = results.tree?.result;
  if (!r || !drawn.treeFig || !drawn.pheno) return;
  const H = r.treeHeight;
  const end = t >= H - 1e-9;
  const treeSvg = $('tree-tree');
  const clip = treeSvg.querySelector('.reveal');
  const front = treeSvg.querySelector('#tree-tree-front');
  if (state.tree.layout === 'fan') {
    const radius = drawn.treeFig.radius(Math.min(t, H));
    clip?.setAttribute('r', String(end ? radius + 400 : radius + 0.5));
    front?.setAttribute('r', String(radius));
  } else {
    const x = drawn.treeFig.x(Math.min(t, H));
    clip?.setAttribute('width', String(end ? 4000 : x + 0.5));
    front?.setAttribute('x1', String(x));
    front?.setAttribute('x2', String(x));
  }
  front?.classList.toggle('off', end || t <= 0);
  const pheno = $('tree-phenogram');
  pheno.querySelector('.reveal')?.setAttribute('width', String(end ? 4000 : drawn.pheno.x(t) + 0.5));
  const frontGroup = pheno.querySelector('#tree-pheno-front');
  if (frontGroup) frontGroup.innerHTML = end ? '' : phenogramFront(r, drawn.pheno.x, drawn.pheno.y, t, 10, drawn.pheno.height - 42);
  pheno.querySelector('#tree-pheno-tips')?.classList.toggle('off', !end);
  if (drawn.rateOn) {
    const line = $('tree-rate').querySelector('#tree-rate-front');
    const x = drawn.pheno.x(t);
    line?.setAttribute('x1', String(x));
    line?.setAttribute('x2', String(x));
    line?.classList.toggle('off', end || t <= 0);
  }
}

function describeTree() {
  const r = results.tree?.result;
  if (!r) return;
  const p = results.tree.params;
  const H = r.treeHeight;
  const sd = r.envelope.sd[r.envelope.sd.length - 1];
  const values = r.tips.map((/** @type {any} */ t) => t.value);
  const mean = values.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / values.length;
  const tipSd = Math.sqrt(values.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length - 1));
  // The sister pair that shared the most history.
  const tree = r.tree;
  let best = null;
  for (let node = 0; node < tree.parent.length; node++) {
    const kids = tree.children[node];
    if (kids.length === 2 && kids.every((/** @type {number} */ k) => !tree.children[k].length)) {
      if (!best || tree.height[node] > tree.height[best.node]) best = { node, kids };
    }
  }
  const unit = 'tips' in p.tree ? 'of the tree\'s height' : `of ${num(H)}`;
  let sister = '';
  if (best) {
    const [a, b] = best.kids.map((/** @type {number} */ k) => r.tips.find((/** @type {any} */ t) => t.node === k));
    sister = ` Sisters ${a.label} and ${b.label} shared ${formatNumber((tree.height[best.node] / H) * 100, 0)}% ${unit} and differ by ${num(Math.abs(a.value - b.value))}.`;
  }
  const texts = {
    bm: () => `Under Brownian motion a lineage's variance grows in step with time: after ${num(H)} it has spread with SD ${num(sd)} around the root's ${num(p.root)}.`,
    trend: () => `The trend moves every lineage by ${num(p.drift)} per unit time, ${num(p.drift * H)} in all, while the spread is Brownian motion's, SD ${num(sd)} at the tips.`,
    ou: () => `Pulled toward θ = ${num(p.theta)} at α = ${num(p.alpha)}, a lineage loses half its distance from θ every ln 2/α = ${num(Math.LN2 / p.alpha)}, so the spread levels off at SD √(σ²/2α) = ${num(Math.sqrt(p.sigma2 / (2 * p.alpha)))} instead of growing, and old shared history is forgotten.`,
    eb: () => (p.change < 0 ? `The rate falls from σ² = ${num(p.sigma2)} at the root to ${num(r.envelope.rate[r.envelope.rate.length - 1], 3)} by the tips: an early burst, in which the deep splits carry most of the difference and young sister species barely differ.`
      : p.change > 0 ? `The rate rises from σ² = ${num(p.sigma2)} at the root to ${num(r.envelope.rate[r.envelope.rate.length - 1])} by the tips: a late burst, in which young sister species differ about as much as distant ones.`
        : 'With a rate change of 0 this is Brownian motion.'),
    burst: () => `At ${num(p.burstAt * H)} the rate jumps from σ² = ${num(p.sigma2)} to σ²(1 + δ²) = ${num(p.sigma2 * (1 + p.delta2))} and decays back with half-life ln 2/λ = ${num(Math.LN2 / p.lambda, 3)}; lineages alive then spread out quickly.`,
    shift: () => `The clade ${r.clade ? r.clade.tips.length > 2 ? `${r.clade.tips[0]}–${r.clade.tips[r.clade.tips.length - 1]}` : r.clade.tips.join(' and ') : ''} evolves toward θ₂ = ${num(p.theta2)} from the start of its stem, at ${num(r.clade?.from ?? 0)}, and the rest of the tree toward θ₁ = ${num(p.theta)}.`,
  };
  $('tree-readout').innerHTML = `${texts[/** @type {Model} */ (p.model)]()}${p.model === 'ou' || p.model === 'shift' ? '' : sister}`;
  $('tree-stats').innerHTML = [
    stat('Tips', String(r.tips.length)),
    stat('Tree height', num(H)),
    stat('SD of the tips', num(tipSd)),
    stat('SD of one lineage at the end', num(sd)),
  ].join('');
}

// ---------- Panel 2: two traits ----------

const VIEW_START = orientation(-38, 20);
let rotation = VIEW_START;
const TURNS = /** @type {const} */ ([['left', '◀', 'Turn left'], ['right', '▶', 'Turn right'], ['up', '▲', 'Tilt up'], ['down', '▼', 'Tilt down']]);

function renderBivariate() {
  const r = results.bivariate?.result;
  const box = $('bivariate-scene');
  const width = box.clientWidth;
  if (!r || width <= 0) return;
  const height = Math.round(Math.max(300, Math.min(480, width * 0.9)));
  const camera = { rotation, width, height, scale: Math.min(width, height) * 0.3, distance: 7 };
  box.innerHTML = bivariateScene(r, camera, players.bivariate.time);
}

function describeBivariate() {
  const r = results.bivariate?.result;
  if (!r) return;
  const s = state.bivariate;
  const few = r.tips.length <= 3;
  $('bivariate-legend').innerHTML = few
    ? r.tips.map((/** @type {any} */ t, /** @type {number} */ i) => `<li>${swatch({ line: ['a-line', 'b-line', 'c-line'][i], shape: /** @type {any} */ (['circle', 'triangle', 'square'][i]), mark: ['a-mark', 'b-mark', 'c-mark'][i] })} ${t.label}</li>`).join('') + `<li>${swatch({ line: 'ink-line' })} shared ancestors</li><li>${swatch({ line: 'shadow-line' })} shadows</li>`
    : `<li>${swatch({ line: 'ink-line' })} a lineage</li><li>${swatch({ line: 'shadow-line' })} shadows</li>`;
  const last = r.tips.map((/** @type {any} */ t) => `${t.label} (${num(t.value[0])}, ${num(t.value[1])})`);
  $('bivariate-readout').innerHTML = `Within each lineage the two traits change with correlation ρ = ${num(r.correlation)}: ${r.correlation > 0.05 ? 'a lineage that grows in trait 1 tends to grow in trait 2 as well' : r.correlation < -0.05 ? 'a lineage that grows in trait 1 tends to shrink in trait 2' : 'the two change independently'}. The tips end at ${last.slice(0, 4).join(', ')}${last.length > 4 ? ', …' : ''}.`;
  $('bivariate-stats').innerHTML = [stat('Tips', String(r.tips.length)), stat('Tree height', num(r.treeHeight)), stat('σ₁², σ₂²', `${num(s.v1)}, ${num(s.v2)}`), stat('ρ', num(r.correlation))].join('');
}

// ---------- Panel 3: the bridge ----------

function renderBridge() {
  const r = results.bridge?.result;
  const box = $('bridge-plot');
  const width = box.clientWidth;
  if (!r || width <= 0) return;
  const p = results.bridge.params;
  const height = Math.round(Math.max(280, Math.min(520, width * (p.region === 'dumbbell' ? 0.55 : 0.85))));
  box.innerHTML = bridgeFigure(r, p, { width, height, level: players.bridge.time, levels: p.levels });
}

function describeBridge() {
  const entry = results.bridge;
  if (!entry) return;
  const { params: p, result: r, other } = entry;
  $('bridge-legend').innerHTML = [
    `<li>${swatch({ shape: 'circle', mark: 'ink-mark' })} start</li>`, `<li>${swatch({ shape: 'square', mark: 'ink-mark' })} end</li>`,
    `<li>${swatch({ line: 'a-line', shape: 'circle', mark: 'a-mark' })} the first path</li>`,
    p.region === 'none' ? '' : `<li>${swatch({ fill: 'region-swatch' })} the ${p.region === 'disc' ? 'disc' : 'islands'}</li>`,
  ].join('');
  const total = r.levels.reduce((/** @type {number} */ a, /** @type {any} */ l) => a + l.draws, 0);
  const rejected = r.levels.reduce((/** @type {number} */ a, /** @type {any} */ l) => a + l.rejected, 0);
  const note = $('bridge-note');
  if (p.region === 'none') {
    note.hidden = true;
    $('bridge-readout').innerHTML = `Each of the ${r.paths.length.toLocaleString('en-US')} paths is a free Brownian bridge: the middle point is normal around the halfway point between the ends, with covariance the branch length times the rate matrix over 4, and each level halves every gap the same way.`;
  } else {
    const stage = p.method === 'stagewise' ? r : other;
    const whole = p.method === 'stagewise' ? other : r;
    const where = (/** @type {any} */ x) => (x.midpoint.sample ? `${num(x.midpoint.sample.distance)} ± ${num(x.midpoint.sample.distanceSE)}` : 'none kept');
    const kept = whole.paths.length
      ? `The middle point's mean distance from the centre: ${where(stage)} redrawing midpoints, ${where(whole)} redrawing whole paths.`
      : `Redrawing whole paths kept none of ${p.paths.toLocaleString('en-US')} in ${whole.attempts.toLocaleString('en-US')} tries: almost every free path leaves the region somewhere, which is why the script redraws single midpoints instead.`;
    note.hidden = false;
    note.innerHTML = `<strong>${p.method === 'stagewise' ? 'Approximate.' : 'Exact for the drawn points.'}</strong> ${p.method === 'stagewise'
      ? 'Each midpoint that falls outside is redrawn on its own, as truncatedBMapprox.R does. That ignores that a point near the edge makes the rest of the path likely to leave, so paths crowd the edge.'
      : 'A whole path is redrawn whenever any of its points leaves, so the kept paths are bridges conditioned to stay inside, at the drawn points.'} ${kept}`;
    $('bridge-readout').innerHTML = p.method === 'stagewise'
      ? `${rejected.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} midpoints (${formatNumber((rejected / Math.max(1, total)) * 100, 1)}%) fell outside and were redrawn.`
      : `${r.attempts.toLocaleString('en-US')} whole paths were drawn to keep ${r.paths.length.toLocaleString('en-US')} that stayed inside.`;
  }
  $('bridge-stats').innerHTML = [
    stat('Points per path', (r.points).toLocaleString('en-US')),
    stat('Paths kept', `${r.paths.length.toLocaleString('en-US')}${r.failed ? ` <small>${r.failed} gave up</small>` : ''}`),
  ].join('');
  $('bridge-status').textContent = `Seed ${p.seed}.${r.failed ? ` ${r.failed.toLocaleString('en-US')} paths gave up ${r.exhausted ? 'when the request\'s 2,000,000 draws ran out' : 'after 10,000 draws'} and are not shown.` : ''}`;
  $('bridge-levels-hint').textContent = `${(2 ** p.levels - 1).toLocaleString('en-US')} points between the ends.`;
}

/** @type {Record<View, () => void>} */
const RENDER = {
  tree: () => { renderTree(); describeTree(); },
  bivariate: () => { renderBivariate(); describeBivariate(); },
  bridge: () => { renderBridge(); describeBridge(); },
};
/** @param {View} v */
const render = (v) => RENDER[v]();

const players = {
  tree: player('tree', { max: () => results.tree?.result.treeHeight ?? 1, seconds: 8, label: 'Time', format: (t, m) => `${num(t)} of ${num(m)}`, onTime: showTreeTime }),
  bivariate: player('bivariate', { max: () => results.bivariate?.result.treeHeight ?? 1, seconds: 8, label: 'Time', format: (t, m) => `${num(t)} of ${num(m)}`, onTime: renderBivariate }),
  bridge: player('bridge', { max: () => results.bridge?.params.levels ?? 1, seconds: 6, discrete: true, label: 'Level', format: (t, m) => `${t} of ${m}`, onTime: renderBridge }),
};

// ---------- Controls ----------

/**
 * The tree source controls of a panel: a simulated pure-birth tree (tips and seed) or a
 * Newick tree, and for panel 1 the layout.
 * @param {'tree' | 'bivariate'} v
 */
function treeControls(v) {
  const box = /** @type {HTMLElement} */ (document.querySelector(`[data-tree-control="${v}"]`));
  box.innerHTML = `
    <fieldset class="choice-list bare">
      <legend>Tree</legend>
      <div class="segmented">
        <label><input type="radio" name="${v}-source" value="yule"> Simulated</label>
        <label><input type="radio" name="${v}-source" value="newick"> Your own</label>
      </div>
    </fieldset>
    <div id="${v}-yule" class="sub-controls">
      <div class="control-head">
        <label for="${v}-tips-number">Tips</label>
        <input id="${v}-tips-number" type="number" min="2" max="64" step="1">
      </div>
      <input id="${v}-tips-range" type="range" min="2" max="64" step="1" aria-label="Tips, slider">
      <div class="control-row">
        <label for="${v}-tree-seed">Tree seed</label>
        <input id="${v}-tree-seed" type="number" min="0" max="4294967295" step="1">
        <button type="button" id="${v}-new-tree">New tree</button>
      </div>
      <p class="hint">A pure-birth (Yule) tree, scaled to height 1.</p>
    </div>
    <div id="${v}-own" class="sub-controls">
      <label for="${v}-newick">Newick, with branch lengths</label>
      <textarea id="${v}-newick" rows="3" spellcheck="false" autocomplete="off"></textarea>
      <div class="control-row"><button type="button" id="${v}-apply">Use this tree</button></div>
    </div>
    ${v === 'tree' ? `<fieldset class="choice-list bare"><legend>Draw the tree</legend><div class="segmented">
      <label><input type="radio" name="tree-layout" value="rectangular"> Across</label>
      <label><input type="radio" name="tree-layout" value="fan"> As a fan</label></div></fieldset>` : ''}`;
  const s = state[v];
  const tips = bindPair({ range: input(`${v}-tips-range`), number: input(`${v}-tips-number`), decimals: 0, integer: true, onInput: (value) => { s.tips = value; s.source = 'yule'; if (v === 'tree') state.tree.clade = null; update(v); } });
  integerField(input(`${v}-tree-seed`), (value) => { s.treeSeed = value; if (v === 'tree') state.tree.clade = null; update(v); });
  $(`${v}-new-tree`).addEventListener('click', () => {
    s.treeSeed = (s.treeSeed + 1) % 4294967296;
    input(`${v}-tree-seed`).value = String(s.treeSeed);
    if (v === 'tree') state.tree.clade = null;
    update(v);
    if (v === 'tree') modelControls();
  });
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (box.querySelectorAll(`input[name="${v}-source"]`))) {
    radio.addEventListener('change', () => {
      s.source = radio.value;
      showTreeSource(v);
      if (v === 'tree') state.tree.clade = null;
      update(v);
      if (v === 'tree') modelControls();
    });
  }
  $(`${v}-apply`).addEventListener('click', () => {
    s.newick = /** @type {HTMLTextAreaElement} */ ($(`${v}-newick`)).value.trim();
    s.source = 'newick';
    if (v === 'tree') state.tree.clade = null;
    update(v);
    if (v === 'tree') modelControls();
  });
  if (v === 'tree') {
    for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (box.querySelectorAll('input[name="tree-layout"]'))) {
      radio.addEventListener('change', () => { state.tree.layout = /** @type {any} */ (radio.value); renderTree(); });
    }
  }
  return { tips };
}

/** @param {'tree' | 'bivariate'} v */
function showTreeSource(v) {
  const s = state[v];
  $(`${v}-yule`).hidden = s.source !== 'yule';
  $(`${v}-own`).hidden = s.source !== 'newick';
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(`input[name="${v}-source"]`))) radio.checked = radio.value === s.source;
  input(`${v}-tree-seed`).value = String(s.treeSeed);
  /** @type {HTMLTextAreaElement} */ ($(`${v}-newick`)).value = s.newick;
  treeBinds[v].tips.set(s.tips);
  if (v === 'tree') for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="tree-layout"]'))) radio.checked = radio.value === state.tree.layout;
}

const treeBinds = { tree: treeControls('tree'), bivariate: treeControls('bivariate') };

/** Labels, ranges and decimals for panel 1's model fields. */
const FIELDS = {
  sigma2: { label: 'Rate, σ²', min: 0.001, max: 100, range: [0.05, 5], step: 0.05, decimals: 3 },
  root: { label: 'Root state', min: -100, max: 100, range: [-5, 5], step: 0.1, decimals: 2 },
  drift: { label: 'Trend, μ per unit time', min: -50, max: 50, range: [-5, 5], step: 0.1, decimals: 2 },
  alpha: { label: 'Pull, α', min: 0.001, max: 100, range: [0.1, 20], step: 0.1, decimals: 3 },
  theta: { label: 'Optimum, θ', min: -100, max: 100, range: [-5, 5], step: 0.1, decimals: 2 },
  theta2: { label: 'The clade\'s optimum, θ₂', min: -100, max: 100, range: [-5, 5], step: 0.1, decimals: 2 },
  change: { label: 'Rate change, a (σ² e^(a t))', min: -20, max: 20, range: [-10, 10], step: 0.1, decimals: 2 },
  burstAt: { label: 'Burst time, share of the height', min: 0, max: 1, range: [0, 1], step: 0.01, decimals: 2 },
  delta2: { label: 'Burst size, δ²', min: 0, max: 1000, range: [0, 50], step: 0.5, decimals: 2 },
  lambda: { label: 'Burst decay, λ', min: 0.01, max: 200, range: [0.1, 50], step: 0.1, decimals: 2 },
};

/** Rebuilds panel 1's model fields for the current model. */
function modelControls() {
  const s = state.tree;
  const box = $('tree-model-controls');
  const fields = ['sigma2', 'root', ...MODEL_FIELDS[s.model]];
  box.innerHTML = fields.map((f) => {
    if (f === 'clade') {
      return `<div class="control"><div class="control-row"><label for="tree-clade">The clade</label><select id="tree-clade"></select></div><p class="hint">It shifts to θ₂ from the start of its stem branch.</p></div>`;
    }
    const d = FIELDS[/** @type {keyof typeof FIELDS} */ (f)];
    return `<div class="control"><div class="control-head"><label for="tree-${f}-number">${d.label}</label><input id="tree-${f}-number" type="number" min="${d.min}" max="${d.max}" step="${d.step}"></div>
      <input id="tree-${f}-range" type="range" min="${d.range[0]}" max="${d.range[1]}" step="${d.step}" aria-label="${d.label.replace(/,.*$/, '')}, slider"></div>`;
  }).join('') + `<div class="control"><div class="control-head"><label for="tree-steps-number">Time steps across the tree</label><input id="tree-steps-number" type="number" min="10" max="2000" step="10"></div>
      <input id="tree-steps-range" type="range" min="10" max="1000" step="10" aria-label="Time steps, slider"><p class="hint">How finely each path is drawn. The tips' distribution does not depend on it.</p></div>`;
  for (const f of [...fields.filter((x) => x !== 'clade'), 'steps']) {
    const d = f === 'steps' ? { decimals: 0 } : FIELDS[/** @type {keyof typeof FIELDS} */ (f)];
    const pair = bindPair({ range: input(`tree-${f}-range`), number: input(`tree-${f}-number`), decimals: d.decimals, integer: f === 'steps', onInput: (value) => { /** @type {Record<string, any>} */ (s)[f] = value; update('tree'); } });
    pair.set(/** @type {Record<string, any>} */ (s)[f]);
  }
  if (fields.includes('clade')) {
    const select = /** @type {HTMLSelectElement} */ ($('tree-clade'));
    let tree;
    try {
      tree = s.source === 'yule' ? null : parseNewick(s.newick);
    } catch {
      tree = null;
    }
    const r = results.tree?.result;
    const t = r ? r.tree : tree;
    if (t) {
      const below = tipsBelow(t);
      const options = [];
      for (let node = 1; node < t.parent.length; node++) {
        if (!t.children[node].length) continue;
        const tips = below[node].map((/** @type {number} */ n) => t.label[n]);
        options.push(`<option value="${tips[0]}|${tips[tips.length - 1]}">${tips.length > 2 ? `${tips[0]} to ${tips[tips.length - 1]}` : tips.join(' and ')} (${tips.length} tips)</option>`);
      }
      select.innerHTML = options.join('');
      const current = (s.clade ?? r?.clade?.tips ?? []);
      const value = current.length ? `${current[0]}|${current[current.length - 1]}` : '';
      if ([...select.options].some((o) => o.value === value)) select.value = value;
    }
    select.addEventListener('change', () => { s.clade = select.value.split('|'); update('tree'); });
  }
}

/** @type {HTMLSelectElement} */ ($('tree-model')).addEventListener('change', () => {
  state.tree.model = /** @type {Model} */ (/** @type {HTMLSelectElement} */ ($('tree-model')).value);
  update('tree');
  modelControls();
});
integerField(input('tree-seed'), (value) => { state.tree.seed = value; update('tree'); });
$('tree-new-seed').addEventListener('click', () => {
  state.tree.seed = (state.tree.seed + 1) % 4294967296;
  input('tree-seed').value = String(state.tree.seed);
  update('tree');
});

const bivariatePairs = {
  v1: bindPair({ range: input('bivariate-v1-range'), number: input('bivariate-v1-number'), decimals: 3, onInput: (value) => { state.bivariate.v1 = value; update('bivariate'); } }),
  v2: bindPair({ range: input('bivariate-v2-range'), number: input('bivariate-v2-number'), decimals: 3, onInput: (value) => { state.bivariate.v2 = value; update('bivariate'); } }),
  rho: bindPair({ range: input('bivariate-rho-range'), number: input('bivariate-rho-number'), decimals: 3, onInput: (value) => { state.bivariate.rho = value; update('bivariate'); } }),
};
integerField(input('bivariate-seed'), (value) => { state.bivariate.seed = value; update('bivariate'); });
$('bivariate-new-seed').addEventListener('click', () => {
  state.bivariate.seed = (state.bivariate.seed + 1) % 4294967296;
  input('bivariate-seed').value = String(state.bivariate.seed);
  update('bivariate');
});
const turner = attachRotation($('bivariate-scene'), { get: () => rotation, set: (q) => { rotation = q; renderBivariate(); } });
$('bivariate-view').innerHTML = `${TURNS.map(([dir, glyph, label]) => `<button type="button" class="icon" data-turn="${dir}" aria-label="${label}" title="${label}">${glyph}</button>`).join('')}<button type="button" data-turn="reset">Reset view</button><span class="hint">Drag, or focus the figure and use the arrow keys.</span>`;
$('bivariate-view').addEventListener('click', (event) => {
  const button = /** @type {HTMLElement} */ (event.target).closest('button');
  if (!button) return;
  if (button.dataset.turn === 'reset') {
    rotation = VIEW_START;
    renderBivariate();
  } else turner.turnBy(/** @type {'left' | 'right' | 'up' | 'down'} */ (button.dataset.turn));
});

const bridgePairs = {
  levels: bindPair({ range: input('bridge-levels-range'), number: input('bridge-levels-number'), decimals: 0, integer: true, onInput: (value) => { state.bridge.levels = value; update('bridge'); } }),
  paths: bindPair({ range: input('bridge-paths-range'), number: input('bridge-paths-number'), decimals: 0, integer: true, onInput: (value) => { state.bridge.paths = value; update('bridge'); } }),
  length: bindPair({ range: input('bridge-length-range'), number: input('bridge-length-number'), decimals: 2, onInput: (value) => { state.bridge.length = value; update('bridge'); } }),
};
for (const [id, key, k] of /** @type {const} */ ([['bridge-start-x', 'start', 0], ['bridge-start-y', 'start', 1], ['bridge-end-x', 'end', 0], ['bridge-end-y', 'end', 1]])) {
  input(id).addEventListener('input', () => {
    const value = Number(input(id).value);
    const ok = input(id).value.trim() !== '' && Number.isFinite(value) && Math.abs(value) <= 100;
    setInvalid(input(id), !ok);
    if (!ok) return;
    state.bridge[key][k] = value;
    update('bridge');
  });
}
for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="bridge-region"]'))) {
  radio.addEventListener('change', () => { state.bridge.region = radio.value; showBridgeControls(); update('bridge'); });
}
for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="bridge-method"]'))) {
  radio.addEventListener('change', () => { state.bridge.method = radio.value; update('bridge'); });
}
for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('[data-bridge-preset]'))) {
  button.addEventListener('click', () => {
    const preset = BRIDGE_PRESETS[/** @type {keyof typeof BRIDGE_PRESETS} */ (button.dataset.bridgePreset)];
    Object.assign(state.bridge, { ...preset, start: [...preset.start], end: [...preset.end] });
    showBridgeControls();
    update('bridge');
  });
}
integerField(input('bridge-seed'), (value) => { state.bridge.seed = value; update('bridge'); });
$('bridge-new-seed').addEventListener('click', () => {
  state.bridge.seed = (state.bridge.seed + 1) % 4294967296;
  input('bridge-seed').value = String(state.bridge.seed);
  update('bridge');
});

function showBridgeControls() {
  const s = state.bridge;
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="bridge-region"]'))) radio.checked = radio.value === s.region;
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="bridge-method"]'))) {
    radio.checked = radio.value === s.method;
    radio.disabled = s.region === 'none';
  }
  bridgePairs.levels.set(s.levels);
  bridgePairs.paths.set(s.paths);
  bridgePairs.length.set(s.length);
  input('bridge-start-x').value = String(s.start[0]);
  input('bridge-start-y').value = String(s.start[1]);
  input('bridge-end-x').value = String(s.end[0]);
  input('bridge-end-y').value = String(s.end[1]);
  input('bridge-seed').value = String(s.seed);
}

function showTreePanel() {
  const s = state.tree;
  showTreeSource('tree');
  /** @type {HTMLSelectElement} */ ($('tree-model')).value = s.model;
  input('tree-seed').value = String(s.seed);
  modelControls();
}

function showBivariatePanel() {
  const s = state.bivariate;
  showTreeSource('bivariate');
  bivariatePairs.v1.set(s.v1);
  bivariatePairs.v2.set(s.v2);
  bivariatePairs.rho.set(s.rho);
  input('bivariate-seed').value = String(s.seed);
}

$('tree-reset').addEventListener('click', () => { state.tree = freshTree(); showTreePanel(); update('tree'); modelControls(); });
$('bivariate-reset').addEventListener('click', () => { state.bivariate = freshBivariate(); rotation = VIEW_START; showBivariatePanel(); update('bivariate'); });
$('bridge-reset').addEventListener('click', () => { state.bridge = freshBridge(); showBridgeControls(); update('bridge'); });
onWidth($('tree-tree'), renderTree);
onWidth($('bivariate-scene'), renderBivariate);
onWidth($('bridge-plot'), renderBridge);

// ---------- Start ----------

showTreePanel();
showBivariatePanel();
showBridgeControls();
update('tree');
modelControls();
update('bivariate');
update('bridge');

installApi({
  entry: ENTRY,
  load: (/** @type {any} */ p, /** @type {any} */ result) => {
    const v = /** @type {View} */ (p.view);
    state.view = v;
    if (v === 'tree') {
      const source = 'newick' in p.tree ? 'newick' : 'yule';
      Object.assign(state.tree, { source, ...(source === 'yule' ? { tips: p.tree.tips, treeSeed: p.tree.seed } : { newick: p.tree.newick }) });
      for (const key of ['model', 'sigma2', 'root', 'steps', 'seed', 'drift', 'alpha', 'theta', 'theta2', 'change', 'burstAt', 'delta2', 'lambda', 'clade']) if (key in p) /** @type {Record<string, any>} */ (state.tree)[key] = p[key];
      results.tree = { params: p, result };
      showTreePanel();
    } else if (v === 'bivariate') {
      const source = 'newick' in p.tree ? 'newick' : 'yule';
      Object.assign(state.bivariate, { source, ...(source === 'yule' ? { tips: p.tree.tips, treeSeed: p.tree.seed } : { newick: p.tree.newick }) });
      Object.assign(state.bivariate, { v1: p.rate[0][0], v2: p.rate[1][1], rho: p.rate[0][1] / Math.sqrt(p.rate[0][0] * p.rate[1][1]), root: p.root, steps: p.steps, seed: p.seed });
      results.bivariate = { params: p, result };
      showBivariatePanel();
    } else {
      Object.assign(state.bridge, p);
      showBridgeControls();
      update('bridge');
      $(v).scrollIntoView({ block: 'start' });
      return;
    }
    showIssues(v, []);
    delete $(`${v}-figures`).dataset.stale;
    players[v].reset();
    render(v);
    $(v).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor(state.view)),
});
