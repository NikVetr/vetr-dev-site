// Hypercube Rotation: the tesseract's shadow, drawn from the k = 4 plan by the tool's core in
// R's translucent style. The loop is the plan's whole cycle (line, square, cube, tesseract and
// folding back), which the R pipeline solves to have no seam, at every 8th of its 1,488 frames:
// 186 frames at 30 per second, four times the tool's speed. It starts at the still.
import { readFileSync } from 'node:fs';
import { decodePlan, submit } from '../../../hypercube/core/index.js';
import { H, W, art, flipbook, num } from '../svg.mjs';

const STILL = 700;   // a frame in the tesseract stage
const STEP = 8;
const FPS = 30;

export function build() {
  const plan = decodePlan(readFileSync(new URL('../../../hypercube/plans/k4.json', import.meta.url), 'utf8'));
  if (plan.frames % STEP) throw new Error(`hypercube: ${STEP} does not divide the plan's ${plan.frames} frames`);
  const size = H - 8;
  const x0 = (W - size) / 2;
  const y0 = (H - size) / 2;
  const frames = [];
  /** @type {{ fill: string, alpha: number }} */
  let style = { fill: '#87CEFA', alpha: 0 };
  for (let i = 0; i < plan.frames / STEP; i++) {
    const frame = ((STILL - 1 + i * STEP) % plan.frames) + 1;
    const { geometry, faceAlpha } = /** @type {any} */ (submit({ k: 4, frame, render: 'geometry', size }, plan));
    if (i === 0) style = { fill: geometry.faces[0]?.fill ?? style.fill, alpha: faceAlpha };
    const at = (/** @type {number} */ v) => {
      const [x, y] = geometry.vertices[v];
      return `${num(x0 + size / 2 + x * geometry.scale)} ${num(y0 + size / 2 - y * geometry.scale)}`;
    };
    const faces = geometry.faces.map((/** @type {{ vertices: number[] }} */ f) => `<path d="M${f.vertices.map(at).join('L')}Z"/>`).join('');
    const edges = geometry.edges.map((/** @type {number[]} */ [a, b]) => `M${at(a)}L${at(b)}`).join('');
    frames.push(`<g class="faces">${faces}</g><path class="edges" d="${edges}"/>`);
  }
  const period = frames.length / FPS;
  const book = flipbook('hypercube', frames, period);
  return art({
    name: 'hypercube',
    period,
    frames: book.frames,
    body: book.body,
    // R's colours: faces #87CEFA at its opacity for k = 4, edges #00688B; on the dark theme the
    // tool's own dark edge colour.
    css: `${book.css}
& .faces { fill: ${style.fill}; fill-opacity: ${num(style.alpha, 3)}; }
& .edges { fill: none; stroke: #00688B; stroke-width: 1.2; stroke-linecap: round; }
:root[data-theme="dark"] & .edges { stroke: #1f7fa8; }`,
    loop: book.loop,
  });
}
