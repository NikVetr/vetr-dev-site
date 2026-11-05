import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  decodePlan, drawFrame, faceNumber, faceVisibility, HypercubeError, PLAN_TOLERANCE, projectFrame, SHIPPED_K, stageAt, stageLabel, submit,
} from '../core/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const planText = (/** @type {number} */ k) => readFileSync(join(here, '..', 'plans', `k${k}.json`), 'utf8');
/** @type {Map<number, import('../core/plan.js').Plan>} */
const plans = new Map(SHIPPED_K.map((k) => [k, decodePlan(planText(k))]));
const plan = (/** @type {number} */ k) => /** @type {import('../core/plan.js').Plan} */ (plans.get(k));
/** R's own frames: projected vertices, drawing order, visibility and face numbers (see the fixture's source). */
const fixture = JSON.parse(readFileSync(join(here, 'fixtures', 'r-parity.json'), 'utf8'));
const md5 = (/** @type {string} */ text) => createHash('md5').update(text).digest('hex');
const visibleBits = (/** @type {string} */ hex, /** @type {number} */ n) => Array.from({ length: n }, (_, f) => (parseInt(hex[f >> 2], 16) >> (3 - (f & 3))) & 1);

test('every shipped plan loads: stages cover the loop, which unfolds 1..k and folds back', () => {
  for (const k of SHIPPED_K) {
    const p = plan(k);
    assert.equal(p.k, k);
    assert.equal(p.frames % p.thin, 0, 'a whole number of video frames');
    assert.equal(p.projection.length, p.frames * k * 3);
    assert.equal(p.stages.reduce((n, s) => n + s.length, 0), p.frames);
    const dims = p.stages.map((s) => s.dimension);
    const peak = dims.indexOf(k);
    assert.deepEqual(dims.slice(0, peak + 1), Array.from({ length: k }, (_, i) => i + 1));
    assert.deepEqual(dims.slice(peak), Array.from({ length: k }, (_, i) => k - i));
    assert.equal(p.topology.faces.length / 4, (k * (k - 1) / 2) * 2 ** (k - 2));
    assert.equal(p.topology.edges.length / 2, k * 2 ** (k - 1));
    assert.equal(stageAt(p, 1).dimension, 1);
    assert.equal(stageAt(p, p.frames).phase, 'folding');
  }
  assert.equal(stageLabel(4), 'tesseract (ℝ⁴)');
  assert.equal(stageLabel(9), 'ennearact (ℝ⁹)');
  assert.equal(stageLabel(12), '12-cube (ℝ¹²)');
});

test('topology is R\'s: the same faces and edges in the same order', () => {
  for (const { k, topology } of fixture.plans) {
    const { faces, edges } = plan(k).topology;
    // R lists each face's vertices sorted; the port keeps them as the quad cycle (1, 2, 4, 3).
    const rows = Array.from({ length: faces.length / 4 }, (_, f) => [0, 1, 3, 2].map((c) => faces[4 * f + c] + 1).join(','));
    assert.equal(md5(rows.join(';')), topology.facesMd5, `faces, k = ${k}`);
    assert.deepEqual(rows.slice(0, topology.firstFaces.length), topology.firstFaces.map((/** @type {number[]} */ r) => r.join(',')));
    const pairs = Array.from({ length: edges.length / 2 }, (_, e) => `${edges[2 * e] + 1},${edges[2 * e + 1] + 1}`);
    assert.equal(md5(pairs.join(';')), topology.edgesMd5, `edges, k = ${k}`);
  }
});

test('frame geometry matches R\'s projected vertices and depths', () => {
  let worst = 0;
  for (const { k, frames, steps } of fixture.plans) {
    assert.equal(plan(k).frames, frames);
    for (const s of steps) {
      const points = projectFrame(plan(k).projection, k, s.step);
      s.xyz.forEach((/** @type {number[]} */ row, /** @type {number} */ v) => row.forEach((x, c) => { worst = Math.max(worst, Math.abs(x - points[3 * v + c])); }));
      assert.equal(stageAt(plan(k), s.step).dimension, s.dimension);
    }
  }
  // The plans store each frame's matrix in single precision.
  assert.ok(worst < 1e-7, `largest difference ${worst}`);
});

test('translucent faces are drawn as R draws them, in R\'s depth order', () => {
  for (const { k, steps } of fixture.plans) {
    const { faces } = plan(k).topology;
    for (const s of steps) {
      const depthR = (/** @type {number} */ f) => [0, 1, 2, 3].reduce((sum, c) => sum + s.xyz[faces[4 * f + c]][2], 0) / 4;
      const drawn = /** @type {any} */ (submit({ k, frame: s.step, render: 'geometry' }, plan(k))).geometry.faces.map((/** @type {{ face: number }} */ f) => f.face);
      const order = s.drawOrder.map((/** @type {number} */ f) => f - 1);
      // The same faces, apart from those R fills with no area.
      assert.deepEqual([...drawn].sort((a, b) => a - b), [...order].sort((a, b) => a - b), `k = ${k}, step ${s.step}`);
      const rank = new Map(order.map((/** @type {number} */ f, /** @type {number} */ i) => [f, i]));
      for (let i = 1; i < drawn.length; i++) {
        // Far to near by R's depths; R breaks exact ties by rounding noise, so only ties may swap.
        assert.ok(depthR(drawn[i]) <= depthR(drawn[i - 1]) + 1e-7, `k = ${k}, step ${s.step}: depth rises at ${i}`);
        if (/** @type {number} */ (rank.get(drawn[i])) < /** @type {number} */ (rank.get(drawn[i - 1]))) {
          assert.ok(Math.abs(depthR(drawn[i]) - depthR(drawn[i - 1])) <= 1e-7, `k = ${k}, step ${s.step}: order differs from R's beyond a tie`);
        }
      }
    }
  }
});

test('face visibility matches R\'s face_label_visibility, on R\'s and on the plan\'s coordinates', () => {
  for (const { k, steps } of fixture.plans) {
    const topo = plan(k).topology;
    for (const s of steps) {
      const expected = visibleBits(s.visible, topo.faces.length / 4);
      // R uses 1e-9 on its doubles; the fixture rounds them to 1e-9, so allow 1e-8.
      assert.deepEqual([...faceVisibility(new Float64Array(s.xyz.flat()), topo, 1e-8).visible], expected, `R coordinates, k = ${k}, step ${s.step}`);
      assert.deepEqual([...faceVisibility(projectFrame(plan(k).projection, k, s.step), topo, PLAN_TOLERANCE).visible], expected, `plan, k = ${k}, step ${s.step}`);
    }
  }
});

test('face numbers replay R\'s plan; opaque frames print them on the visible faces only', () => {
  for (const { k, steps } of fixture.plans) {
    const p = plan(k);
    const count = p.topology.faces.length / 4;
    for (const s of steps) {
      const numbers = k > 9 ? s.numbers.split(',').map(Number) : [...s.numbers].map(Number);
      assert.deepEqual(Array.from({ length: count }, (_, f) => faceNumber(p, f, s.step)), numbers, `k = ${k}, step ${s.step}`);
      const expected = visibleBits(s.visible, count);
      const result = /** @type {any} */ (submit({ k, frame: s.step, style: 'opaque', render: 'geometry' }, p));
      assert.equal(result.numeralsShown, true);
      for (const face of result.geometry.faces) {
        assert.equal(expected[face.face], 1, `drawn face ${face.face} is visible in R`);
        assert.equal(face.number, numbers[face.face]);
      }
    }
  }
});

test('a numeral never changes in view: a face drawn at its change is covered by faces painted over it', () => {
  // R plans changes on faces it finds hidden. Within the plans' float32 tolerance a face
  // just behind the front surface is drawn too, deepest first, so check it is covered.
  const inside = (/** @type {number[]} */ q, /** @type {number} */ x, /** @type {number} */ y) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, ay, bx, by] = [q[2 * i], q[2 * i + 1], q[(2 * i + 2) % 8], q[(2 * i + 3) % 8]];
      const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (Math.abs(c) < 1e-6) continue;
      if (sign && Math.sign(c) !== sign) return false;
      sign = Math.sign(c);
    }
    return true;
  };
  for (const k of [5, 6, 9]) {
    const p = plan(k);
    /** @type {Map<number, import('../core/draw.js').FacePrimitive[]>} */
    const lists = new Map();
    const facesAt = (/** @type {number} */ s) => {
      if (!lists.has(s)) lists.set(s, drawFrame(p, s, { style: 'opaque', faceAlpha: 1, numerals: true, theme: 'light', size: 800, camera: [1, 0, 0, 0] }).faces);
      return /** @type {import('../core/draw.js').FacePrimitive[]} */ (lists.get(s));
    };
    let checked = 0;
    for (let f = 0; f < p.topology.faces.length / 4; f++) {
      for (let e = p.faceNumbers.changeStarts[f]; e < p.faceNumbers.changeStarts[f + 1]; e++) {
        const step = p.faceNumbers.changeSteps[e];
        for (const at of [step - 1, step]) {
          const faces = facesAt(at);
          const i = faces.findIndex((d) => d.face === f);
          if (i < 0) continue;
          checked++;
          const q = faces[i].points;
          for (const [u, v] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
            const x = q[0] + u * (q[2] - q[0]) + v * (q[6] - q[0]), y = q[1] + u * (q[3] - q[1]) + v * (q[7] - q[1]);
            assert.ok(faces.slice(i + 1).some((d) => inside(d.points, x, y)), `k = ${k}: face ${f} shows at step ${at} as its numeral changes`);
          }
        }
      }
    }
    assert.ok(checked > 0);
  }
});

test('opaque view: numerals only in the default camera; a turned camera draws the turned shadow', () => {
  const turned = [Math.cos(0.3), Math.sin(0.3), 0, 0];
  const r = /** @type {any} */ (submit({ k: 5, frame: 716, style: 'opaque', render: 'geometry', camera: turned }, plan(5)));
  assert.equal(r.numerals, true);
  assert.equal(r.numeralsShown, false);
  assert.ok(r.geometry.faces.every((/** @type {object} */ f) => !('number' in f)));
  const flat = /** @type {any} */ (submit({ k: 5, frame: 716, render: 'geometry' }, plan(5))).geometry.vertices;
  const q = /** @type {any} */ (submit({ k: 5, frame: 716, render: 'geometry', camera: turned }, plan(5))).geometry.vertices;
  // A turn about x by 0.6 rad: x unchanged, y and z rotate.
  for (let v = 0; v < flat.length; v++) {
    assert.ok(Math.abs(q[v][0] - flat[v][0]) < 1e-12);
    assert.ok(Math.abs(q[v][1] - (flat[v][1] * Math.cos(0.6) - flat[v][2] * Math.sin(0.6))) < 1e-12);
  }
  const svg = /** @type {any} */ (submit({ k: 4, frame: 714, style: 'opaque' }, plan(4))).svg;
  assert.equal((svg.match(/<text /g) ?? []).length, drawFrame(plan(4), 714, { style: 'opaque', faceAlpha: 1, numerals: true, theme: 'light', size: 800, camera: [1, 0, 0, 0] }).faces.length);
});

test('t wraps around the loop; results are deterministic', () => {
  const p = plan(3);
  const at = (/** @type {object} */ r) => /** @type {any} */ (submit({ k: 3, render: 'geometry', ...r }, p)).frame;
  assert.equal(at({ t: 0 }), 1);
  assert.equal(at({ t: 1 }), 61);
  assert.equal(at({ t: p.frames / 60 }), 1);
  assert.equal(at({ t: p.frames / 60 + 0.5 }), 31);
  assert.equal(JSON.stringify(submit({ k: 3, frame: 700 }, p)), JSON.stringify(submit({ k: 3, frame: 700 }, p)));
  const svg = /** @type {any} */ (submit({ k: 3, frame: 700, caption: true, size: 300, theme: 'dark' }, p)).svg;
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="300" height="300"/);
  assert.match(svg, /cube \(ℝ³\)<\/text><\/svg>$/);
});

test('invalid requests list every problem with a code and a path', () => {
  const p = plan(4);
  /** @param {unknown} request */
  const issues = (request) => {
    try {
      submit(request, p);
    } catch (error) {
      assert.ok(error instanceof HypercubeError);
      return { code: error.code, issues: error.issues.map((i) => `${i.code} ${i.path}`) };
    }
    throw new Error('accepted');
  };
  assert.deepEqual(issues([]), { code: 'invalid_request', issues: ['wrong_type '] });
  assert.deepEqual(issues({ frame: 2, color: 'red' }), { code: 'invalid_request', issues: ['unknown_field color', 'missing_field k'] });
  assert.deepEqual(issues({ k: 4, frame: 1.5, t: 2, render: 'png', style: 'opaque', faceAlpha: 0.5, size: 8, camera: [1, 1, 0, 0], caption: 'yes' }), {
    code: 'invalid_request',
    issues: ['conflicting_fields t', 'wrong_type frame', 'invalid_choice render', 'not_applicable faceAlpha', 'out_of_range size', 'wrong_type caption', 'out_of_range camera'].sort((a, b) => order(a) - order(b)),
  });
  assert.deepEqual(issues({ k: 4, numerals: false }), { code: 'invalid_request', issues: ['not_applicable numerals'] });
  assert.deepEqual(issues({ k: 4, frame: 5000 }), { code: 'invalid_request', issues: ['out_of_range frame'] });
  assert.deepEqual(issues({ k: 5 }), { code: 'plan_unavailable', issues: ['plan_unavailable k'] });
  assert.deepEqual(issues({ k: 4, t: -1 }), { code: 'invalid_request', issues: ['out_of_range t'] });
});
/** Issues come in field order: k, frame/t, render, style, faceAlpha, numerals, caption, size, camera. @param {string} issue */
function order(issue) {
  return ['t', 'frame', 'render', 'style', 'faceAlpha', 'numerals', 'caption', 'size', 'camera'].indexOf(issue.split(' ')[1]);
}

test('a damaged plan is refused with every problem listed', () => {
  const json = JSON.parse(planText(3));
  assert.throws(() => decodePlan('{'), (/** @type {any} */ e) => e.code === 'invalid_plan');
  assert.throws(() => decodePlan({ ...json, version: 2, k: 2 }), (/** @type {any} */ e) => e.code === 'invalid_plan' && e.issues.length === 2);
  assert.throws(() => decodePlan({ ...json, stages: json.stages.slice(1) }), (/** @type {any} */ e) => e.issues[0].path === 'stages[0]');
  assert.throws(() => decodePlan({ ...json, projection: { ...json.projection, data: json.projection.data.slice(0, 400) } }), (/** @type {any} */ e) => e.issues[0].path === 'projection.data');
  assert.throws(() => decodePlan({ ...json, faceNumbers: { ...json.faceNumbers, initial: json.faceNumbers.initial.map(() => 1) } }), (/** @type {any} */ e) => e.issues[0].path === 'faceNumbers.initial');
});

test('the CLI prints results, writes SVG frames, and reports errors as JSON', () => {
  const cli = join(here, '..', 'cli.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'hypercube-'));
  const out = JSON.parse(execFileSync(process.execPath, [cli, '-', '--svg', join(dir, 'f.svg')], { input: '{"k": 4, "frame": 714, "size": 200}' }).toString());
  assert.equal(out.stage.label, 'tesseract (ℝ⁴)');
  assert.equal(out.svg, undefined);
  assert.match(readFileSync(join(dir, 'f.svg'), 'utf8'), /^<svg .*width="200"/);
  execFileSync(process.execPath, [cli, '-', '--frames', '1,700-704:2', '--out', join(dir, 'frames')], { input: '{"k": 3, "style": "opaque"}' });
  assert.deepEqual(readdirSync(join(dir, 'frames')), ['frame-00001.svg', 'frame-00700.svg', 'frame-00702.svg', 'frame-00704.svg']);
  const bad = spawnSync(process.execPath, [cli, '-'], { input: '{"k": 4, "frame": 0}' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr.toString()).error.issues[0].path, 'frame');
  assert.equal(spawnSync(process.execPath, [cli, '-', '--bogus'], { input: '{}' }).status, 2);
  const missing = spawnSync(process.execPath, [cli, '-'], { input: '{"k": 11}' });
  assert.equal(JSON.parse(missing.stderr.toString()).error.code, 'plan_unavailable');
});
