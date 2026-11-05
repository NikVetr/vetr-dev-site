// Color Palette Extender (Palette Town): the tool's worked example from its scientific summary,
// two input colours and the three the optimizer adds to them, rerun here with the example's
// settings and seed. As in each of the page's vision panels: the colours as input and output
// swatches labelled with their hex codes, and the OKLab a-b view with the sRGB gamut's outline,
// its colour field, and the colours as markers (circles for inputs, squares for additions,
// sized by lightness), all painted as the panel's vision type sees them. Under a simulation a
// swatch keeps a sliver of its true colour at the left, as the page's swatches do.
// The loop is a flip-book of the page's four panels, trichromacy, deutan, protan and tritan, each
// named in the strip above it; the still is trichromacy.
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { plotOrder } from '../../../color-optimization/config.js';
import { decodeColor, encodeColor, isInGamut, projectToGamut } from '../../../color-optimization/core/colorSpaces.js';
import { applyCvdHex } from '../../../color-optimization/core/cvd.js';
import { contrastColor } from '../../../color-optimization/core/metrics.js';
import { optimizePalette } from '../../../color-optimization/optimizer/optimizePalette.js';
import { buildGamutProjectionBoundary, computeGamutExtent, smoothBoundary } from '../../../color-optimization/ui/gamutHull.js';
import { H, W, art, esc, flipbook, num, polyline } from '../svg.mjs';

const FRAME = 1.75;  // seconds per vision type
const FIELD = 24;    // the colour field's cells per side (the page draws 48)
const TABS = { none: 'trichromacy', deutan: 'deutan', protan: 'protan', tritan: 'tritan' };

/**
 * An RGB PNG of `n` × `n` pixels, as a data URI.
 * @param {number} n
 * @param {number[][]} rgb  rows of [r, g, b, r, g, b, ...]
 */
function png(n, rgb) {
  // Each row filtered with "Sub" (the difference from the pixel to its left), which suits a field.
  const raw = Buffer.alloc(n * (3 * n + 1));
  rgb.forEach((row, y) => {
    const o = y * (3 * n + 1);
    raw[o] = 1;
    row.forEach((v, i) => { raw[o + 1 + i] = (v - (i >= 3 ? row[i - 3] : 0) + 256) % 256; });
  });
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const file = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${file.toString('base64')}`;
}

export async function build() {
  const example = JSON.parse(readFileSync(new URL('../../../color-optimization/assets/scientific-summary/example.json', import.meta.url), 'utf8'));
  const { inputs, config } = example;
  const best = await optimizePalette(inputs, config);
  if (JSON.stringify(best.newHex) !== JSON.stringify(example.added)) {
    throw new Error(`color-optimization: the optimizer gives ${best.newHex.join(' ')}, the worked example ${example.added.join(' ')}`);
  }
  /** @type {string[]} */
  const added = best.newHex;
  const palette = [...inputs, ...added];
  const model = config.cvdModel;
  const space = config.colorwheelSpace;
  const gamut = config.gamutPreset;
  if (space !== 'oklab') throw new Error(`color-optimization: the example's view is ${space}, not the OKLab a-b view drawn here`);
  if (JSON.stringify(plotOrder) !== JSON.stringify(Object.keys(TABS))) throw new Error(`color-optimization: the page's panels are ${plotOrder.join(', ')}`);

  // The page's clipped a-b view: the gamut's extent with its 1.1 margin, a square plot.
  const range = computeGamutExtent(space, gamut, 1.1);
  const maxA = Math.max(Math.abs(range.min.a), Math.abs(range.max.a));
  const maxB = Math.max(Math.abs(range.min.b), Math.abs(range.max.b));
  const lAt = (/** @type {number} */ f) => range.min.l + f * (range.max.l - range.min.l);
  // Inputs from their hex codes, additions from the optimizer's own coordinates, each projected
  // into the gamut as the clipped view shows them.
  const values = [...inputs.map((/** @type {string} */ h) => decodeColor(h, space)), ...best.newRaw].map((v) => projectToGamut(v, space, gamut, space));
  for (const v of values) if (Math.abs(v.a) > maxA || Math.abs(v.b) > maxB || v.l < range.min.l || v.l > range.max.l) throw new Error('color-optimization: a colour lies outside the view the page would show');

  // Layout: the vision strip on top; swatches left, the a-b view right.
  const side = 136;
  const px = W - 10 - side;
  const py = H - 8 - side;
  const half = side / 2;
  const toXY = (/** @type {{ a: number, b: number }} */ v) => [px + half + (v.a / maxA) * half, py + half - (v.b / maxB) * half];

  /** @type {{ x: number, y: number }[]} */
  const boundary = smoothBoundary(buildGamutProjectionBoundary(space, gamut, range, true, { l: 'l', x: 'a', y: 'b' }).map((/** @type {{ a: number, b: number }} */ v) => { const [x, y] = toXY(v); return { x, y }; }), 1);
  const outline = polyline(boundary.filter((_, i) => i % 4 === 0).map(({ x, y }) => [x, y]), true);

  // The colour field at three quarters of the lightness range, as the page paints it, one PNG
  // per vision type, scaled up smoothly over the plot.
  const fieldL = lAt(0.75);
  const cells = Array.from({ length: FIELD }, (_, yi) => Array.from({ length: FIELD }, (_, xi) => {
    const vals = { l: fieldL, a: ((xi + 0.5) / FIELD) * 2 * maxA - maxA, b: (1 - (yi + 0.5) / FIELD) * 2 * maxB - maxB };
    return encodeColor(isInGamut(vals, space, gamut) ? vals : projectToGamut(vals, space, gamut, space), space);
  }));
  const rgb = (/** @type {string} */ hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  // Swatches: an input column and an output column, as in the page's panels.
  const sw = { w: 70, h: 28, gap: 6, col: 8 };
  const sx = [10, 10 + sw.w + sw.col];
  // The columns' block (headings 14 above three swatches) centred on the plot.
  const sy = py + half - (3 * sw.h + 2 * sw.gap - 14) / 2;
  const swatchAt = (/** @type {number} */ i) => (i < inputs.length ? [sx[0], sy + i * (sw.h + sw.gap)] : [sx[1], sy + (i - inputs.length) * (sw.h + sw.gap)]);

  // The vision strip: four names, the current one on a filled tab.
  const tabY = 8;
  const tabH = 15;
  const tabW = (W - 20) / 4;
  const tabX = (/** @type {number} */ k) => 10 + k * tabW;

  const frames = plotOrder.map((vision, k) => {
    const sim = palette.map((h) => applyCvdHex(h, vision, 1, model));
    let f = `<rect class="tab-on" x="${num(tabX(k) + 3)}" y="${tabY}" width="${num(tabW - 6)}" height="${tabH}" rx="${num(tabH / 2)}"/><text class="tab-on-text" x="${num(tabX(k) + tabW / 2)}" y="${num(tabY + tabH / 2)}">${esc(TABS[/** @type {keyof typeof TABS} */ (vision)])}</text>`;
    for (const [i, hex] of palette.entries()) {
      const [x, y] = swatchAt(i);
      const ink = contrastColor(sim[i]);
      // Under a simulation, the true colour's sliver and a rule in the label's colour.
      const sliver = vision === 'none' ? '' : `<path d="M${num(x + 3)} ${num(y)}h${num(0.1 * sw.w - 3)}v${sw.h}h${num(3 - 0.1 * sw.w)}a3 3 0 0 1 -3 -3v${6 - sw.h}a3 3 0 0 1 3 -3z" fill="${hex}"/><path d="M${num(x + 0.1 * sw.w)} ${num(y)}v${sw.h}" stroke="${ink}" stroke-width="0.8"/>`;
      f += `<rect class="swatch" x="${x}" y="${num(y)}" width="${sw.w}" height="${sw.h}" rx="3" fill="${sim[i]}"/>${sliver}<text class="hex" x="${num(x + sw.w - 4)}" y="${num(y + sw.h / 2)}" fill="${ink}">${esc(hex)}</text>`;
    }
    const field = cells.map((row) => row.flatMap((hex) => rgb(applyCvdHex(hex, vision, 1, model))));
    f += `<image class="field" href="${png(FIELD, field)}" x="${num(px)}" y="${num(py)}" width="${side}" height="${side}" preserveAspectRatio="none" clip-path="url(#color-optimization-gamut)"/>`;
    f += `<path class="outline" d="${outline}"/>`;
    // Markers, largest first so the smaller sit on top.
    const order = palette.map((_, i) => i).sort((a, b) => values[b].l - values[a].l);
    for (const i of order) {
      const [x, y] = toXY(values[i]);
      const lNorm = Math.min(Math.max((values[i].l - range.min.l) / (range.max.l - range.min.l), 0), 1);
      const s = (6 + 12 * lNorm) * 0.6;
      const paint = `fill="${sim[i]}" stroke="${contrastColor(sim[i])}"`;
      f += i < inputs.length
        ? `<circle class="marker" cx="${num(x)}" cy="${num(y)}" r="${num(s / 2)}" ${paint}/>`
        : `<rect class="marker" x="${num(x - s / 2)}" y="${num(y - s / 2)}" width="${num(s)}" height="${num(s)}" ${paint}/>`;
    }
    return f;
  });
  const book = flipbook('color-optimization', frames, FRAME * frames.length);

  // What every frame shares: the tab names, the swatch columns' headings, the plot's frame.
  const tabs = plotOrder.map((vision, k) => `<text x="${num(tabX(k) + tabW / 2)}" y="${num(tabY + tabH / 2)}">${esc(TABS[/** @type {keyof typeof TABS} */ (vision)])}</text>`).join('');
  const headY = sy - 7;
  // Each heading after its marker's shape, as the page's "Input = ●" and "Output = ■".
  const heads = `<circle cx="${num(sx[0] + 2.6)}" cy="${num(headY)}" r="2.6"/><text x="${sx[0] + 8}" y="${num(headY)}">input</text>`
    + `<rect x="${sx[1]}" y="${num(headY - 2.5)}" width="5" height="5"/><text x="${sx[1] + 8}" y="${num(headY)}">added</text>`;
  let grid = '';
  for (let k = 1; k < 8; k++) grid += `M${num(px + (k * side) / 8)} ${num(py)}v${side}M${num(px)} ${num(py + (k * side) / 8)}h${side}`;

  return art({
    name: 'color-optimization',
    period: FRAME * frames.length,
    frames: book.frames,
    defs: `<clipPath id="color-optimization-gamut"><path d="${outline}"/></clipPath>`,
    body: `<g class="tabs">${tabs}</g>
<g class="heads">${heads}</g>
<rect class="plot" x="${num(px)}" y="${num(py)}" width="${side}" height="${side}"/><path class="grid" d="${grid}"/>
${book.body}`,
    // The page's own swatch and marker colours are content; the chrome follows the theme.
    css: `${book.css}
& text { font-family: ui-sans-serif, system-ui, sans-serif; dominant-baseline: central; }
& .tabs text { fill: var(--art-muted); font-size: 8.5px; text-anchor: middle; }
& .tab-on { fill: var(--art-ink); }
& .tab-on-text { fill: var(--art-paper); font-size: 8.5px; font-weight: 600; text-anchor: middle; }
& .heads text { fill: var(--art-muted); font-size: 8px; }
& .heads circle, & .heads rect { fill: none; stroke: var(--art-muted); stroke-width: 0.9; }
& .swatch { stroke: var(--art-ink); stroke-opacity: 0.15; stroke-width: 0.8; }
& .hex { font-size: 8.5px; font-weight: 600; text-anchor: end; }
& .plot { fill: var(--surface); stroke: var(--art-line); stroke-width: 1; }
& .grid { fill: none; stroke: var(--art-line); stroke-width: 0.5; }
& .outline { fill: none; stroke: var(--art-ink); stroke-width: 1.2; stroke-linejoin: round; }
& .marker { stroke-width: 0.8; }`,
    loop: book.loop,
  });
}
