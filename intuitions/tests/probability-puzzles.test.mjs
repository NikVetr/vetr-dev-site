// The probability puzzles: exact answers against exhaustive enumeration and known values,
// the seeded simulations against them, and the R scripts' simulations
// (tests/fixtures/r-puzzles.json, see its "source") within Monte Carlo error.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { IntuitionsError } from '../lib/params.js';
import { coinPosterior, compute as computePuzzles, cutoffWin, loopsSucceed, optimalThreshold, resolveParams, thresholds, thresholdWin } from '../probability-puzzles/compute.js';

/** @param {unknown} params @returns {any} */
const compute = (params) => computePuzzles(params);
const ref = JSON.parse(readFileSync(new URL('fixtures/r-puzzles.json', import.meta.url), 'utf8'));
/** Two estimates agree within z combined standard errors. @param {number} a @param {number} sa @param {number} b @param {number} sb */
const agree = (a, sa, b, sb, z = 4) => Math.abs(a - b) <= z * Math.hypot(sa, sb);

/** Every permutation of 0..n−1. @param {number} n @returns {number[][]} */
function permutations(n) {
  if (n === 1) return [[0]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}

test('prisoners: the loop probability matches every permutation of up to 7 boxes', () => {
  for (const n of [3, 5, 7]) {
    const all = permutations(n);
    for (let m = 1; m <= n; m++) {
      for (let t = 1; t <= n; t++) {
        let ok = 0;
        for (const perm of all) {
          let every = true;
          for (let i = 0; i < m && every; i++) {
            let b = i;
            let found = false;
            for (let a = 0; a < t; a++) { if (perm[b] === i) { found = true; break; } b = perm[b]; }
            every = found;
          }
          if (every) ok++;
        }
        assert.ok(Math.abs(loopsSucceed(n, m, t) - ok / all.length) < 1e-12, `n = ${n}, m = ${m}, t = ${t}`);
      }
    }
  }
});

test('prisoners: with t ≥ n/2 at most one loop is too long, so 1 − Σ_{k>t} (1/k)(1 − C(n−m, k)/C(n, k))', () => {
  const ratio = (/** @type {number} */ n, /** @type {number} */ m, /** @type {number} */ k) => {
    let r = 1;
    for (let i = 0; i < k; i++) r *= (n - m - i) / (n - i);
    return Math.max(0, r);
  };
  for (const [n, m, t] of [[100, 100, 50], [100, 5, 80], [100, 30, 60], [200, 17, 120]]) {
    let fail = 0;
    for (let k = t + 1; k <= n; k++) fail += (1 - ratio(n, m, k)) / k;
    assert.ok(Math.abs(loopsSucceed(n, m, t) - (1 - fail)) < 1e-12, `${n} ${m} ${t}`);
  }
  assert.ok(Math.abs(loopsSucceed(100, 100, 50) - 0.3118278206898) < 1e-12);
});

test('prisoners: the seeded simulation and prisonerTicketBoxes.R agree with the exact chance', () => {
  for (const key of ['script', 'classic', 'short']) {
    const s = ref.prisoners[key];
    const r = compute({ view: 'prisoners', boxes: s.boxes, prisoners: s.prisoners, attempts: s.attempts, replicates: 40000, seed: 3 });
    assert.ok(agree(s.rate, s.se, r.exact.loops, 0), `R ${key}: ${s.rate} vs ${r.exact.loops}`);
    assert.ok(agree(r.simulation.loops.rate, r.simulation.loops.se, r.exact.loops, 0), `JS ${key}`);
  }
  const random = compute({ view: 'prisoners', boxes: 10, prisoners: 3, attempts: 5, replicates: 40000, seed: 4 });
  assert.equal(random.exact.random, 0.125);
  assert.ok(agree(random.simulation.random.rate, random.simulation.random.se, 0.125, 0));
});

test('prisoners: the play-through follows the loop and counts the prisoners it fails', () => {
  const r = compute({ view: 'prisoners', seed: 1 });
  const { tickets, opened, loops, loopOf } = r.play;
  for (let i = 1; i < opened.length; i++) assert.equal(opened[i], tickets[opened[i - 1] - 1]);
  assert.equal(opened[0], 1);
  assert.equal(loops.flat().length, 100);
  const failing = Array.from({ length: 100 }, (_, i) => loops[loopOf[i]].length > 50).filter(Boolean).length;
  assert.equal(r.play.failing, failing);
  assert.equal(r.play.found, loops[loopOf[0]].length <= 50);
});

test('secretary: the cutoff rule is exact, best at 37 of 100, and tends to 1/e', () => {
  // Every order of 6: the chance that skipping r and taking the next record picks the best.
  const all = permutations(6);
  for (let r = 0; r < 6; r++) {
    let wins = 0;
    for (const perm of all) {
      let best = -1;
      for (let i = 0; i < r; i++) best = Math.max(best, perm[i]);
      let chosen = -1;
      for (let i = r; i < 6; i++) if (perm[i] > best) { chosen = perm[i]; break; }
      if (chosen === 5) wins++;
    }
    assert.ok(Math.abs(cutoffWin(6, r) - wins / all.length) < 1e-12, `r = ${r}`);
  }
  const r = compute({ view: 'secretary', replicates: 0 });
  assert.equal(r.cutoff, 36);
  assert.deepEqual(r.exact.best, { cutoff: 37, probability: cutoffWin(100, 37) });
  assert.ok(Math.abs(r.exact.best.probability - 0.37104277871) < 1e-10);
  assert.ok(Math.abs(cutoffWin(100000, Math.round(100000 / Math.E)) - 1 / Math.E) < 1e-5);
  // choice_problem_strategies.R's sim_apps_canon (cutoff floor(n/e) = 36), 1e5 runs.
  const canon = ref.secretary.canon;
  assert.ok(agree(canon.rate, canon.se, cutoffWin(100, 36), 0));
});

test('secretary: the full-information rules, exact, against simulation and the corrected script', () => {
  // Two applicants: both rules take the first if it is above ½, and win 3/4.
  for (const rule of /** @type {const} */ (['half', 'optimal'])) assert.ok(Math.abs(thresholdWin(thresholds(2, rule)) - 0.75) < 1e-6);
  assert.ok(Math.abs(optimalThreshold(1) - 0.5) < 1e-15);
  // Decision numbers solve Σ (b^−j − 1)/j = 1.
  for (const k of [2, 7, 50, 400]) {
    const b = optimalThreshold(k);
    let s = 0;
    for (let j = 1; j <= k; j++) s += (b ** -j - 1) / j;
    assert.ok(Math.abs(s - 1) < 1e-12, `k = ${k}`);
  }
  // The grid converges: tenfold more points moves the answer by under 2 × 10⁻⁷.
  for (const n of [10, 100, 1000]) {
    for (const rule of /** @type {const} */ (['half', 'optimal'])) {
      const t = thresholds(n, rule);
      assert.ok(Math.abs(thresholdWin(t) - thresholdWin(t, 100000)) < 2e-7, `${n} ${rule}`);
    }
  }
  const r = compute({ view: 'secretary', replicates: 100000, seed: 2 });
  for (const s of ['cutoff', 'half', 'optimal']) assert.ok(agree(r.simulation[s].rate, r.simulation[s].se, r.exact[s], 0), s);
  assert.ok(r.exact.optimal > r.exact.half && r.exact.half > r.exact.cutoff);
  // The script's omniscient rule, corrected to accept only a best so far, is the half rule;
  // as written it also accepts applicants who cannot be the best, and wins less often.
  const fixed = ref.secretary.omnisc_best_so_far;
  assert.ok(agree(fixed.rate, fixed.se, r.exact.half, 0));
  const written = ref.secretary.omnisc_as_written;
  assert.ok(written.rate < r.exact.half - 10 * written.se);
  assert.equal(ref.secretary.kde, "object 'i' not found");
});

test('kruskal: the seeded simulation agrees with card_trick.R', () => {
  const r = compute({ view: 'kruskal', replicates: 40000, seed: 5 });
  const R = ref.kruskal;
  const se = (/** @type {number} */ p, /** @type {number} */ n) => Math.sqrt((p * (1 - p)) / n);
  for (let i = 0; i < 52; i++) {
    const a = r.simulation.byWindow[i];
    const b = R.all_together[i];
    assert.ok(agree(a, se(a, 40000), b, se(b, R.deals)), `first ${i + 1} cards: ${a} vs ${b}`);
  }
  assert.ok(agree(r.simulation.allTogether.rate, r.simulation.allTogether.se, R.all5, se(R.all5, R.deals)));
  assert.ok(agree(r.simulation.pairTogether.rate, r.simulation.pairTogether.se, R.just_2_in_5, se(R.just_2_in_5, R.deals)));
  // The coupling block: with catchup = T (paths that share a card), its PMF of the first
  // shared card is the simulation's; its default catchup = F counts only kids on the same
  // card after the same number of jumps, and misses most pairs that end together.
  const pmf = R.coupling_catchup_true.pmf;
  let cum = 0;
  for (let c = 0; c < 52; c++) {
    cum += pmf[c];
    const a = r.simulation.pairMeeting.cdf[c];
    assert.ok(agree(a, se(a, 40000), cum, se(cum, R.replicates)), `met by card ${c + 1}`);
  }
  assert.ok(agree(1 - r.simulation.pairMeeting.never, 0.0007, R.coupling_catchup_true.coupled, se(R.coupling_catchup_true.coupled, R.replicates)));
  assert.ok(R.coupling_catchup_false.coupled < 0.2);
  // Block 1's deck has 56 cards: its kids can end past card 52.
  assert.ok(Object.keys(R.block1.end_table).some((k) => Number(k) > 52));
});

test("kruskal: the play-through walks by each card's value, and the decks count as stated", () => {
  for (const deck of ['exhibit', 'kruskal']) {
    const r = compute({ view: 'kruskal', deck, window: 10, seed: 9, replicates: 0 });
    const { cards, walks, ends } = r.play;
    const total = cards.reduce((/** @type {number} */ s, /** @type {any} */ c) => s + c.value, 0);
    assert.equal(total, deck === 'exhibit' ? 4 * 45 + 16 : 4 * 55 + 60);
    walks.forEach((/** @type {number[]} */ w, /** @type {number} */ i) => {
      assert.equal(w[0], i);
      for (let k = 1; k < w.length; k++) assert.equal(w[k], w[k - 1] + cards[w[k - 1]].value);
      assert.ok(w[w.length - 1] + cards[w[w.length - 1]].value >= 52);
      assert.equal(ends[i], w[w.length - 1]);
    });
    if (r.play.together) for (const w of walks) assert.ok(w.includes(r.play.merged));
  }
});

test('coins: Bayes rule, against the simulation and coinflipping.R', () => {
  const e = coinPosterior(9, 1, 5);
  assert.ok(Math.abs(e.nextHead - (1 - (1 - 0.1 / (0.9 * 0.5 ** 5 + 0.1)) / 2)) < 1e-15);
  assert.ok(Math.abs(e.nextHead - ref.coins.exact) < 1e-15);
  assert.ok(agree(ref.coins.simulated.rate, ref.coins.simulated.se, e.nextHead, 0));
  const r = compute({ view: 'coins', replicates: 400000, seed: 6 });
  assert.ok(agree(r.simulation.nextHead.rate, r.simulation.nextHead.se, e.nextHead, 0));
  assert.ok(agree(r.simulation.twoHeaded.rate, r.simulation.twoHeaded.se, e.posterior, 0));
  assert.ok(Math.abs(r.simulation.kept / 400000 - e.evidence) < 4 * Math.sqrt((e.evidence * (1 - e.evidence)) / 400000));
  assert.equal(coinPosterior(5, 0, 3).nextHead, 0.5);
  assert.equal(coinPosterior(0, 2, 3).nextHead, 1);
});

test('puzzles: requests are checked in full', () => {
  /** @param {unknown} params */
  const issues = (params) => {
    try { resolveParams(params); } catch (error) { assert.ok(error instanceof IntuitionsError); return error.issues.map((i) => `${i.code} ${i.path}`); }
    return [];
  };
  assert.deepEqual(issues({ view: 'secretary', n: 50, cutoff: 50 }), ['out_of_range params.cutoff']);
  assert.deepEqual(issues({ view: 'secretary', n: 1000, replicates: 100000 }), ['too_much_work params.replicates']);
  assert.deepEqual(issues({ view: 'prisoners', boxes: 10, prisoners: 11, prisoner: 3, foo: 1 }), ['unknown_field params.foo', 'out_of_range params.prisoners']);
  assert.deepEqual(issues({ view: 'coins', fair: 0, twoHeaded: 0 }), ['out_of_range params.fair']);
  assert.deepEqual(issues({ view: 'kruskal', deck: 'tarot', window: 11 }), ['out_of_range params.deck', 'out_of_range params.window']);
  assert.deepEqual(resolveParams({ view: 'secretary', n: 20 }), { view: 'secretary', n: 20, strategy: 'cutoff', cutoff: 7, seed: 1, replicates: 10000 });
  assert.deepEqual(resolveParams({ view: 'prisoners', boxes: 10 }), { view: 'prisoners', boxes: 10, prisoners: 10, attempts: 5, strategy: 'loops', prisoner: 1, seed: 1, replicates: 10000 });
  assert.deepEqual(compute({ view: 'kruskal', replicates: 50 }), compute({ view: 'kruskal', replicates: 50 }));
});
