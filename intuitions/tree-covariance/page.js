// Page wiring for a tree as a covariance matrix: three panels over compute(). Each panel
// keeps its own tree, edited as Newick or branch by branch. Every number shown comes from
// compute.js.

import { attachRotation, orientation } from '../lib/geom3d.js';
import { formatNumber } from '../lib/format.js';
import { bindPair, installApi, integerField, onWidth, setInvalid } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { swatch } from '../lib/plot.js';
import { tipNodes, writeNewick } from '../lib/tree.js';
import { compute, ENTRY, readTree, resolveParams, SCRIPT_TREE } from './compute.js';
import { ARROW_STYLE, arrowsScene, len, scatterFigure, sweepFigure, treeFigure } from './figure.js';

/** @typedef {'covariance' | 'reroot' | 'pruning'} View */
/** @typedef {import('../lib/tree.js').Tree} Tree */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const num = (/** @type {number} */ v, d = 3) => formatNumber(v, d);
const escape = (/** @type {string} */ s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const PRESETS = [
  { name: 'The script\'s three tips', newick: SCRIPT_TREE },
  { name: 'Two tips with a stem', newick: '(x1:1.5,x2:0.5):1;' },
  { name: 'Four tips, two cherries', newick: '((A:2,B:3):1,(C:1.5,D:2.5):2);' },
  { name: 'Five tips, a ladder', newick: '((((A:1,B:1):1,C:2):1,D:3):1,E:4);' },
];
const SCRIPT_VALUES = { A: 3, B: -2, C: 1 };

/** Default values for a tree's tips: the script's, or a fixed pattern. @param {Tree} tree */
function defaultValues(tree) {
  const tips = tipNodes(tree).map((n) => /** @type {string} */ (tree.label[n]));
  if (tips.join() === 'A,B,C') return { ...SCRIPT_VALUES };
  return Object.fromEntries(tips.map((t, i) => [t, Number(Math.sin(i + 1).toFixed(2))]));
}

const fresh = {
  covariance: () => ({ newick: SCRIPT_TREE, arrows: ['A', 'B', 'C'], pair: ['B', 'C'], n: 500, seed: 1 }),
  reroot: () => ({ newick: SCRIPT_TREE, values: /** @type {Record<string, number>} */ ({ ...SCRIPT_VALUES }), rate: 0.1, node: 'E', fraction: 0, sweep: ['A', 'C'] }),
  pruning: () => ({ newick: SCRIPT_TREE, values: /** @type {Record<string, number>} */ ({ ...SCRIPT_VALUES }), rate: 0.1, step: 1 }),
};
const state = { view: /** @type {View} */ ('covariance'), covariance: fresh.covariance(), reroot: fresh.reroot(), pruning: fresh.pruning() };
/** @type {Record<View, any>} */
const results = { covariance: null, reroot: null, pruning: null };
for (const v of /** @type {View[]} */ (['covariance', 'reroot', 'pruning'])) {
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) $(v).addEventListener(type, () => { state.view = v; });
}

/** @param {View} v */
function paramsFor(v) {
  if (v === 'covariance') {
    const s = state.covariance;
    return { view: v, newick: s.newick, arrows: s.arrows, pair: s.pair, sample: { n: s.n, seed: s.seed } };
  }
  if (v === 'reroot') {
    const s = state.reroot;
    return { view: v, newick: s.newick, values: s.values, rate: s.rate, root: { node: s.node, fraction: s.fraction }, sweep: s.sweep };
  }
  const s = state.pruning;
  return { view: v, newick: s.newick, values: s.values, rate: s.rate };
}

/** @param {View} v @param {import('../lib/params.js').Issue[]} issues */
function showIssues(v, issues) {
  const box = $(`${v}-issues`);
  for (const field of /** @type {NodeListOf<HTMLElement>} */ ($(v).querySelectorAll('.panel-side input, .panel-side textarea'))) setInvalid(field, false);
  box.hidden = !issues.length;
  box.innerHTML = issues.map((issue) => {
    const path = issue.path.replace(/^params\./, '');
    const target = document.getElementById(path === 'newick' ? `${v}-newick` : path.startsWith('values.') ? `${v}-value-${path.slice(7)}` : path === 'rate' ? `${v}-rate` : `${v}-${path}`);
    if (target) setInvalid(target, true);
    return `<p>${escape(issue.message).replace(/-(?=\d)/g, '−')}.</p>`;
  }).join('');
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
  showIssues(v, []);
  delete $(`${v}-figures`).dataset.stale;
  results[v] = { params, result: compute(params) };
  render(v);
}

/** The panel's tree, named as compute names it, or null if its Newick is invalid. @param {View} v */
const treeOf = (v) => readTree(state[v].newick, []);

// ---------- Matrices ----------

/**
 * A covariance matrix as a shaded table; with `pick`, each cell is a button that picks
 * its pair, and the picked cell is outlined and marked as pressed.
 * @param {string[]} names @param {number[][]} M @param {{ picked?: string[], pick?: boolean, caption: string }} options
 */
function matrixTable(names, M, { picked = [], pick = false, caption }) {
  const max = Math.max(...M.flat().map(Math.abs)) || 1;
  const head = `<caption class="visually-hidden">${escape(caption)}</caption><thead><tr><th scope="col"><span class="visually-hidden">tip</span></th>${names.map((n) => `<th scope="col">${escape(n)}</th>`).join('')}</tr></thead>`;
  const rows = M.map((row, i) => `<tr><th scope="row">${escape(names[i])}</th>${row.map((c, j) => {
    const shade = Math.min(6, Math.round((Math.abs(c) / max) * 6));
    const chosen = picked.length === 2 && ((names[i] === picked[0] && names[j] === picked[1]) || (names[i] === picked[1] && names[j] === picked[0]) || (picked[0] === picked[1] && i === j && names[i] === picked[0]));
    const body = pick ? `<button type="button" class="cell-button" data-i="${escape(names[i])}" data-j="${escape(names[j])}" aria-pressed="${chosen}" aria-label="${escape(names[i])} and ${escape(names[j])}: ${len(c)}">${len(c)}</button>` : len(c);
    return `<td data-shade="${shade}" class="${chosen ? 'chosen' : ''}">${body}</td>`;
  }).join('')}</tr>`).join('');
  return `${head}<tbody>${rows}</tbody>`;
}

/** A small bracketed matrix with a title, as drawingSimple3TipTrees.R's plotMatrix draws it. @param {string} title @param {string[][]} cells */
function smallMatrix(title, cells) {
  return `<div class="small-matrix"><p class="hist-name">${title}</p><table class="bracket-matrix"><tbody>${cells.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// ---------- Panel 1 ----------

const ARROW_VIEW = orientation(-30, 22);
let arrowRotation = ARROW_VIEW;

/** The branches on the path two tips share (both tips the same: its whole path). @param {Tree} tree @param {string[]} pair */
function sharedPath(tree, pair) {
  const up = (/** @type {number} */ n) => {
    const out = [];
    for (let k = n; k >= 0; k = tree.parent[k]) out.push(k);
    return out;
  };
  const a = up(tree.label.indexOf(pair[0]));
  const b = up(tree.label.indexOf(pair[1]));
  return new Set(a.filter((n) => b.includes(n) && (n > 0 || tree.length[0] > 0)));
}

function renderCovariance() {
  const entry = results.covariance;
  if (!entry) return;
  const r = entry.result;
  const s = state.covariance;
  const tree = /** @type {Tree} */ (treeOf('covariance'));
  const box = $('covariance-tree');
  const width = box.clientWidth;
  if (width <= 0) return;
  const tips = r.tips.length;
  const strong = sharedPath(tree, s.pair);
  box.innerHTML = treeFigure(tree, { width, height: Math.max(140, Math.min(320, tips * 34 + 50)), strong, label: `The tree, with ${s.pair[0] === s.pair[1] ? `${s.pair[0]}'s path from the root` : `the path ${s.pair.join(' and ')} share`} in blue.` });
  $('covariance-matrix').innerHTML = matrixTable(r.tips, r.vcv, { picked: s.pair, pick: true, caption: 'The tips\' covariance: each entry is the length of the path two tips share from the root.' });
  $('covariance-legend').innerHTML = r.arrows.tips.map((/** @type {string} */ t, /** @type {number} */ i) => `<li>${swatch({ line: ARROW_STYLE[i].swatch, shape: ARROW_STYLE[i].shape, mark: ARROW_STYLE[i].mark })} ${escape(t)}</li>`).join('');
  renderArrows();
  const sbox = $('covariance-scatter');
  const [i, j] = s.pair.map((/** @type {string} */ t) => r.tips.indexOf(t));
  if (r.sample) sbox.innerHTML = scatterFigure(r.sample, [[r.vcv[i][i], r.vcv[i][j]], [r.vcv[j][i], r.vcv[j][j]]], s.pair, { width, height: Math.min(360, Math.max(240, width * 0.6)) });
  const shared = r.vcv[i][j];
  const rho = r.correlation[i][j];
  const angle = (Math.acos(Math.max(-1, Math.min(1, rho))) * 180) / Math.PI;
  $('covariance-readout').innerHTML = s.pair[0] === s.pair[1]
    ? `${escape(s.pair[0])} is ${len(shared)} from the root, so that is its variance.`
    : shared === 0
      ? `${escape(s.pair[0])} and ${escape(s.pair[1])} share no branch, so their covariance is 0 and their arrows are at right angles.`
      : `${escape(s.pair[0])} and ${escape(s.pair[1])} share ${len(shared)} of their paths from the root, so they covary by ${len(shared)}; with variances ${len(r.vcv[i][i])} and ${len(r.vcv[j][j])} their correlation is ${num(rho, 2)}, the cosine of the ${Math.round(angle)}° between their arrows.`;
  $('covariance-stats').innerHTML = [
    stat(`Covariance, ${escape(s.pair.join(' and '))}`, len(shared)),
    stat('Correlation', num(rho, 3)),
    r.sample ? stat('In the runs', `${num(r.sample.correlation, 3)} <small>${r.sample.n.toLocaleString('en-US')} runs</small>`) : '',
  ].join('');
}

function renderArrows() {
  const r = results.covariance?.result;
  const box = $('covariance-scene');
  const width = box.clientWidth;
  if (!r || width <= 0) return;
  const height = Math.round(Math.max(260, Math.min(400, width * 0.75)));
  box.innerHTML = arrowsScene(r.arrows, { rotation: arrowRotation, width, height, scale: Math.min(width, height) * 0.36, distance: 7 });
}

// ---------- Panel 2 ----------

function renderReroot() {
  const entry = results.reroot;
  if (!entry) return;
  const r = entry.result;
  const s = state.reroot;
  const box = $('reroot-tree');
  const width = box.clientWidth;
  if (width <= 0) return;
  const rooted = /** @type {Tree} */ ({ parent: r.tree.parent, children: r.tree.children, length: r.tree.length, label: r.tree.label });
  /** @type {Map<number, string>} */
  const notes = new Map();
  rooted.label.forEach((l, i) => {
    if (l !== null && (!rooted.children[i].length || i === 0) && Object.hasOwn(s.values, l)) notes.set(i, `x = ${len(s.values[l])}`);
  });
  box.innerHTML = treeFigure(rooted, { width, height: Math.max(140, Math.min(300, r.tips.length * 40 + 60)), notes, label: `The tree rooted ${r.observedRoot ? `at tip ${r.observedRoot}` : `on the branch above ${s.node}, ${Math.round(s.fraction * 100)}% of the way up`}.` });
  $('reroot-matrix').innerHTML = matrixTable(r.tips, r.vcv.map((/** @type {number[]} */ row) => row.map((c) => c * s.rate)), { caption: 'The tips\' covariance under this rooting, times σ².' });
  $('reroot-legend').innerHTML = `<li>${swatch({ line: 'ink-line' })} restricted (root integrated out)</li><li>${swatch({ line: 'b-line' })} ordinary (root at its estimate)</li><li>${swatch({ line: 'root-swatch' })} the current root</li>`;
  $('reroot-sweep').innerHTML = sweepFigure(r.sweep, { width, height: width < 520 ? 240 : 270 });
  const base = state.reroot;
  const where = r.observedRoot ? `Rooted at tip ${escape(r.observedRoot)}, its value is the root's state, observed, so there is nothing to estimate and the two likelihoods coincide.`
    : `Rooted ${base.fraction === 0 ? `at ${escape(base.node)}` : `${Math.round(base.fraction * 100)}% of the way up the branch above ${escape(base.node)}`}, the root's estimate is ${num(r.rootEstimate[0], 2)} with SD ${num(Math.sqrt(r.rootVariance * s.rate), 2)}.`;
  $('reroot-readout').innerHTML = `${where} The restricted log-likelihood is ${num(r.reml)} wherever the root is; the ordinary one is ${num(r.ml)} here.`;
  $('reroot-stats').innerHTML = [
    stat('Restricted, pruned', num(r.reml)),
    stat('Restricted, from the matrix', num(r.direct.reml)),
    stat('Ordinary, at the root estimate', num(r.ml)),
  ].join('');
}

// ---------- Panel 3 ----------

function renderPruning() {
  const entry = results.pruning;
  if (!entry) return;
  const r = entry.result;
  const s = state.pruning;
  const total = r.steps.length;
  s.step = Math.max(0, Math.min(total, s.step));
  const k = s.step;
  const tree = /** @type {Tree} */ ({ parent: r.tree.parent, children: r.tree.children, length: r.tree.length, label: r.tree.label });
  const id = (/** @type {string} */ label) => tree.label.indexOf(label);
  const faded = new Set();
  const strong = new Set();
  /** @type {Map<number, { length: number, label: string }>} */
  const extensions = new Map();
  /** @type {Map<number, string>} */
  const notes = new Map();
  for (const node of tipNodes(tree)) notes.set(node, `x = ${len(s.values[/** @type {string} */ (tree.label[node])])}`);
  r.steps.forEach((/** @type {any} */ step, /** @type {number} */ i) => {
    if (i >= k) return;
    const node = id(step.node);
    const kids = step.children.flatMap((/** @type {string} */ c) => c.split('+')).map(id);
    if (i < k - 1) for (const c of kids) faded.add(c);
    else for (const c of kids) strong.add(c);
    if (node > 0 || tree.children[0].length === 2) {
      extensions.set(node, { length: step.extension, label: `${step.node}′` });
      notes.set(node, `x̂ = ${len(step.estimate[0])}`);
    }
    for (const c of kids) if (i < k - 1 || tree.children[c].length) notes.delete(c);
  });
  const box = $('pruning-tree');
  const width = box.clientWidth;
  if (width <= 0) return;
  box.innerHTML = treeFigure(tree, { width, height: Math.max(150, Math.min(320, r.tips.length * 40 + 60)), strong, faded, extensions, notes, label: k === 0 ? 'The tree before pruning, with the tip values.' : `Pruning step ${k} of ${total}: the cherry ${r.steps[k - 1].children.join(' and ')} becomes ${r.steps[k - 1].node}′.` });
  $('pruning-count').textContent = k === 0 ? `Start: ${total} cherries to prune` : `Step ${k} of ${total}`;
  /** @type {HTMLButtonElement} */ ($('pruning-first')).disabled = k === 0;
  /** @type {HTMLButtonElement} */ ($('pruning-prev')).disabled = k === 0;
  /** @type {HTMLButtonElement} */ ($('pruning-next')).disabled = k === total;
  /** @type {HTMLButtonElement} */ ($('pruning-last')).disabled = k === total;
  const sigma2 = typeof s.rate === 'number' ? s.rate : 1;
  if (k === 0) {
    $('pruning-caption').textContent = 'The tips and their values. Each step replaces a cherry by its parent, shown as a dotted extension of the parent\'s branch.';
  } else {
    const step = r.steps[k - 1];
    const [a, b] = step.children;
    const [va, vb] = step.lengths;
    $('pruning-caption').innerHTML = `${escape(a)} and ${escape(b)}, at ${len(step.values[0][0])} and ${len(step.values[1][0])} on branches of ${len(va)} and ${len(vb)}${step.extensions.some((/** @type {number} */ e) => e > 0) ? ' (lengthened by earlier steps)' : ''}, differ by ${len(step.contrast[0])}, with variance σ²(${len(va)} + ${len(vb)}) = ${len(sigma2 * step.variance)}. ${escape(step.node)}′ takes their weighted average, ${len(step.estimate[0])}, and its branch grows by ${len(va)}·${len(vb)}/(${len(va)} + ${len(vb)}) = ${len(step.extension)}.`;
  }
  const rows = r.steps.map((/** @type {any} */ step, /** @type {number} */ i) => {
    const cls = i === k - 1 ? 'current' : i >= k ? 'future' : '';
    return `<tr class="${cls}"><th scope="row">${i === k - 1 ? '<span aria-hidden="true">▶ </span>' : ''}${i + 1}</th><td>${escape(step.children.join(', '))} → ${escape(step.node)}′</td><td>${len(step.contrast[0])}</td><td>${len(sigma2 * step.variance)}</td><td>${num(step.logDensity)}</td><td>${num(step.total)}</td></tr>`;
  }).join('');
  $('pruning-steps').innerHTML = `<caption class="visually-hidden">The pruning steps</caption><thead><tr><th scope="col">Step</th><th scope="col">Cherry</th><th scope="col">Contrast</th><th scope="col">Its variance</th><th scope="col">Log-density</th><th scope="col">Running total</th></tr></thead><tbody>${rows}</tbody>`;
  const P = r.P;
  $('pruning-matrices').innerHTML = P ? [
    smallMatrix('P, the tips\' covariance', P.map((/** @type {number[]} */ row) => row.map((c) => len(c)))),
    smallMatrix('y, the contrasts', r.steps.map((/** @type {any} */ st, /** @type {number} */ i) => [i < k ? len(st.contrast[0]) : '·'])),
    smallMatrix('Q, their covariance', r.Q.map((/** @type {number} */ q, /** @type {number} */ i) => r.Q.map((/** @type {number} */ _, /** @type {number} */ j) => (i === j ? (i < k ? len(q) : '·') : '0')))),
  ].join('') : '';
  const done = k === total;
  $('pruning-readout').innerHTML = done
    ? `The ${total} contrasts' log-densities add up to ${num(r.reml)}, the restricted log-likelihood, and the tips' multivariate normal density with the tree's covariance gives ${num(r.direct.reml)}. The value left at the root, ${num(r.root.estimate[0], 2)}, is the root's estimate.`
    : `After ${k} of ${total} steps the running total is ${k ? num(r.steps[k - 1].total) : '0'}.`;
  $('pruning-stats').innerHTML = [
    stat('Restricted, pruned', num(r.reml)),
    stat('Restricted, from the matrix', num(r.direct.reml)),
    stat('Ordinary, at the root estimate', num(r.ml)),
    stat('Root estimate', `${num(r.root.estimate[0], 2)} <small>SD ${num(Math.sqrt(r.root.variance * sigma2), 2)}</small>`),
  ].join('');
}

/** @type {Record<View, () => void>} */
const RENDER = { covariance: renderCovariance, reroot: renderReroot, pruning: renderPruning };
/** @param {View} v */
const render = (v) => RENDER[v]();

// ---------- Controls ----------

/** The tree editor: presets, Newick, and a length for every branch. @param {View} v */
function treeEditor(v) {
  const box = /** @type {HTMLElement} */ (document.querySelector(`[data-tree-editor="${v}"]`));
  box.innerHTML = `
    <div class="control-row"><label for="${v}-preset">Tree</label><select id="${v}-preset">${PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}<option value="own">Your own</option></select></div>
    <label for="${v}-newick" class="sub-label">Newick</label>
    <textarea id="${v}-newick" rows="2" spellcheck="false" autocomplete="off"></textarea>
    <div class="control-row"><button type="button" id="${v}-apply">Use this tree</button></div>
    <p class="sub-label" id="${v}-lengths-label">Branch lengths, by the node below</p>
    <div class="length-grid" id="${v}-lengths" role="group" aria-labelledby="${v}-lengths-label"></div>`;
  /** @type {HTMLSelectElement} */ ($(`${v}-preset`)).addEventListener('change', () => {
    const value = /** @type {HTMLSelectElement} */ ($(`${v}-preset`)).value;
    if (value === 'own') return;
    setTree(v, PRESETS[Number(value)].newick);
  });
  $(`${v}-apply`).addEventListener('click', () => setTree(v, /** @type {HTMLTextAreaElement} */ ($(`${v}-newick`)).value.trim()));
}

/** Uses a new tree in a panel, resetting what depends on its tips. @param {View} v @param {string} newick */
function setTree(v, newick) {
  const s = /** @type {any} */ (state[v]);
  s.newick = newick;
  const tree = readTree(newick, []);
  if (tree) {
    const tips = tipNodes(tree).map((n) => /** @type {string} */ (tree.label[n]));
    if (v === 'covariance') {
      s.arrows = tips.slice(0, 3);
      s.pair = tips.length >= 3 && newick === SCRIPT_TREE ? ['B', 'C'] : tips.slice(0, 2);
    } else {
      s.values = defaultValues(tree);
      if (v === 'reroot') {
        s.node = tree.label[0];
        s.fraction = 0;
        s.sweep = [tips[0], tips[tips.length - 1]];
      } else s.step = 1;
    }
  }
  showControls(v);
  update(v);
}

/** Fills a panel's controls from its state. @param {View} v */
function showControls(v) {
  const s = /** @type {any} */ (state[v]);
  const presetIndex = PRESETS.findIndex((p) => p.newick === s.newick);
  /** @type {HTMLSelectElement} */ ($(`${v}-preset`)).value = presetIndex >= 0 ? String(presetIndex) : 'own';
  /** @type {HTMLTextAreaElement} */ ($(`${v}-newick`)).value = s.newick;
  const tree = readTree(s.newick, []);
  const lengths = $(`${v}-lengths`);
  if (!tree) {
    lengths.innerHTML = '';
    return;
  }
  lengths.innerHTML = tree.label.map((label, node) => (node === 0 && !(tree.length[0] > 0) ? '' : `<label for="${v}-length-${node}">${escape(/** @type {string} */ (label))}${node === 0 ? ' (stem)' : ''}</label><input id="${v}-length-${node}" type="number" min="0.001" max="1e6" step="any" value="${tree.length[node]}">`)).join('');
  for (const field of /** @type {NodeListOf<HTMLInputElement>} */ (lengths.querySelectorAll('input'))) {
    field.addEventListener('input', () => {
      const value = Number(field.value);
      const ok = field.value.trim() !== '' && Number.isFinite(value) && value > 0 && value <= 1e6;
      setInvalid(field, !ok);
      if (!ok) return;
      const now = readTree(s.newick, []);
      if (!now) return;
      now.length[Number(field.id.split('-').pop())] = value;
      s.newick = writeNewick(now);
      /** @type {HTMLTextAreaElement} */ ($(`${v}-newick`)).value = s.newick;
      /** @type {HTMLSelectElement} */ ($(`${v}-preset`)).value = PRESETS.findIndex((p) => p.newick === s.newick) >= 0 ? String(PRESETS.findIndex((p) => p.newick === s.newick)) : 'own';
      update(v);
    });
  }
  const tips = tipNodes(tree).map((n) => /** @type {string} */ (tree.label[n]));
  const options = (/** @type {string} */ selected) => tips.map((t) => `<option${t === selected ? ' selected' : ''}>${escape(t)}</option>`).join('');
  if (v === 'covariance') {
    $('covariance-arrows').innerHTML = s.arrows.map((/** @type {string} */ t, /** @type {number} */ i) => `<select id="covariance-arrow-${i}" aria-label="Arrow ${i + 1}">${options(t)}</select>`).join('');
    $('covariance-pair').innerHTML = s.pair.map((/** @type {string} */ t, /** @type {number} */ i) => `<select id="covariance-pair-${i}" aria-label="${i ? 'Up' : 'Across'}">${options(t)}</select>`).join('');
    s.arrows.forEach((/** @type {string} */ _, /** @type {number} */ i) => $(`covariance-arrow-${i}`).addEventListener('change', () => { s.arrows[i] = /** @type {HTMLSelectElement} */ ($(`covariance-arrow-${i}`)).value; update(v); }));
    s.pair.forEach((/** @type {string} */ _, /** @type {number} */ i) => $(`covariance-pair-${i}`).addEventListener('change', () => { s.pair[i] = /** @type {HTMLSelectElement} */ ($(`covariance-pair-${i}`)).value; update(v); }));
    input('covariance-n').value = String(s.n);
    input('covariance-seed').value = String(s.seed);
    return;
  }
  const valueBox = /** @type {HTMLElement} */ (document.querySelector(`[data-values="${v}"]`));
  valueBox.innerHTML = `<p class="sub-label" id="${v}-values-label">Tip values</p><div class="length-grid" role="group" aria-labelledby="${v}-values-label">${tips.map((t) => `<label for="${v}-value-${escape(t)}">${escape(t)}</label><input id="${v}-value-${escape(t)}" type="number" min="-1e6" max="1e6" step="0.1" value="${s.values[t]}">`).join('')}
    <label for="${v}-rate">Rate, σ²</label><input id="${v}-rate" type="number" min="0.000001" max="1e6" step="0.01" value="${s.rate}"></div>`;
  for (const t of tips) {
    const field = input(`${v}-value-${t}`);
    field.addEventListener('input', () => {
      const value = Number(field.value);
      const ok = field.value.trim() !== '' && Number.isFinite(value) && Math.abs(value) <= 1e6;
      setInvalid(field, !ok);
      if (ok) {
        s.values[t] = value;
        update(v);
      }
    });
  }
  input(`${v}-rate`).addEventListener('input', () => {
    const value = Number(input(`${v}-rate`).value);
    const ok = Number.isFinite(value) && value >= 1e-6 && value <= 1e6;
    setInvalid(input(`${v}-rate`), !ok);
    if (ok) {
      s.rate = value;
      update(v);
    }
  });
  if (v === 'reroot') {
    const nodes = tree.label.map((l) => /** @type {string} */ (l));
    /** @type {HTMLSelectElement} */ ($('reroot-node')).innerHTML = nodes.map((l, i) => `<option value="${escape(l)}"${l === s.node ? ' selected' : ''}>${escape(l)}${i === 0 ? ' (the root: no branch above)' : tree.children[i].length ? '' : ', a tip'}</option>`).join('');
    fractionPair.set(s.fraction);
    input('reroot-fraction-number').disabled = s.node === tree.label[0];
    input('reroot-fraction-range').disabled = s.node === tree.label[0];
    /** @type {HTMLSelectElement} */ ($('reroot-sweep-from')).innerHTML = options(s.sweep[0]);
    /** @type {HTMLSelectElement} */ ($('reroot-sweep-to')).innerHTML = options(s.sweep[1]);
    const script = s.newick === SCRIPT_TREE;
    $('reroot-presets').parentElement?.toggleAttribute('hidden', !script);
  }
}

for (const v of /** @type {View[]} */ (['covariance', 'reroot', 'pruning'])) {
  if (document.querySelector(`[data-tree-editor="${v}"]`)) treeEditor(v);
}

// Panel 1
$('covariance-matrix').addEventListener('click', (event) => {
  const button = /** @type {HTMLElement} */ (event.target).closest('button');
  if (!button) return;
  state.covariance.pair = [/** @type {string} */ (button.dataset.i), /** @type {string} */ (button.dataset.j)];
  showControls('covariance');
  update('covariance');
  /** @type {HTMLElement | null} */ ($('covariance-matrix').querySelector(`button[data-i="${CSS.escape(state.covariance.pair[0])}"][data-j="${CSS.escape(state.covariance.pair[1])}"]`))?.focus();
});
integerField(input('covariance-n'), (value) => { state.covariance.n = value; update('covariance'); });
integerField(input('covariance-seed'), (value) => { state.covariance.seed = value; update('covariance'); });
$('covariance-new-seed').addEventListener('click', () => {
  state.covariance.seed = (state.covariance.seed + 1) % 4294967296;
  input('covariance-seed').value = String(state.covariance.seed);
  update('covariance');
});
const turner = attachRotation($('covariance-scene'), { get: () => arrowRotation, set: (q) => { arrowRotation = q; renderArrows(); } });
const TURNS = /** @type {const} */ ([['left', '◀', 'Turn left'], ['right', '▶', 'Turn right'], ['up', '▲', 'Tilt up'], ['down', '▼', 'Tilt down']]);
$('covariance-view').innerHTML = `${TURNS.map(([dir, glyph, label]) => `<button type="button" class="icon" data-turn="${dir}" aria-label="${label}" title="${label}">${glyph}</button>`).join('')}<button type="button" data-turn="reset">Reset view</button><span class="hint">Drag, or focus the figure and use the arrow keys.</span>`;
$('covariance-view').addEventListener('click', (event) => {
  const button = /** @type {HTMLElement} */ (event.target).closest('button');
  if (!button) return;
  if (button.dataset.turn === 'reset') {
    arrowRotation = ARROW_VIEW;
    renderArrows();
  } else turner.turnBy(/** @type {'left' | 'right' | 'up' | 'down'} */ (button.dataset.turn));
});

// Panel 2
const fractionPair = bindPair({ range: input('reroot-fraction-range'), number: input('reroot-fraction-number'), decimals: 2, onInput: (value) => { state.reroot.fraction = value; update('reroot'); } });
/** @type {HTMLSelectElement} */ ($('reroot-node')).addEventListener('change', () => {
  state.reroot.node = /** @type {HTMLSelectElement} */ ($('reroot-node')).value;
  const tree = treeOf('reroot');
  if (tree && state.reroot.node === tree.label[0]) state.reroot.fraction = 0;
  showControls('reroot');
  update('reroot');
});
for (const [k, id] of /** @type {const} */ ([[0, 'reroot-sweep-from'], [1, 'reroot-sweep-to']])) {
  $(id).addEventListener('change', () => { state.reroot.sweep[k] = /** @type {HTMLSelectElement} */ ($(id)).value; update('reroot'); });
}
const ROOTINGS = [
  { name: 'At E', node: 'E', fraction: 0 }, { name: 'At A', node: 'A', fraction: 0 }, { name: 'At B', node: 'B', fraction: 0 },
  { name: 'Halfway along v₄', node: 'D', fraction: 0.5 }, { name: 'Halfway along v₃', node: 'C', fraction: 0.5 },
];
$('reroot-presets').innerHTML = ROOTINGS.map((p, i) => `<button type="button" data-rooting="${i}">${p.name}</button>`).join('');
$('reroot-presets').addEventListener('click', (event) => {
  const button = /** @type {HTMLElement} */ (event.target).closest('button');
  if (!button) return;
  const p = ROOTINGS[Number(button.dataset.rooting)];
  Object.assign(state.reroot, { node: p.node, fraction: p.fraction });
  showControls('reroot');
  update('reroot');
});

// Panel 3
const stepTo = (/** @type {number} */ k) => { state.pruning.step = k; renderPruning(); };
$('pruning-first').addEventListener('click', () => stepTo(0));
$('pruning-prev').addEventListener('click', () => stepTo(state.pruning.step - 1));
$('pruning-next').addEventListener('click', () => stepTo(state.pruning.step + 1));
$('pruning-last').addEventListener('click', () => stepTo(results.pruning?.result.steps.length ?? 0));

for (const v of /** @type {View[]} */ (['covariance', 'reroot', 'pruning'])) {
  $(`${v}-reset`).addEventListener('click', () => {
    /** @type {any} */ (state)[v] = fresh[v]();
    if (v === 'covariance') arrowRotation = ARROW_VIEW;
    showControls(v);
    update(v);
  });
}
onWidth($('covariance-tree'), renderCovariance);
onWidth($('covariance-scene'), renderArrows);
onWidth($('reroot-tree'), renderReroot);
onWidth($('pruning-tree'), renderPruning);

// ---------- Start ----------

for (const v of /** @type {View[]} */ (['covariance', 'reroot', 'pruning'])) {
  showControls(v);
  update(v);
}

installApi({
  entry: ENTRY,
  load: (/** @type {any} */ p, /** @type {any} */ result) => {
    const v = /** @type {View} */ (p.view);
    state.view = v;
    const s = /** @type {any} */ (state[v]);
    s.newick = p.newick;
    if (v === 'covariance') Object.assign(s, { arrows: [...p.arrows], pair: [...p.pair], n: p.sample?.n ?? s.n, seed: p.sample?.seed ?? s.seed });
    else {
      const oneTrait = typeof p.rate === 'number';
      if (!oneTrait) {
        // The page shows one trait; a multi-trait request is computed but shown by its first trait.
        s.values = Object.fromEntries(Object.entries(p.values).map(([k, x]) => [k, /** @type {number[]} */ (x)[0]]));
        s.rate = p.rate[0][0];
      } else Object.assign(s, { values: { ...p.values }, rate: p.rate });
      if (v === 'reroot') Object.assign(s, { node: p.root.node, fraction: p.root.fraction, sweep: [...p.sweep] });
      if (!oneTrait) {
        showControls(v);
        update(v);
        $(v).scrollIntoView({ block: 'start' });
        return;
      }
    }
    showControls(v);
    showIssues(v, []);
    delete $(`${v}-figures`).dataset.stale;
    results[v] = { params: p, result };
    render(v);
    $(v).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams(paramsFor(state.view)),
});
