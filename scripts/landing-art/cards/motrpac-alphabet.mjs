// Exact editor seed geometry and the supplied Mattlab painter’s reference design.
import { createRequire } from 'node:module';
import { openPage } from '../browser.mjs';
import { art, esc } from '../svg.mjs';

const require = createRequire(import.meta.url);
const Core = require('../../../motrpac-alphabet/mattlab/core.js');
const Glyphs = require('../../../motrpac-alphabet/mattlab/glyphs.js');

export async function build() {
  const { page, errors, close } = await openPage('motrpac-alphabet/');
  /** @type {{letter: string, viewBox: string, shapes: string[]}[]} */
  let letters;
  try {
    letters = await page.evaluate(() => ['A', 'M', 'Z'].map(letter => {
      const svg = document.querySelector(`.letter-card[data-letter="${letter}"] svg`);
      if (!svg) throw new Error(`Missing editor seed: ${letter}`);
      return { letter, viewBox: svg.getAttribute('viewBox') || '',
        shapes: [...svg.querySelectorAll(':scope > g')].map(g => g.outerHTML) };
    }));
    if (errors.length) throw new Error(errors.join('\n'));
  } finally { await close(); }
  const name = 'motrpac-alphabet';
  const design = Glyphs.getDesign('@original');
  if (!design) throw new Error('Missing Mattlab reference design');
  const fill = design.fills;
  const faces = Core.FACES.map((/** @type {{id:string,d:string}} */ face, /** @type {number} */ i) =>
    `<path class="paint-${i}" d="${esc(face.d)}" fill="${fill[face.id]}"/>`).join('');
  const pair = [letters[0], letters[2]];
  // Both editors work on light paper: keep the actual logo colours legible in dark mode too.
  const body = `<rect width="480" height="180" rx="5" fill="#fff"/>
    <text x="135" y="19" text-anchor="middle" fill="#5e6b78" font-size="12">MotRPAC alphabet</text>
    <text x="375" y="19" text-anchor="middle" fill="#5e6b78" font-size="12">Mattlab</text>
    ${pair.map((letter,k)=>`<svg x="${10+k*125}" y="30" width="115" height="145" viewBox="${letter.viewBox}">${letter.shapes.map((g,i)=>`<g class="piece-${k}-${i}">${g}</g>`).join('')}</svg>`).join('')}
    <svg x="280" y="35" width="190" height="135" viewBox="260 132 1004 748">${faces}</svg>`;
  const loop = pair.flatMap((letter,k)=>letter.shapes.map((_,i)=>`& .piece-${k}-${i} { animation: ${name}-piece-${k}-${i} 9s linear infinite; }
    @keyframes ${name}-piece-${k}-${i} { 0%,${4+k*10+i*2}% {opacity:.12} ${7+k*10+i*2}%,94% {opacity:1} 100% {opacity:.12} }`)).join('\n') +
    Core.FACES.map((_,i)=>`& .paint-${i} { animation: ${name}-paint-${i} 9s linear infinite; }
    @keyframes ${name}-paint-${i} { 0%,${30+i*1.8}% {fill:var(--art-line)} ${32+i*1.8}%,94% {fill:${fill[Core.FACES[i].id]}} 100% {fill:var(--art-line)} }`).join('\n');
  return art({ name, body, loop, period:9, width:480 });
}
