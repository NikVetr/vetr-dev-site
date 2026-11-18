// Coordinates are in a 960 × 540 view. Seeking a frame never advances shared state.
import { checkRequestKeys, invalidRequest } from '../shared/request.js';
import { mulberry32 } from '../shared/rng.js';
export const duration = 16;
const clamp = (x) => Math.max(0, Math.min(1, x));
const logistic = (x) => 1 / (1 + Math.exp(-x));
const columns = 84,
  rows = 30,
  dx = 960 / columns,
  dy = 540 / rows;

export function makeScene({
  title = 'THE MATRIX: CORRELATIONS',
  alphabet = 'ACGT',
  seed = 777,
  mode = 'opening',
  crt = 0.76,
} = {}) {
  if (
    typeof title !== 'string' ||
    [...title].length > 40 ||
    typeof alphabet !== 'string' ||
    !alphabet.trim() ||
    [...alphabet].length > 64 ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !['opening', 'rain'].includes(mode) ||
    !Number.isFinite(crt) ||
    crt < 0 ||
    crt > 1
  )
    throw invalidRequest(
      '$',
      'Use a title of up to 40 characters, a nonempty alphabet of up to 64 characters, a 32-bit unsigned seed, a known mode and CRT strength 0–1.',
    );
  const rand = mulberry32(seed);
  const letters = [...title],
    glyphs = [...alphabet];
  const first = Math.floor((columns - letters.length) / 2);
  const streams = Array.from({ length: columns }, (_, i) => {
    const lock = 8 + 3 * rand(),
      fade = 13 + 2 * rand(),
      length = 9 + Math.floor(rand() * 16);
    const start = 0.1 + rand() * 0.9,
      period = rows + length + 4;
    const letter = letters[i - first] || '';
    const speed = mode === 'opening' && letter ? (period + rows / 2) / (lock - start) : 7.5 + 7.5 * rand();
    return {
      lock,
      fade,
      length,
      start,
      speed,
      period,
      letter,
      bright: rand() < 0.5,
      sequence: Array.from({ length: 149 }, () => glyphs[Math.floor(rand() * glyphs.length)]),
    };
  });
  return { title, mode, crt, streams, letters: letters.filter((c) => c.trim()) };
}
/** @param {ReturnType<typeof makeScene>} scene @param {number} time */
export function frame(scene, time) {
  if (!Number.isFinite(time) || time < 0 || time > duration)
    throw invalidRequest('time', 'Frame time must be between 0 and 16 seconds.');
  const opening = scene.mode === 'opening';
  const titleZoom = Math.min(3, (columns - 4) / Math.max(1, [...scene.title].length));
  const zoom = opening
    ? 1 + (titleZoom - 1) * logistic((time - 8) * 2) + (12 - titleZoom) * logistic((time - 14.75) * 4)
    : 1;
  const glyphs = [];
  for (const [i, s] of scene.streams.entries()) {
    const x = 480 + ((i + 0.5) * dx - 480) * zoom;
    if (x < -dx * zoom || x > 960 + dx * zoom) continue;
    const phase = Math.floor((time - s.start) * s.speed);
    if (phase < 0) continue;
    const head = phase % s.period;
    const locked = opening && s.letter && time >= s.lock;
    const fade = locked ? clamp((s.fade + 0.28 - time) / 0.28) : 1;
    for (let tail = 0; tail < s.length && fade > 0; tail++) {
      const row = head - tail;
      if (row < 0 || row >= rows || (locked && row >= rows / 2)) continue;
      const y = 270 + ((row + 0.5) * dy - 270) * zoom;
      if (y < -dy * zoom || y > 540 + dy * zoom) continue;
      const index = (phase - tail + Math.floor(time * 3 + i * 0.37)) % s.sequence.length;
      const glitch =
        Math.imul((i + 1) * 101 + (row + 1) * 787 + Math.floor(time * 4) * 1543, 2654435761) >>> 0;
      const char =
        scene.letters.length && glitch % 100 < 2
          ? scene.letters[glitch % scene.letters.length]
          : s.sequence[index];
      glyphs.push({ x, y, char, alpha: (1 - tail / s.length) * fade, hot: tail === 0 && s.bright });
    }
    if (locked && fade > 0)
      glyphs.push({ x, y: 270 + (dy * zoom) / 2, char: s.letter, alpha: fade, hot: true });
  }
  // A ghosted image early on returns through the title for the final push-in.
  const ghost = clamp((time - 0.25) / 1.25) * clamp((4.75 - time) / 3);
  const reveal = logistic((time - 14) * 3.5);
  return {
    time,
    zoom,
    glyphs,
    crt: scene.crt,
    size: dy * zoom,
    imageAlpha: opening ? Math.max(ghost * 0.48, reveal) : 0,
    imageZoom: 1 + 0.12 * ghost + 0.8 * reveal,
  };
}

/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof frame>} f @param {HTMLImageElement | null} image */
export function paint(ctx, f, image) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.scale(width / 960, height / 540);
  ctx.fillStyle = '#010704';
  ctx.fillRect(0, 0, 960, 540);
  ctx.font = '600 ' + f.size + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const g of f.glyphs) {
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = g.hot ? '#d5fce7' : '#00ff41';
    ctx.shadowColor = '#43ff83';
    ctx.shadowBlur = g.hot ? 3 * f.crt : 0;
    ctx.fillText(g.char, g.x, g.y);
  }
  ctx.shadowBlur = 0;
  if (image && f.imageAlpha > 0.002) {
    ctx.globalAlpha = f.imageAlpha;
    const scale = Math.max(960 / image.width, 540 / image.height) * f.imageZoom;
    const w = image.width * scale,
      h = image.height * scale;
    ctx.drawImage(image, (960 - w) / 2, (540 - h) / 2, w, h);
  }
  ctx.globalAlpha = 1;
  if (f.crt > 0) {
    // A staggered slot mask grows with the zoom, anchored at the optical center.
    const pitch = 2.75 * Math.sqrt(f.zoom);
    const band = pitch * 1.8;
    ctx.fillStyle = 'rgba(0,8,4,' + 0.48 * f.crt + ')';
    for (let y = 270 - Math.ceil(270 / band) * band; y < 540; y += band)
      ctx.fillRect(0, y, 960, Math.max(0.6, band * 0.17));
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(0.55, pitch * 0.15);
    ctx.setLineDash([band * 0.82, band * 1.18]);
    for (let parity = 0; parity < 2; parity++) {
      const y = 270 - Math.ceil(270 / (2 * band)) * 2 * band + band * (0.18 + parity) - 2 * band;
      ctx.beginPath();
      for (let x = 480 - Math.ceil(480 / pitch) * pitch + (parity * pitch) / 2; x < 960; x += pitch) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, 540);
      }
      ctx.stroke();
    }
    // The old CRT also had independent, low-alpha row and column intensity drift.
    const tick = Math.floor(f.time * 5);
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = f.crt * (0.02 + 0.025 * (1 + Math.sin(i * 13.4 + tick * 1.7)));
      ctx.fillStyle = '#001006';
      ctx.fillRect(i * 40, 0, 40, 540);
      ctx.fillRect(0, i * 22.5, 960, 22.5);
    }
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(480, 270, 140, 480, 270, 565);
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(0,4,2,' + 0.75 * f.crt + ')');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, 960, 540);
  }
  ctx.restore();
}
export function submit(input) {
  checkRequestKeys(input, ['time', 'title', 'alphabet', 'seed', 'mode', 'crt']);
  const { time = 4, ...options } = input;
  return frame(makeScene(options), time);
}
