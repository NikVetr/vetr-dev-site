// Five actual event rounds from the shared room example. The camera reveals one
// table, four tables, then the full fifty-table room. Routes are presentation only;
// the planner's travel terms continue to use the real table-center distances.
import { readFileSync, writeFileSync } from 'node:fs';
import { planRounds } from '../../../seating/core/index.js';
import { roundCategoryColours } from '../../../seating/core/rounds-chart.js';
import { TALL, art, num } from '../svg.mjs';
import { planSwarm, softenSwarm, validateSwarm } from '../seating-swarm.mjs';
const { width: W, height: H } = TALL;
const TOP = 26;
/** Choose the stronger black/white text contrast for each category fill. */
function inkOn(/** @type {string} */ hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}


/** Derive every displayed seat directly from each planned round, with no seat rotation.
 * @param {ReturnType<typeof planRounds>} result @param {{id:string}[]} guests
 */
export function roomGeometry(result, guests) {
  const tables = result.rounds[0].tables;
  const xs = tables.map(t => t.x), ys = tables.map(t => t.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spacing = Math.min(...tables.flatMap((a, i) => tables.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y))));
  const scale = Math.min((W - 12) / (maxX - minX + spacing), (H - TOP - 10) / (maxY - minY + spacing));
  const distance = spacing * scale, seatRadius = .36 * distance, radius = Number(num(.085 * distance, 2));
  const round = (/** @type {number} */ value) => Number(num(value, 2));
  const centre = (/** @type {{x:number,y:number}} */ t) => /** @type {import('../seating-swarm.mjs').Point} */ ([round(W / 2 + (t.x - (minX + maxX) / 2) * scale), round(TOP + (H - TOP) / 2 + (t.y - (minY + maxY) / 2) * scale)]);
  const obstacles = tables.map(t => { const [x, y] = centre(t); return { x, y, radius: round(.2 * distance) }; });
  const rounds = result.rounds.map(r => {
    /** @type {Map<string,import('../seating-swarm.mjs').Point>} */ const seats = new Map();
    for (const table of r.tables) {
      const [cx, cy] = centre(table);
      table.seats.forEach((guest, j) => {
        if (guest !== null) seats.set(guest, [round(cx + seatRadius * Math.cos(-Math.PI / 2 + 2 * Math.PI * j / table.capacity)), round(cy + seatRadius * Math.sin(-Math.PI / 2 + 2 * Math.PI * j / table.capacity))]);
      });
    }
    return guests.map(g => {
      const point = seats.get(g.id);
      if (!point) throw new Error(`seating: round ${r.round} has no seat for ${g.id}`);
      return point;
    });
  });
  const focus = obstacles[22], neighbor = obstacles[28];
  return { rounds, radius, obstacles, camera: { close: { x: focus.x, y: focus.y, scale: 9, height: 240 }, four: { x: (focus.x + neighbor.x) / 2, y: (focus.y + neighbor.y) / 2, scale: 3.2, height: 172 }, full: { x: W / 2, y: TOP + (H - TOP) / 2, scale: 1, height: H - TOP } } };
}

export async function seatingScene() {
  const request = JSON.parse(readFileSync(new URL('../../../seating/examples/rounds-room.json', import.meta.url), 'utf8'));
  const result = planRounds(request);
  if (result.rounds.length !== 5 || result.rounds[0].tables.length !== 50 || request.guests.length !== 300) throw new Error('Seating camera expects the shared 300-guest, 50-table, five-round example');
  const geometry = roomGeometry(result, request.guests);
  const options = { radius: geometry.radius, width: W, height: H, obstacles: geometry.obstacles };
  const routes = geometry.rounds.slice(1).map((ends, i) => {
    const route = planSwarm(geometry.rounds[i], ends, options);
    console.log(`seating round ${i + 1} → ${i + 2}: ${route.priorityRetries} routing priority retries`);
    return route;
  });
  // Remove unused waiting time after everybody has arrived. All routes retain one
  // common timeline, then every segment is split in two without changing its path.
  let last = 1;
  for (const route of routes) for (const path of route.paths) for (let i = 1; i < path.length; i++) if (path[i][0] !== path[i - 1][0] || path[i][1] !== path[i - 1][1]) last = Math.max(last, i);
  const round = (/** @type {number} */ value) => Number(num(value, 2));
  const motion = routes.map(route => {
    const soft = softenSwarm(route.paths.map(path => path.slice(0, last + 1)), options);
    const paths = soft.map(path => path.flatMap((p, i) => i ? [/** @type {import('../seating-swarm.mjs').Point} */ ([(p[0] + path[i - 1][0]) / 2, (p[1] + path[i - 1][1]) / 2]), p] : [p]).map(p => /** @type {import('../seating-swarm.mjs').Point} */ (p.map(round))));
    const clearance = validateSwarm(paths, { ...options, radius: geometry.radius + .2, obstacles: geometry.obstacles.map(o => ({ ...o, radius: o.radius + .25 })) });
    return { paths, clearance, priorityRetries: route.priorityRetries };
  });
  return { request, result, geometry, motion };
}

export async function build() {
  const { request, result, geometry, motion } = await seatingScene();
  const categories = request.guests.map((/** @type {{category:number}} */ g) => g.category);
  const codes = [...new Set(categories)].sort((a, b) => a - b);
  const lightColours = roundCategoryColours(categories), darkColours = roundCategoryColours(categories, 'dark');
  const guests = request.guests.map((/** @type {{id:string,category:number,fixedSeat?:boolean}} */ g) => {
    const light = /** @type {string} */ (lightColours.get(g.category)), dark = /** @type {string} */ (darkColours.get(g.category));
    return { id: g.id, name: g.id.split(' ')[0], category: g.category, fixed: !!g.fixedSeat, light, dark, inkLight: inkOn(light), inkDark: inkOn(dark) };
  });
  const samples = motion[0].paths[0].length;
  const transitions = motion.map(({ paths }) => encodeRoutes(paths));
  const data = {
    width: W, height: H, radius: geometry.radius, coordinateScale: 100, samples, encoding: 'delta-runs-v1',
    tables: geometry.obstacles.map(o => [o.x, o.y, o.radius]), guests, rounds: geometry.rounds, transitions, camera: geometry.camera,
    provenance: { request: 'seating/examples/rounds-room.json', objective: result.objective, travelMetric: 'table-center Euclidean distance; drawn routes are not objective costs', search: result.search, routing: motion.map(({ clearance, priorityRetries }) => ({ ...clearance, priorityRetries })) },
  };
  writeFileSync(new URL('../../../assets/cards/seating-motion.json', import.meta.url), JSON.stringify(data) + '\n');
  const tables = geometry.obstacles.map(o => `<circle class="table" cx="${o.x}" cy="${o.y}" r="${o.radius}"/>`).join('');
  const final = /** @type {import('../seating-swarm.mjs').Point[]} */ (geometry.rounds.at(-1));
  const dots = guests.map((/** @type {typeof guests[number]} */ g, /** @type {number} */ i) => `<circle class="guest c${g.category}${g.fixed ? ' fixed' : ''}" cx="${final[i][0]}" cy="${final[i][1]}" r="${geometry.radius}"/>`).join('');
  const css = codes.map(c => `& .c${c} { fill: ${lightColours.get(c)}; } :root[data-theme="dark"] & .c${c} { fill: ${darkColours.get(c)}; }`).join('\n');
  return art({ name: 'seating', width: W, height: H, period: 28, player: 'seating',
    body: `<g class="player-still"><text class="heading" x="8" y="16">50 tables · 5 rounds</text>${tables}${dots}</g><rect class="seating-clock" width="0" height="0"/>`,
    css: `& .heading { fill: var(--art-ink); font: 600 11px system-ui, sans-serif; }\n& .table { fill: var(--surface); stroke: var(--art-line); stroke-width: .5; }\n& .guest { stroke: var(--art-ink); stroke-width: .3; }\n& .fixed { stroke-width: .4; }\n${css}`,
    loop: '& .seating-clock { animation: seating-clock 28s linear infinite; }\n@keyframes seating-clock { from { opacity: .99; } to { opacity: 1; } }',
  });
}

/** Lossless integer deltas and repeated-position runs keep the routed asset small.
 * @param {import('../seating-swarm.mjs').Point[][]} paths
 */
export function encodeRoutes(paths) {
  /** @type {number[]} */ const bytes = [];
  const put = (/** @type {number} */ value) => { while (value >= 128) { bytes.push((value & 127) | 128); value >>>= 7; } bytes.push(value); };
  const signed = (/** @type {number} */ value) => value < 0 ? -2 * value - 1 : 2 * value;
  for (const path of paths) {
    const points = path.map(p => p.map(value => Math.round(value * 100)));
    put(points[0][0]); put(points[0][1]);
    for (let i = 1; i < points.length;) {
      const dx = points[i][0] - points[i - 1][0], dy = points[i][1] - points[i - 1][1];
      if (dx === 0 && dy === 0) {
        let count = 1;
        while (i + count < points.length && points[i + count][0] === points[i][0] && points[i + count][1] === points[i][1]) count++;
        put(0); put(count); i += count;
      } else { put(signed(dx) + 1); put(signed(dy)); i++; }
    }
  }
  return Buffer.from(bytes).toString('base64');
}
