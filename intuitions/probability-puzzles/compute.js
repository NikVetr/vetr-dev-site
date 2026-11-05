// Four probability puzzles, each with a seeded play-through, the exact answer where one
// exists, and a seeded simulation against it:
//   kruskal    the Kruskal count of card_trick.R: kids stand on the first few cards of a
//              shuffled deck and each walks on by the value of the card under them; they
//              almost always end on the same card. No closed form; simulated.
//   secretary  choice_problem_strategies.R: n applicants in random order, each accepted or
//              rejected on the spot. Ranks only: skip the first r and take the next best so
//              far, which wins with (r/n) Σ_{j=r}^{n−1} 1/j, about 1/e. Knowing the
//              distribution of qualities: a threshold on each value, by the script's 50% rule
//              or Gilbert and Mosteller's optimal one, exact by integration.
//   prisoners  prisonerTicketBoxes.R: each prisoner opens up to t of n boxes to find their
//              number. Following the loops of the permutation, they all succeed exactly when
//              no loop through one of them is longer than t; at random, with (t/n)^m.
//   coins      coinflipping.R: a coin drawn from fair and two-headed ones shows k heads; the
//              chance that it is two-headed, and that the next flip is heads, by Bayes' rule.
// The R scripts are card_trick.R and choice_problem_strategies.R in
// ~/repos/minor_scripts/postdoc/ and prisonerTicketBoxes.R and coinflipping.R in
// ~/repos/minor_scripts/grad_school/; api.md says what was corrected.

import { checkChoice, checkInteger, invalidRequest, isObject, rejectUnknown } from '../lib/params.js';
import { mulberry32 } from '../../shared/rng.js';

/** @typedef {import('../lib/params.js').Issue} Issue */
/** @typedef {'kruskal' | 'secretary' | 'prisoners' | 'coins'} View */
/** @typedef {'exhibit' | 'kruskal'} Deck */
/** @typedef {'cutoff' | 'half' | 'optimal'} Strategy */
/**
 * @typedef {{ view: 'kruskal', deck: Deck, window: number, seed: number, replicates: number }} KruskalParams
 * @typedef {{ view: 'secretary', n: number, strategy: Strategy, cutoff: number, seed: number, replicates: number }} SecretaryParams
 * @typedef {{ view: 'prisoners', boxes: number, prisoners: number, attempts: number, strategy: 'loops' | 'random', prisoner: number, seed: number, replicates: number }} PrisonersParams
 * @typedef {{ view: 'coins', fair: number, twoHeaded: number, heads: number, seed: number, replicates: number }} CoinsParams
 * @typedef {KruskalParams | SecretaryParams | PrisonersParams | CoinsParams} Params
 */
/** @typedef {{ rate: number, se: number }} Rate */

export const ENTRY = 'probability-puzzles';
export const VIEWS = /** @type {const} */ (['kruskal', 'secretary', 'prisoners', 'coins']);
export const DECKS = /** @type {const} */ (['exhibit', 'kruskal']);
export const STRATEGIES = /** @type {const} */ (['cutoff', 'half', 'optimal']);
/** The most random draws one request may ask for. */
export const MAX_WORK = 4e7;
/** Gilbert and Mosteller's limit for the full-information problem. */
export const FULL_INFORMATION_LIMIT = 0.580164;

/** @type {Record<View, Record<string, any>>} */
export const DEFAULTS = Object.freeze({
  kruskal: Object.freeze({ deck: /** @type {Deck} */ ('exhibit'), window: 5, seed: 1, replicates: 10000 }),
  secretary: Object.freeze({ n: 100, strategy: /** @type {Strategy} */ ('cutoff'), seed: 1, replicates: 10000 }),
  prisoners: Object.freeze({ boxes: 100, prisoners: 100, attempts: 50, strategy: /** @type {'loops' | 'random'} */ ('loops'), prisoner: 1, seed: 1, replicates: 10000 }),
  coins: Object.freeze({ fair: 9, twoHeaded: 1, heads: 5, seed: 1, replicates: 100000 }),
});

// ---------- Parameters ----------

/**
 * @param {unknown} [params]
 * @returns {Params}
 */
export function resolveParams(params = {}) {
  if (!isObject(params)) throw invalidRequest([{ code: 'wrong_type', path: 'params', message: 'must be an object' }]);
  const view = params.view ?? 'kruskal';
  if (typeof view !== 'string' || !VIEWS.includes(/** @type {View} */ (view))) {
    throw invalidRequest([{ code: typeof view === 'string' ? 'out_of_range' : 'wrong_type', path: 'params.view', message: `must be one of ${VIEWS.map((v) => `"${v}"`).join(', ')}` }]);
  }
  /** @type {Issue[]} */
  const issues = [];
  const d = DEFAULTS[/** @type {View} */ (view)];
  const extra = view === 'secretary' ? ['cutoff'] : [];
  rejectUnknown(params, ['view', ...Object.keys(d), ...extra], 'params', issues);
  const int = (/** @type {string} */ key, /** @type {number} */ min, /** @type {number} */ max) => (Object.hasOwn(params, key) ? checkInteger(params[key], `params.${key}`, min, max, d[key], issues) : d[key]);
  const seed = int('seed', 0, 4294967295);
  /** @type {Params} */
  let out;
  if (view === 'kruskal') {
    const deck = Object.hasOwn(params, 'deck') ? checkChoice(params.deck, 'params.deck', DECKS, d.deck, issues) : d.deck;
    out = { view: 'kruskal', deck, window: int('window', 1, 10), seed, replicates: int('replicates', 0, 200000) };
  } else if (view === 'secretary') {
    const n = int('n', 2, 1000);
    const strategy = Object.hasOwn(params, 'strategy') ? checkChoice(params.strategy, 'params.strategy', STRATEGIES, d.strategy, issues) : d.strategy;
    const cutoff = Object.hasOwn(params, 'cutoff') ? checkInteger(params.cutoff, 'params.cutoff', 0, Math.max(0, n - 1), Math.floor(n / Math.E), issues) : Math.floor(n / Math.E);
    out = { view: 'secretary', n, strategy, cutoff, seed, replicates: int('replicates', 0, 100000) };
    if (n * out.replicates > MAX_WORK) issues.push({ code: 'too_much_work', path: 'params.replicates', message: `asks for ${(n * out.replicates).toLocaleString('en-US')} draws; n × replicates can be at most ${MAX_WORK.toLocaleString('en-US')}` });
  } else if (view === 'prisoners') {
    const boxes = int('boxes', 2, 200);
    const prisoners = Object.hasOwn(params, 'prisoners') ? checkInteger(params.prisoners, 'params.prisoners', 1, boxes, Math.min(d.prisoners, boxes), issues) : Math.min(d.prisoners, boxes);
    const attempts = Object.hasOwn(params, 'attempts') ? checkInteger(params.attempts, 'params.attempts', 1, boxes, Math.min(d.attempts, boxes), issues) : Math.min(d.attempts, Math.max(1, Math.floor(boxes / 2)));
    const strategy = Object.hasOwn(params, 'strategy') ? checkChoice(params.strategy, 'params.strategy', /** @type {const} */ (['loops', 'random']), d.strategy, issues) : d.strategy;
    const prisoner = Object.hasOwn(params, 'prisoner') ? checkInteger(params.prisoner, 'params.prisoner', 1, prisoners, 1, issues) : 1;
    out = { view: 'prisoners', boxes, prisoners, attempts, strategy, prisoner, seed, replicates: int('replicates', 0, 100000) };
  } else {
    const fair = int('fair', 0, 100);
    const twoHeaded = int('twoHeaded', 0, 100);
    if (fair + twoHeaded === 0) issues.push({ code: 'out_of_range', path: 'params.fair', message: 'there must be at least one coin; give fair or twoHeaded above 0' });
    out = { view: 'coins', fair, twoHeaded, heads: int('heads', 0, 20), seed, replicates: int('replicates', 0, 1000000) };
  }
  if (issues.length) throw invalidRequest(issues);
  return out;
}

/** A seeded share and its standard error. @param {number} hits @param {number} n @returns {Rate | null} */
const rate = (hits, n) => (n > 0 ? { rate: hits / n, se: Math.sqrt((hits / n) * (1 - hits / n) / n) } : null);

/** Shuffles in place by Fisher–Yates. @template {unknown[] | Int32Array} A @param {A} a @param {() => number} rng @returns {A} */
function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// ---------- The Kruskal count ----------

export const RANKS = /** @type {const} */ (['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
export const SUITS = /** @type {const} */ (['spades', 'hearts', 'diamonds', 'clubs']);

/**
 * What each rank counts: the exhibit's (A to 9 at face value, 10 and court cards 1) or
 * Kruskal's (A 1, 2 to 10 at face value, court cards 5).
 * @param {Deck} deck @param {number} rank index into RANKS
 */
export function cardValue(deck, rank) {
  if (rank <= 8) return rank + 1;
  if (deck === 'exhibit') return 1;
  return rank === 9 ? 10 : 5;
}

/** A full deck, unshuffled: rank and suit indices. */
const DECK = Array.from({ length: 52 }, (_, i) => ({ rank: i % 13, suit: Math.floor(i / 13) }));

/**
 * Each starting card's last card: from card i (0-based) a walker moves on by the value of the
 * card it stands on while that stays in the deck.
 * @param {Int32Array} values
 */
function lastCards(values) {
  const n = values.length;
  const end = new Int32Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const next = i + values[i];
    end[i] = next >= n ? i : end[next];
  }
  return end;
}

/** The cards a walker from card i stands on. @param {Int32Array} values @param {number} i */
function walk(values, i) {
  const path = [i];
  while (path[path.length - 1] + values[path[path.length - 1]] < values.length) path.push(path[path.length - 1] + values[path[path.length - 1]]);
  return path;
}

/** The first card two walkers both stand on, or −1. @param {Int32Array} values @param {number} a @param {number} b */
function meetingCard(values, a, b) {
  const n = values.length;
  while (a !== b) {
    if (a > b) [a, b] = [b, a];
    if (a + values[a] >= n) return -1;
    a += values[a];
  }
  return a;
}

/** @param {KruskalParams} p */
function kruskalResult(p) {
  const rng = mulberry32(p.seed);
  const cards = shuffle(DECK.map((c) => ({ ...c })), rng);
  const values = Int32Array.from(cards, (c) => cardValue(p.deck, c.rank));
  const walks = Array.from({ length: p.window }, (_, i) => walk(values, i));
  const ends = walks.map((w) => w[w.length - 1]);
  // The first card on every walker's path (they share the rest from there).
  let merged = walks[0];
  for (const w of walks.slice(1)) merged = merged.filter((c) => w.includes(c));
  const together = new Set(ends).size === 1;
  const play = {
    cards: cards.map((c) => ({ rank: RANKS[c.rank], suit: SUITS[c.suit], value: cardValue(p.deck, c.rank) })),
    walks,
    ends,
    together,
    merged: together ? merged[0] : null,
  };
  let simulation = null;
  if (p.replicates > 0) {
    const m = p.window;
    let all = 0;
    let pairs = 0;
    let pairTogether = 0;
    const byWindow = new Float64Array(52);
    const distinct = new Float64Array(m);
    const meeting = new Float64Array(52);
    const v = new Int32Array(52);
    const order = Int32Array.from({ length: 52 }, (_, i) => i);
    for (let r = 0; r < p.replicates; r++) {
      shuffle(order, rng);
      for (let i = 0; i < 52; i++) v[i] = cardValue(p.deck, order[i] % 13);
      const end = lastCards(v);
      let first = 1;
      while (first < 52 && end[first] === end[0]) first++;
      for (let i = 0; i < first; i++) byWindow[i]++;
      if (first >= m) all++;
      distinct[new Set(end.subarray(0, m)).size - 1]++;
      if (m >= 2) {
        // One pair of distinct starts among the first m, as the script samples it.
        const a = Math.floor(rng() * m);
        let b = Math.floor(rng() * (m - 1));
        if (b >= a) b++;
        pairs++;
        const meet = meetingCard(v, a, b);
        if (meet >= 0) { pairTogether++; meeting[meet]++; }
      }
    }
    const n = p.replicates;
    let cumulative = 0;
    simulation = {
      replicates: n,
      allTogether: rate(all, n),
      pairTogether: rate(pairTogether, pairs),
      byWindow: Array.from(byWindow, (c) => c / n),
      distinctEnds: Array.from(distinct, (c) => c / n),
      pairMeeting: pairs ? { cdf: Array.from(meeting, (c) => (cumulative += c) / pairs), never: 1 - pairTogether / pairs } : null,
    };
  }
  return { view: p.view, deck: p.deck, window: p.window, exact: null, play, simulation };
}

// ---------- The secretary problem ----------

/**
 * The chance that skipping the first r of n applicants and taking the next one who beats
 * them all picks the best: (r/n) Σ_{j=r}^{n−1} 1/j, or 1/n for r = 0.
 * @param {number} n @param {number} r
 */
export function cutoffWin(n, r) {
  if (r === 0) return 1 / n;
  let s = 0;
  for (let j = r; j < n; j++) s += 1 / j;
  return (r / n) * s;
}

/**
 * Gilbert and Mosteller's decision numbers: with k applicants still to come, accept a best
 * so far whose quality (as a uniform quantile) is at least b_k, where Σ_{j=1}^{k} (b^{−j} − 1)/j = 1.
 * @param {number} k
 */
export function optimalThreshold(k) {
  const f = (/** @type {number} */ b) => {
    let s = -1;
    let v = 1;
    let d = 0;
    for (let j = 1; j <= k; j++) {
      v /= b;
      s += (v - 1) / j;
      d -= v / b;
    }
    return [s, d];
  };
  let lo = 0.3;
  let hi = 1;
  let b = 1 / (1 + 0.8043 / k);
  for (let i = 0; i < 100; i++) {
    const [s, d] = f(b);
    if (s > 0) lo = b; // f decreases in b
    else hi = b;
    let next = b - s / d;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - b) < 1e-15) return next;
    b = next;
  }
  return b;
}

/**
 * Thresholds on each applicant's quality quantile for the full-information rules: the
 * script's (accept a best so far when the chance that no one later beats them, x^(n−i), is at
 * least ½) or Gilbert and Mosteller's. The last applicant has threshold 0.
 * @param {number} n @param {'half' | 'optimal'} rule
 */
export function thresholds(n, rule) {
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    if (k === 0) return 0;
    return rule === 'half' ? 2 ** (-1 / k) : optimalThreshold(k);
  });
}

/**
 * The chance that a threshold rule picks the best of n: stop at the first applicant i who is
 * the best so far with quality x_i ≥ t_i (qualities uniform, as quantiles of their known
 * distribution). With G_i(x) = P(no stop by i, the best of the first i below x),
 * G_i(x) = x G_{i−1}(x) − [x > t_i] ∫_{t_i}^x G_{i−1}, and the rule wins with
 * Σ_i ∫_{t_i}^1 G_{i−1}(x) x^{n−i} dx. The integrals are trapezoids on a grid even in
 * log(−log x), which follows the features near 1 at every n.
 * @param {number[]} t thresholds, one per applicant @param {number} [points]
 */
export function thresholdWin(t, points = 10000) {
  const n = t.length;
  const zLo = Math.log(1e-7 / n);
  const zHi = Math.log(50);
  const xs = new Float64Array(points + 2);
  xs[0] = 0;
  for (let g = 1; g <= points; g++) xs[g] = Math.exp(-Math.exp(zHi + ((zLo - zHi) * (g - 1)) / (points - 1)));
  xs[points + 1] = 1;
  const K = xs.length;
  let G = new Float64Array(K).fill(1);
  const C = new Float64Array(K);
  let win = 0;
  for (let i = 0; i < n; i++) {
    const ti = t[i];
    const k = n - 1 - i;
    let g0 = 0;
    while (g0 + 1 < K && xs[g0 + 1] <= ti) g0++;
    const s = g0 + 1 < K ? (ti - xs[g0]) / (xs[g0 + 1] - xs[g0]) : 0;
    const Gt = g0 + 1 < K ? G[g0] + s * (G[g0 + 1] - G[g0]) : G[g0];
    // ∫_{t}^1 G(x) x^k dx
    let prevX = ti;
    let prevF = Gt * ti ** k;
    for (let g = g0 + 1; g < K; g++) {
      const f = G[g] * xs[g] ** k;
      win += ((xs[g] - prevX) * (f + prevF)) / 2;
      prevX = xs[g];
      prevF = f;
    }
    if (i === n - 1) break;
    C[0] = 0;
    for (let g = 1; g < K; g++) C[g] = C[g - 1] + ((xs[g] - xs[g - 1]) * (G[g] + G[g - 1])) / 2;
    const Ct = C[g0] + ((ti - xs[g0]) * (G[g0] + Gt)) / 2;
    const next = new Float64Array(K);
    for (let g = 0; g < K; g++) next[g] = xs[g] * G[g] - (xs[g] > ti ? C[g] - Ct : 0);
    G = next;
  }
  return win;
}

/**
 * Which applicant a strategy picks from a sequence of qualities (0-based), or −1.
 * @param {Float64Array | number[]} x @param {number} cutoff @param {number[] | null} t thresholds, or null for the cutoff rule
 */
function pick(x, cutoff, t) {
  let best = -Infinity;
  for (let i = 0; i < x.length; i++) {
    const record = x[i] > best;
    if (record && (t ? x[i] >= t[i] : i >= cutoff)) return i;
    if (record) best = x[i];
  }
  return -1;
}

/** @param {SecretaryParams} p */
function secretaryResult(p) {
  const { n } = p;
  const curve = Array.from({ length: n }, (_, r) => cutoffWin(n, r));
  let bestR = 0;
  for (let r = 1; r < n; r++) if (curve[r] > curve[bestR]) bestR = r;
  const rules = { half: thresholds(n, 'half'), optimal: thresholds(n, 'optimal') };
  const exact = {
    cutoff: curve[p.cutoff],
    curve,
    best: { cutoff: bestR, probability: curve[bestR] },
    limit: 1 / Math.E,
    half: thresholdWin(rules.half),
    optimal: thresholdWin(rules.optimal),
    fullInformationLimit: FULL_INFORMATION_LIMIT,
  };
  const rng = mulberry32(p.seed);
  const values = Array.from({ length: n }, () => rng());
  let best = 0;
  for (let i = 1; i < n; i++) if (values[i] > values[best]) best = i;
  const t = p.strategy === 'cutoff' ? null : rules[p.strategy];
  const chosen = pick(values, p.cutoff, t);
  const records = [];
  let top = -Infinity;
  for (let i = 0; i < n; i++) if (values[i] > top) { top = values[i]; records.push(i); }
  const play = { values, records, best, pick: chosen, won: chosen === best, thresholds: t };
  let simulation = null;
  if (p.replicates > 0) {
    const wins = { cutoff: 0, half: 0, optimal: 0 };
    const x = new Float64Array(n);
    for (let r = 0; r < p.replicates; r++) {
      let b = 0;
      for (let i = 0; i < n; i++) {
        x[i] = rng();
        if (x[i] > x[b]) b = i;
      }
      if (pick(x, p.cutoff, null) === b) wins.cutoff++;
      if (pick(x, 0, rules.half) === b) wins.half++;
      if (pick(x, 0, rules.optimal) === b) wins.optimal++;
    }
    simulation = {
      replicates: p.replicates,
      cutoff: rate(wins.cutoff, p.replicates),
      half: rate(wins.half, p.replicates),
      optimal: rate(wins.optimal, p.replicates),
    };
  }
  return { view: p.view, n, strategy: p.strategy, cutoff: p.cutoff, exact, thresholds: rules, play, simulation };
}

// ---------- The prisoners ----------

/**
 * The chance that every one of m given prisoners finds their number by following the
 * loops: that no loop of a uniform permutation of n through one of them is longer than t.
 * The loop of one marked element has length k with chance 1/N, its other k − 1 elements
 * are a uniform subset of the rest (j of them marked, hypergeometric), and what is left is
 * a uniform permutation of N − k elements with M − 1 − j marked:
 * q(N, M) = (1/N) Σ_{k ≤ t} Σ_j H(j) q(N − k, M − 1 − j), q(N, 0) = 1.
 * @param {number} n @param {number} m @param {number} t
 */
export function loopsSucceed(n, m, t) {
  const unmarked = n - m;
  // q[u][M]: u unmarked and M marked elements left.
  const q = Array.from({ length: unmarked + 1 }, () => new Float64Array(m + 1));
  for (let u = 0; u <= unmarked; u++) q[u][0] = 1;
  for (let M = 1; M <= m; M++) {
    for (let u = 0; u <= unmarked; u++) {
      const N = u + M;
      let total = 0;
      for (let k = 1; k <= Math.min(t, N); k++) {
        // j marked and k − 1 − j unmarked of the other k − 1, from M − 1 marked and u unmarked.
        const lo = Math.max(0, k - 1 - u);
        const hi = Math.min(k - 1, M - 1);
        if (lo > hi) continue;
        // H(lo) = C(M−1, lo) C(u, k−1−lo) / C(N−1, k−1), then the ratio H(j+1)/H(j).
        let h = Math.exp(logChoose(M - 1, lo) + logChoose(u, k - 1 - lo) - logChoose(N - 1, k - 1));
        let s = 0;
        for (let j = lo; j <= hi; j++) {
          s += h * q[u - (k - 1 - j)][M - 1 - j];
          h *= ((M - 1 - j) * (k - 1 - j)) / ((j + 1) * (u - k + 2 + j));
        }
        total += s;
      }
      q[u][M] = total / N;
    }
  }
  return q[unmarked][m];
}

const LOG_FACTORIAL = (() => {
  const f = new Float64Array(402);
  for (let i = 1; i < f.length; i++) f[i] = f[i - 1] + Math.log(i);
  return f;
})();
/** log C(a, b). @param {number} a @param {number} b */
const logChoose = (a, b) => LOG_FACTORIAL[a] - LOG_FACTORIAL[b] - LOG_FACTORIAL[a - b];

/** The loops of a permutation (box → ticket), each from its smallest box. @param {Int32Array} tickets 0-based */
function loopsOf(tickets) {
  const seen = new Uint8Array(tickets.length);
  const loops = [];
  for (let s = 0; s < tickets.length; s++) {
    if (seen[s]) continue;
    const loop = [];
    for (let b = s; !seen[b]; b = tickets[b]) { seen[b] = 1; loop.push(b); }
    loops.push(loop);
  }
  return loops;
}

/** @param {PrisonersParams} p */
function prisonersResult(p) {
  const { boxes: n, prisoners: m, attempts: t } = p;
  const exact = { loops: loopsSucceed(n, m, t), random: (t / n) ** m };
  const rng = mulberry32(p.seed);
  const tickets = shuffle(Int32Array.from({ length: n }, (_, i) => i), rng);
  const loops = loopsOf(tickets);
  const loopOf = new Int32Array(n);
  loops.forEach((loop, k) => { for (const b of loop) loopOf[b] = k; });
  const who = p.prisoner - 1;
  /** @type {number[]} */
  let opened = [];
  if (p.strategy === 'loops') {
    for (let b = who; opened.length < t; b = tickets[b]) {
      opened.push(b);
      if (tickets[b] === who) break;
    }
  } else {
    const order = shuffle(Int32Array.from({ length: n }, (_, i) => i), rng);
    for (const b of order.subarray(0, t)) {
      opened.push(b);
      if (tickets[b] === who) break;
    }
  }
  // Under the loops, prisoner i fails exactly when their loop is longer than t.
  let failing = 0;
  for (let i = 0; i < m; i++) if (loops[loopOf[i]].length > t) failing++;
  const play = {
    tickets: Array.from(tickets, (v) => v + 1),
    loops: loops.map((l) => l.map((b) => b + 1)),
    loopOf: Array.from(loopOf),
    opened: opened.map((b) => b + 1),
    found: tickets[opened[opened.length - 1]] === who,
    failing: p.strategy === 'loops' ? failing : null,
    longest: Math.max(...loops.map((l) => l.length)),
  };
  let simulation = null;
  if (p.replicates > 0) {
    const perm = Int32Array.from({ length: n }, (_, i) => i);
    const scratch = Int32Array.from({ length: n }, (_, i) => i);
    let loopWins = 0;
    let randomWins = 0;
    for (let r = 0; r < p.replicates; r++) {
      shuffle(perm, rng);
      let all = true;
      for (let i = 0; i < m && all; i++) {
        let found = false;
        for (let a = 0, b = i; a < t; a++) {
          if (perm[b] === i) { found = true; break; }
          b = perm[b];
        }
        all = found;
      }
      if (all) loopWins++;
      // At random: each prisoner opens t boxes of their own choosing.
      all = true;
      for (let i = 0; i < m && all; i++) {
        let found = false;
        for (let a = 0; a < t; a++) {
          const j = a + Math.floor(rng() * (n - a));
          const tmp = scratch[a];
          scratch[a] = scratch[j];
          scratch[j] = tmp;
          if (perm[scratch[a]] === i) { found = true; break; }
        }
        all = found;
      }
      if (all) randomWins++;
    }
    simulation = { replicates: p.replicates, loops: rate(loopWins, p.replicates), random: rate(randomWins, p.replicates) };
  }
  return { view: p.view, boxes: n, prisoners: m, attempts: t, strategy: p.strategy, prisoner: p.prisoner, exact, play, simulation };
}

// ---------- The coins ----------

/**
 * Bayes' rule for k heads in a row from a coin drawn from F fair and D two-headed coins.
 * @param {number} fair @param {number} twoHeaded @param {number} k
 */
export function coinPosterior(fair, twoHeaded, k) {
  const total = fair + twoHeaded;
  const likely = twoHeaded + fair * 2 ** -k; // ∝ P(k heads)
  const posterior = twoHeaded / likely;
  return { prior: twoHeaded / total, evidence: likely / total, posterior, nextHead: posterior + (1 - posterior) / 2 };
}

/** @param {CoinsParams} p */
function coinsResult(p) {
  const exact = { ...coinPosterior(p.fair, p.twoHeaded, p.heads), curve: Array.from({ length: 21 }, (_, k) => ({ heads: k, ...coinPosterior(p.fair, p.twoHeaded, k) })) };
  const rng = mulberry32(p.seed);
  const share = p.twoHeaded / (p.fair + p.twoHeaded);
  // One trial: draw a coin, flip it until a tail or k heads, and once more if all were heads.
  const trial = () => {
    const twoHeaded = rng() < share;
    const flips = [];
    for (let f = 0; f <= p.heads; f++) {
      const head = twoHeaded || rng() < 0.5;
      flips.push(head);
      if (!head && f < p.heads) break;
    }
    return { twoHeaded, flips, kept: flips.length === p.heads + 1 };
  };
  const trials = Array.from({ length: 24 }, trial);
  let simulation = null;
  if (p.replicates > 0) {
    let kept = 0;
    let heads = 0;
    let twoHeaded = 0;
    for (let r = 0; r < p.replicates; r++) {
      const t = trial();
      if (!t.kept) continue;
      kept++;
      if (t.flips[p.heads]) heads++;
      if (t.twoHeaded) twoHeaded++;
    }
    simulation = { replicates: p.replicates, kept, nextHead: rate(heads, kept), twoHeaded: rate(twoHeaded, kept) };
  }
  return { view: p.view, fair: p.fair, twoHeaded: p.twoHeaded, heads: p.heads, exact, play: { trials }, simulation };
}

/** @param {unknown} params */
export function compute(params) {
  const p = resolveParams(params);
  if (p.view === 'kruskal') return kruskalResult(p);
  if (p.view === 'secretary') return secretaryResult(p);
  if (p.view === 'prisoners') return prisonersResult(p);
  return coinsResult(p);
}
