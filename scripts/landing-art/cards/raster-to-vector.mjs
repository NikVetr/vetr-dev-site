// Four real stages of the curated fishcake example. The full-size image advances
// from JPEG through colour simplification and traced edges to smoothed edges;
// the finished curves are shown at rest. No contour coordinates are redrawn.
import { readFileSync } from 'node:fs';
import { submit } from '../../../raster-to-vector/core/index.js';
import { downscale, pad, upscale } from '../../../raster-to-vector/core/image.js';
import { cleanLabels, quantizeColors, relabelClusters } from '../../../raster-to-vector/core/quantize.js';
import { openPage } from '../browser.mjs';
import { art, flipbook } from '../svg.mjs';

/** Display the actual SVG's contour edges; keep the background frame unoutlined.
 * @param {import('../../../raster-to-vector/core/index.js').Result} result
 */
function outlined(result) {
  const visible = result.regions.filter(region => !result.palette[region.layer - 1].transparent);
  let i = 0;
  return result.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/<path /g, () => {
      const region = visible[i++];
      // The padded background contour is an image boundary, not an object edge.
      const background = region.frame || (Math.min(...region.outer.map(p => p[0])) <= 0 && Math.min(...region.outer.map(p => p[1])) <= 0
        && Math.max(...region.outer.map(p => p[0])) >= result.width && Math.max(...region.outer.map(p => p[1])) >= result.height);
      return `<path${background ? '' : ' stroke="#4c3c44" stroke-width="0.45" stroke-linejoin="round"'} `;
    });
}

export async function build() {
  const { page, errors, close } = await openPage('raster-to-vector/');
  try {
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await page.locator('#example-emoji').click();
    await page.waitForFunction(() => /** @type {any} */ (window).RasterToVector?.getResult()?.width === 128);
    const snapshot = await page.evaluate(() => {
      const app = /** @type {any} */ (window).RasterToVector;
      const request = app.getRequest();
      return { result: app.getResult(), image: { width: request.image.width, height: request.image.height, data: Array.from(request.image.data) } };
    });
    const image = { ...snapshot.image, data: Uint8Array.from(snapshot.image.data) };
    /** @type {import('../../../raster-to-vector/core/index.js').Result} */
    const smooth = snapshot.result;
    const settings = smooth.settings;
    const request = { image, ...settings };
    if (submit(request).svg !== smooth.svg) throw new Error('Landing conversion differs from the application');
    const raw = submit({ ...request, smooth: { ...settings.smooth, method: 'none' } });

    // Reuse the exact preprocessing, quantization and cleanup operations used by
    // submit(), and check that the resulting palette is the application's palette.
    let prepared = settings.preprocess.maxDim === null ? image : downscale(image, settings.preprocess.maxDim);
    prepared = upscale(prepared, settings.preprocess.scale);
    const padded = pad(prepared, settings.preprocess.pad);
    const q = settings.quantize;
    const quantized = quantizeColors(padded, { ...q, kRange: q.k === 'auto' ? [...q.kRange] : [q.k] });
    const { labels, centers } = relabelClusters(cleanLabels(quantized.clusterInds, padded.height, padded.width, settings.clean.minRun, settings.clean.passes), quantized.centers);
    const rgba = centers.map(center => center.map(value => Math.trunc(255 * value + 0.5)));
    const hex = rgba.map(color => `#${color.slice(0, 3).map(value => value.toString(16).toUpperCase().padStart(2, '0')).join('')}`);
    if (JSON.stringify(hex) !== JSON.stringify(smooth.palette.map(color => color.hex))) throw new Error('Stage palette differs from the application');
    const pixels = new Uint8ClampedArray(prepared.width * prepared.height * 4);
    for (let y = 0; y < prepared.height; y++) for (let x = 0; x < prepared.width; x++) {
      const layer = labels[(y + settings.preprocess.pad) * padded.width + x + settings.preprocess.pad] - 1;
      pixels.set(rgba[layer], (y * prepared.width + x) * 4);
    }
    const colors = await page.evaluate((/** @type {{width:number,height:number,pixels:number[]}} */ input) => {
      const canvas = document.createElement('canvas');
      canvas.width = input.width; canvas.height = input.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.putImageData(new ImageData(Uint8ClampedArray.from(input.pixels), input.width, input.height), 0, 0);
      return canvas.toDataURL('image/png');
    }, { width: prepared.width, height: prepared.height, pixels: Array.from(pixels) });
    if (errors.length) throw new Error(errors.join('; '));
    const jpeg = `data:image/jpeg;base64,${readFileSync(new URL('../../../raster-to-vector/examples/emoji-compressed.jpg', import.meta.url)).toString('base64')}`;
    const stages = ['Raster', 'Colours', 'Trace', 'Smooth'];
    const defs = `<clipPath id="raster-to-vector-image-bounds"><rect width="128" height="128"/></clipPath>
<clipPath id="raster-to-vector-reveal"><rect class="reveal" width="128" height="128"/></clipPath>
<linearGradient id="raster-to-vector-scan"><stop stop-color="#c5c8ce" stop-opacity="0"/><stop offset=".5" stop-color="#c5c8ce" stop-opacity=".65"/><stop offset="1" stop-color="#c5c8ce" stop-opacity="0"/></linearGradient>
<g id="raster-to-vector-input"><image href="${jpeg}" width="128" height="128"/></g>
<g id="raster-to-vector-colors"><image href="${colors}" width="128" height="128" image-rendering="pixelated"/></g>
<g id="raster-to-vector-traced" clip-path="url(#raster-to-vector-image-bounds)">${outlined(raw)}</g>
<g id="raster-to-vector-smooth" clip-path="url(#raster-to-vector-image-bounds)">${outlined(smooth)}</g>`;
    const ids = ['input', 'colors', 'traced', 'smooth'];
    const frame = (/** @type {number} */ active, processing = false) => `<rect x="6" y="6" width="168" height="168" rx="6" fill="white"/>
<use href="#raster-to-vector-${ids[active]}" transform="translate(8 8) scale(1.28125)"/>
${processing && active < 3 ? `<g transform="translate(8 8) scale(1.28125)" clip-path="url(#raster-to-vector-image-bounds)"><g clip-path="url(#raster-to-vector-reveal)"><use href="#raster-to-vector-${ids[active + 1]}"/></g><rect class="scan" x="-8" width="16" height="128" fill="url(#raster-to-vector-scan)"/></g>` : ''}
${stages.map((label, i) => `<g class="step${i === active ? ' active' : ''}"><circle cx="202" cy="${31 + i * 39}" r="11"/><text class="number" x="202" y="${35 + i * 39}">${i + 1}</text><text class="label" x="221" y="${36 + i * 39}">${label}</text></g>${i < 3 ? `<path class="connector" d="M202 ${45 + i * 39}v10m-3-3 3 3 3-3"/>` : ''}`).join('')}`;
    const frames = stages.map((_, i) => frame(i, true));
    const loop = flipbook('raster-to-vector', frames, 10);
    return art({
      name: 'raster-to-vector', period: 10, frames: stages.length, defs,
      body: `<g class="finished">${frame(3)}</g><g class="process">${loop.body}</g>`,
      css: `& .process{display:none} & text{font-family:system-ui,sans-serif} & .label{font-size:17px;fill:var(--art-muted)} & .number{font-size:11px;text-anchor:middle;fill:var(--art-muted)} & .step circle{fill:var(--art-paper);stroke:var(--art-line)} & .active circle{fill:#e7a1b9;stroke:#b46b87} & .active .label{fill:var(--art-ink);font-weight:650} & .active .number{fill:#482537;font-weight:700} & .connector{fill:none;stroke:var(--art-line);stroke-width:1.25}`,
      loop: `& .finished{display:none} & .process{display:block}
& .reveal { transform-origin: 0 0; animation: raster-to-vector-reveal 2.5s linear infinite; }
& .scan { animation: raster-to-vector-scan 2.5s linear infinite; }
@keyframes raster-to-vector-reveal { 0%,15% { transform:scaleX(0); } 80%,100% { transform:scaleX(1); } }
@keyframes raster-to-vector-scan { 0%,15% { transform:translateX(0); opacity:0; } 16% { opacity:1; } 80% { transform:translateX(128px); opacity:1; } 81%,100% { transform:translateX(128px); opacity:0; } }
${loop.css}\n${loop.loop}`,
    });
  } finally { await close(); }
}
