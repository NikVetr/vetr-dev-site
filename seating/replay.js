// The replay of a result: every seating the search accepted, rebuilt from the recorded moves,
// drawn one at a time with the guests who swap moving between their seats. It ends on the
// best seating (the result), returning to it after the last move. Nothing re-runs the search.

import { categoryColour, categoryText, formatScore, labelPlacement, renderSeating, renderTraceSvg, scoreSteps, seatingGeometry, tableLabel } from './core/chart.js';
import { scoreAssignment, violations } from './core/objective.js';
import { buildProblem } from './core/request.js';

/**
 * @typedef {import('./core/index.js').Result} Result
 * @typedef {import('./core/search.js').Move} Move
 * @typedef {import('./core/objective.js').Terms} Terms
 * @typedef {import('./core/chart.js').Geometry} Geometry
 * @typedef {{ tableScores: number[], broken: Set<string>, brokenWith: Map<string, string[]> }} Derived
 */

const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32]; // accepted moves a second
const TERM_ROWS = /** @type {const} */ ([['table', 'Table term'], ['pairs', 'Pairs'], ['constraints', 'Constraints'], ['geography', 'Geography']]);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const byId = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const el = {
  chart: byId('chart'), trace: byId('trace'), traceTip: byId('trace-tip'), readout: byId('readout'), status: byId('replay-status'),
  list: byId('table-list'), listHeading: byId('list-heading'), timeline: byId('timeline'), timelineOut: byId('timeline-out'),
  speed: byId('speed'), speedOut: byId('speed-out'), animate: byId('animate'), play: byId('play'),
  toStart: byId('to-start'), back: byId('step-back'), forward: byId('step-forward'), toBest: byId('to-best'),
  arrangement: byId('arrangement'), traceAxis: byId('trace-axis'),
};
el.animate.checked = !reducedMotion.matches;

/** @type {null | { result: Result, request: any, problem: import('./core/request.js').Problem, seats: (string | null)[][][], recorded: boolean,
 *   moves: (Move | null)[], iteration: number[], score: number[], terms: Terms[], best: number[], bestIndex: number,
 *   tableIndex: Map<string, number>, seatIndex: Map<string, number>, categories: Map<string, number>, derived: Map<number, Derived> }} */
let run = null;
let pos = 0; // the state on view: after `pos` accepted moves
let final = false; // on view as the result, after the replay returned to it
let playing = false;
/** @type {Geometry | null} */
let geo = null;
/** @type {null | { finish: () => void }} */
let tween = null;
/** What the score chart on view was drawn for (see drawTrace). */
let traceKey = '';

const theme = () => /** @type {'light' | 'dark'} */ (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const fmt = (/** @type {number} */ x) => x.toLocaleString('en-US');
const speed = () => SPEEDS[Number(el.speed.value)];
const speedText = () => `${speed()} move${speed() === 1 ? '' : 's'} a second`;

/**
 * Shows a result for replay, at the best seating, or playing from the first when autoplay.
 * @param {Result} result @param {any} request the request it answers
 */
export function loadReplay(result, request, { autoplay = false } = {}) {
  pause();
  const traj = result.trajectory;
  const problem = buildProblem(request);
  const tableIndex = new Map(result.tables.map((t, i) => [t.id, i]));
  /** @type {(string | null)[][][]} */
  let seats = [result.tables.map((t) => [...t.seats])];
  /** @type {(Move | null)[]} */
  const moves = [null];
  let steps = { iteration: [result.search.bestIteration], score: [result.score], best: [result.score] };
  let terms = [result.terms];
  // Without recorded moves there is only the result to show.
  if (traj?.record === 'moves') {
    seats = [traj.initial.tables.map((t) => [...t])];
    for (const m of traj.moves) {
      const next = seats[seats.length - 1].map((t) => [...t]);
      const [a, b] = m.tables.map((id) => /** @type {number} */ (tableIndex.get(id)));
      m.positions.forEach(([pa, pb], k) => {
        next[a][pa] = m.swaps[k][1];
        next[b][pb] = m.swaps[k][0];
      });
      seats.push(next);
      moves.push(m);
    }
    steps = scoreSteps(result);
    terms = [traj.initial.terms, ...traj.moves.map((m) => m.terms)];
  }
  run = {
    result, request, problem, seats, moves, recorded: traj?.record === 'moves',
    iteration: steps.iteration, score: steps.score, best: steps.best, terms,
    bestIndex: Math.max(0, steps.iteration.indexOf(result.search.bestIteration)),
    tableIndex,
    seatIndex: new Map(problem.ids.flatMap((id, i) => (id === null ? [] : [[id, i]]))),
    categories: new Map(/** @type {any[]} */ (request.guests).flatMap((g) => (typeof g.category === 'number' ? [[g.id, g.category]] : []))),
    derived: new Map(),
  };
  el.timeline.max = String(seats.length - 1);
  geo = null;
  traceKey = '';
  if (autoplay && seats.length > 1) {
    pos = 0;
    final = false;
    draw();
    play();
  } else {
    pos = run.bestIndex;
    final = true;
    draw();
  }
}

/** Per-table scores and the guests in broken constraints, with what each breaks, for one state. @param {number} i */
function derived(i) {
  const r = /** @type {NonNullable<typeof run>} */ (run);
  const cached = r.derived.get(i);
  if (cached) return cached;
  let empty = r.problem.nGuests;
  const tables = r.seats[i].map((t) => t.map((id) => (id === null ? empty++ : /** @type {number} */ (r.seatIndex.get(id)))));
  const s = scoreAssignment(r.problem, tables);
  const broken = violations(r.problem, tables);
  const ids = /** @type {string[]} */ (r.problem.ids);
  /** @type {Map<string, string[]>} */
  const brokenWith = new Map();
  const note = (/** @type {number} */ a, /** @type {string} */ text) => brokenWith.set(ids[a], [...(brokenWith.get(ids[a]) ?? []), text]);
  for (const [a, b] of broken.together) {
    note(a, `not seated with ${ids[b]}`);
    note(b, `not seated with ${ids[a]}`);
  }
  for (const [a, b] of broken.apart) {
    note(a, `seated with ${ids[b]}, to be apart`);
    note(b, `seated with ${ids[a]}, to be apart`);
  }
  /** @type {Derived} */
  const d = { tableScores: s.byTable.map((t) => t.table + t.pairs + t.geography), broken: new Set(brokenWith.keys()), brokenWith };
  r.derived.set(i, d);
  return d;
}

/** The chart's width, as the resize observer last saw it (reading it would force a layout). */
const chartWidth = () => observedWidth || el.chart.clientWidth;

function geometry() {
  const r = /** @type {NonNullable<typeof run>} */ (run);
  const width = Math.max(280, Math.floor(chartWidth()));
  if (geo && geo.width === width) return geo;
  const names = r.request.guests.map((/** @type {any} */ g) => g.id);
  const choice = el.arrangement.value;
  geo = seatingGeometry(r.result.tables, names, { width, arrangement: choice === 'rows' ? 'rows' : 'room' });
  if (choice === 'auto' && geo.font < 9) geo = seatingGeometry(r.result.tables, names, { width, arrangement: 'rows' });
  return geo;
}

/** The tables of the move that led to state i, while it is the one on view. @param {number} i */
function activeTables(i) {
  const m = run?.moves[i];
  return m && !final ? m.tables.map((id) => /** @type {number} */ (run?.tableIndex.get(id))) : [];
}

/** Draws state i (pos) whole: chart, readout, status, trace, list and controls. @param {number[]} [active] */
function draw(active) {
  if (!run) return;
  const r = run;
  const d = derived(pos);
  const g = geometry();
  const view = {
    tables: r.result.tables.map((t, k) => ({ id: t.id, seats: r.seats[pos][k], score: d.tableScores[k] })),
    categories: r.categories,
    broken: d.broken,
    active: active ?? activeTables(pos),
  };
  el.chart.innerHTML = renderSeating(g, view, { theme: theme(), replay: true, title: final ? 'The best seating found' : `Seating after move ${pos}` });
  drawReadout(d);
  drawStatus();
  drawTrace();
  drawList(d);
  const N = r.seats.length - 1;
  el.timeline.value = String(pos);
  el.timelineOut.textContent = `${fmt(pos)} of ${fmt(r.seats.length - 1)}`;
  el.speedOut.textContent = speedText();
  el.play.textContent = playing ? '❚❚ Pause' : '▶ Play';
  el.play.setAttribute('aria-pressed', String(playing));
  el.back.disabled = pos === 0;
  el.toStart.disabled = pos === 0;
  el.forward.disabled = pos === r.seats.length - 1 && (final || pos === r.bestIndex);
  el.toBest.disabled = pos === r.bestIndex && final;
  el.play.disabled = N === 0;
  el.timeline.disabled = N === 0;
}

/** @param {Derived} d */
function drawReadout(d) {
  const r = /** @type {NonNullable<typeof run>} */ (run);
  const prev = pos > 0 && !final ? r.terms[pos - 1] : null;
  const terms = r.terms[pos];
  const newBest = pos > 0 && !final && r.best[pos] > r.best[pos - 1];
  /** @param {number} now @param {number | undefined} before */
  const delta = (now, before) => {
    if (before === undefined) return '';
    const dv = now - before;
    if (Math.abs(dv) < 1e-9) return '';
    return dv > 0 ? `<span class="delta up">▲ +${formatScore(dv)}</span>` : `<span class="delta down">▼ ${formatScore(dv)}</span>`;
  };
  const brokenPairs = brokenCount(d);
  const rows = TERM_ROWS.map(([k, label]) => {
    const note = k === 'constraints' ? `<span class="term-note">${brokenPairs ? `⚠ ${brokenPairs} pair${brokenPairs === 1 ? '' : 's'} broken` : '✓ all kept'}</span>` : '';
    return `<div class="term"><dt>${label}</dt><dd><span class="value">${formatScore(terms[k])}</span>${note}${delta(terms[k], prev?.[k])}</dd></div>`;
  }).join('');
  el.readout.innerHTML = `<div class="total"><dt>Score</dt><dd><span class="value">${formatScore(r.score[pos])}</span>${delta(r.score[pos], prev ? r.score[pos - 1] : undefined)}</dd></div>`
    + `<div class="total best-so-far"><dt>Best so far</dt><dd><span class="value">${formatScore(r.best[pos])}</span>${newBest ? '<span class="new-best">★ new best</span>' : ''}</dd></div>${rows}`;
}

/** Broken constraint pairs in a state (each pair once). @param {Derived} d */
function brokenCount(d) {
  const r = /** @type {NonNullable<typeof run>} */ (run);
  const p = r.problem;
  const tableOf = new Map(r.seats[pos].flatMap((t, k) => t.flatMap((id) => (id === null ? [] : [[id, k]]))));
  const same = (/** @type {[number, number]} */ [a, b]) => tableOf.get(/** @type {string} */ (p.ids[a])) === tableOf.get(/** @type {string} */ (p.ids[b]));
  return d.broken.size ? p.together.filter((pr) => !same(pr)).length + p.apart.filter(same).length : 0;
}

function drawStatus() {
  const r = /** @type {NonNullable<typeof run>} */ (run);
  const N = r.seats.length - 1;
  const total = fmt(r.result.search.iterations);
  const bestAt = `iteration ${fmt(r.iteration[r.bestIndex])} of ${total}`;
  if (!r.recorded) {
    el.status.innerHTML = `<strong>★ The best seating found</strong>, at ${bestAt}. Its moves were not recorded (record: "${esc(r.result.settings.record)}"), so there is nothing to replay.`;
  } else if (final) {
    el.status.innerHTML = `<strong>★ The best seating found</strong>, at ${bestAt}${N ? ` (move ${fmt(r.bestIndex)} of ${fmt(N)})` : ''}. This is the result.`;
  } else if (pos === 0) {
    el.status.innerHTML = `<strong>The first seating</strong>: guests in list order, iteration 0 of ${total}.`;
  } else {
    const m = /** @type {Move} */ (r.moves[pos]);
    const k = m.swaps.length;
    const who = m.swaps.flat().filter((id) => id !== null);
    el.status.innerHTML = `<strong>Move ${fmt(pos)} of ${fmt(N)}</strong>, iteration ${fmt(m.iteration)} of ${total}: ${k} seat${k === 1 ? '' : 's'} swapped between ${esc(tableLabel(m.tables[0]))} and ${esc(tableLabel(m.tables[1]))} (${who.map(esc).join(', ')})${pos === r.bestIndex ? '. <strong>★ The best seating found.</strong>' : '.'}`;
  }
}

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The score chart, drawn once for a result, width, theme and axis; each state only moves its cursor. */
function drawTrace() {
  const r = /** @type {NonNullable<typeof run>} */ (run);
  const width = Math.max(280, Math.floor(chartWidth()));
  const key = `${width} ${theme()} ${el.traceAxis.value}`;
  if (key !== traceKey) {
    traceKey = key;
    const height = Math.round(Math.min(240, Math.max(170, width * 0.34)));
    el.trace.innerHTML = renderTraceSvg(r.result, { width, height, theme: theme(), axis: el.traceAxis.value, cursor: r.iteration[pos] });
  }
  const svg = /** @type {SVGSVGElement} */ (el.trace.querySelector('svg'));
  const d = Object.fromEntries(['plotLeft', 'plotWidth', 'plotTop', 'plotHeight', 'lo', 'hi', 'iterations'].map((k) => [k, Number(svg.dataset[k])]));
  const v = r.score[pos];
  const below = v < d.lo;
  /** @type {SVGGElement} */ (svg.querySelector('.cursor')).setAttribute('transform', `translate(${(d.plotLeft + (r.iteration[pos] / d.iterations) * d.plotWidth).toFixed(2)} 0)`);
  const dot = /** @type {SVGCircleElement} */ (svg.querySelector('.cursor-dot'));
  dot.setAttribute('cy', (below ? d.plotTop + d.plotHeight : d.plotTop + ((d.hi - v) / (d.hi - d.lo)) * d.plotHeight).toFixed(2));
  dot.setAttribute('visibility', below ? 'hidden' : 'visible');
  /** @type {SVGPathElement} */ (svg.querySelector('.cursor-below')).setAttribute('visibility', below ? 'visible' : 'hidden');
}

/** @param {Derived} d */
function drawList(d) {
  const r = /** @type {NonNullable<typeof run>} */ (run);
  el.listHeading.textContent = final ? 'Tables: the best seating' : pos === 0 ? 'Tables: the first seating' : `Tables after move ${fmt(pos)}`;
  const t = theme();
  const range = /** @type {[number, number]} */ ([Math.min(...r.categories.values()), Math.max(...r.categories.values())]);
  el.list.innerHTML = r.result.tables.map((table, k) => {
    const seats = r.seats[pos][k];
    const filled = seats.filter((s) => s !== null).length;
    const items = seats.map((id) => {
      if (id === null) return '<li class="empty">◌ empty seat</li>';
      const cat = r.categories.get(id);
      const chip = cat === undefined ? '' : `<span class="chip-cat" style="background:${categoryColour(cat, range, t)}" data-dark="${isDark(categoryColour(cat, range, t))}">${esc(categoryText(cat))}</span>`;
      const warn = (d.brokenWith.get(id) ?? []).map((w) => `<span class="broken">⚠ ${esc(w)}</span>`).join('');
      return `<li>${chip}<span>${esc(id)}</span>${warn}</li>`;
    }).join('');
    return `<section class="table-card"><h4>${esc(tableLabel(table.id))}</h4><p class="muted">${filled} of ${seats.length} seats · score ${formatScore(d.tableScores[k])}</p><ol>${items}</ol></section>`;
  }).join('');
}

/** @param {string} hex */
const isDark = (hex) => parseInt(hex.slice(1, 3), 16) * 0.3 + parseInt(hex.slice(3, 5), 16) * 0.59 + parseInt(hex.slice(5, 7), 16) * 0.11 < 140;

// ---------- motion ----------

/** Where each guest sits in a state: table and seat. @param {number} i */
function places(i) {
  const r = /** @type {NonNullable<typeof run>} */ (run);
  /** @type {Map<string, [number, number]>} */
  const out = new Map();
  r.seats[i].forEach((t, k) => t.forEach((id, j) => { if (id !== null) out.set(id, [k, j]); }));
  return out;
}

const ease = (/** @type {number} */ t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Moves the guests whose seats differ between the state on view and state `to`, then draws
 * `to` whole. Without animation (or with reduced motion) it just draws `to`.
 * @param {number} to @param {{ final?: boolean, active?: number[] }} [options]
 */
function go(to, { final: toFinal = false, active } = {}) {
  tween?.finish();
  const from = pos;
  const duration = Math.min(1200, 800 / speed());
  const arrive = () => {
    tween = null;
    pos = to;
    final = toFinal;
    draw();
  };
  if (!el.animate.checked || reducedMotion.matches || from === to || duration < 30) {
    arrive();
    return Promise.resolve();
  }
  const g = geometry();
  // outline the tables of the move being made (or undone)
  const move = run?.moves[to === from + 1 ? to : to === from - 1 ? from : -1];
  draw(active ?? (move ? move.tables.map((id) => /** @type {number} */ (run?.tableIndex.get(id))) : []));
  const a = places(from);
  const b = places(to);
  const guests = /** @type {SVGGElement} */ (el.chart.querySelector('.guests'));
  const movers = [...b].filter(([id, p]) => {
    const q = a.get(id);
    return !q || q[0] !== p[0] || q[1] !== p[1];
  }).map(([id, [k, j]]) => {
    const [k0, j0] = /** @type {[number, number]} */ (a.get(id));
    const node = /** @type {SVGGElement} */ (guests.querySelector(`[data-guest="${CSS.escape(id)}"]`));
    guests.append(node); // on top while it moves
    const s0 = g.tables[k0].seats[j0];
    const s1 = g.tables[k].seats[j];
    let turn = s1.angle - s0.angle;
    turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
    return { node, s0, s1, turn };
  });
  return new Promise((resolve) => {
    const start = performance.now();
    let frame = 0;
    const step = (/** @type {number} */ now) => {
      const t = ease(Math.min(1, (now - start) / duration));
      for (const m of movers) {
        const x = m.s0.x + (m.s1.x - m.s0.x) * t;
        const y = m.s0.y + (m.s1.y - m.s0.y) * t;
        m.node.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        const place = labelPlacement(m.s0.angle + m.turn * t, g);
        const label = /** @type {SVGGElement} */ (m.node.querySelector('.label'));
        label.setAttribute('transform', `rotate(${place.rotate.toFixed(2)})`);
        const text = /** @type {SVGTextElement} */ (label.firstElementChild);
        text.setAttribute('text-anchor', place.anchor);
        for (const node of [text, ...text.querySelectorAll('tspan')]) node.setAttribute('x', place.x.toFixed(2));
      }
      if (t < 1) frame = requestAnimationFrame(step);
      else {
        arrive();
        resolve(undefined);
      }
    };
    tween = {
      finish() {
        cancelAnimationFrame(frame);
        arrive();
        resolve(undefined);
      },
    };
    frame = requestAnimationFrame(step);
  });
}

const wait = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Plays from the state on view (from the first seating if the replay is over) to the end, then returns to the best. */
export async function play() {
  if (!run || playing) return;
  if (final || (pos === run.seats.length - 1 && pos === run.bestIndex)) {
    pos = 0;
    final = false;
  }
  playing = true;
  draw();
  while (playing && run) {
    const N = run.seats.length - 1;
    const period = 1000 / speed();
    if (pos < N) {
      const started = performance.now();
      await go(pos + 1);
      if (!playing) break;
      await wait(Math.max(0, period - (performance.now() - started)));
    } else {
      playing = false;
      await go(run.bestIndex, { final: true });
    }
  }
  playing = false;
  draw();
}

export function pause() {
  playing = false;
  if (run) draw();
}

// ---------- controls ----------

el.play.addEventListener('click', () => (playing ? pause() : play()));
el.toStart.addEventListener('click', () => {
  pause();
  tween?.finish();
  pos = 0;
  final = false;
  draw();
});
el.back.addEventListener('click', () => {
  pause();
  if (pos > 0) go(pos - 1);
});
el.forward.addEventListener('click', () => {
  pause();
  if (!run) return;
  if (pos < run.seats.length - 1) go(pos + 1);
  else go(run.bestIndex, { final: true });
});
el.toBest.addEventListener('click', () => {
  pause();
  if (run) go(run.bestIndex, { final: true });
});
el.timeline.addEventListener('input', () => {
  const to = Number(el.timeline.value); // before pause() redraws the slider
  pause();
  tween?.finish();
  pos = to;
  final = false;
  draw();
});
el.speed.addEventListener('input', () => { el.speedOut.textContent = speedText(); });
for (const control of [el.arrangement, el.traceAxis]) {
  control.addEventListener('change', () => {
    geo = null;
    if (run) draw();
  });
}

// The score chart: hover for the values, click to show that state.
/** @param {PointerEvent} event @returns {number | null} */
function stateAt(event) {
  const svg = el.trace.querySelector('svg');
  if (!run || !svg) return null;
  const box = svg.getBoundingClientRect();
  const left = Number(svg.dataset.plotLeft);
  const width = Number(svg.dataset.plotWidth);
  const x = ((event.clientX - box.left) / box.width) * svg.viewBox.baseVal.width;
  if (x < left - 4 || x > left + width + 4) return null;
  const it = Math.max(0, Math.min(1, (x - left) / width)) * Number(svg.dataset.iterations);
  let i = 0;
  while (i + 1 < run.iteration.length && run.iteration[i + 1] <= it) i++;
  return i;
}
el.trace.addEventListener('pointermove', (/** @type {PointerEvent} */ event) => {
  const i = stateAt(event);
  if (i === null || !run) {
    el.traceTip.innerHTML = '&nbsp;';
    return;
  }
  el.traceTip.textContent = `${i === 0 ? 'First seating' : `Move ${fmt(i)}`}, iteration ${fmt(run.iteration[i])}: score ${formatScore(run.score[i])}, best so far ${formatScore(run.best[i])}. Click to show it.`;
});
el.trace.addEventListener('pointerleave', () => { el.traceTip.innerHTML = '&nbsp;'; });
el.trace.addEventListener('click', (/** @type {PointerEvent} */ event) => {
  const i = stateAt(event);
  if (i === null) return;
  pause();
  tween?.finish();
  pos = i;
  final = false;
  draw();
});

let observedWidth = 0, resizeFrame = 0;
new ResizeObserver(([entry]) => {
  const w = entry.contentRect.width;
  if (w === observedWidth) return;
  observedWidth = w;
  geo = null;
  cancelAnimationFrame(resizeFrame);
  resizeFrame=requestAnimationFrame(()=>{if(run&&!tween)draw()});
}).observe(el.chart);
document.addEventListener('themechange', () => { if (run && !tween) draw(); });

/** The chart as drawn now, for window.Seating. */
export const replayState = () => (run ? { move: pos, moves: run.seats.length - 1, iteration: run.iteration[pos], best: final, playing } : null);

/** Release the old static replay before a round plan takes over the chart. */
export function clearReplay() { pause(); run=null; geo=null; traceKey=''; }
