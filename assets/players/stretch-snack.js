// One repetition from each movement in a one-minute seated routine.
import { moves } from '../../stretch-snack/core/catalog.js';
import { submit } from '../../stretch-snack/core/plan.js';
import { movementPose } from '../../stretch-snack/pose.js';

const steps = [
  { id: 'seated-overhead-reach', label: 'Arm reach', joint: 'palm' },
  { id: 'seated-knee-extend', label: 'Knee extension', joint: 'ankle' },
  { id: 'seated-elbow-bend', label: 'Elbow bend', joint: 'palm' },
];
export const secondsPerSample = 4;
const hold = 2;
/** @typedef {{move: (typeof moves)[number], label: string, joint: string, seconds: number}} RoutineStep */
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
    return {...steps[i], ...step, move};
  });
  return routine;
}

// Use the app's joints, projected as a compact side-on exercise illustration.
// The working side is nearest the viewer; positions are in a shared 140 × 128 field.
/** @param {number[]} point */
function project([x, y, z]) {
  return [78 + (0.69 * x - 0.76 * z) * 75, 122 - (y + 0.08 * x - 0.07 * z) * 75];
}
/** @param {number[][]} points */
function line(points) {
  return points.map((p, i) => (i ? 'L' : 'M') + p.map(n => n.toFixed(1)).join(' ')).join('');
}
/** @param {ReturnType<typeof movementPose>} pose */
function limbPaths(pose) {
  return [1, 0].flatMap(side => {
    const { hip, knee, ankle, toe } = pose.legs[side];
    const { shoulder, elbow, palm } = pose.arms[side];
    return [
      line([hip, knee, ankle].map(project)),
      line([ankle, toe].map(project)),
      line([shoulder, elbow, palm].map(project)),
    ];
  });
}

/** The still and live player use these same paths. @param {RoutineStep} step */
export function figure(step) {
  const pose = movementPose(step.move, hold);
  const paths = limbPaths(pose);
  const trail = Array.from({length: 19}, (_, i) => {
    const phase = movementPose(step.move, i * hold / 18);
    return project(step.joint === 'ankle' ? phase.legs[0].ankle : phase.arms[0].palm);
  });
  const [hx, hy] = project(pose.skull);
  const [tx, ty] = trail[trail.length - 1];
  const working = step.joint === 'ankle' ? 'leg' : 'arm';
  /** @param {number} index @param {string} name */
  const limb = (index, name) =>
    '<path class="limb ' + name + (index >= 3 && name === working ? ' working' : '') +
    '" data-limb="' + index + '" d="' + paths[index] + '"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="figure" viewBox="13 2 93 126" fill="none">
    <ellipse class="ground" cx="69" cy="123" rx="33" ry="2"/>
    <g class="seat" stroke-linecap="round" stroke-linejoin="round">
      <path d="M55 88l-3 32m30-33 5 33m-29-35h31l7-41"/>
      <path d="M88 73l6-28" stroke-width="7"/>
    </g>
    <path class="trail" d="${line(trail)}"/>
    <circle class="target" cx="${tx}" cy="${ty}" r="3.4"/>
    <g class="far">${limb(0,'leg')}${limb(1,'foot')}${limb(2,'arm')}</g>
    <path class="body" d="M70 48q7-4 14 0l4 27q1 10-5 15H68q-5-5-4-11l2-19q0-8 4-12Z"/>
    <path class="skin" d="M75 49l1-8" stroke-width="8" stroke-linecap="round"/>
    <ellipse class="face" cx="${hx}" cy="${hy}" rx="7.1" ry="9.1" transform="rotate(-8 ${hx} ${hy})"/>
    <path class="face" d="M${hx-5} ${hy-2}l-3.6 4.3 3.2.1Z"/>
    <circle class="hair" cx="${hx-4.3}" cy="${hy-0.4}" r=".68"/>
    <path class="hair" d="M${hx-6.6} ${hy-2}q-1-7.9 5.6-8.4 8.8-0.6 8.3 9.7l-2.4 1-1.8-5.3q-5.3 2.4-9.7 3Z"/>
    <g class="near">${limb(3,'leg')}${limb(4,'foot')}${limb(5,'arm')}</g>
  </svg>`;
}

/** @param {HTMLElement} art @param {ReturnType<typeof prepare>} plan */
export function create(art, plan) {
  const panels = Array.from(art.querySelectorAll('.movement'));
  const limbs = panels.map(panel => [...panel.querySelectorAll('[data-limb]')]);
  const digits = art.querySelector('.routine-time');
  if (!digits) throw new Error('Missing Stretch Snack preview timer.');
  const timer = digits;
  const progress = /** @type {HTMLElement} */ (art.querySelector('.progress'));
  const clock = art.animate([], {duration: plan.length * secondsPerSample * 1000, iterations: Infinity});
  clock.pause();
  const after = plan.map((_, i) => plan.slice(i + 1).reduce((sum, step) => sum + step.seconds, 0));
  const stillTime = timer.textContent;
  let frame = 0, lastFrame = -1, active = 0;
  /** @param {number} index @param {number} seconds */
  function pose(index, seconds) {
    const paths = limbPaths(movementPose(plan[index].move, seconds));
    limbs[index].forEach((node, i) => node.setAttribute('d', paths[i]));
  }
  /** @param {number} now */
  function draw(now) {
    const sample = Math.floor(now * 30 / 1000);
    if (sample !== lastFrame) {
      lastFrame = sample;
      const t = Number(clock.currentTime) / 1000 % (secondsPerSample * plan.length);
      const index = Math.floor(t / secondsPerSample);
      const local = t % secondsPerSample;
      if (active !== index) {
        pose(active, hold);
        panels[active].removeAttribute('data-current');
        panels[index].setAttribute('data-current', '');
        active = index;
      }
      pose(index, (local + hold) % secondsPerSample);
      const progressInStep = local / secondsPerSample;
      const left = after[index] + Math.ceil(plan[index].seconds * (1 - progressInStep));
      const display = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      if (timer.textContent !== display) timer.textContent = display;
      progress.style.transform = 'scaleX(' + (index + progressInStep) / plan.length + ')';
    }
    frame = requestAnimationFrame(draw);
  }
  function pause() {
    clock.pause();
    cancelAnimationFrame(frame);
    frame = 0;
  }
  return {
    play() {
      if (frame) return;
      clock.play();
      lastFrame = -1;
      frame = requestAnimationFrame(draw);
    },
    pause,
    destroy() {
      pause();
      clock.cancel();
      pose(active, hold);
      panels[active].removeAttribute('data-current');
      panels[0].setAttribute('data-current', '');
      timer.textContent = stillTime;
      progress.style.removeProperty('transform');
    },
  };
}
