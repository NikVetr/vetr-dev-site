// Core-fitted layouts converge from illustrative shuffled arrangements, then engrave.
import { readFileSync } from 'node:fs';
import { submit } from '../../../name-tags/core/index.js';
import { BALANCED_STYLE } from '../../../name-tags/presets.js';
import { H, W, art, num, simplifyPath } from '../svg.mjs';

const PERIOD = 10;

export async function build() {
  const read = (/** @type {string} */ f) => readFileSync(new URL(`../../../name-tags/examples/${f}`, import.meta.url), 'utf8');
  const names = read('historical-figures.txt').trim().split('\n');
  const tray = JSON.parse(read('tray-4x3.json'));
  const result = await submit({ names, tray, style: BALANCED_STYLE });
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

  // The SVG orders each cell's glyphs by line, followed by its helix.
  /** @type {string[]} */
  const groups = [];
  let tagIndex = -1, glyphIndex = 0;
  for (const [, attrs, d] of paths) {
    if (attrs.includes('stroke="#333333"')) { tagIndex++; glyphIndex = 0; continue; }
    if (!attrs.includes('fill="#000000"')) continue;
    const counts = result.tags[tagIndex].lines.map((/** @type {string} */ line) => [...line.replaceAll(' ', '')].length);
    const part = glyphIndex < counts[0] ? 0 : glyphIndex < counts[0] + counts[1] ? 1 : 2;
    const index = tagIndex * 3 + part;
    groups[index] = (groups[index] ?? '') + simplifyPath(d, at, 0.12);
    glyphIndex++;
  }
  const motions = groups.map((d, i) => {
    const dx = Math.sin(i * 13.7 + 2) * 9, dy = Math.cos(i * 7.3 + 1) * 8;
    const angle = Math.sin(i * 2.1) * 12;
    return `& .piece-${i} { animation: name-tags-place-${i} ${PERIOD}s ease-in-out infinite; }
@keyframes name-tags-place-${i} { 0%, 7% { transform: translate(${num(dx)}px, ${num(dy)}px) rotate(${num(angle)}deg) scale(0.82); } 34%, 100% { transform: none; } }`;
  }).join('\n');
  return art({
    name: 'name-tags', period: PERIOD,
    defs: `<path id="name-tags-design" d="${engraving}"/>
<clipPath id="name-tags-etched"><rect class="scan-window" width="${W}" height="${H}"/></clipPath>
<mask id="name-tags-contact" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><use href="#name-tags-design" fill="white" stroke="white" stroke-width="1"/></mask>`,
    body: `<g class="layout">${groups.map((d, i) => `<path class="piece piece-${i}" d="${d}"/>`).join('')}</g>
<g clip-path="url(#name-tags-etched)"><rect class="paper" width="${W}" height="${H}"/><use class="engraving" href="#name-tags-design"/></g>
<g class="laser-pass"><path class="laser" d="M0 0H${W}"/><g mask="url(#name-tags-contact)"><path class="contact" d="M0 0H${W}"/></g></g>
<path class="cells" d="${cells}"/>`,
    css: `& .engraving { fill: var(--art-ink); stroke: var(--art-ink); stroke-width: 0.18; fill-rule: evenodd; }
& .layout { opacity: 0; }
& .piece { fill: none; stroke: #8b939c; stroke-width: 0.45; transform-box: fill-box; transform-origin: center; }
& .cells { fill: none; stroke: var(--art-muted); stroke-width: 0.6; stroke-linejoin: round; }
& .paper { fill: var(--art-paper); }
& .laser-pass { opacity: 0; }
& .laser { stroke: #c92926; stroke-width: 0.6; }
& .contact { stroke: #ff5145; stroke-width: 2.8; stroke-linecap: round; filter: drop-shadow(0 0 1px #ff3228); }`,
    loop: `& .layout { opacity: 1; }
${motions}
& .scan-window { animation: name-tags-reveal ${PERIOD}s linear infinite; }
& .laser, & .contact { animation: name-tags-scan ${PERIOD}s linear infinite; }
& .laser-pass { animation: name-tags-laser ${PERIOD}s linear infinite; }
@keyframes name-tags-reveal { 0%, 43% { transform: translateY(${-H}px); } 83%, 100% { transform: translateY(0); } }
@keyframes name-tags-scan { 0%, 43% { transform: translateY(0); } 83%, 100% { transform: translateY(${H}px); } }
@keyframes name-tags-laser { 0%, 42% { opacity: 0; } 43%, 82% { opacity: 1; } 83%, 100% { opacity: 0; } }`,
  });
}
