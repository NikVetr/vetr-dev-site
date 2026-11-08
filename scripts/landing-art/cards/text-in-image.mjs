// Text in Image: the page's default picture, Tenniel's Alice with the "Drink me" bottle, beside
// the tool's text fill of it on white, through the tool's whole-word fitter,
// on the wide (2 x 3) tile's canvas. The page's default text is the whole of chapter 1
// (11,224 characters, including preserved line breaks), which at tile size would be letters a pixel tall; this uses its opening
// ten paragraphs. The longer excerpt and twelve fitting rounds let whole words reach both
// narrow legs instead of ending at the skirt. Each letter is
// drawn where the core places it, in the colour it takes from the picture.
// The loop clears the text line by line from the top and writes it back in the same order,
// ending full as it began: every line runs one shared fade, delayed to its turn.
import { readFileSync } from 'node:fs';
import { decodePng } from '../../../shared/decode-png.mjs';
import { measureChars } from '../../../text-in-image/core/font.js';
import { submit } from '../../../text-in-image/core/index.js';
import { openPage } from '../browser.mjs';
import { WIDE, art, esc, num } from '../svg.mjs';

const BACKGROUND = '#ffffff';   // the page's background
const PERIOD = 6;
const START = 0.5;   // seconds full before the first line clears
const SWEEP = 2.2;   // seconds to clear (and later to write) every line
const FADE = 0.12;
const PICTURE_PX = 2;   // the picture embedded at this many pixels per display unit
const PARAGRAPHS = 10;   // of the default text
const { width: W, height: H } = WIDE;

export async function build() {
  const file = new URL('../../../text-in-image/examples/alice-drink-me.png', import.meta.url);
  const image = decodePng(readFileSync(file));
  const chapter = readFileSync(new URL('../../../text-in-image/examples/alice-chapter-1.txt', import.meta.url), 'utf8');
  const text = chapter.trim().split(/\n\s*\n/).slice(0, PARAGRAPHS).join(' ');
  const result = submit({ image, text, layout: { wrap: 'word', n_rounds: 12 }, color: { background: BACKGROUND } });
  if (!result.complete) throw new Error('text-in-image: the opening paragraphs did not fit');
  if (result.settings.layout.rotation !== 0) throw new Error('text-in-image: a rotated layout, which this drawing does not expect');
  // Alice's lower legs occupy two separated runs below y=.12 in the image's unit square.
  // A complete fit can still stop at the skirt: check actual glyphs in both legs as well.
  const legs = result.glyphs.filter(g => g.placed && g.char.trim() && g.y !== null && g.y < 0.20);
  const lowerLegs = legs.filter(g => g.y !== null && g.y < 0.12);
  const leftLeg = lowerLegs.filter(g => g.x !== null && g.x < 0.65);
  const rightLeg = lowerLegs.filter(g => g.x !== null && g.x >= 0.65);
  const rows = [...new Set(legs.map(g => /** @type {number} */ (g.y)))].sort((a, b) => a - b);
  const skipsCalves = rows.some((y, i) => i > 0 && y - rows[i - 1] > 0.03);
  if (leftLeg.length < 10 || rightLeg.length < 10 || skipsCalves) throw new Error('text-in-image: the excerpt must fill both lower legs without skipping the calves');

  // The picture's box on the canvas (inside its margins), and its place on the card.
  const { width: CW, height: CH } = result.canvas;
  const m = result.settings.render.margin;
  const span = 1 + 2 * m;
  const box = { x: (m / span) * CW, y: (m / span) * CH, w: CW / span, h: CH / span };
  const ph = H - 16;
  const k = ph / box.h;
  const pw = box.w * k;
  const gap = 24;
  const left = (W - 2 * pw - gap) / 2;
  const fx = left + pw + gap;
  const fy = (H - ph) / 2;

  // Glyph anchors as renderSvg places them, in card units; one <text> per line, one <tspan> per
  // colour with each letter's own x.
  const size = result.font_size_px;
  const baseline = (measureChars(['M']).height * size) / 3;
  /** @type {Map<number, Map<string, { x: number[], chars: string }>>} */
  const lines = new Map();
  /** @type {Map<number, number>} */
  const lineY = new Map();
  for (const g of result.glyphs) {
    if (!g.placed || g.x === null || g.y === null || g.line === null || !g.col || !g.char.trim()) continue;
    const x = fx + (((g.x + m) / span) * CW + 7.2 - box.x) * k;
    const y = fy + (((1 + m - g.y) / span) * CH + baseline - box.y) * k;
    const line = lines.get(g.line) ?? new Map();
    lines.set(g.line, line);
    lineY.set(g.line, y);
    const run = line.get(g.col) ?? { x: [], chars: '' };
    line.set(g.col, run);
    run.x.push(x);
    run.chars += g.char;
  }
  const order = [...lines.keys()].sort((a, b) => a - b);
  const delay = (/** @type {number} */ i) => START + (i * SWEEP) / Math.max(1, order.length - 1);
  if (delay(order.length - 1) > PERIOD / 2 - FADE) throw new Error('text-in-image: the sweep is too long for the period');
  const body = order.map((n, i) => {
    const spans = [...(lines.get(n) ?? [])].map(([col, run]) => `<tspan fill="${col}" x="${run.x.map((x) => num(x, 1)).join(' ')}">${esc(run.chars)}</tspan>`).join('');
    return `<text y="${num(lineY.get(n) ?? 0, 1)}" style="animation-delay:${num(delay(i), 3)}s">${spans}</text>`;
  }).join('\n');

  // The picture, scaled by the browser to twice its size here and embedded as WebP.
  const { page, close } = await openPage('text-in-image/');
  let picture = '';
  try {
    picture = await page.evaluate(async (/** @type {number[]} */ [w, h]) => {
      const bitmap = await createImageBitmap(await (await fetch('examples/alice-drink-me.png')).blob(), { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
      const canvas = new OffscreenCanvas(w, h);
      /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(bitmap, 0, 0);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })).arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return `data:image/webp;base64,${btoa(s)}`;
    }, [Math.round(pw * PICTURE_PX), Math.round(ph * PICTURE_PX)]);
  } finally {
    await close();
  }

  const p = (/** @type {number} */ t) => num((100 * t) / PERIOD, 3);
  return art({
    name: 'text-in-image',
    width: W,
    height: H,
    period: PERIOD,
    body: `<rect class="panel" x="${num(left - 4)}" y="${num(fy - 4)}" width="${num(pw + 8)}" height="${num(ph + 8)}" rx="3"/>
<image href="${picture}" x="${num(left)}" y="${num(fy)}" width="${num(pw)}" height="${num(ph)}" preserveAspectRatio="none"/>
<rect class="panel" x="${num(fx - 4)}" y="${num(fy - 4)}" width="${num(pw + 8)}" height="${num(ph + 8)}" rx="3"/>
<path class="arrow" d="M${num(left + pw + 6)} ${num(H / 2)}h${num(gap - 14)}m-3 -3l3 3l-3 3"/>
<g class="fill">
${body}
</g>`,
    css: `& .panel { fill: ${BACKGROUND}; }
& .arrow { fill: none; stroke: var(--art-muted); stroke-width: 1.1; stroke-linecap: round; stroke-linejoin: round; }
& .fill { font: 700 ${num(size * k, 2)}px 'Liberation Sans', Arial, Helvetica, sans-serif; }`,
    loop: `& .fill text { animation: text-in-image-line ${PERIOD}s linear infinite; }
@keyframes text-in-image-line { 0% { opacity: 1; } ${p(FADE)}% { opacity: 0; } 50% { opacity: 0; } ${p(PERIOD / 2 + FADE)}% { opacity: 1; } 100% { opacity: 1; } }`,
  });
}
