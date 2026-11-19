// The landing cut runs the full opening on the card's own aspect ratio.
import { makeScene, frame, paint, duration } from '../../matrix-rain/core.mjs';
const scene = makeScene({ title: 'The Extracellular Matrix' });
let portrait;
export function prepare() {
  if (!portrait) {
    const image = new Image();
    image.src = new URL('../../matrix-rain/nik-reflection.webp', import.meta.url).href;
    portrait = image.decode().then(() => image).catch(error => { portrait = undefined; throw error; });
  }
  return portrait;
}

/** @param {HTMLElement} art @param {HTMLImageElement} image */
export function create(art, image) {
  const canvas = document.createElement('canvas');
  canvas.className = 'card-player';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Matrix Rain requires a 2D canvas.');
  const svg = art.querySelector('svg');
  const clock = art.querySelector('.matrix-clock').getAnimations()[0];
  const period = Number(svg.dataset.period) * 1000;
  art.append(canvas);
  let raf = 0;
  function draw() {
    if (!art.clientWidth || !art.clientHeight) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = Math.round(art.clientWidth * dpr), h = Math.round(art.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const time = Number(clock.currentTime ?? 0) % period / period * duration;
    paint(ctx, frame(scene, time, w / h), image);
  }
  function tick() { draw(); raf = requestAnimationFrame(tick); }
  const resize = new ResizeObserver(draw);
  resize.observe(art);
  const pause = () => { cancelAnimationFrame(raf); raf = 0; };
  return {
    play() { if (!raf) tick(); }, pause,
    destroy() { pause(); resize.disconnect(); canvas.remove(); },
  };
}
