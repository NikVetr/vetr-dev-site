// The hypercube's loop on a card picture: the k = 4 plan drawn by the tool's own core
// (hypercube/core) on a canvas over the still, one plan frame per 1/60 s, the tool's own speed,
// from the still's frame, in the box the SVG names (data-player-box, "x y size" on its canvas).
// The plan is R's closed loop, so its last frame leads into its first with no seam. The clock is
// the picture's CSS loop when it has one, so the two stay in step and wrap together. The plan
// and the core load on the first hover only, and nothing runs once the card is left.
import { decodePlan, drawFrame } from '../../hypercube/core/index.js';

const STILL = 700;   // the frame scripts/landing-art/cards/hypercube.mjs draws as the still
const EDGE_WIDTH = 1.2;

/** @type {Promise<import('../../hypercube/core/plan.js').Plan> | undefined} */
let plan;

/** Loads the plan; resolves when the loop can start. */
export function prepare() {
  plan ??= fetch('hypercube/plans/k4.json').then((r) => {
    if (!r.ok) throw new Error(`hypercube plan: HTTP ${r.status}`);
    return r.text();
  }).then(decodePlan);
  return plan;
}

/** Starts the loop in this card picture (after prepare); returns the function that stops it. @param {HTMLElement} art */
export function play(art) {
  const svg = /** @type {SVGSVGElement} */ (art.querySelector('svg'));
  const [bx, by, size] = (svg.dataset.playerBox ?? '').split(' ').map(Number);
  const view = svg.viewBox.baseVal;
  const canvas = document.createElement('canvas');
  canvas.className = 'card-player';
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  let raf = 0;
  let stopped = false;
  prepare().then((p) => {
    if (stopped) return;
    const box = { bx, by, size, view };
    // The still's frame is on the canvas before the canvas takes the still's place.
    paint(ctx, canvas, art, p, box, STILL);
    art.append(canvas);
    let start = -1;
    /** @param {number} now */
    const tick = (now) => {
      if (start < 0) start = now;
      const css = art.getAnimations({ subtree: true })[0];
      const elapsed = css && typeof css.currentTime === 'number' ? css.currentTime : now - start;
      paint(ctx, canvas, art, p, box, ((STILL - 1 + Math.round((elapsed * p.stepsPerSecond) / 1000)) % p.frames) + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    canvas.remove();
  };
}

/**
 * One frame in the named box, the picture's canvas fitted into its box as the SVG is (meet).
 * @param {CanvasRenderingContext2D} ctx @param {HTMLCanvasElement} canvas @param {HTMLElement} art
 * @param {import('../../hypercube/core/plan.js').Plan} p
 * @param {{ bx: number, by: number, size: number, view: DOMRect }} box @param {number} frame
 */
function paint(ctx, canvas, art, p, { bx, by, size, view }, frame) {
  const dpr = devicePixelRatio || 1;
  const [w, h] = [art.clientWidth, art.clientHeight];
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const list = drawFrame(p, frame, { style: 'translucent', faceAlpha: p.colors.faceAlpha, numerals: false, theme, size, camera: [1, 0, 0, 0] });
  const s = Math.min(w / view.width, h / view.height);
  const ox = (w - view.width * s) / 2 + bx * s;
  const oy = (h - view.height * s) / 2 + by * s;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  ctx.fillStyle = p.colors.face;
  ctx.globalAlpha = p.colors.faceAlpha;
  for (const face of list.faces) {
    const q = face.points;
    ctx.beginPath();
    ctx.moveTo(q[0], q[1]);
    ctx.lineTo(q[2], q[3]);
    ctx.lineTo(q[4], q[5]);
    ctx.lineTo(q[6], q[7]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const e = list.edges.segments;
  ctx.strokeStyle = list.edges.color;
  ctx.lineWidth = EDGE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < e.length; i += 4) {
    ctx.moveTo(e[i], e[i + 1]);
    ctx.lineTo(e[i + 2], e[i + 3]);
  }
  ctx.stroke();
}
