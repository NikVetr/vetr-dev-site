import { renderMovement } from '../../stretch-snack/demo.js';
import { moves } from '../../stretch-snack/core/catalog.js';

export function prepare() {
  const movement = moves.find((move) => move.id === 'seated-seated-march');
  if (!movement) throw new Error('Missing seated knee lifts for the Stretch Snack preview.');
  return movement;
}

/** @param {HTMLElement} art @param {ReturnType<typeof prepare>} movement */
export function create(art, movement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'card-player';
  art.append(canvas);
  let elapsed = 2,
    start = 0,
    frame = 0,
    lastDraw = 0;
  const paint = () =>
    renderMovement(canvas, movement, elapsed, {
      location: 'plane-seat',
      dark: document.documentElement.dataset.theme === 'dark',
    });
  /** @param {number} now */
  const tick = (now) => {
    elapsed += (now - start) / 1000;
    start = now;
    if (now - lastDraw >= 40) {
      paint();
      lastDraw = now;
    }
    frame = requestAnimationFrame(tick);
  };
  const observer = new ResizeObserver(paint);
  observer.observe(art);
  document.addEventListener('themechange', paint);
  const pause = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  return {
    play() {
      if (!frame) {
        start = performance.now();
        paint();
        frame = requestAnimationFrame(tick);
      }
    },
    pause,
    destroy() {
      pause();
      observer.disconnect();
      document.removeEventListener('themechange', paint);
      canvas.remove();
    },
  };
}
