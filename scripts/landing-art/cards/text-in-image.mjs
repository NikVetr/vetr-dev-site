// Text in Image: the page's default picture, Tenniel's Alice with the "Drink me" bottle, beside
// the tool's text fill of it on navy, through the tool's whole-word fitter,
// on the wide (2 x 3) tile's canvas. The page's default text is the whole of chapter 1
// (11,224 characters, including preserved line breaks), which at tile size would be letters a pixel tall; this uses its opening
// ten paragraphs. The longer excerpt and twelve fitting rounds let whole words reach both
// narrow legs instead of ending at the skirt. Each letter is
// drawn where the core places it, in the colour it takes from the picture.
// The loop starts close to Alice’s head, reveals actual whole words from left to right,
// then zooms out during the fill. A small SVG player follows the single CSS camera clock.
import { readFileSync } from 'node:fs';
import { decodePng } from '../../../shared/decode-png.mjs';
import { glyphPath, measureChars } from '../../../text-in-image/core/font.js';
import { submit } from '../../../text-in-image/core/index.js';
import { textGlowFilter } from '../../../text-in-image/core/glow.js';
import { adjustedContrastColour } from '../../../text-in-image/core/contrast.js';
import { openPage } from '../browser.mjs';
import { WIDE, art, esc, num } from '../svg.mjs';

const BACKGROUND = '#14253d';   // selected landing background
const PERIOD = 18;
const ZOOM = 8;
const PICTURE_PX = 2;   // the picture embedded at this many pixels per display unit
const PARAGRAPHS = 10;   // of the default text
const { width: W, height: H } = WIDE;

/** @param {{background?:string,glow?:number|boolean}} [options] */
export async function build({ background = BACKGROUND, glow = 3 } = {}) {
  const file = new URL('../../../text-in-image/examples/alice-drink-me.png', import.meta.url);
  const image = decodePng(readFileSync(file));
  const chapter = readFileSync(new URL('../../../text-in-image/examples/alice-chapter-1.txt', import.meta.url), 'utf8');
  const text = chapter.trim().split(/\n\s*\n/).slice(0, PARAGRAPHS).join(' ');
  const result = submit({ image, text, layout: { wrap: 'word', n_rounds: 12 }, color: { background }, render: { contrast_adjust: true, glow } });
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

  // Preserve the core's reading order, then order disconnected runs on a row by x.
  // Each word is revealed as one group, without changing any glyph position or colour.
  const size = result.font_size_px;
  const baseline = (measureChars(['M']).height * size) / 3;
  const words = wordRuns(result.glyphs);
  const glyphDefs = new Map();
  const body = words.map((word, i) => {
    const glyphs = word.glyphs.map(g => {
      const id = `text-in-image-glyph-${g.char.codePointAt(0)}`;
      if (!glyphDefs.has(id)) glyphDefs.set(id, `<path id="${id}" d="${glyphPath(g.char, size * k)}"/>`);
      const x = fx + (((/** @type {number} */ (g.x) + m) / span) * CW + 7.2 - box.x) * k;
      const y = fy + (((1 + m - /** @type {number} */ (g.y)) / span) * CH + baseline - box.y) * k;
      return `<use href="#${id}" x="${num(x, 3)}" y="${num(y, 3)}" fill="${adjustedContrastColour(/** @type {string} */ (g.col), background)}"/>`;
    }).join('');
    return `<g class="word" data-word="${i}" data-line="${word.line}" data-left="${num(word.left, 6)}" data-text="${esc(word.text)}" data-reveal="${num(revealTime(i, words.length), 1)}">${glyphs}</g>`;
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

  // Exact bundled glyph outlines remain sharp in the initial close-up.
  const focusX = fx + pw * .59;
  const focusY = fy + H / (2 * ZOOM);
  const tx = W / 2 - ZOOM * focusX, ty = H / 2 - ZOOM * focusY;
  return art({
    name: 'text-in-image', width: W, height: H, period: PERIOD, player: 'text-in-image',
    defs: [...glyphDefs.values()].join('') + (glow ? textGlowFilter('text-in-image-glow', size * k, [fx - 4, fy - 4, pw + 8, ph + 8], result.settings.render.glow) : ''),
    body: `<g class="clock"/>
<g class="camera" data-close="${ZOOM},${num(tx,4)},${num(ty,4)}">
<rect class="panel" x="${num(left - 4)}" y="${num(fy - 4)}" width="${num(pw + 8)}" height="${num(ph + 8)}" rx="3"/>
<image href="${picture}" x="${num(left)}" y="${num(fy)}" width="${num(pw)}" height="${num(ph)}" preserveAspectRatio="none"/>
<rect class="panel" x="${num(fx - 4)}" y="${num(fy - 4)}" width="${num(pw + 8)}" height="${num(ph + 8)}" rx="3"/>
<path class="arrow" d="M${num(left + pw + 6)} ${num(H / 2)}h${num(gap - 14)}m-3 -3l3 3l-3 3"/>
<g class="fill"${glow ? ' filter="url(#text-in-image-glow)"' : ''}>${body}</g></g>`,
    css: `& .panel { fill: ${background}; }
& .arrow { fill: none; stroke: var(--art-muted); stroke-width: 1.1; stroke-linecap: round; stroke-linejoin: round; }`,
    loop: `& .clock { animation:text-in-image-clock ${PERIOD}s linear infinite; }
@keyframes text-in-image-clock { from { opacity:0; } to { opacity:1; } }`,
  });
}

/** Whole words from actual fitted glyphs; no re-layout or new text.
 * @param {import('../../../text-in-image/core/index.js').Glyph[]} glyphs
 */
export function wordRuns(glyphs) {
  /** @type {{line:number,left:number,text:string,glyphs:import('../../../text-in-image/core/index.js').Glyph[]}[]} */
  const words = [];
  /** @type {typeof words[number] | null} */
  let word = null;
  for (const g of glyphs) {
    if (!g.char.trim()) { word = null; continue; }
    if (!g.placed || g.x === null || g.y === null || g.line === null || !g.col) throw new Error('text-in-image: an unplaced visible glyph');
    if (!word || word.line !== g.line) { word = {line:g.line,left:g.x,text:'',glyphs:[]}; words.push(word); }
    word.text += g.char; word.glyphs.push(g);
  }
  return words.sort((a,b)=>a.line-b.line || a.left-b.left);
}

/** Milliseconds on the shared camera clock. Let the opening words be read before accelerating.
 * @param {number} index @param {number} count
 */
export function revealTime(index, count) {
  const slow = Math.min(20, count);
  return index < slow ? 250 + index * 150 : 3250 + (index - slow) * 10750 / Math.max(1, count - slow - 1);
}
