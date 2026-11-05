// Helix and Braid: the tool's "Two colours" helix beside its default three-strand braid, both
// upright, as the tool draws a helix by default, and running off the top and bottom. The loop
// moves each along by one period, which for a helix is a phase advance of one turn and for the
// braid one full twist, so its last frame is its first.
import { submit } from '../../../helix/core/index.js';
import { TALL, art, roundPath } from '../svg.mjs';

const { width: W, height: H } = TALL;   // a 1x3 tile
const PERIOD = 4;

/** The filled SVG's paths, rounded, with the tool's colour groups kept. @param {string} svg */
function paths(svg) {
  return [...svg.matchAll(/<g id="[^"]+" fill="(#[0-9a-fA-F]+)"[^>]*>([\s\S]*?)<\/g>/g)]
    .map(([, fill, inner]) => `<g fill="${fill}">${[...inner.matchAll(/d="([^"]+)"/g)].map(([, d]) => `<path d="${roundPath(d)}"/>`).join('')}</g>`)
    .join('\n');
}

export function build() {
  // Six turns of 80 px cover the canvas plus the turn the loop moves. 145 points put exactly 24
  // samples in each turn, 3 between base pairs, which snap to samples: every turn's crossing
  // gaps and base pairs fall at the same places, so the shifted helix is the same helix.
  const turn = 80;
  const helix = submit({
    mode: 'helix',
    helix: {
      turns: 6, frequency: 2, rotation: 0, points: 145, strandThickness: 4, basePairsPerTurn: 8,
      basePairThickness: 0.6, squareWave: 0, crossingGap: 0.5, box: { width: 200, height: 6 * turn },
      colors: { strand1: '#2b66d5', strand2: '#d5462b', basePairs: '#8a8a8a' },
    },
    output: { unit: 'px' },
  });
  const geometry = /** @type {{ strands: { pieces: number[][][] }[] }} */ (helix.geometry);
  const ys = geometry.strands.flatMap((s) => s.pieces.flat().map((p) => p[1]));
  const helixTop = Math.min(...ys);
  if (Math.abs(Math.max(...ys) - helixTop - 6 * turn) > 0.01) throw new Error('helix: the turns are not 80 px long');

  // The braid's colours repeat every length / twists: five twists of 100 px, turned upright.
  const twist = 100;
  const braid = submit({ mode: 'braid', braid: { length: 5 * twist, width: 30, twists: 5, minSegments: 150, rotation: 90 }, output: { unit: 'px' } });
  const braidTop = (braid.height - 5 * twist) / 2;

  // Through the loop the drawings span [-100, 460] and [-140, 460]: the canvas stays covered.
  if (6 * turn - turn - 20 < H + 20 || 5 * twist - twist - 40 < H + 20) throw new Error('helix: too short to cover the canvas through the loop');
  const helixX = 66 - helix.width / 2;
  const braidX = 148 - braid.width / 2;
  const body = `<g class="helix" transform="translate(${helixX.toFixed(1)} ${-turn - 20 - helixTop})"><g class="move">
${paths(helix.svg)}
</g></g>
<g class="braid" transform="translate(${braidX.toFixed(1)} ${-twist - 40 - braidTop})"><g class="move">
${paths(braid.svg)}
</g></g>`;
  return art({
    name: 'helix',
    period: PERIOD,
    width: W,
    height: H,
    body,
    css: '& .move { will-change: transform; }',
    loop: `& .helix .move { animation: helix-turn ${PERIOD}s linear infinite; }
& .braid .move { animation: helix-twist ${PERIOD}s linear infinite; }
@keyframes helix-turn { to { transform: translateY(${turn}px); } }
@keyframes helix-twist { to { transform: translateY(${twist}px); } }`,
  });
}
