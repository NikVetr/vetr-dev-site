// Name Tags: the page's example names (twelve historical figures), each fitted around a DNA
// helix by the tool's core with its defaults, laid out on the tool's own 4 × 3 example tray
// (examples/tray-4x3.json), which holds exactly those twelve. The engraving is simplified to the
// card's scale. The loop: the engraving fades, then a laser line scans down the tray and the
// engraving reappears behind it, back to the finished sheet. The scan is a paper-coloured cover
// that only translates, with the line along its top edge.
import { readFileSync } from 'node:fs';
import { submit } from '../../../name-tags/core/index.js';
import { H, W, art, num, simplifyPath } from '../svg.mjs';

const PERIOD = 6;

export async function build() {
  const read = (/** @type {string} */ f) => readFileSync(new URL(`../../../name-tags/examples/${f}`, import.meta.url), 'utf8');
  const names = read('historical-figures.txt').trim().split('\n');
  const tray = JSON.parse(read('tray-4x3.json'));
  const result = await submit({ names, tray });
  if (result.sheets.length !== 1) throw new Error('name-tags: the example should fill one sheet');
  const svg = result.sheets[0].svg;

  // The cells' extent on the page (inches, y up), mapped into the canvas (the sheet is 96 units
  // per inch, y down).
  const [cw, ch] = tray.cell_in;
  const [cols, rows] = tray.grid;
  const [sx, sy] = tray.spacing_in;
  const left = tray.first_center_in[0] - cw / 2;
  const bottom = tray.first_center_in[1] - ch / 2;
  const width = cols * cw + (cols - 1) * sx;
  const height = rows * ch + (rows - 1) * sy;
  const k = Math.min((W - 14) / width, (H - 14) / height) / 96;
  const top = (tray.page_in[1] - bottom - height) * 96;
  const ox = (W - width * 96 * k) / 2 - left * 96 * k;
  const oy = (H - height * 96 * k) / 2 - top * k;
  const at = (/** @type {number} */ x, /** @type {number} */ y) => [ox + x * k, oy + y * k];

  const paths = [...svg.matchAll(/<path ([^>]*?)d="([^"]+)"/g)];
  const cells = paths.filter(([, attrs]) => attrs.includes('stroke="#333333"')).map(([, , d]) => simplifyPath(d, at, 0.05)).join('');
  const engraving = paths.filter(([, attrs]) => attrs.includes('fill="#000000"')).map(([, , d]) => simplifyPath(d, at, 0.12)).join('');
  if (!cells || !engraving) throw new Error('name-tags: the sheet has no cells or engraving');

  const p = (/** @type {number} */ t) => num((100 * t) / PERIOD, 3);
  return art({
    name: 'name-tags',
    period: PERIOD,
    // The cover rests just below the canvas, the laser line 2 units inside it.
    body: `<path class="engraving" d="${engraving}"/>
<g class="scan"><rect class="cover" x="0" y="${H}" width="${W}" height="${H + 4}"/><path class="laser" d="M0 ${H + 2}H${W}"/></g>
<path class="cells" d="${cells}"/>`,
    // The sheet's colours: black engraving (the theme's ink here), #333333 cell outlines.
    css: `& .engraving { fill: var(--art-ink); fill-rule: evenodd; }
& .cells { fill: none; stroke: var(--art-muted); stroke-width: 0.6; stroke-linejoin: round; }
& .cover { fill: var(--art-paper); }
& .laser { stroke: #e0302a; stroke-width: 1.2; }`,
    // 0-0.8 still; engraving fades 0.8-1.2; the cover jumps over the tray at 1.25, where the
    // engraving is back under it by 1.35; the scan moves down 1.4-5.0 and rests below to 6.
    loop: `& .engraving { animation: name-tags-fade ${PERIOD}s linear infinite; }
& .scan { animation: name-tags-scan ${PERIOD}s linear infinite; }
@keyframes name-tags-fade { 0%, ${p(0.8)}% { opacity: 1; } ${p(1.2)}%, ${p(1.25)}% { opacity: 0; } ${p(1.35)}%, 100% { opacity: 1; } }
@keyframes name-tags-scan { 0% { transform: none; } ${p(1.25)}% { transform: none; animation-timing-function: step-end; } ${p(1.26)}%, ${p(1.4)}% { transform: translateY(${-H - 4}px); } ${p(5)}%, 100% { transform: none; } }`,
  });
}
