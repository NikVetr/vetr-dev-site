// Hypercube Rotation: the tesseract's shadow at a frame of the k = 4 plan, drawn by the tool's
// core in R's translucent style. Its loop is assets/players/hypercube.js, which paints the plan
// frame by frame on a canvas at the tool's speed from this frame, so it runs as smoothly as the
// display allows; the plan is R's closed loop, so its last frame leads into its first.
import { readFileSync } from 'node:fs';
import { decodePlan, drawFrame } from '../../../hypercube/core/index.js';
import { H, W, art, num } from '../svg.mjs';

// assets/players/hypercube.js draws the same frame first, at the same place and width.
const STILL = 700;   // a frame in the tesseract stage
const SIZE = H - 8;
const EDGE_WIDTH = 1.2;

export function build() {
  const plan = decodePlan(readFileSync(new URL('../../../hypercube/plans/k4.json', import.meta.url), 'utf8'));
  const list = drawFrame(plan, STILL, { style: 'translucent', faceAlpha: plan.colors.faceAlpha, numerals: false, theme: 'light', size: SIZE, camera: [1, 0, 0, 0] });
  const [x0, y0] = [(W - SIZE) / 2, (H - SIZE) / 2];
  const pt = (/** @type {number} */ x, /** @type {number} */ y) => `${num(x0 + x, 2)} ${num(y0 + y, 2)}`;
  const faces = list.faces.map((f) => `<path d="M${pt(f.points[0], f.points[1])}L${pt(f.points[2], f.points[3])}L${pt(f.points[4], f.points[5])}L${pt(f.points[6], f.points[7])}Z"/>`).join('');
  const s = list.edges.segments;
  let edges = '';
  for (let i = 0; i < s.length; i += 4) edges += `M${pt(s[i], s[i + 1])}L${pt(s[i + 2], s[i + 3])}`;
  return art({
    name: 'hypercube',
    period: plan.frames / plan.stepsPerSecond,
    player: 'hypercube',
    body: `<g class="faces">${faces}</g><path class="edges" d="${edges}"/>`,
    // R's colours: faces #87CEFA at its opacity for k = 4, edges #00688B; on the dark theme the
    // tool's own dark edge colour.
    css: `& .faces { fill: ${plan.colors.face}; fill-opacity: ${num(plan.colors.faceAlpha, 3)}; }
& .edges { fill: none; stroke: ${plan.colors.edge}; stroke-width: ${EDGE_WIDTH}; stroke-linecap: round; stroke-linejoin: round; }
:root[data-theme="dark"] & .edges { stroke: #1f7fa8; }`,
  });
}
