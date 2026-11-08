// Page wiring for the probability puzzles: four panels, each run in its own Web Worker. A
// round is shown whole when it arrives; Play replays it from the start, one jump, applicant,
// box or draw at a time. Every number shown comes from compute.js.

import { formatNumber, formatShare } from '../lib/format.js';
import { bindPair, installApi, integerField, onWidth, playback, setInvalid, workerRunner } from '../lib/page.js';
import { IntuitionsError } from '../lib/params.js';
import { seriesMark, swatch } from '../lib/plot.js';
import { DEFAULTS, ENTRY, resolveParams, VIEWS } from './compute.js';
import { applicantsFigure, boxesFigure, cutoffFigure, dealFigure, loopsFigure, posteriorFigure, trialsFigure, windowFigure } from './figure.js';

/** @typedef {import('./compute.js').View} View */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));
const stat = (/** @type {string} */ label, /** @type {string} */ value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const count = (/** @type {number} */ v) => v.toLocaleString('en-US');
/** A chance as a percentage, with more digits near 0 and 1. @param {number} p */
const pct = (p, d = 1) => (p > 0 && p < 1e-4 ? formatShare(p) : `${formatNumber(p * 100, d)}%`);
const pm = (/** @type {{ rate: number, se: number } | null} */ s) => (s ? `${pct(s.rate)} <small>± ${formatNumber(s.se * 100, 2)}</small>` : '—');
const MAX_REPLICATES = { kruskal: 200000, secretary: 100000, prisoners: 100000, coins: 1000000 };

/** @param {View} v */
const fresh = (v) => ({ ...DEFAULTS[v] });
const state = { view: /** @type {View} */ ('kruskal'), panels: /** @type {Record<View, Record<string, any>>} */ (Object.fromEntries(VIEWS.map((v) => [v, fresh(v)]))) };
/** @type {Partial<Record<View, { params: any, result: any }>>} */
const results = {};
const runners = Object.fromEntries(VIEWS.map((v) => [v, workerRunner()]));
for (const v of VIEWS) {
  for (const type of ['input', 'change', 'pointerdown', 'keydown']) $(v).addEventListener(type, () => { state.view = v; });
}

/** @param {string} id @param {(width: number) => string} draw */
function drawInto(id, draw) {
  const box = $(id);
  if (box.clientWidth > 0) box.innerHTML = draw(box.clientWidth);
}

// ---------- Drawing ----------

/** The play-through at time t. @type {Record<View, (t: number) => void>} */
const PLAY = {
  kruskal: (t) => {
    const r = results.kruskal?.result;
    if (r) drawInto('kruskal-deal', (w) => dealFigure(r, { width: w, t }));
  },
  secretary: (t) => {
    const r = results.secretary?.result;
    if (r) drawInto('secretary-applicants', (w) => applicantsFigure(r, { width: w, height: w < 520 ? 240 : 290, t }));
  },
  prisoners: (t) => {
    const r = results.prisoners?.result;
    if (r) drawInto('prisoners-boxes', (w) => boxesFigure(r, { width: w, t }));
  },
  coins: (t) => {
    const r = results.coins?.result;
    if (r) drawInto('coins-trials', (w) => trialsFigure(r, { width: w, t }));
  },
};

/** Everything else in a panel: the second figure, the legend, the readout and the numbers. @type {Record<View, () => void>} */
const RENDER = {
  kruskal: () => {
    const r = results.kruskal?.result;
    if (!r) return;
    $('kruskal-legend').innerHTML = r.play.walks.map((/** @type {number[]} */ _, /** @type {number} */ k) => `<li>${swatch({ line: `k-line k${k % 6}`, ...seriesMark(k) })} kid on card ${k + 1}</li>`).join('')
      + `<li>${swatch({ line: 'walk-line shared' })} walked together</li>`
      + '<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><rect x="5" y="1.5" width="16" height="11" rx="2" class="card-face end"/></svg> where they end</li>';
    const sim = r.simulation;
    if (sim) drawInto('kruskal-curve', (w) => windowFigure(r, { width: w, height: w < 520 ? 220 : 250 }));
    $('kruskal-curve').hidden = !sim;
    const { ends, together, merged, walks } = r.play;
    const verdict = $('kruskal-verdict');
    verdict.className = `verdict ${together ? 'ok' : 'bad'}`;
    verdict.innerHTML = together
      ? `<strong>✓ All on card ${ends[0] + 1}.</strong> ${walks.length > 1 ? `Their paths have all met by card ${merged + 1}.` : 'One kid always ends with themselves.'}`
      : `<strong>✗ Not together.</strong> They end on cards ${[...new Set(ends)].map((/** @type {number} */ e) => e + 1).join(' and ')}: some paths never met.`;
    $('kruskal-readout').innerHTML = sim
      ? `In ${count(sim.replicates)} seeded deals, ${walks.length} kids on the first ${walks.length} cards all ended on the same card in ${pct(sim.allTogether.rate)} of them${sim.pairTogether ? `, and two of them chosen at random in ${pct(sim.pairTogether.rate)}` : ''}. ${r.deck === 'kruskal' ? 'Court cards worth 5 make the steps longer, so paths have fewer chances to meet.' : 'Short steps give the paths many chances to meet.'}`
      : 'No simulation: set more than 0 deals.';
    $('kruskal-stats').innerHTML = sim ? [
      stat(`All ${walks.length} together`, pm(sim.allTogether)),
      sim.pairTogether ? stat('A random pair together', pm(sim.pairTogether)) : '',
      stat('All 52 together', pct(sim.byWindow[51])),
    ].join('') : '';
    $('kruskal-status').textContent = `Seed ${results.kruskal?.params.seed}; the deal shown is the first, then ${count(r.simulation?.replicates ?? 0)} more.`;
  },
  secretary: () => {
    const r = results.secretary?.result;
    if (!r) return;
    const e = r.exact;
    drawInto('secretary-curve', (w) => cutoffFigure(r, { width: w, height: w < 520 ? 230 : 270 }));
    $('secretary-legend').innerHTML = [
      `<li>${swatch({ shape: 'circle', mark: 'k-mark k0' })} the best so far</li>`,
      `<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><circle cx="13" cy="7" r="3" class="applicant-dot"/></svg> the others</li>`,
      `<li>${swatch({ shape: 'diamond', mark: 'k-mark k1' })} hired</li>`,
      `<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><circle cx="13" cy="7" r="6" class="best-ring"/></svg> the best, at the end</li>`,
      r.strategy === 'cutoff' ? `<li>${swatch({ fill: 'skip-zone' })} skipped</li>` : `<li>${swatch({ line: 'threshold-curve' })} the quality needed</li>`,
    ].join('');
    const { pick, best, won } = r.play;
    const verdict = $('secretary-verdict');
    verdict.className = `verdict ${won ? 'ok' : 'bad'}`;
    verdict.innerHTML = won ? `<strong>✓ Hired the best.</strong> Applicant ${pick + 1} of ${r.n} was the best of them all.`
      : pick < 0 ? `<strong>✗ No one hired.</strong> No one after the skipped ${r.cutoff} beat them; the best, applicant ${best + 1}, was among those skipped.`
        : `<strong>✗ Not the best.</strong> Applicant ${pick + 1} was hired; the best was applicant ${best + 1}.`;
    const exact = r.strategy === 'cutoff' ? e.cutoff : e[r.strategy];
    const sim = r.simulation?.[r.strategy];
    $('secretary-readout').innerHTML = (r.strategy === 'cutoff'
      ? `Skipping ${r.cutoff} of ${r.n} hires the best with chance ${pct(exact, 2)} exactly. The best cutoff is ${e.best.cutoff}, with ${pct(e.best.probability, 2)}; 1/e is ${pct(1 / Math.E, 2)}.`
      : `Knowing the distribution, ${r.strategy === 'half' ? 'the 50% rule' : 'the best threshold rule'} hires the best with chance ${pct(exact, 2)} exactly, against ${pct(e.best.probability, 2)} for the best cutoff on ranks alone.`)
      + (sim ? ` In ${count(r.simulation.replicates)} seeded rounds it did so ${pct(sim.rate, 2)} of the time.` : '');
    $('secretary-stats').innerHTML = [
      stat(`Skip ${r.cutoff}`, `${pct(e.cutoff, 2)}${r.simulation ? ` <small class="sim-line">sim. ${pct(r.simulation.cutoff.rate, 1)}</small>` : ''}`),
      stat('The 50% rule', `${pct(e.half, 2)}${r.simulation ? ` <small class="sim-line">sim. ${pct(r.simulation.half.rate, 1)}</small>` : ''}`),
      stat('The best rule', `${pct(e.optimal, 2)}${r.simulation ? ` <small class="sim-line">sim. ${pct(r.simulation.optimal.rate, 1)}</small>` : ''}`),
    ].join('');
    $('secretary-cutoff-hint').innerHTML = `⌊<var>n</var>/e⌋ = ${Math.floor(r.n / Math.E)}; the best cutoff is ${e.best.cutoff}.`;
    $('secretary-status').textContent = `Seed ${results.secretary?.params.seed}; the applicants shown are the first round, then ${count(r.simulation?.replicates ?? 0)} more.`;
  },
  prisoners: () => {
    const r = results.prisoners?.result;
    if (!r) return;
    drawInto('prisoners-loops', (w) => loopsFigure(r, { width: w }));
    $('prisoners-legend').innerHTML = [
      '<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><rect x="5" y="1" width="16" height="12" rx="2" class="box"/></svg> closed, its number</li>',
      '<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><rect x="5" y="1" width="16" height="12" rx="2" class="box open"/></svg> opened, the ticket inside</li>',
      '<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><rect x="5" y="1" width="16" height="12" rx="2" class="box open own"/></svg> ✓ their own number</li>',
      '<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><rect x="5" y="1" width="16" height="12" rx="2" class="loop-segment long"/></svg> ✗ a loop too long</li>',
    ].join('');
    const { found, opened, longest, failing, loops, loopOf } = r.play;
    const loopLength = loops[loopOf[r.prisoner - 1]].length;
    const verdict = $('prisoners-verdict');
    verdict.className = `verdict ${found ? 'ok' : 'bad'}`;
    verdict.innerHTML = found ? `<strong>✓ Found.</strong> Prisoner ${r.prisoner} found their number in box ${opened[opened.length - 1]}, the ${count(opened.length)}${ordinal(opened.length)} box opened.`
      : `<strong>✗ Not found.</strong> Prisoner ${r.prisoner} opened ${r.attempts} boxes without finding their number${r.strategy === 'loops' ? `: their loop has ${loopLength} boxes` : ''}.`;
    const sim = r.simulation;
    $('prisoners-readout').innerHTML = (r.strategy === 'loops'
      ? `In this shuffle the longest loop has ${longest} boxes, so ${failing === 0 ? `every prisoner finds their number: all ${r.prisoners} go free` : `${count(failing)} of the ${r.prisoners} prisoners fail and none go free`}. `
      : `Opening boxes at random, each prisoner succeeds with chance ${r.attempts}/${r.boxes}, independently of the others. `)
      + `Following the loops, all ${r.prisoners} go free with chance ${pct(r.exact.loops, 2)}; at random, ${pct(r.exact.random, 2)}.`
      + (sim ? ` In ${count(sim.replicates)} seeded shuffles: ${pct(sim.loops.rate, 2)} and ${pct(sim.random.rate, 2)}.` : '');
    $('prisoners-stats').innerHTML = [
      stat('Following the loops', `${pct(r.exact.loops, 2)}${sim ? ` <small class="sim-line">sim. ${pct(sim.loops.rate, 1)}</small>` : ''}`),
      stat('At random', `${pct(r.exact.random, 2)}${sim ? ` <small class="sim-line">sim. ${pct(sim.random.rate, 1)}</small>` : ''}`),
      stat('Longest loop', `${longest} <small>of ${r.boxes}</small>`),
    ].join('');
    $('prisoners-status').textContent = `Seed ${results.prisoners?.params.seed}; the shuffle shown is the first, then ${count(sim?.replicates ?? 0)} more.`;
  },
  coins: () => {
    const r = results.coins?.result;
    if (!r) return;
    drawInto('coins-curve', (w) => posteriorFigure(r, { width: w, height: w < 520 ? 230 : 260 }));
    $('coins-legend').innerHTML = [
      '<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><circle cx="13" cy="7" r="6" class="flip head"/><text x="13" y="10.5" class="flip-letter head" text-anchor="middle">H</text></svg> heads</li>',
      '<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><circle cx="13" cy="7" r="6" class="flip tail"/><text x="13" y="10.5" class="flip-letter tail" text-anchor="middle">T</text></svg> tails</li>',
      `<li><svg width="26" height="14" viewBox="0 0 26 14" class="plot" aria-hidden="true"><rect x="1" y="1" width="24" height="12" rx="3" class="trial kept"/></svg> kept: ${r.heads} heads first</li>`,
      `<li>${swatch({ line: 'k-line k0', shape: 'circle', mark: 'k-mark k0' })} two-headed</li>`,
      `<li>${swatch({ line: 'k-line k1', shape: 'triangle', mark: 'k-mark k1' })} next flip heads</li>`,
    ].join('');
    const e = r.exact;
    const sim = r.simulation;
    $('coins-readout').innerHTML = `${r.heads} heads in a row happen with chance ${pct(e.evidence, 2)}. Given them, the coin is two-headed with chance ${pct(e.posterior, 2)} (it was ${pct(e.prior, 1)} before any flips), so the next flip is heads with chance ${pct(e.nextHead, 2)}.`
      + (sim ? ` Of ${count(sim.replicates)} seeded draws, ${count(sim.kept)} began with ${r.heads} heads, and ${sim.nextHead ? pct(sim.nextHead.rate, 2) : '—'} of those came up heads again.` : '');
    $('coins-stats').innerHTML = [
      stat('Two-headed, given the heads', `${pct(e.posterior, 2)}${sim?.twoHeaded ? ` <small class="sim-line">sim. ${pct(sim.twoHeaded.rate, 1)}</small>` : ''}`),
      stat('Next flip heads', `${pct(e.nextHead, 2)}${sim?.nextHead ? ` <small class="sim-line">sim. ${pct(sim.nextHead.rate, 1)}</small>` : ''}`),
    ].join('');
    $('coins-status').textContent = `Seed ${results.coins?.params.seed}; the draws shown are the first ${r.play.trials.length}.`;
  },
};

/** @param {number} n */
const ordinal = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

/** The playback lengths and labels of each panel. */
const PLAYBACK = {
  kruskal: { max: () => Math.max(1, ...(results.kruskal?.result.play.walks ?? [[0]]).map((/** @type {number[]} */ w) => w.length - 1)), label: 'Jump', speeds: /** @type {[number, string, boolean?][]} */ ([[0.5, 'slow'], [1, '1 a second', true], [3, '3 a second']]) },
  secretary: { max: () => results.secretary?.result.n ?? 1, label: 'Applicant', speeds: /** @type {[number, string, boolean?][]} */ ([[2, '2 a second'], [8, '8 a second', true], [30, '30 a second']]) },
  prisoners: { max: () => results.prisoners?.result.play.opened.length ?? 1, label: 'Boxes opened', speeds: /** @type {[number, string, boolean?][]} */ ([[1, '1 a second'], [3, '3 a second', true], [10, '10 a second']]) },
  coins: { max: () => results.coins?.result.play.trials.length ?? 1, label: 'Draws', speeds: /** @type {[number, string, boolean?][]} */ ([[1, '1 a second'], [3, '3 a second', true], [10, '10 a second']]) },
};
// The playback's discrete steps last 0.9 s at speed 1, so n a second is speed 0.9n.
const players = Object.fromEntries(VIEWS.map((v) => [v, playback(v, {
  max: PLAYBACK[v].max, seconds: 1, discrete: true, label: PLAYBACK[v].label,
  format: (t, m) => `${count(Math.floor(t))} of ${count(m)}`,
  onTime: (t) => PLAY[v](t), speeds: PLAYBACK[v].speeds.map(([s, l, d]) => [s * 0.9, l, d]),
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
function update(v) {
  let params;
  try {
    params = resolveParams({ view: v, ...state.panels[v] });
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    showIssues(v, error.issues);
    $(`${v}-figures`).dataset.stale = 'true';
    return;
  }
  showIssues(v, []);
  $(`${v}-figures`).dataset.stale = 'true';
  $(`${v}-status`).textContent = 'Simulating…';
  runners[v].run({ entry: ENTRY, params }).then((response) => show(v, response.params, response.result));
}

/** @param {View} v @param {any} params @param {any} result */
function show(v, params, result) {
  results[v] = { params, result };
  delete $(`${v}-figures`).dataset.stale;
  players[v].reset();
  RENDER[v]();
  PLAY[v](players[v].time);
}

// ---------- Controls ----------

for (const v of VIEWS) {
  const run = /** @type {HTMLElement} */ (document.querySelector(`[data-run="${v}"]`));
  const noun = { kruskal: ['Deals simulated', 'Deal again'], secretary: ['Rounds simulated', 'New applicants'], prisoners: ['Shuffles simulated', 'Shuffle again'], coins: ['Draws simulated', 'Draw again'] }[v];
  run.innerHTML = `<div class="control-head"><label for="${v}-replicates-number">${noun[0]}</label><input id="${v}-replicates-number" type="number" min="0" max="${MAX_REPLICATES[v]}" step="1000"></div>
    <div class="control-row"><label for="${v}-seed">Seed</label><input id="${v}-seed" type="number" min="0" max="4294967295" step="1"><button type="button" id="${v}-new-seed">${noun[1]}</button></div>`;
  integerField(input(`${v}-replicates-number`), (value) => { state.panels[v].replicates = value; update(v); });
  integerField(input(`${v}-seed`), (value) => { state.panels[v].seed = value; update(v); });
  $(`${v}-new-seed`).addEventListener('click', () => {
    state.panels[v].seed = (state.panels[v].seed + 1) % 4294967296;
    input(`${v}-seed`).value = String(state.panels[v].seed);
    update(v);
  });
  $(`${v}-reset`).addEventListener('click', () => { state.panels[v] = fresh(v); showControls(v); update(v); });
}

/** A slider-and-number pair for a panel field. @param {View} v @param {string} field @param {object} [extra] */
const pair = (v, field, extra = {}) => bindPair({
  range: input(`${v}-${field}-range`), number: input(`${v}-${field}-number`), decimals: 0, integer: true,
  onInput: (value) => { state.panels[v][field] = value; afterChange(v, field); update(v); }, ...extra,
});
const pairs = {
  window: pair('kruskal', 'window'),
  n: pair('secretary', 'n', { toRange: Math.log10, fromRange: (/** @type {number} */ q) => Math.round(10 ** q) }),
  cutoff: pair('secretary', 'cutoff'),
  boxes: pair('prisoners', 'boxes'),
  prisoners: pair('prisoners', 'prisoners'),
  attempts: pair('prisoners', 'attempts'),
  fair: pair('coins', 'fair'),
  twoHeaded: pair('coins', 'twoHeaded'),
  heads: pair('coins', 'heads'),
};
integerField(input('prisoners-prisoner-number'), (value) => { state.panels.prisoners.prisoner = value; update('prisoners'); });

/**
 * Keeps dependent fields in range: a new n resets the cutoff to ⌊n/e⌋, and fewer boxes
 * shrink the prisoners, attempts and the prisoner followed with them.
 * @param {View} v @param {string} field
 */
function afterChange(v, field) {
  const s = state.panels[v];
  if (v === 'secretary' && field === 'n') { s.cutoff = Math.floor(s.n / Math.E); showControls(v); }
  if (v === 'prisoners' && field === 'boxes') {
    s.prisoners = Math.min(s.prisoners, s.boxes);
    s.attempts = Math.min(s.attempts, s.boxes);
    showControls(v);
  }
  if (v === 'prisoners') s.prisoner = Math.min(s.prisoner, s.prisoners);
}

for (const [v, field] of /** @type {const} */ ([['kruskal', 'deck'], ['secretary', 'strategy'], ['prisoners', 'strategy']])) {
  for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(`input[name="${v}-${field}"]`))) {
    radio.addEventListener('change', () => { state.panels[v][field] = radio.value; showControls(v); update(v); });
  }
}
for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('[data-preset]'))) {
  button.addEventListener('click', () => {
    const s = state.panels.prisoners;
    Object.assign(s, button.dataset.preset === 'script' ? { boxes: 100, prisoners: 5, attempts: 80 } : { boxes: 100, prisoners: 100, attempts: 50 });
    s.prisoner = Math.min(s.prisoner, s.prisoners);
    showControls('prisoners');
    update('prisoners');
  });
}

/** @param {View} v */
function showControls(v) {
  const s = state.panels[v];
  for (const field of ['deck', 'strategy']) {
    for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(`input[name="${v}-${field}"]`))) radio.checked = radio.value === s[field];
  }
  input(`${v}-replicates-number`).value = String(s.replicates);
  input(`${v}-seed`).value = String(s.seed);
  if (v === 'kruskal') pairs.window.set(s.window);
  if (v === 'secretary') {
    s.cutoff ??= Math.floor(s.n / Math.E);
    pairs.n.set(s.n);
    input('secretary-cutoff-number').max = String(s.n - 1);
    input('secretary-cutoff-range').max = String(s.n - 1);
    pairs.cutoff.set(s.cutoff);
    $('secretary-cutoff-control').hidden = s.strategy !== 'cutoff';
  }
  if (v === 'prisoners') {
    for (const f of ['prisoners', 'attempts']) {
      input(`prisoners-${f}-number`).max = String(s.boxes);
      input(`prisoners-${f}-range`).max = String(s.boxes);
    }
    pairs.boxes.set(s.boxes);
    pairs.prisoners.set(s.prisoners);
    pairs.attempts.set(s.attempts);
    input('prisoners-prisoner-number').max = String(s.prisoners);
    input('prisoners-prisoner-number').value = String(s.prisoner);
  }
  if (v === 'coins') { pairs.fair.set(s.fair); pairs.twoHeaded.set(s.twoHeaded); pairs.heads.set(s.heads); }
}

onWidth($('kruskal-deal'), () => { RENDER.kruskal(); PLAY.kruskal(players.kruskal.time); });
onWidth($('secretary-applicants'), () => { RENDER.secretary(); PLAY.secretary(players.secretary.time); });
onWidth($('prisoners-boxes'), () => { RENDER.prisoners(); PLAY.prisoners(players.prisoners.time); });
onWidth($('coins-trials'), () => { RENDER.coins(); PLAY.coins(players.coins.time); });

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
    state.panels[v] = rest;
    showControls(v);
    showIssues(v, []);
    show(v, p, result);
    $(v).scrollIntoView({ block: 'start' });
  },
  getParams: () => resolveParams({ view: state.view, ...state.panels[state.view] }),
});
