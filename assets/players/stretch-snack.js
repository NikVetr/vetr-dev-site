// The directory plays a real, short seated session at its normal pace.
import { moves } from '../../stretch-snack/core/catalog.js';
import { submit } from '../../stretch-snack/core/plan.js';
import { formatTime } from '../../stretch-snack/dom.js';
import { renderMovement } from '../../stretch-snack/demo.js';

export const heldSeconds = 2;
const location = 'roomy-seat';
const ids = ['seated-overhead-reach', 'seated-knee-extend', 'seated-elbow-bend'];

export function prepare() {
  const plan = submit({location, seconds: 15, discretion: 'any', steps: ids.map(id => ({id, seconds: 5}))});
  let start = 0;
  const steps = plan.steps.map(step => {
    const move = moves.find(move => move.id === step.id);
    if (!move) throw new Error('Missing Stretch Snack preview movement: ' + step.id);
    const entry = {...step, move, start};
    start += step.seconds;
    return entry;
  });
  return {steps, total: plan.totalSeconds};
}

/** @param {ReturnType<typeof prepare>} plan @param {number} seconds */
export function sessionReading(plan, seconds) {
  const index = plan.steps.findIndex(step => seconds < step.start + step.seconds);
  const step = plan.steps[index];
  const next = plan.steps[index + 1];
  return {
    name: step.move.name,
    counter: 'Movement ' + (index + 1) + ' of ' + plan.steps.length,
    clock: formatTime(Math.ceil(step.seconds - (seconds - step.start))),
    remaining: formatTime(Math.ceil(plan.total - seconds)) + ' total left',
    next: next ? 'Up next · ' + next.move.name : 'Final movement',
    skip: next ? 'Next' : 'Finish',
    step,
  };
}

/** Same camera, direction arrows and equipment as the full-screen session.
 * @param {HTMLCanvasElement} canvas @param {ReturnType<typeof prepare>['steps'][number]} step
 * @param {number} seconds @param {boolean} dark */
export function paintStep(canvas, step, seconds, dark) {
  renderMovement(canvas, step.move, seconds, {location, dark});
}

/** @param {HTMLElement} art @param {ReturnType<typeof prepare>} plan */
export function create(art, plan) {
  const stage = art.querySelector('.pose');
  const progress = art.querySelector('.progress');
  if (!stage || !(progress instanceof HTMLElement)) throw new Error('Incomplete Stretch Snack session preview.');
  const fields = [...art.querySelectorAll('[data-reading]')].map(node => ({
    node, key: node.getAttribute('data-reading'), stillText: node.textContent,
  }));
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);
  // The real session updates its progress as each whole second elapses.
  const clock = progress.animate(
    [{transform: 'scaleX(0)'}, {transform: 'scaleX(1)'}],
    {duration: plan.total * 1000, iterations: Infinity, easing: 'steps(' + plan.total + ', end)'},
  );
  clock.pause();
  clock.currentTime = heldSeconds * 1000;
  let request = 0, lastSample = -1, lastSecond = -1;
  let step = plan.steps[0];
  function draw(force = false) {
    const t = Number(clock.currentTime ?? 0) / 1000 % plan.total;
    const sample = Math.floor(t * 30);
    if (!force && sample === lastSample) return;
    lastSample = sample;
    if (lastSecond !== Math.floor(t)) {
      const reading = sessionReading(plan, t);
      step = reading.step;
      for (const {node, key} of fields) {
        if (node.textContent !== reading[key]) node.textContent = reading[key];
      }
      lastSecond = Math.floor(t);
    }
    paintStep(canvas, step, t - step.start, document.documentElement.dataset.theme === 'dark');
  }
  function tick() {
    draw();
    request = requestAnimationFrame(tick);
  }
  const repaint = () => draw(true);
  const size = new ResizeObserver(repaint);
  size.observe(stage);
  document.addEventListener('themechange', repaint);
  function pause() {
    clock.pause();
    cancelAnimationFrame(request);
    request = 0;
  }
  return {
    play() {
      if (request) return;
      clock.play();
      tick();
    },
    pause,
    destroy() {
      pause();
      size.disconnect();
      document.removeEventListener('themechange', repaint);
      clock.cancel();
      canvas.remove();
      for (const {node, stillText} of fields) node.textContent = stillText;
    },
  };
}
