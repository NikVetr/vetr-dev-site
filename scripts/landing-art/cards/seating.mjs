// Table Seating: the tool's default party (39 guests at four round tables), seated by its own
// search, each guest a disc in the category's colour with the category inside, as the tool draws
// them. The still is the best seating found. The loop replays the search's last three accepted
// moves backwards, guests swapping seats one move at a time, then forwards again, so it ends on
// the seating it starts from; the two tables of each move are ringed while it happens.
import { readFileSync } from 'node:fs';
import { CHART_THEMES, categoryColour, categoryText } from '../../../seating/core/chart.js';
import { submit } from '../../../seating/core/index.js';
import { H, W, art, esc, num } from '../svg.mjs';

const MOVES = 3;
const HOLD = 0.7;   // seconds at the best seating, start and end
const MOVE = 0.55;  // seconds a swap takes
const PAUSE = 0.3;  // seconds between swaps

/** Luminance rule of the tool's chart (inkOn): white numerals on dark discs. */
function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.25 ? '#0b0b0b' : '#ffffff';
}

export async function build() {
  const request = JSON.parse(readFileSync(new URL('../../../seating/examples/party.json', import.meta.url), 'utf8'));
  const result = await submit(request);
  const moves = result.trajectory.moves;
  if (moves.at(-1).iteration !== result.search.bestIteration) throw new Error('seating: the best seating is not the last move');
  const category = new Map(request.guests.map((g) => [g.id, g.category]));
  const range = [Math.min(...category.values()), Math.max(...category.values())];

  // The room, turned a quarter so its long side runs across the card.
  const tables = result.tables.map((t) => ({ ...t, x: -t.y, y: -t.x }));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dmin = Math.min(...tables.flatMap((a, i) => tables.slice(i + 1).map((b) => dist(a, b))));
  const [minX, maxX] = [Math.min(...tables.map((t) => t.x)), Math.max(...tables.map((t) => t.x))];
  const [minY, maxY] = [Math.min(...tables.map((t) => t.y)), Math.max(...tables.map((t) => t.y))];
  const k = Math.min((W - 16) / (maxX - minX + dmin), (H - 12) / (maxY - minY + dmin));
  const D = dmin * k;
  const centre = (t) => [W / 2 + (t.x - (minX + maxX) / 2) * k, H / 2 + (t.y - (minY + maxY) / 2) * k];
  const rSeat = 0.36 * D;
  const mark = Math.min(0.17 * D, (2 * Math.PI * rSeat) / 10 - 1.5);
  const seatAt = (ti, j) => {
    const [cx, cy] = centre(tables[ti]);
    const a = -Math.PI / 2 + (2 * Math.PI * j) / tables[ti].capacity;
    return [cx + rSeat * Math.cos(a), cy + rSeat * Math.sin(a)];
  };
  const tableIndex = new Map(tables.map((t, i) => [t.id, i]));

  // Seatings from the best back MOVES moves: seats[s] maps each guest to [table, seat].
  const where = (seating) => new Map(seating.flatMap((seats, ti) => seats.flatMap((g, j) => (g === null ? [] : [[g, [ti, j]]]))));
  let seating = tables.map((t) => [...t.seats]);
  const states = [where(seating)];
  const active = [];
  for (const m of moves.slice(-MOVES).reverse()) {
    const [ta, tb] = m.tables.map((id) => tableIndex.get(id));
    seating = seating.map((s) => [...s]);
    for (const [k2, [ga, gb]] of m.swaps.entries()) {
      const [pa, pb] = m.positions[k2];
      if (seating[ta][pa] !== gb || seating[tb][pb] !== ga) throw new Error('seating: a move does not undo onto the seating before it');
      seating[ta][pa] = ga;
      seating[tb][pb] = gb;
    }
    states.push(where(seating));
    active.push([ta, tb]);
  }
  // Backwards through the moves, then forwards: states 0, 1, .., MOVES, .., 1, 0.
  const path = [...states, ...states.slice(0, -1).reverse()];
  const pathActive = [...active, ...active.slice().reverse()];
  const segments = path.length - 1;
  const period = 2 * HOLD + segments * MOVE + (segments - 1) * PAUSE;
  const pct = (t) => num((100 * t) / period, 3);
  const start = (j) => HOLD + j * (MOVE + PAUSE);

  const theme = (name) => CHART_THEMES[name];
  const cats = [...new Set(category.values())].sort((a, b) => a - b);
  let css = `& .table { fill: var(--surface); stroke: var(--art-line); stroke-width: 1; }
& .ring { fill: none; stroke: var(--art-ink); opacity: 0; }
& .ring .dash { stroke-dasharray: 3 2; }
& .guest circle { stroke: var(--art-ink); stroke-opacity: 0.35; stroke-width: 0.7; }
& .guest text { font: 700 ${num(mark * 0.62)}px ui-sans-serif, system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; }
`;
  for (const [i, c] of cats.entries()) {
    const light = categoryColour(c, range, 'light');
    const dark = categoryColour(c, range, 'dark');
    css += `& .c${i} circle { fill: ${light}; } & .c${i} text { fill: ${inkOn(light)}; }
:root[data-theme="dark"] & .c${i} circle { fill: ${dark}; } :root[data-theme="dark"] & .c${i} text { fill: ${inkOn(dark)}; }
`;
  }
  if (!theme('light') || !theme('dark')) throw new Error('seating: the chart has no light or dark theme');

  let body = '';
  let loop = '';
  for (const [ti] of tables.entries()) {
    const [cx, cy] = centre(tables[ti]);
    body += `<circle class="table" cx="${num(cx)}" cy="${num(cy)}" r="${num(rSeat - 0.75 * mark)}"/>`;
    const on = pathActive.flatMap((pair, j) => (pair.includes(ti) ? [j] : []));
    if (on.length) {
      body += `<g class="ring ring${ti}"><circle cx="${num(cx)}" cy="${num(cy)}" r="${num(rSeat - 0.75 * mark)}" stroke-width="2"/><circle class="dash" cx="${num(cx)}" cy="${num(cy)}" r="${num(rSeat - 0.75 * mark - 3)}"/></g>`;
      const stops = on.flatMap((j) => [`${pct(start(j) - 0.001)}% { opacity: 0; }`, `${pct(start(j))}% { opacity: 1; }`, `${pct(start(j) + MOVE)}% { opacity: 1; }`, `${pct(start(j) + MOVE + 0.001)}% { opacity: 0; }`]);
      loop += `& .ring${ti} { animation: seating-ring${ti} ${num(period, 3)}s linear infinite; }
@keyframes seating-ring${ti} { 0% { opacity: 0; } ${stops.join(' ')} 100% { opacity: 0; } }
`;
    }
  }
  const guests = [...states[0].keys()];
  for (const [gi, g] of guests.entries()) {
    const [x0, y0] = seatAt(...states[0].get(g));
    const offsets = path.map((s) => { const [x, y] = seatAt(...s.get(g)); return [x - x0, y - y0]; });
    const moving = offsets.some(([dx, dy]) => Math.abs(dx) + Math.abs(dy) > 0.01);
    body += `<g transform="translate(${num(x0)} ${num(y0)})"><g class="guest c${cats.indexOf(category.get(g))}${moving ? ` m${gi}` : ''}"><circle r="${num(mark / 2)}"/><text>${esc(categoryText(category.get(g)))}</text></g></g>`;
    if (!moving) continue;
    const at = ([dx, dy]) => `transform: translate(${num(dx)}px, ${num(dy)}px);`;
    const stops = [];
    for (let j = 0; j < segments; j++) {
      const [a, b] = [offsets[j], offsets[j + 1]];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      stops.push(`${pct(start(j))}% { ${at(a)} }`, `${pct(start(j) + MOVE)}% { ${at(b)} }`);
    }
    loop += `& .m${gi} { animation: seating-m${gi} ${num(period, 3)}s ease-in-out infinite; }
@keyframes seating-m${gi} { 0% { transform: none; } ${stops.join(' ')} 100% { transform: none; } }
`;
  }
  return art({ name: 'seating', period, body, css, loop });
}
