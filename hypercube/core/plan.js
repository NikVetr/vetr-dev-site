// A plan: one solved trajectory of the R pipeline (NikVetr/shape_rotation,
// scripts/export_web_plan.R), read and checked here. Each integration step of R
// is one frame; its projected vertices and depths are V A for a k × 3 matrix A.
// The plan also carries the stage dimension of every frame and the face-number
// plan of R's --face-numbers render as initial numbers plus change events.

import { HypercubeError, isObject } from './errors.js';
import { topology } from './geometry.js';

/** @typedef {import('./errors.js').Issue} Issue */
/** @typedef {import('./geometry.js').Topology} Topology */
/**
 * @typedef {{ index: number, dimension: number, start: number, length: number, phase: 'unfolding' | 'full' | 'folding' }} Stage
 * @typedef {{
 *   k: number, frames: number, stepsPerSecond: number, thin: number, seed: number, nrots: number, axisBounds: number,
 *   colors: { face: string, edge: string, faceAlpha: number },
 *   stages: Stage[], stageOfFrame: Uint8Array, projection: Float32Array, topology: Topology,
 *   faceNumbers: { initial: Uint8Array, changeStarts: Int32Array, changeSteps: Int32Array, changeNumbers: Uint8Array, eventCount: number },
 *   source: Record<string, unknown>,
 * }} Plan
 */

export const STAGE_NAMES = ['line segment', 'square', 'cube', 'tesseract', 'penteract', 'hexeract', 'hepteract', 'octeract', 'ennearact'];
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** "tesseract (ℝ⁴)", as R's RGL caption reads. @param {number} dimension */
export function stageLabel(dimension) {
  const name = STAGE_NAMES[dimension - 1] ?? `${dimension}-cube`;
  const power = [...String(dimension)].map((d) => SUPERSCRIPTS[Number(d)]).join('');
  return `${name} (ℝ${power})`;
}

/** @param {string} text @returns {Uint8Array} */
function base64Bytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Reads a plan document (parsed JSON or its text) and checks it. Problems throw
 * one HypercubeError with code 'invalid_plan' listing every issue.
 * @param {unknown} document
 * @returns {Plan}
 */
export function decodePlan(document) {
  /** @type {Issue[]} */
  const issues = [];
  const problem = (/** @type {string} */ path, /** @type {string} */ message) => issues.push({ code: 'invalid_plan', path, message });
  let json = document;
  if (typeof json === 'string') {
    try { json = JSON.parse(json); } catch (error) { problem('', `not JSON: ${/** @type {Error} */ (error).message}`); }
  }
  const fail = () => new HypercubeError('invalid_plan', `The plan is not a usable hypercube plan: ${issues.map((i) => `${i.path || 'plan'}: ${i.message}`).join('; ')}`, issues);
  if (!isObject(json)) {
    if (!issues.length) problem('', 'must be a JSON object');
    throw fail();
  }
  if (json.format !== 'hypercube-plan' || json.version !== 1) problem('format', 'must be format "hypercube-plan", version 1');
  const k = json.k;
  const frames = json.frames;
  if (!Number.isInteger(k) || k < 3 || k > 12) problem('k', 'must be an integer from 3 to 12');
  if (!Number.isInteger(frames) || frames < 2) problem('frames', 'must be an integer of at least 2');
  for (const key of ['stepsPerSecond', 'thin', 'seed', 'nrots']) {
    if (!Number.isInteger(json[key]) || json[key] < 1) problem(key, 'must be a positive integer');
  }
  if (!(json.axisBounds > 0)) problem('axisBounds', 'must be a positive number');
  const colors = json.colors;
  if (!isObject(colors) || !HEX.test(colors.face) || !HEX.test(colors.edge) || !(colors.faceAlpha >= 0 && colors.faceAlpha <= 1)) {
    problem('colors', 'must give face and edge as #RRGGBB and faceAlpha from 0 to 1');
  }
  if (issues.length) throw fail();

  /** @type {Stage[]} */
  const stages = [];
  const stageOfFrame = new Uint8Array(frames);
  if (!Array.isArray(json.stages) || !json.stages.length) problem('stages', 'must be a non-empty array');
  else {
    let next = 1;
    let peak = -1;
    json.stages.forEach((/** @type {any} */ stage, /** @type {number} */ i) => {
      if (!isObject(stage) || !Number.isInteger(stage.dimension) || stage.dimension < 1 || stage.dimension > k ||
          stage.start !== next || !Number.isInteger(stage.length) || stage.length < 1) {
        problem(`stages[${i}]`, `must be {dimension 1..${k}, start ${next}, length ≥ 1}, contiguous from frame 1`);
        return;
      }
      if (stage.dimension === k && peak < 0) peak = i;
      stageOfFrame.fill(i, stage.start - 1, Math.min(frames, stage.start - 1 + stage.length));
      stages.push({ index: i, dimension: stage.dimension, start: stage.start, length: stage.length,
        phase: peak < 0 ? 'unfolding' : stage.dimension === k ? 'full' : 'folding' });
      next = stage.start + stage.length;
    });
    if (next !== frames + 1) problem('stages', `must cover frames 1 to ${frames}`);
    if (json.stages.length > 255) problem('stages', 'must number at most 255');
  }

  const p = json.projection;
  let projection = new Float32Array(0);
  if (!isObject(p) || p.encoding !== 'float32le-base64' || typeof p.data !== 'string') {
    problem('projection', 'must be {encoding: "float32le-base64", data}');
  } else {
    const bytes = base64Bytes(p.data);
    if (bytes.length !== frames * k * 3 * 4) problem('projection.data', `must hold ${frames} × ${k} × 3 float32 values`);
    else {
      const view = new DataView(bytes.buffer);
      projection = new Float32Array(frames * k * 3);
      for (let i = 0; i < projection.length; i++) projection[i] = view.getFloat32(4 * i, true);
      if (!projection.every(Number.isFinite)) problem('projection.data', 'must be finite');
    }
  }

  const topo = topology(k);
  const faceCount = topo.faces.length / 4;
  const fn = json.faceNumbers;
  let faceNumbers = { initial: new Uint8Array(0), changeStarts: new Int32Array(0), changeSteps: new Int32Array(0), changeNumbers: new Uint8Array(0), eventCount: 0 };
  if (!isObject(fn) || !Array.isArray(fn.initial) || !isObject(fn.events) || fn.events.encoding !== 'uint16le-base64' || typeof fn.events.data !== 'string') {
    problem('faceNumbers', 'must be {initial: [...], events: {encoding: "uint16le-base64", data}}');
  } else if (fn.initial.length !== faceCount || !fn.initial.every((/** @type {unknown} */ n) => Number.isInteger(n) && /** @type {number} */ (n) >= 2 && /** @type {number} */ (n) <= k)) {
    problem('faceNumbers.initial', `must give ${faceCount} numbers from 2 to ${k}`);
  } else {
    const bytes = base64Bytes(fn.events.data);
    const view = new DataView(bytes.buffer);
    const count = bytes.length / 6;
    if (!Number.isInteger(count) || count !== fn.eventCount) problem('faceNumbers.events', `must hold ${fn.eventCount} (step, face, number) uint16 triples`);
    else {
      // Group the events by face, in step order, for a binary search per face.
      const steps = new Int32Array(count), faces = new Int32Array(count), numbers = new Uint8Array(count);
      const perFace = new Int32Array(faceCount + 1);
      let last = 0;
      for (let e = 0; e < count; e++) {
        steps[e] = view.getUint16(6 * e, true);
        faces[e] = view.getUint16(6 * e + 2, true) - 1;
        numbers[e] = view.getUint16(6 * e + 4, true);
        if (steps[e] < 2 || steps[e] > frames || steps[e] < last || faces[e] < 0 || faces[e] >= faceCount || numbers[e] < 2 || numbers[e] > k) {
          problem(`faceNumbers.events[${e}]`, 'must be a step 2..frames in order, a face row and a number 2..k');
          break;
        }
        last = steps[e];
        perFace[faces[e] + 1]++;
      }
      for (let f = 0; f < faceCount; f++) perFace[f + 1] += perFace[f];
      const fill = perFace.slice(0, faceCount);
      const changeSteps = new Int32Array(count), changeNumbers = new Uint8Array(count);
      for (let e = 0; e < count; e++) {
        const at = fill[faces[e]]++;
        changeSteps[at] = steps[e];
        changeNumbers[at] = numbers[e];
      }
      faceNumbers = { initial: Uint8Array.from(fn.initial), changeStarts: perFace, changeSteps, changeNumbers, eventCount: count };
    }
  }
  if (issues.length) throw fail();
  return {
    k, frames, stepsPerSecond: json.stepsPerSecond, thin: json.thin, seed: json.seed, nrots: json.nrots, axisBounds: json.axisBounds,
    colors: { face: colors.face, edge: colors.edge, faceAlpha: colors.faceAlpha },
    stages, stageOfFrame, projection, topology: topo, faceNumbers,
    source: isObject(json.source) ? json.source : {},
  };
}

/** The number printed on a face at a frame (1-based), from the plan. @param {Plan} plan @param {number} face 0-based @param {number} frame */
export function faceNumber(plan, face, frame) {
  const { initial, changeStarts, changeSteps, changeNumbers } = plan.faceNumbers;
  let lo = changeStarts[face], hi = changeStarts[face + 1];
  // The last change at or before the frame; none means the initial number.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (changeSteps[mid] <= frame) lo = mid + 1;
    else hi = mid;
  }
  return lo === changeStarts[face] ? initial[face] : changeNumbers[lo - 1];
}

/** The stage a frame belongs to. @param {Plan} plan @param {number} frame 1-based */
export function stageAt(plan, frame) {
  return plan.stages[plan.stageOfFrame[frame - 1]];
}
