// One repetition from each movement in a one-minute seated routine.
import { moves } from '../../stretch-snack/core/catalog.js';
import { submit } from '../../stretch-snack/core/plan.js';
import { renderMovement } from '../../stretch-snack/demo.js';

const steps = [
  { id: 'seated-overhead-reach', label: 'Arm reach' },
  { id: 'seated-knee-extend', label: 'Knee extension' },
  { id: 'seated-elbow-bend', label: 'Elbow bend' },
];
export const secondsPerSample = 4;
export const heldPose = 2;
/** @typedef {{move: (typeof moves)[number], label: string, seconds: number}} RoutineStep */
/** @type {RoutineStep[] | undefined} */
let routine;
export function prepare() {
  if (routine) return routine;
  const plan = submit({
    location: 'roomy-seat', seconds: 60, discretion: 'any',
    steps: steps.map(({ id }) => ({ id, seconds: 20 })),
  });
  routine = plan.steps.map((step, i) => {
    const move = moves.find(move => move.id === step.id);
    if (!move) throw new Error('Missing Stretch Snack preview movement: ' + step.id);
    return {...step, label: steps[i].label, move};
  });
  return routine;
}

/** Paint a storyboard frame with the trainer's centered, transparent preview camera.
 * @param {HTMLCanvasElement} canvas @param {RoutineStep} step @param {number} seconds @param {boolean} dark */
export function paintStep(canvas, step, seconds, dark) {
  const options = { location: 'roomy-seat', dark, preview: true };
  renderMovement(canvas, step.move, seconds, options);
}

/** @param {HTMLElement} art @param {ReturnType<typeof prepare>} plan */
export function create(art, plan) {
  const panels = [...art.querySelectorAll('.movement')];
  const stages = panels.map(panel => {
    const stage = panel.querySelector('.pose');
    if (!stage) throw new Error('Missing Stretch Snack preview figure.');
    return stage;
  });
  const digits = art.querySelector('.routine-time');
  const progress = art.querySelector('.progress');
  if (!digits || !(progress instanceof HTMLElement) || panels.length !== plan.length)
    throw new Error('Incomplete Stretch Snack storyboard.');
  const timer = digits;
  const stillTime = timer.textContent;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const period = plan.length * secondsPerSample;
  // The progress bar can animate on its own layer without invalidating the card.
  const clock = progress.animate(
    [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
    { duration: period * 1000, iterations: Infinity },
  );
  clock.pause();
  const after = plan.map((_, i) => plan.slice(i + 1).reduce((sum, step) => sum + step.seconds, 0));
  let request = 0, lastSample = -1, active = 0;
  function draw(force = false) {
    const t = Number(clock.currentTime ?? 0) / 1000 % period;
    const sample = Math.floor(t * 30);
    if (!force && sample === lastSample) return;
    lastSample = sample;
    const index = Math.floor(t / secondsPerSample);
    const local = t % secondsPerSample;
    if (canvas.parentElement !== stages[index]) {
      panels[active].removeAttribute('data-current');
      panels[index].setAttribute('data-current', '');
      stages[index].append(canvas);
      active = index;
    }
    paintStep(canvas, plan[index], (local + heldPose) % secondsPerSample, document.documentElement.dataset.theme === 'dark');
    const progressInStep = local / secondsPerSample;
    const left = after[index] + Math.ceil(plan[index].seconds * (1 - progressInStep));
    const display = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    if (timer.textContent !== display) timer.textContent = display;
  }
  function tick() {
    draw();
    request = requestAnimationFrame(tick);
  }
  const repaint = () => draw(true);
  const resize = new ResizeObserver(repaint);
  resize.observe(art);
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
      resize.disconnect();
      document.removeEventListener('themechange', repaint);
      clock.cancel();
      canvas.remove();
      panels[active].removeAttribute('data-current');
      panels[0].setAttribute('data-current', '');
      timer.textContent = stillTime;
    },
  };
}
