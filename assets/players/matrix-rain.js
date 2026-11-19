// The landing cut runs the full opening on the card's own aspect ratio.
import { makeScene, frame, paint, duration, prepareReflection } from '../../matrix-rain/core.mjs';
const scene = makeScene({ title: 'The Extracellular Matrix' });
let portrait;
export function prepare() {
  if (!portrait) {
    const image = new Image();
    image.src = new URL('../../matrix-rain/nik-reflection.webp', import.meta.url).href;
    portrait = image.decode().then(() => {
      prepareReflection(image);
      return image;
    }).catch(error => { portrait = undefined; throw error; });
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
  const period = Number(svg.dataset.period) * 1000;
  art.append(canvas);
  // A clock with no painted keyframes avoids invalidating the landing page's inline SVGs.
  const clock = canvas.animate([], { duration: period, iterations: Infinity });
  clock.pause();
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
  const pause = () => { clock.pause(); cancelAnimationFrame(raf); raf = 0; };
  return {
    play() { if (!raf) { clock.play(); tick(); } }, pause,
    destroy() { pause(); clock.cancel(); resize.disconnect(); canvas.remove(); },
  };
}
