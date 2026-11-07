// Sankey: the app's fictitious patient-pathways example, laid out and coloured by the app,
// with larger labels for card-scale reading. Keep the exported strands, nodes and labels;
// simplify geometry below a pixel, and omit hairline strand outlines.
// The loop is the page's emphasis, clicking each source in turn: its node and strands stay as they
// are while every other strand fades to the page's 16%, every other node blends towards the
// background as the page's dim-node filter does, and the outlines go. It ends with nothing
// emphasised, the still, as it starts.
import { readFileSync } from 'node:fs';
import { openPage } from '../browser.mjs';
import { H, W, art, num } from '../svg.mjs';

const CANVAS = [900, 500];
const FONT_SIZE = 26;
const NONE = 1.3;            // seconds with nothing emphasised (the still), across the wrap
const EACH = 1.0;            // seconds each source is emphasised
const FADE = 0.15;
const MARGIN = 4;

/** The card's paper colour in each theme, from the landing page's tokens. */
function papers() {
  const css = readFileSync(new URL('../../../style.css', import.meta.url), 'utf8');
  const all = [...css.matchAll(/--art-paper:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1]);
  if (all.length !== 2) throw new Error('sankey: style.css should define --art-paper for light and dark');
  return { light: all[0], dark: all[1] };
}

/**
 * The page's drawing of the patient-pathways example, on each background, and what a click on each source
 * node emphasises.
 * @param {{ light: string, dark: string }} bg
 */
async function readPage(bg) {
  const { page, errors, close } = await openPage('sankey/');
  try {
    if (errors.length) throw new Error(`sankey: the page failed: ${errors.join('; ')}`);
    /** @param {string} colour */
    const draw = (colour) => page.evaluate((/** @type {[number, number, number, string]} */ [w, h, fontSize, bgColour]) => {
      const app = /** @type {any} */ (window).SankeyApp;
      const example = /** @type {any} */ (window).SK.examples.find((/** @type {any} */ e) => e.id === 'pathways');
      app.submit({ type: 'table', text: example.files[example.table], spec: example.importSpec,
        options: example.importOptions, params: example.params, labels: 'above',
        style: { ...example.style, canvasWidth: w, canvasHeight: h, fontSize,
          labelCounts: false, tracePaths: false, bg: bgColour } });
      return /** @type {string} */ (app.exportSvgText());
    }, [CANVAS[0], CANVAS[1], FONT_SIZE, colour]);
    const dark = await draw(bg.dark);
    const light = await draw(bg.light);
    // The sources are the first stage's nodes; a click on each emphasises what highlightSets gives.
    const sources = await page.evaluate(() => /** @type {any} */ (window).SankeyApp.getProject().loc
      .map((/** @type {any} */ l, /** @type {number} */ i) => ({ set: l.set, i })).filter((/** @type {any} */ l) => l.set === 1).map((/** @type {any} */ l) => l.i));
    const emphasis = [];
    for (const id of sources) {
      await page.locator(`#plot .trunk[data-node="${id}"]`).last().click({ force: true });
      emphasis.push(await page.evaluate(() => ({
        flows: [...new Set([...document.querySelectorAll('#plot .ribbon.hl')].map((e) => Number(/** @type {HTMLElement} */ (e).dataset.flow)))],
        nodes: [...new Set([...document.querySelectorAll('#plot .trunk.hl')].map((e) => Number(/** @type {HTMLElement} */ (e).dataset.node)))],
        dimmed: /** @type {Element} */ (document.querySelector('#plot')).classList.contains('dimmed'),
      })));
      await page.keyboard.press('Escape');
    }
    if (emphasis.some((e) => !e.dimmed || !e.flows.length)) throw new Error('sankey: a click did not emphasise its node');
    return { light, dark, emphasis };
  } finally {
    await close();
  }
}

/** Ramer–Douglas–Peucker on an open polyline. @param {number[][]} pts @param {number} eps @returns {number[][]} */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let worst = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = len ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [a, b];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

export async function build() {
  const bg = papers();
  const { light, dark, emphasis } = await readPage(bg);

  // The drawing's frame onto the canvas.
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(light)?.slice(1).map(Number);
  if (!vb) throw new Error('sankey: the export has no viewBox');
  const k = Math.min((W - 2 * MARGIN) / vb[2], (H - 2 * MARGIN) / vb[3]);
  const [ox, oy] = [(W - vb[2] * k) / 2, (H - vb[3] * k) / 2];
  const X = (/** @type {number} */ x) => (x - vb[0]) * k + ox;
  const Y = (/** @type {number} */ y) => (y - vb[1]) * k + oy;
  /** Path data of the export (M/L/Z only) on the canvas, simplified. @param {string} d @param {boolean} [open] */
  const path = (d, open = false) => {
    if (/[^MLZ\d\s.,-]/.test(d)) throw new Error(`sankey: unexpected path commands in ${d.slice(0, 40)}`);
    return d.split('M').filter(Boolean).map((sub) => {
      const closed = sub.trim().endsWith('Z');
      const pts = sub.replace('Z', '').split('L').map((p) => p.trim().split(/[\s,]+/).map(Number)).map(([x, y]) => [X(x), Y(y)]);
      const kept = simplify(closed && !open ? [...pts, pts[0]] : pts, 0.04);
      const out = closed && !open ? kept.slice(0, -1) : kept;
      return `M${out.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}${closed ? 'Z' : ''}`;
    }).join('');
  };
  const all = (/** @type {RegExp} */ re, /** @type {string} */ s = light) => [...s.matchAll(re)];
  const labels = all(/<text class="node-label" data-node="\d+" x="([-\d.]+)" y="([-\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>(.*?)<\/text>/g)
    .map((m) => `<text x="${num(X(Number(m[1])))}" y="${num(Y(Number(m[2])))}" font-size="${num(Number(m[3]) * k)}">${m[4]}</text>`).join('');
  if (!labels) throw new Error('sankey: patient-pathways labels are missing');

  // Gradients: the strands' are the same on both backgrounds, the node bodies' are not.
  /**
   * A horizontal gradient of the export, on the canvas: its x extent and its stops, written
   * compactly. A gradient of one colour is just that colour.
   * @param {string} svg @param {string} id
   * @returns {{ solid: string | null, stops: string, x1: number, x2: number }}
   */
  const gradientOf = (svg, id) => {
    const m = new RegExp(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="([-\\d.]+)" y1="0" x2="([-\\d.]+)" y2="0">(.*?)</linearGradient>`).exec(svg);
    if (!m) throw new Error(`sankey: no gradient ${id}`);
    const stops = [...m[3].matchAll(/<stop offset="([\d.]+)%" stop-color="(#[0-9A-Fa-f]{6})" stop-opacity="([\d.]+)"\/>/g)];
    if (!stops.length) throw new Error(`sankey: gradient ${id} has no stops`);
    const same = stops.every((t) => t[2] === stops[0][2] && t[3] === '1');
    return {
      solid: same ? stops[0][2] : null,
      stops: stops.map((t) => `<stop offset="${num(Number(t[1]) / 100, 4)}" stop-color="${t[2]}"${t[3] === '1' ? '' : ` stop-opacity="${t[3]}"`}/>`).join(''),
      x1: X(Number(m[1])), x2: X(Number(m[2])),
    };
  };
  const gradient = (/** @type {string} */ as, /** @type {ReturnType<typeof gradientOf>} */ g) => `<linearGradient id="sankey-${as}" gradientUnits="userSpaceOnUse" x1="${num(g.x1, 2)}" x2="${num(g.x2, 2)}">${g.stops}</linearGradient>`;
  const strands = all(/<path id="strand-shape(\d+)" d="([^"]+)"\/>/g).map((m) => ({ flow: Number(m[1]), d: path(m[2]) }));
  const darkStrands = all(/<path id="strand-shape(\d+)" d="([^"]+)"\/>/g, dark).map((m) => m[2]);
  if (all(/<path id="strand-shape(\d+)" d="([^"]+)"\/>/g).some((m, i) => m[2] !== darkStrands[i])) throw new Error('sankey: the two backgrounds laid out differently');
  let defs = strands.map((s) => gradient(`gs${s.flow}`, gradientOf(light, `gs${s.flow}`))).join('');
  defs += strands.map((s) => `<path id="sankey-s${s.flow}" d="${s.d}"/>`).join('');

  // Strands, in the page's order.
  const ribbons = all(/<use class="ribbon" data-flow="(\d+)" href="#strand-shape\d+" fill="url\(#gs\d+\)"\/>/g)
    .map((m) => `<use class="rib f${m[1]}" href="#sankey-s${m[1]}" fill="url(#sankey-gs${m[1]})"/>`);
  if (ribbons.length !== strands.length) throw new Error('sankey: not every strand is drawn once');

  // Node bodies: each node's pieces with their gradients, in both themes; its outline, outside
  // the node and its own strands; and a paper-coloured copy that dims it.
  let trunks = '';
  let css = '';
  const nodes = new Map();
  const trunkPattern = /<path class="trunk" data-node="(\d+)" d="([^"]+)" fill="([^"]+)"(?: fill-opacity="([\d.]+)")?\/>/g;
  const darkTrunks = all(trunkPattern, dark);
  for (const [i, m] of all(trunkPattern).entries()) {
    const [id, d, fill] = [Number(m[1]), m[2], m[3]];
    const piece = path(d);
    nodes.set(id, [...(nodes.get(id) ?? []), piece]);
    if (fill.startsWith('#')) {
      if (darkTrunks[i]?.[2] !== d) throw new Error('sankey: solid node geometry differs between themes');
      const themed = fill !== darkTrunks[i][3];
      if (themed) css += `:root[data-theme="dark"] & .body${i} { fill: ${darkTrunks[i][3]}; }\n`;
      trunks += `<path${themed ? ` class="body${i}"` : ''} d="${piece}" fill="${fill}"${m[4] && m[4] !== '1' ? ` fill-opacity="${m[4]}"` : ''}/>`;
      continue;
    }
    const g = /^url\(#(gn[^)]+)\)$/.exec(fill)?.[1];
    if (!g) throw new Error(`sankey: unsupported node fill ${fill}`);
    const [a, b] = [gradientOf(light, g), gradientOf(dark, g)];
    if (!a.solid) defs += gradient(g, a);
    // A body's gradient runs through the background, so it differs by theme; a band's does not.
    const themed = a.stops !== b.stops;
    if (themed) {
      if (!b.solid) defs += gradient(`${g}d`, b);
      css += `:root[data-theme="dark"] & .${g} { fill: ${b.solid ?? `url(#sankey-${g}d)`}; }\n`;
    }
    trunks += `<path${themed ? ` class="${g}"` : ''} d="${piece}" fill="${a.solid ?? `url(#sankey-${g})`}"/>`;
  }
  // A node's outline follows its pieces' outer edges: the page masks off its inward half and
  // where its own strands join, which the same mask does here.
  const masks = new Map(all(/<mask id="node-edge-mask(\d+)"[^>]*>(.*?)<\/mask>/g).map((m) => [Number(m[1]), m[2]]));
  let outlines = '';
  for (const m of all(/<g class="layer-outline"><path class="plot-outline" d="([^"]+)"[^>]*mask="url\(#node-edge-mask(\d+)\)"\/><\/g>/g)) {
    const id = Number(m[2]);
    const inner = masks.get(id);
    if (!inner) throw new Error(`sankey: node ${id}'s outline has no mask`);
    const own = all(/<use href="#strand-shape(\d+)" fill="black"\/>/g, inner).map((u) => `<use href="#sankey-s${u[1]}" fill="#000"/>`).join('');
    defs += `<mask id="sankey-edge${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><use href="#sankey-n${id}" fill="#000"/>${own}</mask>`;
    outlines += `<path d="${path(m[1], true)}" mask="url(#sankey-edge${id})"/>`;
  }
  defs += [...nodes.entries()].map(([id, ds]) => `<path id="sankey-n${id}" d="${ds.join('')}"/>`).join('');
  const dims = [...nodes.keys()].map((id) => `<use class="dim n${id}" href="#sankey-n${id}"/>`).join('');

  // Strands seen faintly through the nodes they pass behind.
  const behind = new Map(all(/<clipPath id="behind(\d+)"><path d="([^"]+)"\/><\/clipPath>/g).map((m) => [m[1], m[2]]));
  for (const [id, d] of behind) defs += `<clipPath id="sankey-behind${id}"><path d="${path(d)}"/></clipPath>`;
  const ghosts = all(/<use class="ribbon-ghost" data-flow="(\d+)" href="#strand-shape\d+" clip-path="url\(#behind(\d+)\)" opacity="([\d.]+)" fill="url\(#gs\d+\)"\/>/g)
    .map((m) => `<use class="ghost g${m[1]}" href="#sankey-s${m[1]}" clip-path="url(#sankey-behind${m[2]})" fill="url(#sankey-gs${m[1]})"/>`).join('');

  // The loop: nothing, each source, nothing. Every strand, node and ghost with the same opacities
  // through the states shares one animation.
  const states = [null, ...emphasis];
  const period = NONE + emphasis.length * EACH;
  const starts = states.map((_, i) => (i ? NONE / 2 + (i - 1) * EACH : 0));
  const p = (/** @type {number} */ t) => num((100 * t) / period, 3);
  /** @type {Map<string, string[]>} opacities through the states -> selectors */
  const groups = new Map();
  const add = (/** @type {string} */ sel, /** @type {number[]} */ values) => groups.set(values.join(' '), [...(groups.get(values.join(' ')) ?? []), sel]);
  for (const s of strands) add(`.f${s.flow}`, states.map((e) => (!e || e.flows.includes(s.flow) ? 1 : 0.16)));
  for (const s of strands) add(`.g${s.flow}`, states.map((e) => (!e || e.flows.includes(s.flow) ? 0.3 : 0.05)));
  for (const id of nodes.keys()) add(`.n${id}`, states.map((e) => (!e || e.nodes.includes(id) ? 0 : 0.65)));
  add('.outline', states.map((e) => (e ? 0 : 1)));
  let loop = '';
  [...groups.entries()].forEach(([key, sels], j) => {
    const v = key.split(' ');
    if (v.every((x) => x === v[0])) return;
    const stops = [`0% { opacity: ${v[0]}; }`];
    for (let i = 1; i <= states.length; i++) {
      const [from, to] = [v[i - 1], v[i % states.length]];
      const t = i < states.length ? starts[i] : NONE / 2 + emphasis.length * EACH;
      if (from !== to) stops.push(`${p(t)}% { opacity: ${from}; }`, `${p(t + FADE)}% { opacity: ${to}; }`);
    }
    stops.push(`100% { opacity: ${v[0]}; }`);
    loop += `& :is(${sels.map((s) => `${s}`).join(', ')}) { animation: sankey-e${j} ${num(period, 3)}s linear infinite; }
@keyframes sankey-e${j} { ${stops.join(' ')} }
`;
  });
  if (NONE / 2 + emphasis.length * EACH + FADE > period - 0.1) throw new Error('sankey: the last fade runs into the wrap');

  return art({
    name: 'sankey',
    period,
    defs,
    body: `<g class="ribbons">${ribbons.join('')}</g>
<g class="trunks">${trunks}</g>
<g class="outline">${outlines}</g>
<g class="dims">${dims}</g>
<g class="ghosts">${ghosts}</g>
<g class="labels">${labels}</g>`,
    css: `& .outline { fill: none; stroke: #000; stroke-width: 0.6; stroke-linejoin: round; }
& .dim { fill: var(--art-paper); opacity: 0; }
& .ghost { opacity: 0.3; }
& .labels { fill: var(--art-ink); text-anchor: middle; dominant-baseline: central; font-family: Helvetica, Arial, sans-serif; }
${css}`,
    loop,
  });
}
