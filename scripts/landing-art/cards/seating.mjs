// Table Seating: all 39 guests move together between the example's actual best and
// initial table assignments. These are presentation routes, not a replay of the search's
// individual swaps. Within-table seat rotation leaves every objective term unchanged.
// The still is the best assignment; hover/focus plays the separated swarm paths and back.
import { readFileSync } from 'node:fs';
import { categoryColour, categoryText } from '../../../seating/core/chart.js';
import { submit } from '../../../seating/core/index.js';
import { TALL, art, esc, num } from '../svg.mjs';
import { planSwarm, validateSwarm } from '../seating-swarm.mjs';

const { width: W, height: H } = TALL;   // a 1x3 tile

const HOLD = 0.7;
const MOVE = 5.2;

/** Luminance rule of the tool's chart (inkOn): white numerals on dark discs. */
function inkOn(/** @type {string} */ hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.25 ? '#0b0b0b' : '#ffffff';
}

export async function seatingScene() {
  const request = JSON.parse(readFileSync(new URL('../../../seating/examples/party.json', import.meta.url), 'utf8'));
  const result = /** @type {any} */ (await submit(request));
  /** @type {Map<string, number>} */
  const category = new Map(request.guests.map((/** @type {{ id: string, category: number }} */ g) => [g.id, g.category]));
  /** @type {[number, number]} */
  const range = [Math.min(...category.values()), Math.max(...category.values())];

  // The room as the tool draws it, y up.
  /** @typedef {{ id: string, capacity: number, x: number, y: number, seats: (string | null)[] }} Table */
  /** @type {Table[]} */
  const tables = result.tables.map((/** @type {Table} */ t) => ({ ...t, y: -t.y }));
  const dist = (/** @type {Table} */ a, /** @type {Table} */ b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dmin = Math.min(...tables.flatMap((a, i) => tables.slice(i + 1).map((b) => dist(a, b))));
  const [minX, maxX] = [Math.min(...tables.map((t) => t.x)), Math.max(...tables.map((t) => t.x))];
  const [minY, maxY] = [Math.min(...tables.map((t) => t.y)), Math.max(...tables.map((t) => t.y))];
  const k = Math.min((W - 16) / (maxX - minX + dmin), (H - 12) / (maxY - minY + dmin));
  const D = dmin * k;
  const centre = (/** @type {{ x: number, y: number }} */ t) => [W / 2 + (t.x - (minX + maxX) / 2) * k, H / 2 + (t.y - (minY + maxY) / 2) * k];
  const rSeat = 0.36 * D;
  const mark = Math.min(0.17 * D, (2 * Math.PI * rSeat) / 10 - 1.5);
  /** @returns {import('../seating-swarm.mjs').Point} */
  const seatAt = (/** @type {number[]} */ [ti, j]) => {
    const [cx, cy] = centre(tables[ti]);
    const a = -Math.PI / 2 + (2 * Math.PI * j) / tables[ti].capacity;
    return [cx + rSeat * Math.cos(a), cy + rSeat * Math.sin(a)];
  };

  // The endpoints are actual best/initial table memberships. Rotating seats within a
  // table changes no objective term, and lets guests who stay at a table move too.
  const guests = tables.flatMap(t => t.seats).filter(g => g !== null);
  /** @param {(string|null)[][]} seating @param {number} offset @returns {Map<string, number[]>} */
  const seatsByGuest = (seating, offset) => new Map(seating.flatMap((seats, ti) => seats.flatMap((g, j) => g === null ? [] : [/** @type {[string, number[]]} */ ([g, [ti, (j + offset) % seats.length]])])));
  const startSeats = seatsByGuest(tables.map(t => t.seats), 0);
  const initial = result.trajectory.initial.tables;
  const endSeats = seatsByGuest(initial, 3);
  const starts = guests.map(g => seatAt(/** @type {number[]} */ (startSeats.get(g))));
  const ends = guests.map(g => seatAt(/** @type {number[]} */ (endSeats.get(g))));
  if (starts.some((p, i) => Math.hypot(p[0] - ends[i][0], p[1] - ends[i][1]) < 1)) throw new Error('seating: a guest would remain still');
  const obstacles = tables.map(t => { const [x, y] = centre(t); return { x, y, radius: rSeat - .75 * mark }; });
  const paths = planSwarm(starts, ends, { radius: mark / 2, width: W, height: H, obstacles });
  // Audit the coordinates the SVG will actually interpolate, including its strokes.
  const round = (/** @type {number} */ n) => Number(num(n, 2));
  const origin = starts.map(p => /** @type {import('../seating-swarm.mjs').Point} */ ([round(p[0]), round(p[1])]));
  const rendered = paths.map((path, i) => path.map(p => /** @type {import('../seating-swarm.mjs').Point} */ ([origin[i][0] + round(p[0] - starts[i][0]), origin[i][1] + round(p[1] - starts[i][1])])));
  const renderedObstacles = obstacles.map(o => ({ x: round(o.x), y: round(o.y), radius: round(o.radius) }));
  const radius = round(mark / 2);
  const clearance = validateSwarm(rendered, { radius: radius + .35, width: W, height: H, obstacles: renderedObstacles.map(o => ({ ...o, radius: o.radius + .5 })) });
  return { paths: rendered, starts: origin, ends, obstacles: renderedObstacles, radius, guests, category, range, startSeats, endSeats, initial, tables, clearance };
}

export async function build() {
  const { paths, starts, obstacles, radius, guests, category, range } = await seatingScene();
  const half = 2 * HOLD + MOVE;
  const period = half * 2;
  const cats = [...new Set(category.values())].sort((a, b) => a - b);
  let css = `& .table { fill: var(--surface); stroke: var(--art-line); stroke-width: 1; }
& .guest circle { stroke: var(--art-ink); stroke-opacity: .35; stroke-width: .7; }
& .guest text { font: 700 ${num(radius * 1.24)}px ui-sans-serif, system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; }
`;
  for (const [i, c] of cats.entries()) {
    const light = categoryColour(c, range, 'light'), dark = categoryColour(c, range, 'dark');
    css += `& .c${i} circle { fill: ${light}; } & .c${i} text { fill: ${inkOn(light)}; }
:root[data-theme="dark"] & .c${i} circle { fill: ${dark}; } :root[data-theme="dark"] & .c${i} text { fill: ${inkOn(dark)}; }
`;
  }
  let body = obstacles.map(o => `<circle class="table" cx="${num(o.x, 2)}" cy="${num(o.y, 2)}" r="${num(o.radius, 2)}"/>`).join('');
  let loop = '';
  for (const [i, guest] of guests.entries()) {
    const [x0, y0] = starts[i];
    const c = /** @type {number} */ (category.get(guest));
    body += `<g transform="translate(${num(x0, 2)} ${num(y0, 2)})"><g class="guest c${cats.indexOf(c)} m${i}" data-guest="${esc(guest)}"><circle r="${num(radius, 2)}"/><text>${esc(categoryText(c))}</text></g></g>`;
    const stops = paths[i].map(([x, y], frame) => {
      // Inverse cosine spacing eases the whole shared timeline, keeping every segment
      // synchronized and the continuous separation proof valid.
      const progress = frame / (paths[i].length - 1);
      const t = HOLD + MOVE * Math.acos(1 - 2 * progress) / Math.PI;
      return `${num(100 * t / half, 6)}% { transform: translate(${num(x - x0, 2)}px, ${num(y - y0, 2)}px); }`;
    });
    const end = /** @type {import('../seating-swarm.mjs').Point} */ (paths[i].at(-1));
    loop += `& .m${i} { animation: seating-m${i} ${num(half, 3)}s linear alternate infinite; }
@keyframes seating-m${i} { 0% { transform: none; } ${stops.join(' ')} 100% { transform: translate(${num(end[0] - x0, 2)}px, ${num(end[1] - y0, 2)}px); } }
`;
  }
  return art({ name: 'seating', period, width: W, height: H, body, css, loop });
}
