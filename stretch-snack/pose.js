// Body coordinates are metres, with Y up and Z forward. The same articulated
// pose is used by the small preview, full-screen coach and directory artwork.
/** @param {number[]} a @param {number[]} b */
const add = (a, b) => a.map((x, i) => x + b[i]);
/** @param {number[]} a @param {number[]} b @param {number} t */
export const mixPoint = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
/** @param {number[]} point @param {number} yaw */
const turn = ([x, y, z], yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), y, z * Math.cos(yaw) - x * Math.sin(yaw)];
/** @param {number[]} point @param {number} angle */
const lean = ([x, y, z], angle) => [
  x * Math.cos(angle) + y * Math.sin(angle),
  y * Math.cos(angle) - x * Math.sin(angle),
  z,
];

/** @param {{motion:string, pose:string}} move @param {number} seconds */
export function movementPose(move, seconds) {
  const { motion, pose } = move;
  const seated = pose === 'seated';
  const supine = pose === 'supine';
  const cycle = Math.floor(seconds / 4);
  const a = (1 - Math.cos((seconds * Math.PI) / 2)) / 2;
  const side = cycle % 2 ? 1 : -1;
  const bilateral = [
    'palm-turn',
    'hand-open',
    'wrist-bend',
    'heel-lift',
    'toe-lift',
    'shoulder-roll',
    'shoulder-squeeze',
    'chest-open',
    'band-open',
    'elbow-bend',
  ];
  /** @param {number} s */
  const active = (s) => bilateral.includes(motion) || s === side;
  /** @param {string} name */
  const motionAmount = (name) => (motion === name ? a : 0);
  const squat = motionAmount('knee-bend');
  const calf = motionAmount('calf-stretch');
  const rise = !seated && !supine ? 0.065 * motionAmount('heel-lift') : 0;
  const stepTravel = motionAmount('step-up');
  const stepHeight = 0.14;
  const pelvis = [
    0,
    (seated ? 0.51 : 0.91) - 0.095 * squat + rise + (Math.max(0, stepTravel - 0.42) / 0.58) * stepHeight,
    -0.09 * squat + 0.04 * calf + stepTravel * 0.24,
  ];
  const yaw = side * 0.43 * motionAmount('trunk-turn');
  const bend = side * 0.19 * motionAmount('side-bend');
  /** @param {number[]} offset */
  const trunk = (offset) => add(pelvis, turn(lean(offset, bend), yaw));
  const shrug = motionAmount('shoulder-roll');
  const squeeze = motionAmount('shoulder-squeeze');
  const headYaw = yaw + side * 0.66 * motionAmount('neck-turn');
  const headTilt = bend + side * 0.26 * motionAmount('neck-tilt');
  const neck = trunk([0, 0.535, 0]);
  /** @param {number[]} offset */
  const head = (offset) => add(neck, turn(lean(offset, headTilt), headYaw));
  const arms = [-1, 1].map((s) => {
    const shoulder = trunk([
      s * (0.182 - 0.014 * squeeze),
      0.47 + 0.032 * shrug,
      -0.033 * squeeze - 0.023 * side * Math.sin((seconds * Math.PI) / 2) * Number(motion === 'shoulder-roll'),
    ]);
    const handWork = ['palm-turn', 'wrist-bend', 'hand-open', 'towel-grip', 'band-open', 'wrist-stretch'].includes(
      motion,
    );
    const chest = motionAmount('chest-open');
    const band = motionAmount('band-open');
    const elbowAngle =
      motion === 'elbow-bend' && active(s) ? 0.35 + 1.64 * a : handWork ? 1.45 : seated ? 1.1 : 0.24;
    let elbow = add(shoulder, turn([s * (0.031 + 0.09 * chest), -0.25 + 0.035 * chest, -0.06 * chest], yaw));
    let wrist = add(
      elbow,
      turn(
        [
          s * (0.095 * band + 0.13 * chest),
          -0.235 * Math.cos(elbowAngle),
          0.235 * Math.sin(elbowAngle) - 0.08 * chest,
        ],
        yaw,
      ),
    );
    const support =
      !seated && !supine && ['hip-side', 'calf-stretch', 'knee-bend', 'heel-lift', 'step-up'].includes(motion);
    if (support && s === 1) {
      elbow = [s * 0.25, pelvis[1] + 0.23, 0.085];
      wrist = [s * 0.32, 1.075, 0.27];
    }
    if (motion === 'overhead-reach' && active(s)) {
      const angle = 2.85 * a;
      elbow = add(shoulder, [s * (0.025 + Math.sin(angle) * 0.23), -Math.cos(angle) * 0.25, 0.034]);
      wrist = add(elbow, [s * Math.sin(angle) * 0.2, -Math.cos(angle) * 0.22, 0.045]);
    }
    if (motion === 'trunk-turn') {
      wrist = trunk([-s * 0.07, 0.31, 0.15 + s * 0.017]);
      elbow = trunk([s * 0.27, 0.27, 0.11]);
    }
    if (motion === 'wrist-stretch') {
      const forward = s === side;
      elbow = trunk([s * (forward ? 0.12 : 0.19), forward ? 0.42 : 0.27, forward ? 0.22 : 0.16]);
      wrist = trunk([side * 0.1 + (forward ? 0 : -side * 0.015), 0.394, forward ? 0.45 : 0.37]);
    }
    if (motion === 'towel-grip') wrist = trunk([s * 0.16, 0.21, 0.2]);
    const direction = wrist.map((v, i) => v - elbow[i]);
    const length = Math.hypot(...direction);
    let handAxis = direction.map((v) => v / length);
    if (motion === 'wrist-bend' || (motion === 'wrist-stretch' && s === side)) {
      const angle = motion === 'wrist-stretch' ? 1.02 + a * 0.36 : a * 0.58 * side;
      handAxis = [
        handAxis[0],
        handAxis[1] * Math.cos(angle) + handAxis[2] * Math.sin(angle),
        handAxis[2] * Math.cos(angle) - handAxis[1] * Math.sin(angle),
      ];
    }
    const palm = add(
      wrist,
      handAxis.map((v) => v * 0.045),
    );
    const fingers = [];
    const close = motion === 'hand-open' ? 1 - a : active(s) ? motionAmount('towel-grip') : 0;
    const roll = motion === 'palm-turn' ? (a * 2.8 - 1.35) * s : 0.12 * s;
    for (let j = 0; j < 4; j++) {
      const offset = (j - 1.5) * 0.015;
      const base = add(palm, [offset * Math.cos(roll), offset * Math.sin(roll), 0]);
      const length = [0.064, 0.073, 0.069, 0.056][j];
      const tip = add(
        base,
        handAxis.map((v, i) => v * length * (1 - 0.56 * close) + (i === 1 ? -0.029 * close : 0)),
      );
      fingers.push([base, tip]);
    }
    const thumb = add(palm, [-s * 0.04 * Math.cos(roll), -0.025 * Math.sin(roll), 0.028]);
    return { s, shoulder, elbow, wrist, palm, fingers, thumb };
  });
  const legs = [-1, 1].map((s) => {
    const hip = add(pelvis, [s * 0.11, 0, 0]);
    const working = active(s);
    const ankleFlex = motionAmount('toe-lift');
    const heel = motionAmount('heel-lift');
    let knee, ankle;
    if (seated) {
      const lift = working ? motionAmount('seated-march') : 0;
      const extend = working ? motionAmount('knee-extend') : 0;
      knee = add(hip, [s * 0.015, -0.03 + lift * 0.15, 0.39 - lift * 0.035]);
      const angle = extend * 1.24;
      ankle = add(knee, [0, -0.402 * Math.cos(angle) + heel * 0.035, 0.402 * Math.sin(angle)]);
    } else {
      const abduction = working ? motionAmount('hip-side') : 0;
      knee = [
        s * (0.123 + 0.115 * abduction),
        0.476 - squat * 0.04,
        0.023 + 0.132 * squat + calf * (s === side ? -0.1 : 0.13),
      ];
      ankle = [
        s * (0.128 + 0.235 * abduction),
        0.084 + 0.046 * abduction + rise,
        calf * (s === side ? -0.31 : 0.16),
      ];
    }
    if (motion === 'foot-roll' && working) {
      knee[2] += 0.025 * a;
      ankle[2] += 0.13 * a - 0.05;
      ankle[1] += 0.055;
    }
    if (motion === 'step-up') {
      const t = working ? Math.min(1, stepTravel / 0.45) : Math.max(0, (stepTravel - 0.45) / 0.55);
      ankle = [s * 0.13, 0.084 + stepHeight * t + 0.09 * Math.sin(t * Math.PI), 0.32 * t];
      const halfDy = (hip[1] - ankle[1]) / 2,
        halfDz = (hip[2] - ankle[2]) / 2;
      const dist = Math.hypot(halfDy, halfDz);
      const forward = Math.sqrt(Math.max(0, 0.42 ** 2 - dist ** 2));
      knee = [
        s * 0.13,
        (hip[1] + ankle[1]) / 2 - (halfDz / dist) * forward,
        (hip[2] + ankle[2]) / 2 + (halfDy / dist) * forward,
      ];
    }
    const toe = add(ankle, [0, -0.054 + 0.065 * ankleFlex - (seated ? 0.035 : 0.065) * heel, 0.136]);
    return { s, hip, knee, ankle, toe };
  });
  let centre = trunk([0, 0.24, 0]);
  let face = head([0, 0.14, 0.076]);
  let skull = head([0, 0.149, -0.002]);
  let crown = head([0, 0.22, 0]);
  let eyes = [-1, 1].map((s) => head([s * 0.034, 0.172, 0.077]));
  if (supine) {
    // Rotate the body onto its back, then flex both hips and knees so the
    // soles rest on the floor. X is still the figure's left/right axis.
    /** @param {number[]} point */
    const recline = ([x, y, z]) => [x, 0.119 + z, 0.92 - y];
    for (const arm of arms) {
      for (const key of /** @type {const} */ (['shoulder', 'elbow', 'wrist', 'palm', 'thumb']))
        arm[key] = recline(arm[key]);
      arm.fingers = arm.fingers.map((pair) => pair.map(recline));
    }
    for (const leg of legs) {
      const slide = active(leg.s) ? motionAmount('heel-slide') : 0;
      const roll = side * motionAmount('knee-roll');
      const footZ = 0.64 + 0.26 * slide;
      // Half the separation of hip and heel sets the bend of both links.
      const kneeHeight = Math.sqrt(Math.max(0.01, 0.43 ** 2 - (footZ / 2) ** 2));
      leg.hip = [leg.s * 0.11, 0.115, 0.01 - motionAmount('pelvic-tilt') * 0.014];
      leg.knee = [leg.s * 0.12 + 0.16 * roll, 0.1 + kneeHeight - 0.054 * Math.abs(roll), footZ / 2];
      leg.ankle = [leg.s * 0.12, 0.071, footZ];
      leg.toe = [leg.s * 0.12, 0.034, footZ + 0.14];
    }
    eyes = eyes.map(recline);
    centre = recline(centre);
    face = recline(face);
    skull = recline(skull);
    crown = recline(crown);
  }
  return {
    arms,
    legs,
    centre,
    skull,
    face,
    crown,
    eyes,
    neck: mixPoint(arms[0].shoulder, arms[1].shoulder, 0.5),
    a,
    side,
  };
}
