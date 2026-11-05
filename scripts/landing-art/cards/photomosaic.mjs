// Photomosaic: the page's default example, Hokusai's Red Fuji as the target and the 442 example
// photos, matched by the page on load with its defaults (the R script's grid, HSL match, seed 1):
// 425 photos in 25 columns by 17 rows. The still is the mosaic as the page draws it, taken from
// its own PNG export at 20 px a tile and embedded as WebP; the other view is the page's "target
// at one colour per cell", drawn as one square per cell. The loop crossfades from the mosaic to
// the cells and back, with the page's two-way "Show" choice beside it marking the view.
import { openPage } from '../browser.mjs';
import { H, art, num } from '../svg.mjs';

const TILE_PX = 20;     // pixels per tile in the embedded mosaic, about twice its display size
const QUALITY = 0.5;    // WebP quality
const PERIOD = 7;
const TO_CELLS = 2;     // seconds on the mosaic before it fades to the cells
const FADE = 0.6;
const ON_CELLS = 2.8;   // seconds on the cells

export async function build() {
  const { page, errors, close } = await openPage('photomosaic/');
  /** @type {{ grid: { rows: number, columns: number }, cells: number[][], settings: object, used: number, count: number }} */
  let result;
  /** @type {{ url: string, width: number, height: number }} */
  let mosaic;
  try {
    // The page loads the example photos and target and generates the mosaic on load.
    await page.waitForFunction(() => /** @type {any} */ (window).Photomosaic?.getResult(), null, { timeout: 120000 });
    result = await page.evaluate(() => {
      const r = /** @type {any} */ (window).Photomosaic.getResult();
      return { grid: r.grid, cells: r.cells, settings: r.settings, used: r.photos.used, count: r.photos.count };
    });
    mosaic = await page.evaluate(async (/** @type {number[]} */ [tileWidth, quality]) => {
      const png = await /** @type {any} */ (window).Photomosaic.exportPngBlob({ tileWidth, fit: 'keep', tint: 0 });
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

  // The mosaic as tall as the card allows, the view choice to its right.
  const tile = (H - 10) / rows;
  const mw = columns * tile;
  const mh = rows * tile;
  const mx = 8;
  const my = (H - mh) / 2;

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

  // The page's "Show" choice: the mosaic, or the target at one colour per cell.
  const lx = mx + mw + 10;
  const ly = H / 2 - 9;
  const choice = ['mosaic', 'target'].map((label, i) => `<circle class="ring" cx="${num(lx + 3.5)}" cy="${num(ly + i * 18)}" r="3.5"/><circle class="dot dot${i}" cx="${num(lx + 3.5)}" cy="${num(ly + i * 18)}" r="2"/><text x="${num(lx + 10)}" y="${num(ly + i * 18)}">${label}</text>`).join('');

  const p = (/** @type {number} */ t) => `${num((100 * t) / PERIOD, 3)}%`;
  const a = TO_CELLS;
  const b = a + FADE;
  const c = b + ON_CELLS;
  const d = c + FADE;
  if (d > PERIOD - 0.5) throw new Error('photomosaic: the views do not fit in the period');
  const fade = (/** @type {string} */ id, /** @type {number} */ from, /** @type {number} */ to) => `@keyframes ${id} { 0% { opacity: ${from}; } ${p(a)} { opacity: ${from}; } ${p(b)} { opacity: ${to}; } ${p(c)} { opacity: ${to}; } ${p(d)} { opacity: ${from}; } 100% { opacity: ${from}; } }`;

  return art({
    name: 'photomosaic',
    period: PERIOD,
    body: `<image href="${mosaic.url}" x="${num(mx)}" y="${num(my)}" width="${num(mw)}" height="${num(mh)}" preserveAspectRatio="none"/>
<g class="cells" transform="translate(${num(mx)} ${num(my)}) scale(${num(tile, 4)})">${cells}</g>
<g class="choice">${choice}</g>`,
    css: `& .cells { opacity: 0; }
& .choice text { fill: var(--art-ink); font: 8px ui-sans-serif, system-ui, sans-serif; dominant-baseline: central; }
& .ring { fill: none; stroke: var(--art-muted); stroke-width: 0.9; }
& .dot { fill: var(--art-ink); }
& .dot1 { opacity: 0; }`,
    loop: `& .cells, & .dot1 { animation: photomosaic-cells ${PERIOD}s ease-in-out infinite; }
& .dot0 { animation: photomosaic-mosaic ${PERIOD}s ease-in-out infinite; }
${fade('photomosaic-cells', 0, 1)}
${fade('photomosaic-mosaic', 1, 0)}`,
  });
}
