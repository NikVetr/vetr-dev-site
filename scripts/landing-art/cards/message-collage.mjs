// Message Collage: the page's example (its 34 farewell messages, best of 20 layouts, seed 1) laid
// out by the tool's core on a portrait card for the tall tile (3.3 × 5 in, the request's own
// card size, so the tool packs the messages at that shape), each line in its family, style, size
// and colour on the navy card. The glyphs are the visitor's system fonts in the family's generic
// kind (the bundled family named first, in case it is installed), with each line pinned to the
// width the core measured it at (textLength, glyphs and spacing adjusted), so every line keeps the
// tool's position, size, colour and extent.
// The loop is the page's "New layout": the same request with seeds 2, 3 and 4, each faded in
// after the last fades out, and back to seed 1, the still. The card's height follows each layout.
import { readFileSync } from 'node:fs';
import { loadFaces, submit } from '../../../message-collage/core/index.js';
import { TALL, art, esc, num } from '../svg.mjs';

const SEEDS = [1, 2, 3, 4];
const HOLD = 1.5;    // seconds each layout is on the card, fades included
const FADE = 0.2;    // seconds to fade out, and again to fade in
const MARGIN = 4;
const PT = 72;       // the core's units: points, 72 per inch
const CARD = { width_in: 3.3, height_in: 5 };   // about the tall tile's 2:3
const { width: W, height: H } = TALL;

/** The CSS of each family's kind, named family first. */
const FAMILY = {
  serif: '"Source Serif Pro", serif',
  'sans-serif': 'Inter, sans-serif',
  monospace: '"Courier Prime", monospace',
  script: '"Lobster Two", cursive',
  display: '"Playfair Display", serif',
};

export async function build() {
  const request = JSON.parse(readFileSync(new URL('../../../message-collage/examples/request.json', import.meta.url), 'utf8'));
  /** @type {Awaited<ReturnType<typeof submit>>[]} */
  const results = [];
  for (const seed of SEEDS) results.push(await submit({ ...request, ...CARD, seed }));
  const [first] = results;
  const faces = await loadFaces(first.request.fonts, first.request.styles);
  const kind = new Map(first.fonts.map((f) => [f.family, f.category]));
  const classOf = new Map(first.fonts.map((f, i) => [f.family, `f${i}`]));
  const palette = [...new Set(results.flatMap((r) => r.lines.map((l) => l.color)))];

  // One scale for every layout, the tallest fitting the canvas; the cards share their top left.
  const widthPt = first.card.width_in * PT;
  const tallest = Math.max(...results.map((r) => r.card.height_in)) * PT;
  if (results.some((r) => r.card.width_in * PT !== widthPt)) throw new Error('message-collage: the layouts differ in width');
  const k = Math.min((W - 2 * MARGIN) / widthPt, (H - 2 * MARGIN) / tallest);
  const [x0, y0] = [(W - widthPt * k) / 2, (H - tallest * k) / 2];

  /** A line's width in points as the core measured it: advance widths, no kerning. */
  const lineWidth = (/** @type {typeof first.lines[0]} */ line) => {
    const face = faces.get(`${line.family}|${line.style_name}`);
    if (!face) throw new Error(`message-collage: no face for ${line.family} ${line.style_name}`);
    let units = 0;
    for (const ch of line.text) units += face.font.glyphForCodePoint(/** @type {number} */ (ch.codePointAt(0))).advanceWidth;
    return (units * line.font_size_pt) / face.unitsPerEm;
  };
  const styleClass = { plain: '', bold: ' b', italic: ' i', 'bold-italic': ' b i' };

  const period = SEEDS.length * HOLD;
  const shift = (HOLD - 2 * FADE) / 2;   // the still is the middle of the first layout's time
  const groups = results.map((r, i) => {
    // A message's lines share its face, size and colour, so they are one group.
    const lines = r.messages.map((m) => {
      const own = r.lines.filter((line) => line.message === m.index);
      if (own.some((line) => line.family !== m.family || line.style_name !== m.style_name || line.font_size_pt !== m.font_size_pt || line.color !== m.color)) {
        throw new Error(`message-collage: message ${m.index}'s lines differ in face, size or colour`);
      }
      const cls = `${classOf.get(m.family)}${styleClass[m.style_name]} c${palette.indexOf(m.color)}`;
      return `<g class="${cls}" font-size="${num(m.font_size_pt * k, 2)}">${own.map((line) => `<text x="${num(x0 + line.x_in * PT * k)}" y="${num(y0 + line.baseline_in * PT * k)}" textLength="${num(lineWidth(line) * k)}" lengthAdjust="spacingAndGlyphs">${esc(line.text)}</text>`).join('')}</g>`;
    }).join('\n');
    if (r.messages.reduce((n, m) => n + r.lines.filter((line) => line.message === m.index).length, 0) !== r.lines.length) throw new Error('message-collage: a line belongs to no message');
    const delay = ((((i * HOLD - shift) % period) + period) % period) - period;
    return `<g class="layout${i ? '' : ' still'}" style="animation-delay:${num(delay, 3)}s">\n${lines}\n</g>`;
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
    ...first.fonts.map((f, i) => {
      const family = FAMILY[/** @type {keyof typeof FAMILY} */ (kind.get(f.family) ?? '')];
      if (!family) throw new Error(`message-collage: no generic family for ${f.family}'s kind ${kind.get(f.family)}`);
      return `& .f${i} { font-family: ${family}; }`;
    }),
    ...palette.map((c, i) => `& .c${i} { fill: ${c}; }`),
    '& .b { font-weight: 700; }',
    '& .i { font-style: italic; }',
    '& text { font-kerning: none; font-variant-ligatures: none; }',
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
    body: `<g transform="translate(${num(x0)} ${num(y0)})"><rect class="card" width="${num(widthPt * k)}" height="${num(tallest * k)}"/></g>
${groups.join('\n')}`,
    css,
    loop: `& .layout { animation: message-collage-layout ${num(period, 3)}s linear infinite; }
@keyframes message-collage-layout { 0% { opacity: 1; } ${p(HOLD - 2 * FADE)}% { opacity: 1; } ${p(HOLD - FADE)}% { opacity: 0; } ${p(period - FADE)}% { opacity: 0; } 100% { opacity: 1; } }
& .card { animation: message-collage-card ${num(period, 3)}s linear infinite; }
@keyframes message-collage-card { ${stops.join(' ')} }`,
  });
}
