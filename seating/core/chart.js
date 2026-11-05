// SVG drawings, with no DOM: the seating chart (round tables, a mark per seat) and the score
// over iterations. The page draws each state of its replay with renderSeating() and moves the
// guest marks between seats itself; renderSeatingSvg() and renderTraceSvg() draw a result
// whole, for downloads and the command line.

/**
 * @typedef {'light' | 'dark'} Theme
 * @typedef {'room' | 'rows'} Arrangement
 * @typedef {{ x: number, y: number, angle: number }} Seat a mark's centre and its outward direction
 * @typedef {{ cx: number, cy: number, rTop: number, rSeat: number, seats: Seat[] }} TableGeometry
 * @typedef {{ width: number, height: number, D: number, mark: number, font: number, tableFont: number,
 *   tables: TableGeometry[], lines: Map<string, string[]> }} Geometry
 * @typedef {{ id: string, seats: (string | null)[], score?: number }} ViewTable
 * @typedef {{ tables: ViewTable[], categories: Map<string, number>, broken?: Set<string>,
 *   active?: number[] }} View
 *   A seating to draw: each table's seats in order (null for an empty seat), each guest's
 *   category, the guests in a broken constraint and the tables of the move being shown.
 */

const BLUE = { 100: '#cde2fb', 150: '#b7d3f6', 200: '#9ec5f4', 250: '#86b6ef', 300: '#6da7ec', 350: '#5598e7', 400: '#3987e5', 450: '#2a78d6', 500: '#256abf', 550: '#1c5cab', 600: '#184f95', 700: '#0d366b' };

/** Colours for each theme: the site's tokens, and the dataviz blue ramp for categories (low to high). */
export const CHART_THEMES = {
  light: {
    surface: '#ffffff', table: '#f5f6f8', ink: '#1b1b1b', muted: '#5a5a5a', border: '#c9ccd2', alert: '#b3261e',
    current: BLUE[450], grid: '#e3e3e3',
    ramp: [BLUE[250], BLUE[350], BLUE[450], BLUE[550], BLUE[700]],
  },
  dark: {
    surface: '#16181d', table: '#1e2128', ink: '#e8e8e8', muted: '#a9a9a9', border: '#4a505b', alert: '#ff8a80',
    current: BLUE[400], grid: '#30343c',
    ramp: [BLUE[600], BLUE[500], BLUE[400], BLUE[300], BLUE[200], BLUE[100]],
  },
};

const FONT = 'ui-sans-serif, system-ui, -apple-system, &quot;Segoe UI&quot;, Roboto, Arial, sans-serif';
const MAX_FONT = 13;

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (/** @type {number} */ x) => Math.round(x * 100) / 100;

/**
 * Width of a text in ems, by a generous estimate (0.62 em a character, 1 em for wide
 * East Asian characters), so text sized by it always fits.
 * @param {string} s
 */
export function textEms(s) {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u.test(ch) ? 1 : 0.62;
  return w;
}

/** A name split at the space nearest its middle, or null if it has none. @param {string} s */
function splitName(s) {
  const spaces = [...s.matchAll(/ /g)].map((m) => /** @type {number} */ (m.index));
  if (!spaces.length) return null;
  const mid = s.length / 2;
  const at = spaces.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  return [s.slice(0, at), s.slice(at + 1)];
}

/**
 * Where everything goes in a chart `width` px wide. 'room' places tables at their x, y (y up,
 * as in R's chart); 'rows' puts them in reading order, as many to a row as fit. Every table
 * gets a disc of the same diameter D for its seats and labels, so no two tables' labels
 * meet. Guest names share one font size, the largest at which every name fits at every
 * table (guests move between tables), on one line or, if that is too small, two.
 * @param {{ x: number, y: number, capacity: number }[]} tables
 * @param {string[]} names
 * @param {{ width: number, arrangement?: Arrangement }} options
 * @returns {Geometry}
 */
export function seatingGeometry(tables, names, { width, arrangement = 'room' }) {
  const T = tables.length;
  /** @type {[number, number][]} */
  let centres;
  /** @type {number} */
  let D;
  /** @type {number} */
  let height;
  if (arrangement === 'rows') {
    // as wide a disc as 12 px names need (two lines where that is shorter), no wider
    const ems = names.map((n) => {
      const parts = splitName(n);
      return parts ? Math.min(textEms(n), Math.max(textEms(parts[0]), textEms(parts[1]))) : textEms(n);
    });
    const needed = (24 + 14 + 2 * MAX_FONT * Math.max(3, ...ems)) / 0.6;
    const cols = Math.max(1, Math.min(T, Math.floor(width / needed)));
    D = Math.min(width / cols, 420, 1.15 * needed);
    const left = (width - cols * D) / 2;
    centres = tables.map((_, t) => [left + D * ((t % cols) + 0.5), D * (Math.floor(t / cols) + 0.5)]);
    height = Math.ceil(T / cols) * D;
  } else {
    let dmin = Infinity;
    for (let i = 0; i < T; i++) {
      for (let j = i + 1; j < T; j++) dmin = Math.min(dmin, Math.hypot(tables[i].x - tables[j].x, tables[i].y - tables[j].y));
    }
    if (!(dmin > 0)) dmin = 1;
    const xs = tables.map((t) => t.x);
    const ys = tables.map((t) => t.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(width / (maxX - minX + dmin), 420 / dmin);
    D = dmin * k;
    const left = (width - (maxX - minX + dmin) * k) / 2;
    centres = tables.map((t) => [left + (t.x - minX) * k + D / 2, (maxY - t.y) * k + D / 2]);
    height = (maxY - minY + dmin) * k;
  }

  // Marks small enough that a table's seats fit within 0.3 D of its centre.
  const sinStep = (/** @type {number} */ s) => (s >= 3 ? Math.sin(Math.PI / s) : 1);
  const mark = Math.min(Math.max(12, Math.min(24, 0.085 * D)), ...tables.map((t) => (0.3 * D * sinStep(t.capacity)) / 0.62));
  const gap = 3;
  const geo = tables.map((t, i) => {
    const s = t.capacity;
    const rSeat = Math.max(0.2 * D, s >= 3 ? (0.62 * mark) / sinStep(s) : 0);
    const seats = Array.from({ length: s }, (_, j) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * j) / s;
      return { x: centres[i][0] + rSeat * Math.cos(angle), y: centres[i][1] + rSeat * Math.sin(angle), angle };
    });
    return { cx: centres[i][0], cy: centres[i][1], rTop: rSeat - 0.75 * mark, rSeat, seats };
  });

  // Room for labels: radially out to the edge of the table's disc, and between neighbours.
  const inner = geo.map((t) => t.rSeat + mark / 2 + gap);
  const L = Math.min(...inner.map((r) => D / 2 - 4 - r));
  const H = Math.min(...geo.map((t, i) => (t.seats.length >= 2 ? 2 * inner[i] * Math.sin(Math.PI / t.seats.length) : 2 * inner[i])));
  const oneLine = (/** @type {string} */ name) => Math.min(L / textEms(name), H / 1.25);
  const fits = names.map((name) => {
    const parts = splitName(name);
    const two = parts ? Math.min(L / Math.max(textEms(parts[0]), textEms(parts[1])), H / 2.5) : 0;
    return Math.max(oneLine(name), two);
  });
  const font = Math.max(1, Math.min(MAX_FONT, ...fits));
  const lines = new Map(names.map((name) => [name, oneLine(name) >= font ? [name] : /** @type {string[]} */ (splitName(name))]));
  const tableFont = Math.max(1, Math.min(MAX_FONT, ...geo.map((t) => 0.5 * t.rTop)));
  return { width, height, D, mark, font, tableFont, tables: geo, lines };
}

/**
 * A category's colour: its value's place between the lowest and highest category, snapped to
 * the theme's ramp.
 * @param {number} value @param {[number, number]} range @param {Theme} theme
 */
export function categoryColour(value, [lo, hi], theme) {
  const ramp = CHART_THEMES[theme].ramp;
  const u = hi > lo ? (value - lo) / (hi - lo) : 0.5;
  return ramp[Math.round(u * (ramp.length - 1))];
}

/** Ink that reads on a fill: white on dark fills, near black on light ones. @param {string} hex */
function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.25 ? '#0b0b0b' : '#ffffff';
}

/** A category value short enough for its mark (the legend shows it in full). @param {number} v */
export function categoryText(v) {
  const s = String(v);
  return s.length <= 4 ? s : String(Number(v.toPrecision(3)));
}

/** @param {Iterable<number>} values */
const rangeOf = (values) => {
  const v = [...values];
  return /** @type {[number, number]} */ (v.length ? [Math.min(...v), Math.max(...v)] : [0, 0]);
};

/**
 * One guest's mark at a seat: a disc in the category's colour with the category inside, a
 * dashed ring if the guest is in a broken constraint, and the name pointing away from the
 * table. The label's rotation is the only part that depends on the seat's angle.
 * @param {string} id @param {Seat} seat @param {Geometry} geo @param {View} view @param {Theme} theme
 */
export function guestMark(id, seat, geo, view, theme) {
  const c = CHART_THEMES[theme];
  const cat = view.categories.get(id);
  const r = geo.mark / 2;
  const fill = cat === undefined ? c.muted : categoryColour(cat, rangeOf(view.categories.values()), theme);
  let out = `<g class="guest" data-guest="${esc(id)}" transform="translate(${r2(seat.x)} ${r2(seat.y)})">`;
  out += `<circle r="${r2(r)}" fill="${fill}" stroke="${c.ink}" stroke-opacity="0.35"/>`;
  if (cat !== undefined) {
    const t = categoryText(cat);
    const size = Math.min(0.62 * geo.mark, (1.5 * r) / textEms(t));
    out += `<text font-size="${r2(size)}" font-weight="700" fill="${inkOn(fill)}" text-anchor="middle" dominant-baseline="central">${esc(t)}</text>`;
  }
  if (view.broken?.has(id)) out += `<circle r="${r2(r + 3)}" fill="none" stroke="${c.alert}" stroke-width="2" stroke-dasharray="3 2"/>`;
  out += `${labelMarkup(id, seat.angle, geo, c.ink)}</g>`;
  return out;
}

/**
 * The name, radial: rotated to the seat's direction and anchored at the mark's edge, flipped
 * on the left half so it never reads upside down.
 * @param {string} id @param {number} angle @param {Geometry} geo @param {string} ink
 */
export function labelMarkup(id, angle, geo, ink) {
  const { rotate, anchor, x } = labelPlacement(angle, geo);
  const lines = geo.lines.get(id) ?? [id];
  const spans = lines.length === 1
    ? esc(lines[0])
    : lines.map((l, i) => `<tspan x="${r2(x)}" dy="${i === 0 ? '-0.62em' : '1.24em'}">${esc(l)}</tspan>`).join('');
  return `<g class="label" transform="rotate(${r2(rotate)})"><text x="${r2(x)}" font-size="${r2(geo.font)}" fill="${ink}" text-anchor="${anchor}" dominant-baseline="central">${spans}</text></g>`;
}

/** @param {number} angle radians @param {Geometry} geo */
export function labelPlacement(angle, geo) {
  const deg = (angle * 180) / Math.PI;
  const right = Math.cos(angle) >= -1e-9;
  const off = geo.mark / 2 + 3;
  return right ? { rotate: deg, anchor: 'start', x: off } : { rotate: deg + 180, anchor: 'end', x: -off };
}

/**
 * Legend entries in rows across the chart: the categories (up to 12, else the lowest and
 * highest), an empty seat, a broken constraint and, while replaying, the move's tables.
 * @param {View} view @param {Geometry} geo @param {Theme} theme @param {boolean} replay
 */
function legend(view, geo, theme, replay) {
  const c = CHART_THEMES[theme];
  const size = 12;
  const r = 7;
  const range = rangeOf(view.categories.values());
  const cats = [...new Set(view.categories.values())].sort((a, b) => a - b);
  const last = cats[cats.length - 1];
  const shown = cats.length <= 12 ? cats : [cats[0], last];
  /** @type {{ draw: string, label: string }[]} */
  const items = shown.map((v) => {
    const fill = categoryColour(v, range, theme);
    const t = categoryText(v);
    return { draw: `<circle r="${r}" fill="${fill}" stroke="${c.ink}" stroke-opacity="0.35"/><text font-size="${r2(Math.min(8.5, 10 / textEms(t)))}" font-weight="700" fill="${inkOn(fill)}" text-anchor="middle" dominant-baseline="central">${esc(t)}</text>`, label: `${cats.length > 12 && v === last ? '… ' : ''}${String(v)}` };
  });
  const head = cats.length ? 'Category' : '';
  items.push({ draw: `<circle r="${r}" fill="none" stroke="${c.muted}" stroke-dasharray="2 2"/>`, label: 'empty seat' });
  items.push({ draw: `<circle r="${r - 2}" fill="${c.muted}"/><circle r="${r + 1}" fill="none" stroke="${c.alert}" stroke-width="2" stroke-dasharray="3 2"/>`, label: 'in a broken constraint' });
  if (replay) items.push({ draw: `<circle r="${r}" fill="${c.table}" stroke="${c.ink}" stroke-width="2.5"/><circle r="${r - 3.5}" fill="none" stroke="${c.ink}" stroke-dasharray="2 1.5"/>`, label: 'table in this move' });
  const rowH = 22;
  let x = 0;
  let y = rowH / 2;
  let out = '';
  if (head) {
    out += `<text x="0" y="${y}" font-size="${size}" font-weight="600" fill="${c.muted}" dominant-baseline="central">${head}</text>`;
    x = textEms(head) * size + 8;
  }
  for (const item of items) {
    const w = 2 * r + 5 + textEms(item.label) * size + 14;
    if (x > 0 && x + w > geo.width) {
      x = 0;
      y += rowH;
    }
    out += `<g transform="translate(${r2(x + r + 1)} ${y})">${item.draw}<text x="${r + 5}" font-size="${size}" fill="${c.ink}" dominant-baseline="central">${esc(item.label)}</text></g>`;
    x += w;
  }
  return { markup: out, height: y + rowH / 2 + 8 };
}

/**
 * The chart of one seating. Guest marks are children of the <g class="room"> group, in the
 * geometry's coordinates, so the page can move them.
 * @param {Geometry} geo @param {View} view
 * @param {{ theme?: Theme, replay?: boolean, title?: string }} [options]
 */
export function renderSeating(geo, view, { theme = 'light', replay = false, title = 'Seating chart' } = {}) {
  const c = CHART_THEMES[theme];
  const lg = legend(view, geo, theme, replay);
  const height = Math.ceil(lg.height + geo.height);
  let room = '';
  view.tables.forEach((table, t) => {
    const g = geo.tables[t];
    const active = view.active?.includes(t);
    room += `<g class="table" data-table="${t}">`;
    room += `<circle cx="${r2(g.cx)}" cy="${r2(g.cy)}" r="${r2(g.rTop)}" fill="${c.table}" stroke="${active ? c.ink : c.border}" stroke-width="${active ? 2.5 : 1}"/>`;
    if (active) room += `<circle cx="${r2(g.cx)}" cy="${r2(g.cy)}" r="${r2(g.rTop - 4)}" fill="none" stroke="${c.ink}" stroke-dasharray="4 3"/>`;
    const f = geo.tableFont;
    const name = tableLabel(table.id);
    const nameSize = Math.min(f, (1.7 * g.rTop) / textEms(name));
    const scoreText = table.score === undefined ? '' : formatScore(table.score);
    const scoreSize = scoreText ? Math.min(0.85 * f, (1.7 * g.rTop) / textEms(scoreText)) : 0;
    room += `<text x="${r2(g.cx)}" y="${r2(g.cy - (scoreText ? 0.55 * nameSize : 0))}" font-size="${r2(nameSize)}" font-weight="700" fill="${c.ink}" text-anchor="middle" dominant-baseline="central">${esc(name)}</text>`;
    if (scoreText) room += `<text class="table-score" x="${r2(g.cx)}" y="${r2(g.cy + 0.7 * nameSize)}" font-size="${r2(scoreSize)}" fill="${c.muted}" text-anchor="middle" dominant-baseline="central">${esc(scoreText)}</text>`;
    table.seats.forEach((id, j) => {
      if (id === null) room += `<circle class="empty" cx="${r2(g.seats[j].x)}" cy="${r2(g.seats[j].y)}" r="${r2(geo.mark / 2)}" fill="none" stroke="${c.muted}" stroke-dasharray="2 2"/>`;
    });
    room += '</g>';
  });
  const guests = view.tables.flatMap((table, t) => table.seats.map((id, j) => (id === null ? '' : guestMark(id, geo.tables[t].seats[j], geo, view, theme)))).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(geo.width)} ${height}" width="${r2(geo.width)}" height="${height}" font-family="${FONT}" role="img" aria-label="${esc(title)}">`
    + `<rect width="100%" height="100%" fill="${c.surface}"/><g class="legend">${lg.markup}</g>`
    + `<g class="room" transform="translate(0 ${r2(lg.height)})">${room}<g class="guests">${guests}</g></g></svg>`;
}

/** A table's name as charts show it: "Table 2" for a bare number, otherwise its id. @param {string} id */
export const tableLabel = (id) => (/^\d+$/.test(id) ? `Table ${id}` : id);

/** @param {number} x */
export function formatScore(x) {
  const v = Math.abs(x) < 0.005 ? 0 : x;
  return v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 }).replace('-', '−');
}

/**
 * The best seating of a result as SVG, for downloads and the command line.
 * @param {import('./index.js').Result} result @param {any} request the request it answers (for categories)
 * @param {{ width?: number, theme?: Theme, arrangement?: Arrangement }} [options]
 */
export function renderSeatingSvg(result, request, { width = 720, theme = 'light', arrangement = 'room' } = {}) {
  const categories = new Map(/** @type {any[]} */ (request.guests).flatMap((g) => (typeof g.category === 'number' ? [[g.id, g.category]] : [])));
  const names = request.guests.map((/** @type {any} */ g) => g.id);
  const geo = seatingGeometry(result.tables, names, { width, arrangement });
  const broken = new Set([...result.violations.together, ...result.violations.apart].flat().filter((id) => id !== null));
  return renderSeating(geo, { tables: result.tables, categories, broken: /** @type {Set<string>} */ (broken) }, { theme, title: `Best seating, score ${formatScore(result.score)}` });
}

// ---------- score over iterations ----------

/**
 * The current score and the best so far, as step functions over iterations: from the
 * recorded moves when there are any (every accepted move), otherwise the trace.
 * @param {import('./index.js').Result} result
 */
export function scoreSteps(result) {
  const t = result.trajectory;
  if (t && t.record === 'moves') {
    const moves = /** @type {import('./search.js').Move[]} */ (t.moves);
    return {
      iteration: [0, ...moves.map((m) => m.iteration)],
      score: [t.initial.score, ...moves.map((m) => m.score)],
      best: [t.initial.score, ...moves.map((m) => m.best)],
    };
  }
  return { iteration: result.trace.iteration, score: result.trace.score, best: result.trace.best };
}

/** About `count` round tick values covering [lo, hi]. @param {number} lo @param {number} hi */
export function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

/**
 * Score against iteration. axis 'late' fits the y-axis to the last 80% of iterations, as
 * the R version's trace does, and notes how far below it the opening climb starts; 'all'
 * fits every score. cursor marks an iteration (the state on view in the page); the root's
 * data-plot-* and data-lo/hi attributes give the scales, so the page can move it.
 * @param {import('./index.js').Result} result
 * @param {{ width?: number, height?: number, theme?: Theme, axis?: 'late' | 'all', cursor?: number }} [options]
 */
export function renderTraceSvg(result, { width = 720, height = 260, theme = 'light', axis = 'late', cursor } = {}) {
  const c = CHART_THEMES[theme];
  const steps = scoreSteps(result);
  const N = Math.max(1, result.search.iterations);
  const m = { left: 64, right: 14, top: width < 480 ? 44 : 30, bottom: 38 };
  const pw = width - m.left - m.right;
  const ph = height - m.top - m.bottom;
  const from = axis === 'late' ? 0.2 * N : 0;
  /** @type {number[]} */
  const shown = [];
  steps.iteration.forEach((_, i) => {
    const next = steps.iteration[i + 1] ?? Infinity;
    if (next > from) shown.push(steps.score[i], steps.best[i]);
  });
  let [lo, hi] = rangeOf(shown);
  const pad = (hi - lo) * 0.06 || Math.max(1, Math.abs(hi) * 0.05);
  lo -= pad;
  hi += pad;
  const x = (/** @type {number} */ it) => m.left + (it / N) * pw;
  const y = (/** @type {number} */ v) => m.top + ((hi - v) / (hi - lo)) * ph;
  const path = (/** @type {number[]} */ vals) => {
    let d = `M${r2(x(0))} ${r2(y(vals[0]))}`;
    for (let i = 1; i < vals.length; i++) d += `H${r2(x(steps.iteration[i]))}V${r2(y(vals[i]))}`;
    return `${d}H${r2(x(N))}`;
  };
  const fs = 11.5;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT}" role="img" aria-label="Score against iteration" data-plot-left="${m.left}" data-plot-width="${pw}" data-plot-top="${m.top}" data-plot-height="${ph}" data-lo="${lo}" data-hi="${hi}" data-iterations="${N}">`;
  out += `<rect width="100%" height="100%" fill="${c.surface}"/>`;
  out += `<defs><clipPath id="trace-clip"><rect x="${m.left}" y="${m.top}" width="${pw}" height="${ph}"/></clipPath></defs>`;
  for (const v of niceTicks(lo, hi)) {
    out += `<line x1="${m.left}" x2="${m.left + pw}" y1="${r2(y(v))}" y2="${r2(y(v))}" stroke="${c.grid}"/>`;
    out += `<text x="${m.left - 6}" y="${r2(y(v))}" font-size="${fs}" fill="${c.muted}" text-anchor="end" dominant-baseline="central">${esc(formatScore(v))}</text>`;
  }
  for (const v of niceTicks(0, N, Math.max(2, Math.floor(pw / 90)))) {
    out += `<line x1="${r2(x(v))}" x2="${r2(x(v))}" y1="${m.top + ph}" y2="${m.top + ph + 4}" stroke="${c.muted}"/>`;
    out += `<text x="${r2(x(v))}" y="${m.top + ph + 15}" font-size="${fs}" fill="${c.muted}" text-anchor="middle">${v.toLocaleString('en-US')}</text>`;
  }
  out += `<line x1="${m.left}" x2="${m.left + pw}" y1="${m.top + ph}" y2="${m.top + ph}" stroke="${c.muted}"/>`;
  out += `<text x="${m.left + pw / 2}" y="${height - 6}" font-size="${fs}" fill="${c.muted}" text-anchor="middle">Iteration</text>`;
  out += `<text transform="translate(13 ${m.top + ph / 2}) rotate(-90)" font-size="${fs}" fill="${c.muted}" text-anchor="middle">Score</text>`;
  // best so far beneath, so the current score (never above it) shows where they meet
  out += `<g clip-path="url(#trace-clip)"><path d="${path(steps.best)}" fill="none" stroke="${c.ink}" stroke-width="2" stroke-dasharray="6 3"/>`;
  out += `<path d="${path(steps.score)}" fill="none" stroke="${c.current}" stroke-width="2"/></g>`;
  // legend above the plot, and a note when the opening climb is below the axis
  out += `<g transform="translate(${m.left} 12)"><line x1="0" x2="22" y1="0" y2="0" stroke="${c.current}" stroke-width="2"/><text x="28" y="0" font-size="${fs}" fill="${c.ink}" dominant-baseline="central">current</text>`;
  out += `<line x1="${28 + 5.5 * fs}" x2="${50 + 5.5 * fs}" y1="0" y2="0" stroke="${c.ink}" stroke-width="2" stroke-dasharray="6 3"/><text x="${56 + 5.5 * fs}" y="0" font-size="${fs}" fill="${c.ink}" dominant-baseline="central">best so far</text></g>`;
  const below = steps.score.filter((v) => v < lo);
  if (below.length) {
    const note = `▼ starts below the axis, at ${formatScore(Math.min(...below))}`;
    const legendWidth = 56 + 12.5 * fs;
    const besideLegend = textEms(note) * fs <= width - m.left - m.right - legendWidth - 12;
    const size = r2(Math.min(fs, (width - m.left - m.right) / textEms(note)));
    out += besideLegend
      ? `<text x="${width - m.right}" y="12" font-size="${fs}" fill="${c.muted}" text-anchor="end" dominant-baseline="central">${esc(note)}</text>`
      : `<text x="${m.left}" y="${m.top - 2}" font-size="${size}" fill="${c.muted}">${esc(note)}</text>`;
  }
  if (cursor !== undefined) {
    let i = 0;
    while (i + 1 < steps.iteration.length && steps.iteration[i + 1] <= cursor) i++;
    const v = steps.score[i];
    // the current score's dot, or a ▼ at the bottom edge while it is below the axis
    out += `<g class="cursor" transform="translate(${r2(x(cursor))} 0)"><line y1="${m.top}" y2="${m.top + ph}" stroke="${c.muted}" stroke-dasharray="2 2"/>`;
    out += `<path class="cursor-below" d="M-5 ${m.top + ph - 8}h10l-5 7z" fill="${c.current}" visibility="${v < lo ? 'visible' : 'hidden'}"/>`;
    out += `<circle class="cursor-dot" cy="${r2(v < lo ? m.top + ph : y(v))}" r="4.5" fill="${c.current}" stroke="${c.surface}" stroke-width="2" visibility="${v < lo ? 'hidden' : 'visible'}"/></g>`;
  }
  return `${out}</svg>`;
}
