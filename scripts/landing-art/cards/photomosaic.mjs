// Photomosaic: the page's explicit Sunflower preset and the 442 example photos,
// using the existing HSL matcher, seed 1, up to three uses per photo and 45% display tint:
// 1,200 cells in 40 columns by 30 rows. The still is the mosaic as the page draws it, taken from
// its own PNG export at 20 px a tile and embedded as WebP; the other view is the page's "target
// at one colour per cell", drawn as one square per cell. The image fills the artwork at its
// native 4:3 geometry. Narrow wells crop the sides around the sunflower, preserving square
// cells while filling their height. Playback shows the source photo, its actual sampled
// cell colours, then reveals the matched mosaic. The sweep illustrates assembly, not search order.
import { readFileSync } from 'node:fs';
import { openPage } from '../browser.mjs';
import { art, num } from '../svg.mjs';

const TILE_PX = 20;     // pixels per tile in the embedded mosaic, about twice its display size
const QUALITY = 0.5;    // WebP quality
const PERIOD = 10;

export async function build() {
  const { page, errors, close } = await openPage('photomosaic/');
  /** @type {{ grid: { rows: number, columns: number }, cells: number[][], settings: object, used: number, count: number }} */
  let result;
  /** @type {{ url: string, width: number, height: number }} */
  let mosaic;
  try {
    // Keep the baseline on-load example intact; select the richer illustrative preset.
    await page.waitForFunction(() => /** @type {any} */ (window).Photomosaic?.getResult(), null, { timeout: 120000 });
    await page.locator('#sunflower-example').click();
    await page.waitForFunction(() => /** @type {any} */ (window).Photomosaic?.getResult()?.grid.cells === 1200);
    result = await page.evaluate(() => {
      const r = /** @type {any} */ (window).Photomosaic.getResult();
      return { grid: r.grid, cells: r.cells, settings: r.settings, used: r.photos.used, count: r.photos.count };
    });
    mosaic = await page.evaluate(async (/** @type {number[]} */ [tileWidth, quality]) => {
      const png = await /** @type {any} */ (window).Photomosaic.exportPngBlob({ tileWidth, fit: 'keep', tint: 0.45 });
      const bitmap = await createImageBitmap(png);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(bitmap, 0, 0);
      const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
      const bytes = new Uint8Array(await webp.arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return { url: `data:image/webp;base64,${btoa(s)}`, width: bitmap.width, height: bitmap.height };
    }, [TILE_PX, QUALITY]);
    if (errors.length) throw new Error(`photomosaic: ${errors.join('; ')}`);
  } finally {
    await close();
  }
  const { rows, columns } = result.grid;
  if (mosaic.width !== columns * TILE_PX || mosaic.height !== rows * TILE_PX) throw new Error(`photomosaic: the export is ${mosaic.width} × ${mosaic.height}, not ${columns} × ${rows} square tiles`);

  // Use the entire canvas for the image, without a miniature copy of the app's controls.
  const width = 320;
  const tile = width / columns;
  const height = rows * tile;

  // The cells, in tile units; each overlaps its right and lower neighbours slightly so no seam
  // of the mosaic shows between them.
  let cells = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const [red, green, blue] = result.cells[r * columns + c];
      const hex = `#${[red, green, blue].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const w = c < columns - 1 ? 1.05 : 1;
      const h = r < rows - 1 ? 1.05 : 1;
      cells += `<path fill="${hex}" d="M${c} ${r}h${w}v${h}h-${w}z"/>`;
    }
  }

  const target = readFileSync(new URL('../../../photomosaic/examples/sunflower.jpg', import.meta.url)).toString('base64');

  return art({
    name: 'photomosaic',
    width,
    height,
    period: PERIOD,
    defs: `<clipPath id="photomosaic-unfilled"><rect class="unfilled" width="${width}" height="${height}"/></clipPath>`,
    body: `<image class="mosaic-result" href="${mosaic.url}" width="${num(width)}" height="${num(height)}" preserveAspectRatio="none"/>
<g class="target"><image href="data:image/jpeg;base64,${target}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/></g>
<g class="cell-stage" clip-path="url(#photomosaic-unfilled)"><g transform="scale(${num(tile, 4)})">${cells}</g></g>`,
    css: `& .target, & .cell-stage { opacity: 0; }
& .unfilled { transform-origin: ${width}px 0; }`,
    loop: `& .target { animation: photomosaic-target ${PERIOD}s linear infinite; }
& .cell-stage { animation: photomosaic-cells ${PERIOD}s linear infinite; }
& .unfilled { animation: photomosaic-fill ${PERIOD}s linear infinite; }
@keyframes photomosaic-target { 0%,30%,100% {opacity:0;} 6%,24% {opacity:1;} }
@keyframes photomosaic-cells { 0%,24%,88%,100% {opacity:0;} 30%,85% {opacity:1;} }
@keyframes photomosaic-fill { 0%,48%,100% {transform:scaleX(1);} 85%,99% {transform:scaleX(0);} }`,
  }).replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ');
}
