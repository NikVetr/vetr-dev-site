// Posed training figure in metres. Y is up, Z is forward. Clothing, features,
// hands and equipment are real surfaces so their overlap follows the camera.
import { mixPoint } from './pose.js';

const skin = '#ebd9c8',
  lip = '#b89587',
  hair = '#435154';
const top = '#469a9c',
  trim = '#327f82',
  leggings = '#485568',
  sole = '#e4ebe6',
  shoe = '#839a9b';
const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const circle = (n) =>
  Array.from({ length: n }, (_, i) => [Math.cos((i * 2 * Math.PI) / n), Math.sin((i * 2 * Math.PI) / n)]);
const round = circle(12),
  bodyRound = circle(20),
  headRound = circle(36);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const len = Math.hypot(...a) || 1;
  return a.map((v) => v / len);
};
const along = (a, v, t) => [a[0] + v[0] * t, a[1] + v[1] * t, a[2] + v[2] * t];
function perpendicular(reference, axis) {
  const candidate = along(reference, axis, -dot(reference, axis));
  if (dot(candidate, candidate) > Math.max(1e-12, dot(reference, reference) * 0.001)) return unit(candidate);
  return unit(cross(axis, Math.abs(axis[2]) < 0.9 ? Z : Y));
}
function ring(at, x, z, rx, rz, samples) {
  return samples.map(([c, s]) => along(along(at, x, c * rx), z, s * rz));
}

// Sweep a continuous tapered skin through each bend. Bisection at elbows and
// knees keeps each joint joined as the two shafts change direction.
function sweep(mesh, points, radii, color, reference = X, samples = round, colors = undefined) {
  let lateral = reference;
  const rings = points.map((p, i) => {
    const last = i ? unit(sub(p, points[i - 1])) : null;
    const next = i + 1 < points.length ? unit(sub(points[i + 1], p)) : null;
    const axis = last && next ? unit(add(last, next)) : last || next;
    lateral = perpendicular(lateral, axis);
    return ring(p, lateral, cross(lateral, axis), radii[i][0], radii[i][1], samples);
  });
  mesh.surface(rings, color, colors);
}
function rod(mesh, a, b, r, color) {
  sweep(
    mesh,
    [a, b],
    [
      [r, r],
      [r, r],
    ],
    color,
  );
}
function ellipsoid(mesh, at, x, y, z, rx, ry, rz, color) {
  const latitudes = [-0.999, -0.82, -0.48, 0, 0.48, 0.82, 0.999];
  mesh.surface(
    latitudes.map((h) => {
      const factor = Math.sqrt(1 - h * h);
      return ring(along(at, y, h * ry), x, z, rx * factor, rz * factor, round);
    }),
    color,
  );
}

// Head sections from the chin upwards. Front and rear depth differ at each
// height. The nose is part of the facial surface, including the bridge.
const headShape = [
  [-0.107, 0.01, 0.042, 0.024, 0],
  [-0.1, 0.034, 0.064, 0.039, 0],
  [-0.082, 0.052, 0.076, 0.059, 0],
  [-0.063, 0.062, 0.076, 0.076, 0],
  [-0.046, 0.071, 0.08, 0.085, 0],
  [-0.028, 0.077, 0.08, 0.092, 0.004],
  [-0.018, 0.079, 0.08, 0.095, 0.018],
  [-0.011, 0.08, 0.079, 0.096, 0.025],
  [0.002, 0.081, 0.078, 0.097, 0.017],
  [0.018, 0.081, 0.076, 0.098, 0.012],
  [0.03, 0.082, 0.079, 0.096, 0.004],
  [0.049, 0.082, 0.079, 0.093, 0],
  [0.07, 0.078, 0.074, 0.086, 0],
  [0.091, 0.062, 0.062, 0.072, 0],
  [0.106, 0.043, 0.042, 0.053, 0],
  [0.116, 0.004, 0.005, 0.007, 0],
];
function sectionAt(h, profile = headShape) {
  let i = 1;
  while (i < profile.length - 1 && profile[i][0] < h) i++;
  const a = profile[i - 1],
    b = profile[i],
    t = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
  return a.map((v, j) => v + t * (b[j] - v));
}
function drawHead(mesh, p) {
  const up = unit(sub(p.crown, p.skull));
  const front = perpendicular(sub(p.face, p.skull), up);
  const right = unit(cross(up, front));
  const locate = (x, y, z) => along(along(along(p.skull, right, x), up, y), front, z);
  const point = (section, c, s, margin = 0) => {
    const [h, w, fore, back, nose] = section;
    const bridge = c > 0 ? nose * Math.exp((-s * s) / 0.029) : 0;
    return locate(s * (w + margin), h, c * ((c >= 0 ? fore : back) + margin) + bridge);
  };
  mesh.surface(
    headShape.map((row) => headRound.map(([c, s]) => point(row, c, s))),
    skin,
  );
  for (const side of [-1, 1]) {
    ellipsoid(mesh, locate(side * 0.079, 0.002, -0.006), right, up, front, 0.014, 0.023, 0.012, skin);
    // Quiet sculpted brows and lids. Each follows the surface of the cheek.
    const mark = (coords, color) => {
      const rows = coords.map(([x, y, thickness]) => {
        const row = sectionAt(y),
          s = (side * x) / row[1];
        const center = point(row, Math.sqrt(1 - s * s), s, 0.0014);
        return ring(center, up, front, thickness, 0.00085, round);
      });
      mesh.surface(rows, color);
    };
    const eye = (x, y, lift) => {
      const row = sectionAt(y),
        off = (side * x) / row[1];
      return point(row, Math.sqrt(1 - off * off), off, lift);
    };
    mesh.surface(
      [
        [-1, 0.0005],
        [-0.6, 0.0033],
        [0, 0.0045],
        [0.55, 0.0033],
        [1, 0.0004],
      ].map(([v, h]) => {
        const x = 0.034 + v * 0.017,
          y = 0.011 + v * 0.002;
        return ring(eye(x, y, 0.0014), up, front, h, 0.0012, round);
      }),
      '#ede5d8',
    );
    ellipsoid(mesh, eye(0.034, 0.011, 0.0028), right, up, front, 0.0044, 0.0041, 0.0015, '#535b59');
    mark(
      [
        [0.015, 0.032, 0.0006],
        [0.029, 0.036, 0.0028],
        [0.044, 0.036, 0.0024],
        [0.054, 0.031, 0.0005],
      ],
      '#70665f',
    );
    mark(
      [
        [0.017, 0.01, 0.0004],
        [0.024, 0.014, 0.0014],
        [0.036, 0.016, 0.0016],
        [0.047, 0.015, 0.0013],
        [0.052, 0.015, 0.0004],
      ],
      '#67625f',
    );
  }
  const mouth = [-1, -0.55, 0, 0.55, 1].map((s) => {
    const row = sectionAt(-0.05 + 0.0022 * s * s),
      off = (s * 0.021) / row[1];
    return ring(
      point(row, Math.sqrt(1 - off * off), off, 0.0012),
      up,
      front,
      0.0006 + 0.001 * (1 - s * s),
      0.001,
      round,
    );
  });
  mesh.surface(mouth, lip);
  // A swept hairline rises from the nape to the forehead. Keeping the bun
  // near the crown leaves clearance behind the head on the floor.
  const hairRings = [0, 0.035, 0.21, 0.43, 0.67, 0.84, 0.96, 1].map((t) =>
    headRound.map(([c, s]) => {
      const start = -0.064 + 0.128 * Math.max(0, (c + 0.47) / 1.47) ** 1.24 - 0.007 * s;
      const h = start + (0.116 - start) * t;
      const row = sectionAt(h);
      row[0] += 0.004 * t;
      return point(row, c, s, 0.001 + 0.006 * Math.sin(Math.PI * t * 0.94));
    }),
  );
  mesh.surface(hairRings, hair);
  ellipsoid(mesh, locate(0, 0.08, -0.078), right, up, front, 0.043, 0.038, 0.031, trim);
  ellipsoid(mesh, locate(0, 0.086, -0.091), right, up, front, 0.048, 0.046, 0.035, hair);
}

export function drawHand(mesh, arm) {
  const { wrist, palm, fingers, thumb } = arm;
  const axis = unit(sub(palm, wrist));
  const side = perpendicular(sub(fingers[3][0], fingers[0][0]), axis);
  const normal = unit(cross(side, axis));
  const palmFront = along(palm, axis, 0.013);
  mesh.surface(
    [
      ring(along(wrist, axis, -0.015), side, normal, 0.021, 0.017, round),
      ring(wrist, side, normal, 0.023, 0.016, round),
      ring(mixPoint(wrist, palm, 0.65), side, normal, 0.032, 0.014, round),
      ring(palm, side, normal, 0.031, 0.013, round),
      ring(palmFront, side, normal, 0.023, 0.009, round),
    ],
    skin,
  );
  for (const [base, middle, distal, tip] of arm.fingerJoints) {
    sweep(
      mesh,
      [base, middle, distal, mixPoint(distal, tip, 0.84), tip],
      [
        [0.0085, 0.0078],
        [0.008, 0.0076],
        [0.0066, 0.0064],
        [0.0058, 0.0054],
        [0.001, 0.001],
      ],
      skin,
      side,
    );
  }
  sweep(
    mesh,
    [mixPoint(wrist, palm, 0.55), mixPoint(palm, thumb, 0.54), thumb],
    [
      [0.014, 0.012],
      [0.0095, 0.01],
      [0.003, 0.003],
    ],
    skin,
    side,
  );
}

function drawArm(mesh, arm, neck, squeeze) {
  const { shoulder, elbow, wrist } = arm;
  const upper = (t) => mixPoint(shoulder, elbow, t);
  const fore = (t) => mixPoint(elbow, wrist, t);
  const root = mixPoint(neck, shoulder, 0.34);
  sweep(
    mesh,
    [
      root,
      mixPoint(root, upper(0.1), 0.5),
      upper(0.1),
      upper(0.19),
      upper(0.38),
      upper(0.397),
      upper(0.402),
      upper(0.54),
      upper(0.75),
      upper(0.91),
      elbow,
      fore(0.13),
      fore(0.28),
      fore(0.58),
      fore(0.83),
      wrist,
    ],
    [
      [0.018, 0.018],
      [0.042, 0.042],
      [0.055, 0.054],
      [0.058, 0.055],
      [0.051, 0.052],
      [0.051, 0.052],
      [0.05, 0.051],
      [0.048, 0.05],
      [0.042, 0.044],
      [0.034, 0.038],
      [0.035, 0.037],
      [0.039, 0.04],
      [0.04, 0.04],
      [0.031, 0.034],
      [0.024, 0.026],
      [0.022, 0.019],
    ],
    skin,
    Z,
    round,
    [top, top, top, top, top, squeeze ? '#b99266' : trim, skin, skin, skin, skin, skin, skin, skin, skin, skin],
  );
  drawHand(mesh, arm);
}
function drawShoe(mesh, leg, floor) {
  // Use a flat sole when planted and rotate about the toe for heel raises.
  const fwd = unit(add(sub(leg.toe, leg.ankle), [0, floor ? 0.037 : 0.054, 0]));
  const side = perpendicular(X, fwd),
    up = unit(cross(fwd, side));
  const base = along(leg.toe, up, -0.029);
  const sections = [
    [-0.196, 0.009, 0.044],
    [-0.188, 0.032, 0.073],
    [-0.16, 0.04, 0.077],
    [-0.126, 0.042, 0.061],
    [-0.085, 0.043, 0.058],
    [-0.042, 0.05, 0.046],
    [0.005, 0.047, 0.034],
    [0.037, 0.037, 0.031],
    [0.053, 0.009, 0.018],
  ];
  const at = (z, x, y) => along(along(along(base, fwd, z), side, x), up, y);
  const perimeter = sections
    .map(([z, w, h]) => [z, w, h])
    .concat(
      sections
        .slice()
        .reverse()
        .map(([z, w, h]) => [z, -w, h]),
    );
  const deck = (y, k) => perimeter.map(([z, w]) => at(-0.066 + (z + 0.066) * k, w * k, y));
  mesh.surface(
    [
      [at(-0.066, 0, 0.001)],
      deck(0.001, 0.93),
      deck(0.006, 1),
      deck(0.018, 1),
      deck(0.021, 0.96),
      [at(-0.066, 0, 0.021)],
    ],
    sole,
  );
  const upper = sections.map(([z, w, h]) =>
    round.map(([c, s]) => at(z, c * w * 0.975, 0.019 + (s + 1) * 0.5 * (h - 0.019))),
  );
  mesh.surface(
    [[at(sections[0][0], 0, 0.027)], ...upper, [at(sections[sections.length - 1][0], 0, 0.024)]],
    shoe,
  );
  for (const z of [-0.081, -0.061]) {
    rod(mesh, at(z, -0.024, 0.047), at(z + 0.006, 0.022, 0.049), 0.0025, sole);
  }
}
function drawLeg(mesh, leg, floor, hips, up, pelvisSide, front) {
  const { hip, knee, ankle } = leg;
  const thigh = (t) => mixPoint(hip, knee, t),
    shin = (t) => mixPoint(knee, ankle, t);
  // The outer half of each waist loop forms the seat of the leggings. The
  // two inner halves meet at the inseam, then open into the two leg tubes.
  const hipLoop = bodyRound.map(([c, s]) => {
    const y = 0.066 - 0.097 * Math.max(0, -c);
    const center = along(along(hips, up, y), front, -0.012);
    return along(along(center, pelvisSide, leg.s * 0.159 * Math.max(0, c)), front, 0.111 * s);
  });
  const shape = [
    [thigh(0.2), 0.089, 0.096],
    [thigh(0.37), 0.086, 0.089],
    [thigh(0.6), 0.073, 0.078],
    [thigh(0.85), 0.054, 0.062],
    [knee, 0.052, 0.054],
    [shin(0.11), 0.05, 0.051],
    [shin(0.26), 0.058, 0.06],
    [shin(0.41), 0.057, 0.059],
    [shin(0.58), 0.045, 0.048],
    [shin(0.72), 0.038, 0.04],
  ];
  let prev = hip;
  const legRings = shape.map(([point, w, d], i) => {
    const incoming = unit(sub(point, prev));
    const axis = i + 1 < shape.length ? unit(add(incoming, unit(sub(shape[i + 1][0], point)))) : incoming;
    const across = perpendicular(X, axis);
    prev = point;
    return ring(point, across, cross(axis, across), w * leg.s, d, bodyRound);
  });
  mesh.surface([hipLoop, ...legRings], leggings);
  sweep(
    mesh,
    [shin(0.69), shin(0.84), shin(0.94), ankle, along(ankle, Y, -0.026)],
    [
      [0.039, 0.04],
      [0.031, 0.033],
      [0.027, 0.029],
      [0.029, 0.03],
      [0.025, 0.027],
    ],
    skin,
  );
  drawShoe(mesh, leg, floor);
}

export function drawTrainer(mesh, p, move) {
  const hips = mixPoint(p.legs[0].hip, p.legs[1].hip, 0.5);
  const up = unit(sub(p.neck, hips));
  const shoulders = perpendicular(sub(p.arms[1].shoulder, p.arms[0].shoulder), up);
  const pelvis = perpendicular(sub(p.legs[1].hip, p.legs[0].hip), up);
  const baseFront = unit(cross(pelvis, up));
  function bodyPoint(t, w, d, shift, c, s, extra = 0) {
    const side = unit(mixPoint(pelvis, shoulders, Math.max(0, Math.min(1, t))));
    const front = unit(cross(side, up));
    const arch =
      move.motion === 'pelvic-tilt' && t > 0 && t < 0.66
        ? Math.sin((t / 0.66) * Math.PI) * 0.029 * (1 - p.a)
        : 0;
    const center = along(mixPoint(hips, p.neck, t), front, shift + arch);
    return along(along(center, side, c * (w + extra)), front, s * (d + extra));
  }
  const torsoRing = ([t, w, d, shift]) => bodyRound.map(([c, s]) => bodyPoint(t, w, d, shift, c, s));
  for (const leg of p.legs) drawLeg(mesh, leg, move.pose === 'supine', hips, up, pelvis, baseFront);
  const hipHeight = 0.066 / Math.hypot(...sub(p.neck, hips));
  mesh.surface(
    [
      [hipHeight, 0.159, 0.111, -0.012],
      [0.24, 0.147, 0.103, -0.005],
      [0.32, 0.139, 0.098, 0],
    ].map(torsoRing),
    leggings,
  );
  mesh.surface(
    [
      [0.24, 0.148, 0.104, -0.005],
      [0.294, 0.144, 0.102, 0],
      [0.325, 0.141, 0.1, 0],
    ].map(torsoRing),
    move.motion === 'pelvic-tilt' ? '#b28b65' : '#58667a',
  );
  const torso = [
    [0.308, 0.144, 0.102, 0],
    [0.34, 0.145, 0.103, 0],
    [0.46, 0.136, 0.1, 0.002],
    [0.58, 0.139, 0.106, 0.003],
    [0.69, 0.15, 0.116, 0.004],
    [0.78, 0.164, 0.122, 0.006],
    [0.86, 0.173, 0.117, 0.006],
    [0.94, 0.181, 0.1, 0.001],
    [0.99, 0.168, 0.082, -0.002],
    [1.035, 0.119, 0.065, -0.003],
    [1.075, 0.055, 0.044, -0.004],
  ];
  // The knit top and the skin above its neckline meet at the same contour,
  // so the edge stays clean when seen from above or in profile on the mat.
  const necklineRing = (fraction, upperChest = false) =>
    bodyRound.map(([c, s]) => {
      const end = 1.062 - 0.096 * Math.max(0, s) ** 2;
      const t = upperChest ? end + fraction * (1.075 - end) : 0.312 + fraction * (end - 0.312);
      const row = sectionAt(t, torso);
      return bodyPoint(row[0], row[1], row[2], row[3], c, s);
    });
  mesh.surface(
    [0, 0.05, 0.21, 0.4, 0.57, 0.74, 0.85, 0.94, 0.977].map((t) => necklineRing(t)),
    top,
  );
  mesh.surface([necklineRing(0.977), necklineRing(1)], trim);
  mesh.surface(
    [0, 0.18, 0.4, 0.65, 0.81, 0.94, 1].map((t) => necklineRing(t, true)),
    skin,
  );
  const collar = along(mixPoint(hips, p.neck, 1.069), up, -0.001);
  const neckEnd = along(p.skull, unit(sub(p.crown, p.skull)), -0.071);
  sweep(
    mesh,
    [along(collar, up, -0.012), mixPoint(collar, neckEnd, 0.4), neckEnd],
    [
      [0.055, 0.044],
      [0.043, 0.04],
      [0.045, 0.044],
    ],
    skin,
    shoulders,
  );
  for (const arm of p.arms) drawArm(mesh, arm, p.neck, move.motion === 'shoulder-squeeze');
  drawHead(mesh, p);
}

// Rounded seat pads and exercise equipment share the trainer's depth buffer.
function pad(mesh, center, w, d, h, r, color) {
  const outline = [];
  for (const [cx, cz, start] of [
    [w - r, d - r, 0],
    [-w + r, d - r, 90],
    [-w + r, -d + r, 180],
    [w - r, -d + r, 270],
  ]) {
    for (let i = 0; i <= 3; i++) {
      const a = ((start + i * 30) * Math.PI) / 180;
      outline.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  const layers = [
    [-h, 0.01],
    [-h, 0.96],
    [-h * 0.65, 1],
    [h * 0.62, 1],
    [h, 0.96],
    [h, 0.01],
  ];
  mesh.surface(
    layers.map(([dy, k]) => outline.map(([x, z]) => add(center, [x * k, dy, z * k]))),
    color,
  );
}
export function drawEquipment(mesh, p, move, location, seconds) {
  const metal = '#9aaead',
    cushion = '#adbfba',
    accent = '#c98a48';
  if (move.pose === 'seated') {
    pad(mesh, [0, 0.419, 0.071], 0.245, 0.241, 0.03, 0.046, cushion);
    for (const s of [-1, 1]) {
      for (const z of [-0.13, 0.235])
        rod(mesh, [s * 0.226, 0.009, z * 1.18], [s * 0.204, 0.409, z], 0.013, metal);
      rod(mesh, [s * 0.205, 0.41, -0.13], [s * 0.203, 0.889, -0.21], 0.012, metal);
    }
    // Backrest tilts gently with the chair frame.
    mesh.surface(
      [
        [0.51, 0.17, 0.018],
        [0.53, 0.218, 0.024],
        [0.64, 0.22, 0.027],
        [0.85, 0.229, 0.029],
        [0.9, 0.217, 0.023],
        [0.912, 0.159, 0.014],
      ].map(([y, w, d]) => ring([0, y, -0.174 - (y - 0.51) * 0.12], X, Z, w, d, bodyRound)),
      cushion,
    );
    if (['plane-seat', 'train-seat'].includes(location))
      for (const s of [-1, 1]) {
        rod(mesh, [s * 0.266, 0.427, 0.16], [s * 0.266, 0.605, 0.16], 0.012, metal);
        rod(mesh, [s * 0.266, 0.615, -0.145], [s * 0.266, 0.615, 0.19], 0.016, cushion);
      }
  }
  if (move.pose === 'supine') pad(mesh, [0, -0.017, 0.012], 0.385, 1.035, 0.017, 0.054, '#a3c4bc');
  if (move.motion === 'step-up') pad(mesh, [0, 0.07, 0.426], 0.282, 0.203, 0.07, 0.018, cushion);
  if (move.equipment?.includes('support')) {
    rod(mesh, [0.32, 0.009, 0.4], [0.32, 1.055, 0.4], 0.015, metal);
    rod(mesh, [0.32, 1.055, 0.015], [0.32, 1.055, 0.55], 0.02, metal);
  }
  if (move.motion === 'band-open') rod(mesh, p.arms[0].palm, p.arms[1].palm, 0.007, accent);
  if (move.motion === 'foot-roll' || move.motion === 'towel-grip') {
    // The prop travels between the releasing and receiving sides at rest.
    const local = seconds % 4,
      index = p.side === 1 ? 1 : 0;
    const blend = Math.max(0, 1 - Math.min(local, 4 - local) / 0.42);
    const t = 0.5 * blend * blend * (3 - 2 * blend);
    if (move.motion === 'towel-grip') {
      const grip = mixPoint(p.arms[index].palm, p.arms[1 - index].palm, t);
      rod(mesh, add(grip, [-0.047, -0.01, 0.008]), add(grip, [0.047, -0.01, 0.008]), 0.021, '#9db9aa');
    } else {
      const ankle = mixPoint(p.legs[index].ankle, p.legs[1 - index].ankle, t);
      const center = [ankle[0], 0.04, ankle[2] + 0.075 - 0.065 * p.a];
      if (move.equipment?.includes('roller'))
        rod(mesh, add(center, [-0.093, 0, 0]), add(center, [0.093, 0, 0]), 0.04, accent);
      else ellipsoid(mesh, center, X, Y, Z, 0.04, 0.04, 0.04, accent);
    }
  }
}

// The inset uses the same fingers and wrist as the full figure.
export function drawHandDetail(mesh, arm, motion) {
  const fore = (t) => mixPoint(arm.elbow, arm.wrist, t);
  sweep(
    mesh,
    [fore(0.6), fore(0.83), arm.wrist],
    [
      [0.031, 0.035],
      [0.025, 0.026],
      [0.022, 0.019],
    ],
    skin,
  );
  drawHand(mesh, arm);
  if (motion === 'towel-grip') {
    rod(mesh, add(arm.palm, [-0.047, -0.01, 0.008]), add(arm.palm, [0.047, -0.01, 0.008]), 0.021, '#9db9aa');
  }
}
