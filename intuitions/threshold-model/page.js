// Page wiring for the threshold model: three views (one trait, two traits, a table)
// over compute(). Every number shown comes from compute.js.

import { formatNumber } from '../lib/format.js';
import { bindPair, draggable, initTheme, installApi, onWidth } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { compute, DEFAULTS, ENTRY, LIMITS, resolveParams, samplePoints } from './compute.js';
import { barsFigure, liabilityFigure, planeFigure, tableFigure, thresholdName } from './figure.js';

/** @typedef {'one' | 'two' | 'fit'} View */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const select = (/** @type {string} */ id) => /** @type {HTMLSelectElement} */ ($(id));

const PAGE_SAMPLE = { n: 300, seed: 1 };
const EXAMPLES = { 2: [[70, 5], [15, 10]], 3: [[20, 11, 4, 1], [9, 14, 10, 6], [2, 6, 12, 25]] };
const fresh = () => ({
  one: { mean: DEFAULTS.means[0], thresholds: [...DEFAULTS.thresholds[0]] },
  two: { means: [...DEFAULTS.means], thresholds: DEFAULTS.thresholds.map((t) => [...t]), rho: DEFAULTS.rho, ...PAGE_SAMPLE },
  fit: { table: EXAMPLES[2].map((row) => [...row]) },
});
const state = { view: /** @type {View} */ ('one'), ...fresh() };

/** The request params the current view describes. @param {View} view */
function paramsFor(view) {
  if (view === 'one') return { means: [state.one.mean], thresholds: [state.one.thresholds] };
  if (view === 'two') {
    const { means, thresholds, rho, n, seed } = state.two;
    return { means, thresholds, rho, sample: n > 0 ? { n, seed } : null };
  }
  return { table: state.fit.table };
}

// ---------- Tabs ----------

const tabs = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('[role="tab"]')]);
/** @param {View} view @param {boolean} [focus] */
function showView(view, focus = false) {
  state.view = view;
  for (const tab of tabs) {
    const on = tab.id === `tab-${view}`;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(/** @type {string} */ (tab.getAttribute('aria-controls'))).hidden = !on;
    if (on && focus) tab.focus();
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => showView(/** @type {View} */ (tab.id.slice(4))));
  tab.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    showView(/** @type {View} */ (tabs[(i + step + tabs.length) % tabs.length].id.slice(4)), true);
  });
});

// ---------- Threshold editors (shared by both model views) ----------

/**
 * Thresholds after changing the number of categories: drop from the top, or add above
 * the last one (spreading them out when there is no room).
 * @param {number[]} thresholds
 * @param {number} k categories wanted
 */
function resize(thresholds, k) {
  const next = thresholds.slice(0, k - 1);
  while (next.length < k - 1) {
    const last = next[next.length - 1] ?? -1;
    if (last + 0.75 > LIMITS.threshold - 0.5) return Array.from({ length: k - 1 }, (_, j) => Number((-2 + (4 * j) / Math.max(1, k - 2)).toFixed(2)));
    next.push(Number((last + 0.75).toFixed(2)));
  }
  return next;
}

/**
 * Number inputs for a list of thresholds. A value applies only while it is a number in
 * range that keeps the list increasing; otherwise the field is marked and explained.
 * @param {{ list: HTMLElement, error: HTMLElement, get: () => number[], set: (t: number[]) => void, label: string, idPrefix: string }} options
 */
function thresholdEditor({ list, error, get, set, label, idPrefix }) {
  /** @type {HTMLInputElement[]} */
  let fields = [];
  const build = () => {
    const t = get();
    list.innerHTML = t.map((value, j) => `<label for="${idPrefix}-${j}">${thresholdName(j)}<input id="${idPrefix}-${j}" type="number" min="${-LIMITS.threshold}" max="${LIMITS.threshold}" step="0.05" value="${value}" aria-label="${label} threshold ${j + 1}"></label>`).join('');
    fields = [...list.querySelectorAll('input')];
    fields.forEach((field, j) => field.addEventListener('input', () => {
      const values = get().slice();
      const v = Number(field.value);
      const lower = j ? values[j - 1] + LIMITS.minGap : -LIMITS.threshold;
      const upper = j < values.length - 1 ? values[j + 1] - LIMITS.minGap : LIMITS.threshold;
      const ok = field.value.trim() !== '' && Number.isFinite(v) && v >= lower - 1e-9 && v <= upper + 1e-9;
      field.toggleAttribute('aria-invalid', !ok);
      error.hidden = ok;
      if (!ok) {
        error.textContent = `${thresholdName(j)} must be a number from ${formatNumber(lower)} to ${formatNumber(upper)}, between its neighbours.`;
        return;
      }
      values[j] = v;
      set(values);
    }));
  };
  return {
    build,
    /** Shows values set elsewhere (a drag) without rebuilding the fields. */
    show() {
      get().forEach((v, j) => {
        if (fields[j] && document.activeElement !== fields[j]) fields[j].value = String(v);
      });
    },
  };
}

/**
 * Moves threshold j to v, keeping the list increasing.
 * @param {number[]} thresholds @param {number} j @param {number} v
 */
function dragTo(thresholds, j, v) {
  const lower = j ? thresholds[j - 1] + LIMITS.minGap : -LIMITS.threshold;
  const upper = j < thresholds.length - 1 ? thresholds[j + 1] - LIMITS.minGap : LIMITS.threshold;
  const next = thresholds.slice();
  next[j] = Number(Math.min(upper, Math.max(lower, Math.round(v * 100) / 100)).toFixed(2));
  return next;
}

/** @param {HTMLSelectElement} el @param {number} from @param {number} to */
function fillCounts(el, from, to) {
  el.innerHTML = Array.from({ length: to - from + 1 }, (_, i) => `<option value="${from + i}">${from + i}</option>`).join('');
}

// ---------- One trait ----------

const one = {
  liability: $('liability-plot'),
  bars: $('bars-plot'),
  /** @type {ReturnType<typeof liabilityFigure> | null} */
  layout: null,
  mean: bindPair({ range: input('one-mean-range'), number: input('one-mean-number'), onInput: (v) => { state.one.mean = v; renderOne(); } }),
  editor: thresholdEditor({
    list: $('one-thresholds'), error: $('one-error'), label: 'Trait', idPrefix: 'one-t',
    get: () => state.one.thresholds, set: (t) => { state.one.thresholds = t; renderOne(); },
  }),
};
fillCounts(select('one-k'), 2, LIMITS.maxThresholds + 1);

function oneResult() {
  return /** @type {any} */ (compute(paramsFor('one'))).traits[0];
}
function renderOne() {
  const trait = oneResult();
  const width = one.liability.clientWidth;
  if (width > 0) {
    one.layout = liabilityFigure(trait, { width, height: width < 480 ? 240 : 280 });
    one.liability.innerHTML = one.layout.svg;
  }
  const barWidth = one.bars.clientWidth;
  if (barWidth > 0) one.bars.innerHTML = barsFigure(trait.categories, { width: barWidth, height: width < 480 ? 170 : 280 });
  one.editor.show();
}
function showOneControls() {
  one.mean.set(state.one.mean);
  select('one-k').value = String(state.one.thresholds.length + 1);
  one.editor.build();
}
select('one-k').addEventListener('change', () => {
  state.one.thresholds = resize(state.one.thresholds, Number(select('one-k').value));
  one.editor.build();
  renderOne();
});
$('one-reset').addEventListener('click', () => {
  state.one = fresh().one;
  showOneControls();
  renderOne();
});
draggable(one.liability, {
  onStart: (target) => target.closest('[data-drag]')?.getAttribute('data-drag') ?? null,
  onMove: (key, x) => {
    if (!one.layout) return;
    state.one.thresholds = dragTo(state.one.thresholds, Number(key.slice(1)), one.layout.x.invert(x));
    renderOne();
  },
});

// ---------- Two traits ----------

const two = {
  plane: $('plane-plot'),
  table: $('table-plot'),
  /** @type {ReturnType<typeof planeFigure> | null} */
  layout: null,
  rho: bindPair({ range: input('two-rho-range'), number: input('two-rho-number'), onInput: (v) => { state.two.rho = v; renderTwo(); } }),
  means: [0, 1].map((t) => bindPair({
    range: input(`two-mean${t}-range`), number: input(`two-mean${t}-number`),
    onInput: (v) => { state.two.means[t] = v; renderTwo(); },
  })),
  editors: [0, 1].map((t) => thresholdEditor({
    list: $(`two-thresholds${t}`), error: $(`two-error${t}`), label: `Trait ${t + 1}`, idPrefix: `two-t${t}`,
    get: () => state.two.thresholds[t], set: (v) => { state.two.thresholds[t] = v; renderTwo(); },
  })),
};
for (const t of [0, 1]) fillCounts(select(`two-k${t}`), 2, 5);

/** @type {any} */
let twoResult = null;
function renderTwo() {
  twoResult = compute(paramsFor('two'));
  const { means, thresholds, rho, n, seed } = state.two;
  const points = n > 0 ? samplePoints(means, rho, { n, seed }) : [];
  const width = two.plane.clientWidth;
  if (width > 0) {
    two.layout = planeFigure({ means, rho, thresholds, points }, { width, id: 'two-plane' });
    two.plane.innerHTML = two.layout.svg;
  }
  const tableWidth = two.table.clientWidth;
  if (tableWidth > 0) two.table.innerHTML = tableFigure({ cells: twoResult.cells, counts: twoResult.sample?.counts ?? null }, { width: tableWidth });
  two.editors.forEach((e) => e.show());

  const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const items = [
    stat('Latent correlation <var>ρ</var>', formatNumber(rho)),
    stat('Correlation of the category numbers', twoResult.codeCorrelation === null ? '—' : formatNumber(twoResult.codeCorrelation)),
  ];
  if (twoResult.cosPiApproximation !== null) items.push(stat('cos-π shortcut', formatNumber(twoResult.cosPiApproximation)));
  const sample = twoResult.sample;
  if (sample) {
    items.push(stat(`Fitted from ${sample.n.toLocaleString('en-US')} individuals`, sample.fit
      ? `${formatNumber(sample.fit.rho)}${sample.fit.se === null ? '' : ` <small>± ${formatNumber(sample.fit.se)} SE</small>`}`
      : '—'));
  }
  $('two-stats').innerHTML = items.join('');
  const notes = [];
  if (twoResult.cosPiApproximation !== null) {
    const gap = twoResult.cosPiApproximation - rho;
    notes.push(Math.abs(gap) < 0.005
      ? 'With both traits split near their medians, the cos-π shortcut matches the latent correlation.'
      : `The cos-π shortcut, cos(π / (1 + √(AD/BC))), is exact only for median splits; with these margins it is off by ${formatNumber(gap)}.`);
  }
  if (sample && !sample.fit) notes.push(`Cannot fit the sample: ${sample.unfittable}.`);
  $('two-note').hidden = !notes.length;
  $('two-note').textContent = notes.join(' ');
  /** @type {HTMLButtonElement} */ ($('two-to-fit')).disabled = !sample;
}
function showTwoControls() {
  two.rho.set(state.two.rho);
  two.means.forEach((pair, t) => pair.set(state.two.means[t]));
  for (const t of [0, 1]) select(`two-k${t}`).value = String(state.two.thresholds[t].length + 1);
  two.editors.forEach((e) => e.build());
  input('two-n').value = String(state.two.n);
  input('two-seed').value = String(state.two.seed);
}
for (const t of [0, 1]) {
  select(`two-k${t}`).addEventListener('change', () => {
    state.two.thresholds[t] = resize(state.two.thresholds[t], Number(select(`two-k${t}`).value));
    two.editors[t].build();
    renderTwo();
  });
}
/** Applies an integer field when it is in range; marks it otherwise. @param {HTMLInputElement} field @param {(v: number) => void} apply */
function integerField(field, apply) {
  field.addEventListener('input', () => {
    const v = Number(field.value);
    const ok = field.value.trim() !== '' && Number.isInteger(v) && v >= Number(field.min) && v <= Number(field.max);
    field.toggleAttribute('aria-invalid', !ok);
    if (ok) apply(v);
  });
}
integerField(input('two-n'), (v) => { state.two.n = v; renderTwo(); });
integerField(input('two-seed'), (v) => { state.two.seed = v; renderTwo(); });
$('two-new-seed').addEventListener('click', () => {
  state.two.seed = (state.two.seed + 1) % 4294967296;
  input('two-seed').value = String(state.two.seed);
  renderTwo();
});
$('two-reset').addEventListener('click', () => {
  state.two = fresh().two;
  showTwoControls();
  renderTwo();
});
$('two-to-fit').addEventListener('click', () => {
  if (!twoResult?.sample) return;
  state.fit.table = twoResult.sample.counts.map((/** @type {number[]} */ row) => [...row]);
  showFitControls();
  renderFit();
  showView('fit', true);
});
draggable(two.plane, {
  onStart: (target) => target.closest('[data-drag]')?.getAttribute('data-drag') ?? null,
  onMove: (key, x, y) => {
    if (!two.layout) return;
    const t = key[0] === 'x' ? 0 : 1;
    const value = t === 0 ? two.layout.x.invert(x) : two.layout.y.invert(y);
    state.two.thresholds[t] = dragTo(state.two.thresholds[t], Number(key.slice(1)), value);
    renderTwo();
  },
});

// ---------- From a table ----------

const fit = { plane: $('fit-plane') };
fillCounts(select('fit-rows'), 2, 6);
fillCounts(select('fit-cols'), 2, 6);

function showFitControls() {
  const table = state.fit.table;
  select('fit-rows').value = String(table.length);
  select('fit-cols').value = String(table[0].length);
  const header = `<tr><th class="corner" scope="col"><span class="visually-hidden">Trait 1 category</span></th>${table[0].map((_, j) => `<th scope="col">${j}</th>`).join('')}</tr>`;
  const rows = table.map((row, i) => `<tr><th scope="row">${i}</th>${row.map((x, j) => `<td><input type="number" min="0" step="1" value="${x}" data-cell="${i},${j}" aria-label="Count, trait 1 category ${i}, trait 2 category ${j}"></td>`).join('')}</tr>`).join('');
  $('count-grid').innerHTML = `<caption class="visually-hidden">Counts by trait 1 category (rows) and trait 2 category (columns)</caption><thead>${header}</thead><tbody>${rows}</tbody>`;
}
$('count-grid').addEventListener('input', (event) => {
  const field = /** @type {HTMLInputElement} */ (event.target);
  const [i, j] = /** @type {string} */ (field.dataset.cell).split(',').map(Number);
  const v = Number(field.value);
  const ok = field.value.trim() !== '' && Number.isInteger(v) && v >= 0;
  field.toggleAttribute('aria-invalid', !ok);
  state.fit.table[i][j] = ok ? v : NaN;
  renderFit();
});
for (const id of ['fit-rows', 'fit-cols']) {
  select(id).addEventListener('change', () => {
    const rows = Number(select('fit-rows').value);
    const cols = Number(select('fit-cols').value);
    state.fit.table = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => state.fit.table[i]?.[j] ?? 0));
    showFitControls();
    renderFit();
  });
}
for (const k of /** @type {const} */ ([2, 3])) {
  $(`fit-example-${k}`).addEventListener('click', () => {
    state.fit.table = EXAMPLES[k].map((row) => [...row]);
    showFitControls();
    renderFit();
  });
}

/** Issue text for the counts grid, in the page's own words. @param {import('../lib/params.js').Issue} issue */
function describe(issue) {
  const cell = /\[(\d+)\]\[(\d+)\]$/.exec(issue.path);
  if (cell) return `Row ${cell[1]}, column ${cell[2]}: ${issue.message}.`;
  const row = /table\[(\d+)\]$/.exec(issue.path);
  if (row) return `Row ${row[1]}: ${issue.message}.`;
  const col = /table\[\*\]\[(\d+)\]$/.exec(issue.path);
  if (col) return `Column ${col[1]}: ${issue.message.replace(/^column \d+ /, '')}.`;
  return `${issue.message}.`;
}

function renderFit() {
  /** @type {any} */
  let out;
  try {
    out = compute(paramsFor('fit'));
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    $('fit-issues').hidden = false;
    $('fit-issues').innerHTML = error.issues.map((issue) => `<p>${describe(issue)}</p>`).join('');
    $('fit-result').hidden = true;
    return;
  }
  $('fit-issues').hidden = true;
  $('fit-result').hidden = false;
  const f = out.fit;
  const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const items = [
    stat(f.thresholds[0].length === 1 && f.thresholds[1].length === 1 ? 'Tetrachoric correlation' : 'Polychoric correlation', `${formatNumber(f.rho)}${f.se === null ? '' : ` <small>± ${formatNumber(f.se)} SE</small>`}`),
    stat('Correlation of the category numbers', f.codeCorrelation === null ? '—' : formatNumber(f.codeCorrelation)),
  ];
  if (f.cosPiApproximation !== null) items.push(stat('cos-π shortcut', formatNumber(f.cosPiApproximation)));
  $('fit-stats').innerHTML = items.join('');
  const list = (/** @type {number[]} */ ts) => ts.map((t) => formatNumber(t)).join(', ');
  $('fit-thresholds').textContent = `${f.n.toLocaleString('en-US')} individuals. Thresholds on the standardised liability: trait 1 at ${list(f.thresholds[0])}; trait 2 at ${list(f.thresholds[1])}.`;
  const notes = [];
  if (f.atBoundary) notes.push(`Every individual is on one diagonal of the table, so the likelihood is largest at ρ = ${f.rho}; there is no standard error.`);
  if (f.cosPiApproximation !== null && Math.abs(f.cosPiApproximation - f.rho) >= 0.005) {
    notes.push(`The cos-π shortcut is exact only when both traits are split at their medians; here it is off by ${formatNumber(f.cosPiApproximation - f.rho)}.`);
  }
  $('fit-note').hidden = !notes.length;
  $('fit-note').textContent = notes.join(' ');

  const header = `<thead><tr><th scope="col">Trait 1 \\ trait 2</th>${f.expected[0].map((/** @type {number} */ _, /** @type {number} */ j) => `<th scope="col">${j}</th>`).join('')}</tr></thead>`;
  const body = state.fit.table.map((row, i) => `<tr><th scope="row">${i}</th>${row.map((x, j) => `<td>${x} <span class="muted">(${f.expected[i][j].toFixed(1)})</span></td>`).join('')}</tr>`).join('');
  $('fit-table').innerHTML = `${header}<tbody>${body}</tbody>`;

  const width = fit.plane.clientWidth;
  if (width > 0) {
    fit.plane.innerHTML = planeFigure({ means: [0, 0], rho: f.rho, thresholds: f.thresholds }, { width, id: 'fit-plane', handles: false }).svg;
  }
}

// ---------- Start ----------

initTheme(/** @type {HTMLButtonElement} */ ($('theme-toggle')));
showOneControls();
showTwoControls();
showFitControls();
onWidth(one.liability, renderOne);
onWidth(two.plane, renderTwo);
onWidth(fit.plane, renderFit);
renderFit();

installApi({
  entry: ENTRY,
  load: (/** @type {any} */ p) => {
    if ('table' in p) {
      state.fit.table = p.table.map((/** @type {number[]} */ row) => [...row]);
      showFitControls();
      showView('fit');
      renderFit();
    } else if (p.means.length === 1) {
      state.one = { mean: p.means[0], thresholds: [...p.thresholds[0]] };
      showOneControls();
      showView('one');
      renderOne();
    } else {
      state.two = { means: [...p.means], thresholds: p.thresholds.map((/** @type {number[]} */ t) => [...t]), rho: p.rho, n: p.sample?.n ?? 0, seed: p.sample?.seed ?? 1 };
      showTwoControls();
      showView('two');
      renderTwo();
    }
  },
  getParams: () => resolveParams(paramsFor(state.view)),
});
