// Message Collage: the page's dense, gently rotated example, built by its actual core.
// The larger 2×3 tile uses the 264×220 canvas. Four real layouts crossfade on hover;
// line positions, relative sizes, colours and collision-checked rotations match the app.
import { readFileSync } from 'node:fs';
import { loadFaces, renderSvg, submit } from '../../../message-collage/core/index.js';
import { WIDE, art, num } from '../svg.mjs';

const SEEDS = [1, 2, 3, 4];
const HOLD = 1.5;    // seconds each layout is on the card, fades included
const FADE = 0.2;    // seconds to fade out, and again to fade in
const MARGIN = 4;
const PT = 72;       // the core's units: points, 72 per inch
const { width: W, height: H } = WIDE;

export async function build() {
  const request = JSON.parse(readFileSync(new URL('../../../message-collage/examples/request.json', import.meta.url), 'utf8'));
  /** @type {Awaited<ReturnType<typeof submit>>[]} */
  const results = [];
  for (const seed of SEEDS) results.push(await submit({ ...request, seed }));
  const [first] = results;
  const faces = await loadFaces(first.request.fonts, first.request.styles);
  // One scale for every layout, the tallest fitting the canvas; the cards share their top left.
  const widthPt = first.card.width_in * PT;
  const tallest = Math.max(...results.map((r) => r.card.height_in)) * PT;
  if (results.some((r) => r.card.width_in * PT !== widthPt)) throw new Error('message-collage: the layouts differ in width');
  const k = Math.min((W - 2 * MARGIN) / widthPt, (H - 2 * MARGIN) / tallest);
  const [x0, y0] = [(W - widthPt * k) / 2, (H - tallest * k) / 2];

  const period = SEEDS.length * HOLD;
  const shift = (HOLD - 2 * FADE) / 2;   // the still is the middle of the first layout's time
  // Reuse the core's exact outlines rather than substitute installed browser fonts.
  // Share identical glyph paths between all four layouts to keep the preview compact.
  const glyphs = new Map();
  const groups = results.map((r, i) => {
    const svg = renderSvg(r, faces), endDefs = svg.indexOf('</defs>');
    if (endDefs < 0) throw new Error('message-collage: outlined SVG has no glyph definitions');
    const ids = new Map();
    for (const match of svg.slice(0, endDefs).matchAll(/<path id="([^"]+)" d="([^"]+)"\/>/g)) {
      const [, oldId, path] = match;
      if (!glyphs.has(path)) glyphs.set(path, `message-collage-g${glyphs.size}`);
      ids.set(oldId, glyphs.get(path));
    }
    const lines = svg.slice(endDefs + '</defs>'.length).replace(/<rect[^>]+\/>/, '').replace(/<\/svg>\s*$/, '').replace(/xlink:href="#([^"]+)"/g, (_, id) => {
      if (!ids.has(id)) throw new Error(`message-collage: undefined glyph ${id}`);
      return `href="#${ids.get(id)}"`;
    });
    const delay = ((((i * HOLD - shift) % period) + period) % period) - period;
    return `<g class="layout${i ? '' : ' still'}" style="animation-delay:${num(delay, 3)}s"><g transform="translate(${num(x0, 4)} ${num(y0, 4)}) scale(${num(k, 6)})">\n${lines}\n</g></g>`;
  });

  // The card's height, changing while neither layout shows.
  const scale = (/** @type {number} */ i) => num((results[i].card.height_in * PT) / tallest, 4);
  const p = (/** @type {number} */ t) => num((100 * t) / period, 3);
  const stops = [`0% { transform: scaleY(${scale(0)}); }`];
  for (let i = 1; i <= SEEDS.length; i++) {
    const t = i * HOLD - shift;   // the next layout is fully in
    stops.push(`${p(t - 2 * FADE)}% { transform: scaleY(${scale(i - 1)}); }`, `${p(t - FADE)}% { transform: scaleY(${scale(i % SEEDS.length)}); }`);
  }
  stops.push(`100% { transform: scaleY(${scale(0)}); }`);
  if (SEEDS.length * HOLD - shift > period) throw new Error('message-collage: the last change runs past the wrap');

  const css = [
    `& .card { fill: ${first.card.background}; transform: scaleY(${scale(0)}); }`,
    '& .layout + .layout { opacity: 0; }',
    // The still's group is a layer at rest as the loop makes every group, so its text is drawn
    // the same when the loop starts.
    '& .still { will-change: opacity; }',
  ].join('\n');
  if (results.some((r) => r.card.background !== first.card.background)) throw new Error('message-collage: the layouts differ in background');

  return art({
    name: 'message-collage',
    width: W,
    height: H,
    period,
    defs: [...glyphs].map(([path, id]) => `<path id="${id}" d="${path}"/>`).join('\n'),
    body: `<g transform="translate(${num(x0)} ${num(y0)})"><rect class="card" width="${num(widthPt * k)}" height="${num(tallest * k)}"/></g>
${groups.join('\n')}`,
    css,
    loop: `& .layout { animation: message-collage-layout ${num(period, 3)}s linear infinite; }
@keyframes message-collage-layout { 0% { opacity: 1; } ${p(HOLD - 2 * FADE)}% { opacity: 1; } ${p(HOLD - FADE)}% { opacity: 0; } ${p(period - FADE)}% { opacity: 0; } 100% { opacity: 1; } }
& .card { animation: message-collage-card ${num(period, 3)}s linear infinite; }
@keyframes message-collage-card { ${stops.join(' ')} }`,
  });
}
