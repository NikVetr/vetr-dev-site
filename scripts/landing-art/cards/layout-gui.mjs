// Multipanel Layout GUI: the page's default 8 × 8 grid with four panels drawn on it by real mouse
// drags in the page, and the R `layout` code the page writes for them (its default renderer,
// with the URL comment unticked). Panels are drawn as the canvas draws them: its pastel colours,
// faint edges and bold labels; a drag shows the blue-edged preview in the next colour.
// The still is the finished layout. The loop clears it (the Clear button) and drags the panels
// out again one by one: the cursor moves smoothly while the preview snaps to the nearest grid
// corner, as the page's snap() rounds it, and each release commits the panel and updates the
// code, ending on the layout it starts from.
import { openPage } from '../browser.mjs';
import { H, W, art, esc, num } from '../svg.mjs';

/** Each drag runs from one grid corner to the opposite one, [row, col], starting in empty space. */
const DRAGS = [[[0, 0], [4, 5]], [[4, 8], [0, 5]], [[8, 0], [4, 3]], [[8, 8], [4, 3]]];

const PERIOD = 6.5;
const CLEAR = 1;     // seconds showing the layout before it is cleared
const FIRST = 1.5;   // when the cursor starts the first drag
const DRAG = 0.65;   // seconds the cursor takes to cross a drag
const HOLD = 0.15;   // seconds between reaching the end and releasing
const TRAVEL = 0.25; // seconds the cursor takes to the next drag's start
const HIDE = 0.35;   // seconds the cursor stays after the last release

/**
 * The corners the preview's end visits while the cursor runs straight from `from` to `to`,
 * rounded to the nearest corner as the page's snap() does: [fraction of the drag, [row, col]].
 * @param {number[]} from
 * @param {number[]} to
 */
function snaps(from, to) {
  const at = (/** @type {number} */ u) => from.map((s, k) => Math.round(s + (to[k] - s) * u));
  const crossings = from.flatMap((s, k) => {
    const n = Math.abs(to[k] - s);
    return Array.from({ length: n }, (_, j) => (j + 0.5) / n);
  });
  const events = [...new Set(crossings)].sort((a, b) => a - b).map((u) => /** @type {[number, number[]]} */ ([u, at(u + 1e-9)]));
  // A preview of no area is the page's invalid one: it is not drawn here.
  return events.filter(([, [r, c]]) => r !== from[0] && c !== from[1]);
}

/**
 * Step keyframes: `values` are [seconds, declaration] from t = 0, each held until the next.
 * @param {string} id
 * @param {[number, string][]} values
 */
function stepFrames(id, values) {
  const stops = values.map(([t, v]) => `${num((100 * t) / PERIOD, 3)}% { ${v} }`).join(' ');
  return `@keyframes ${id} { ${stops} 100% { ${values[0][1]} } }`;
}

export async function build() {
  const { page, errors, close } = await openPage('layout-gui/');
  /** @type {{ code: string, rects: { r0: number, c0: number, r1: number, c1: number }[], colours: string[], labels: string[] }[]} */
  const states = [];
  let rows = 0;
  let cols = 0;
  try {
    await page.uncheck('#incURL');
    rows = Number(await page.inputValue('#rows'));
    cols = Number(await page.inputValue('#cols'));
    const box = await page.locator('#canvas').boundingBox();
    if (!box) throw new Error('layout-gui: no canvas');
    // A corner's position, nudged 8 px into the canvas at its edges (its frame covers the outer
    // few pixels); the page still rounds it to the corner.
    const corner = (/** @type {number[]} */ [r, c]) => [
      Math.min(Math.max(box.x + (c * box.width) / cols, box.x + 8), box.x + box.width - 8),
      Math.min(Math.max(box.y + (r * box.height) / rows, box.y + 8), box.y + box.height - 8),
    ];
    const read = async () => {
      await page.waitForTimeout(250); // the page writes its hash 150 ms after a change
      return page.evaluate(() => ({
        code: /** @type {HTMLTextAreaElement} */ (document.getElementById('coderenderer')).value,
        hash: location.hash,
        colours: [...document.querySelectorAll('#legendList .swatch')].map((e) => getComputedStyle(e).backgroundColor),
        labels: [...document.querySelectorAll('#legendList .legend-name')].map((e) => e.textContent ?? ''),
      }));
    };
    const parse = (/** @type {string} */ hash) => {
      const part = hash.slice(1).split('|')[1] ?? '';
      return part ? part.split(';').map((s) => { const [r0, c0, r1, c1] = [...s].map((d) => parseInt(d, 36)); return { r0, c0, r1, c1 }; }) : [];
    };
    for (let i = 0; i <= DRAGS.length; i++) {
      const s = await read();
      states.push({ code: s.code, rects: parse(s.hash), colours: s.colours, labels: s.labels });
      if (i === DRAGS.length) break;
      const [from, to] = DRAGS[i];
      await page.mouse.move(...(/** @type {[number, number]} */ (corner(from))));
      await page.mouse.down();
      await page.mouse.move(...(/** @type {[number, number]} */ (corner(to))), { steps: 12 });
      await page.mouse.up();
    }
    if (errors.length) throw new Error(`layout-gui: ${errors.join('; ')}`);
  } finally {
    await close();
  }
  for (const [i, [from, to]] of DRAGS.entries()) {
    const got = states[i + 1].rects[i];
    const want = { r0: Math.min(from[0], to[0]), c0: Math.min(from[1], to[1]), r1: Math.max(from[0], to[0]), c1: Math.max(from[1], to[1]) };
    if (states[i + 1].rects.length !== i + 1 || JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`layout-gui: drag ${i + 1} drew ${JSON.stringify(states[i + 1].rects)}`);
  }
  const final = states.at(-1);
  if (!final) throw new Error('layout-gui: no states');

  // The canvas, square cells, and the code panel beside it.
  const side = 152;
  const cell = side / rows;
  const codeW = 137;
  const gx = (W - side - 10 - codeW) / 2;
  const gy = (H - side) / 2;
  const cx = gx + side + 10;
  const font = 7.2;
  const lead = font * 1.4;
  const xy = (/** @type {number} */ r, /** @type {number} */ c) => [gx + c * cell, gy + r * cell];
  const rect = (/** @type {{ r0: number, c0: number, r1: number, c1: number }} */ R, inset = 0) => {
    const [x, y] = xy(R.r0, R.c0);
    return `x="${num(x + inset)}" y="${num(y + inset)}" width="${num((R.c1 - R.c0) * cell - 2 * inset)}" height="${num((R.r1 - R.r0) * cell - 2 * inset)}"`;
  };

  let grid = '';
  for (let k = 0; k <= cols; k++) grid += `M${num(gx + k * cell)} ${num(gy)}v${num(side)}`;
  for (let k = 0; k <= rows; k++) grid += `M${num(gx)} ${num(gy + k * cell)}h${num(side)}`;

  // Timeline: cleared at CLEAR; drag k starts at start[k], ends at end[k], is released at up[k].
  const start = DRAGS.map((_, k) => FIRST + k * (DRAG + HOLD + TRAVEL));
  const end = start.map((t) => t + DRAG);
  const up = end.map((t) => t + HOLD);
  const hide = up[up.length - 1] + HIDE;
  if (hide > PERIOD - 0.5) throw new Error('layout-gui: the drags do not fit in the period');

  let body = `<rect class="canvas" x="${num(gx)}" y="${num(gy)}" width="${num(side)}" height="${num(side)}"/>
<path class="grid" d="${grid}"/>
`;
  let loop = '';
  const anim = (/** @type {string} */ cls, /** @type {[number, string][]} */ values, timing = 'step-end') => {
    loop += `& .${cls} { animation: layout-gui-${cls} ${PERIOD}s ${timing} infinite; }\n${stepFrames(`layout-gui-${cls}`, values)}\n`;
  };

  // Panels: shown from their release until the Clear.
  for (const [k, R] of final.rects.entries()) {
    const [x, y] = xy(R.r0, R.c0);
    const w = (R.c1 - R.c0) * cell;
    const h = (R.r1 - R.r0) * cell;
    const size = Math.min(16, 0.4 * Math.min(w, h));
    body += `<g class="panel p${k}"><rect ${rect(R, 0.5)} fill="${final.colours[k]}"/><text x="${num(x + w / 2)}" y="${num(y + h / 2)}" font-size="${num(size)}">${esc(final.labels[k])}</text></g>\n`;
    anim(`p${k}`, [[0, 'opacity: 1;'], [CLEAR, 'opacity: 0;'], [up[k], 'opacity: 1;']]);
  }
  // Previews: each snapped corner of each drag, in the colour the panel will take.
  let preview = 0;
  for (const [k, [from, to]] of DRAGS.entries()) {
    const steps = snaps(from, to);
    for (const [j, [u, [r, c]]] of steps.entries()) {
      const R = { r0: Math.min(from[0], r), c0: Math.min(from[1], c), r1: Math.max(from[0], r), c1: Math.max(from[1], c) };
      const shown = start[k] + u * DRAG;
      const gone = j + 1 < steps.length ? start[k] + steps[j + 1][0] * DRAG : up[k];
      body += `<rect class="preview v${preview}" ${rect(R)} fill="${final.colours[k]}"/>`;
      anim(`v${preview}`, [[0, 'opacity: 0;'], [shown, 'opacity: 1;'], [gone, 'opacity: 0;']]);
      preview++;
    }
    const last = steps.at(-1);
    if (!last || last[1][0] !== to[0] || last[1][1] !== to[1]) throw new Error(`layout-gui: drag ${k + 1} does not snap to its end`);
  }
  body += '\n';

  // The code panel: the page's code for each state, shown from that state's release (the cleared
  // grid's from the Clear) until the next.
  body += `<rect class="code-panel" x="${num(cx)}" y="${num(gy)}" width="${num(codeW)}" height="${num(side)}" rx="3"/>\n`;
  for (const [s, { code }] of states.entries()) {
    const lines = code.split('\n');
    const longest = Math.max(...lines.map((l) => l.length));
    if (longest * font * 0.6 > codeW - 8) throw new Error(`layout-gui: code lines of ${longest} characters do not fit`);
    const top = gy + (side - lines.length * lead) / 2 + lead / 2;
    // Leading spaces as no-break spaces, so the indentation survives without xml:space.
    const text = lines.map((l, i) => `<tspan x="${num(cx + 6)}" y="${num(top + i * lead)}">${esc(l).replace(/^ +/, (m) => ' '.repeat(m.length))}</tspan>`).join('');
    body += `<text class="code c${s}">${text}</text>\n`;
    const from = s === 0 ? CLEAR : up[s - 1];
    if (s === states.length - 1) anim(`c${s}`, [[0, 'opacity: 1;'], [CLEAR, 'opacity: 0;'], [up[s - 1], 'opacity: 1;']]);
    else anim(`c${s}`, [[0, 'opacity: 0;'], [from, 'opacity: 1;'], [up[s], 'opacity: 0;']]);
  }

  // The cursor: a crosshair, still between drags, moving at a steady speed along each.
  const at = (/** @type {number[]} */ [r, c]) => xy(r, c);
  const [x0, y0] = at(DRAGS[0][0]);
  /** @type {[number, string][]} */
  const path = [];
  const move = (/** @type {number} */ t, /** @type {number[]} */ p) => {
    const [x, y] = at(p);
    path.push([t, `transform: translate(${num(x - x0)}px, ${num(y - y0)}px);`]);
  };
  move(0, DRAGS[0][0]);
  for (const [k, [from, to]] of DRAGS.entries()) {
    move(start[k], from);
    move(end[k], to);
    if (k + 1 < DRAGS.length) {
      move(up[k], to);
      move(start[k + 1] - 0.05, DRAGS[k + 1][0]);
    }
  }
  move(hide, DRAGS.at(-1)?.[1] ?? [0, 0]);
  // Back to the first start while hidden, so t = period matches t = 0.
  move(PERIOD - 0.01, DRAGS[0][0]);
  body += `<g class="cursor-at" transform="translate(${num(x0)} ${num(y0)})"><g class="cursor"><path class="halo" d="M-5 0h10M0 -5v10"/><path d="M-5 0h10M0 -5v10"/></g></g>\n`;
  loop += `& .cursor-at { animation: layout-gui-cursor-at ${PERIOD}s step-end infinite; }
${stepFrames('layout-gui-cursor-at', [[0, 'opacity: 0;'], [start[0] - 0.25, 'opacity: 1;'], [hide, 'opacity: 0;']])}
& .cursor { animation: layout-gui-cursor ${PERIOD}s linear infinite; }
@keyframes layout-gui-cursor { ${path.map(([t, v]) => `${num((100 * t) / PERIOD, 3)}% { ${v} }`).join(' ')} 100% { transform: none; } }
`;

  return art({
    name: 'layout-gui',
    period: PERIOD,
    body,
    // The canvas's own drawing: pastel panels with a faint dark edge and #222 bold labels in both
    // themes; the drag preview at 60% over the canvas with a blue edge; the crosshair cursor, haloed.
    css: `& .canvas, & .code-panel { fill: var(--surface); stroke: var(--art-line); stroke-width: 1; }
& .grid { fill: none; stroke: var(--art-line); stroke-width: 0.6; }
& .panel rect { stroke: #00000025; stroke-width: 0.8; }
& .panel text { fill: #222; font-weight: 700; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; text-anchor: middle; dominant-baseline: central; }
& .preview { fill-opacity: 0.6; stroke: #3b82f6; stroke-width: 1.2; opacity: 0; }
& .code { fill: var(--art-ink); font: ${num(font)}px ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace; dominant-baseline: central; }
${states.slice(0, -1).map((_, s) => `& .c${s}`).join(', ')} { opacity: 0; }
& .cursor-at { opacity: 0; }
& .cursor path { fill: none; stroke: var(--art-ink); stroke-width: 1.3; stroke-linecap: square; }
& .cursor .halo { stroke: var(--art-paper); stroke-width: 3.3; }`,
    loop,
  });
}
