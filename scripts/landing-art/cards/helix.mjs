// Helix and Braid: the tool's "Two colours" helix above its default three-strand braid, both
// running off the edges. The loop moves each along by one period, which for a helix is a phase
// advance of one turn and for the braid one full twist, so its last frame is its first.
import { submit } from '../../../helix/core/index.js';
import { W, art, roundPath } from '../svg.mjs';

const PERIOD = 4;

/** The filled SVG's paths, rounded, with the tool's colour groups kept. */
function paths(svg) {
  return [...svg.matchAll(/<g id="[^"]+" fill="(#[0-9a-fA-F]+)"[^>]*>([\s\S]*?)<\/g>/g)]
    .map(([, fill, inner]) => `<g fill="${fill}">${[...inner.matchAll(/d="([^"]+)"/g)].map(([, d]) => `<path d="${roundPath(d)}"/>`).join('')}</g>`)
    .join('\n');
}

export function build() {
  // The "Two colours" preset's look on a horizontal axis. Six turns of 80 px cover the canvas
  // plus the turn the loop moves; 241 points put exactly 40 samples in each turn, so every turn's
  // crossing gaps and base pairs fall at the same places and the shifted helix is the same helix.
  const turn = 80;
  const helix = submit({
    mode: 'helix',
    helix: {
      turns: 6, frequency: 2, rotation: 90, points: 241, strandThickness: 4, basePairsPerTurn: 8,
      basePairThickness: 0.6, squareWave: 0, crossingGap: 0.5, box: { width: 6 * turn, height: 200 },
      colors: { strand1: '#2b66d5', strand2: '#d5462b', basePairs: '#8a8a8a' },
    },
    output: { unit: 'px' },
  });
  const xs = helix.geometry.strands.flatMap((s) => s.pieces.flat().map((p) => p[0]));
  const helixLeft = Math.min(...xs);
  if (Math.abs(Math.max(...xs) - helixLeft - 6 * turn) > 0.01) throw new Error('helix: the turns are not 80 px long');

  // The braid's colours repeat every length / twists: five twists of 100 px.
  const twist = 100;
  const braid = submit({ mode: 'braid', braid: { length: 5 * twist, width: 30, twists: 5, minSegments: 150 }, output: { unit: 'px' } });
  const braidLeft = (braid.width - 5 * twist) / 2;

  const helixY = 64 - helix.height / 2;
  const braidY = 138 - braid.height / 2;
  const body = `<g class="helix" transform="translate(${-turn - 20 - helixLeft} ${helixY.toFixed(1)})"><g class="move">
${paths(helix.svg)}
</g></g>
<g class="braid" transform="translate(${-twist - 40 - braidLeft} ${braidY.toFixed(1)})"><g class="move">
${paths(braid.svg)}
</g></g>`;
  // Through the loop the drawings span [-100, 460] and [-140, 460]: the canvas stays covered.
  if (6 * turn - turn - 20 < W + 20 || 5 * twist - twist - 40 < W + 20) throw new Error('helix: too short to cover the canvas through the loop');
  return art({
    name: 'helix',
    period: PERIOD,
    body,
    loop: `& .helix .move { animation: helix-turn ${PERIOD}s linear infinite; }
& .braid .move { animation: helix-twist ${PERIOD}s linear infinite; }
@keyframes helix-turn { to { transform: translateX(${turn}px); } }
@keyframes helix-twist { to { transform: translateX(${twist}px); } }`,
  });
}
