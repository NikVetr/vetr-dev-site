// The page's real Noto emoji JPEG example, with deliberate compression artefacts,
// beside its actual vector conversion. The loop wipes the raster over the vector.
import { readFileSync } from 'node:fs';
import { openPage } from '../browser.mjs';
import { art } from '../svg.mjs';

export async function build() {
  const { page, errors, close } = await openPage('raster-to-vector/');
  let svg;
  try {
    await page.locator('#example-emoji').click();
    await page.waitForFunction(() => /** @type {any} */ (window).RasterToVector?.getResult()?.width === 128);
    svg = await page.evaluate(() => /** @type {any} */ (window).RasterToVector.exportSvgText());
    if (errors.length) throw new Error(errors.join('; '));
  } finally { await close(); }
  if (!svg?.startsWith('<svg')) throw new Error('Emoji conversion did not produce SVG');
  const vector = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const jpeg = `data:image/jpeg;base64,${readFileSync(new URL('../../../raster-to-vector/examples/emoji-compressed.jpg', import.meta.url)).toString('base64')}`;
  return art({
    name: 'raster-to-vector', period: 6,
    defs: '<clipPath id="raster-to-vector-wipe"><rect class="wipe" x="168" y="8" width="0" height="144"/></clipPath>',
    body: `<rect class="paper" x="8" y="8" width="144" height="144" rx="4"/><rect class="paper" x="168" y="8" width="144" height="144" rx="4"/>
<image href="${jpeg}" x="8" y="8" width="144" height="144" image-rendering="pixelated"/>
<g transform="translate(168 8) scale(1.125)">${vector}</g>
<image href="${jpeg}" x="168" y="8" width="144" height="144" image-rendering="pixelated" clip-path="url(#raster-to-vector-wipe)"/>
<text x="80" y="169">JPEG input</text><text x="240" y="169">Smoothed SVG</text>`,
    css: '& .paper {fill:white} & text {font:11px system-ui,sans-serif;fill:var(--art-ink);text-anchor:middle}',
    loop: '& .wipe {animation:raster-to-vector-wipe 6s ease-in-out infinite} @keyframes raster-to-vector-wipe {0%,12%,100%{width:0px}42%,62%{width:144px}88%{width:0px}}',
  });
}
