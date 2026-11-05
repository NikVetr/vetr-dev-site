// The tool's single entry point. The page, window.Hypercube and cli.mjs all call
// submit(); nothing here touches the DOM or the file system. A plan is read once
// with decodePlan and handed to submit, which draws one frame of it.

import { describeStage, drawFrame, renderSvg } from './draw.js';
import { HypercubeError } from './errors.js';
import { checkFrame, normalizeRequest } from './input.js';

export { HypercubeError } from './errors.js';
export { decodePlan, faceNumber, stageAt, stageLabel, STAGE_NAMES } from './plan.js';
export { captionLayout, describeStage, drawFrame, FONT_FAMILY, NUMERAL_TEXTURE, PLAN_TOLERANCE, renderSvg, THEMES } from './draw.js';
export { DEFAULT_CAMERA, faceVisibility, isDefaultCamera, projectFrame, topology } from './geometry.js';
export { DEFAULTS, normalizeRequest, SHIPPED_K } from './input.js';

/** @typedef {import('./plan.js').Plan} Plan */
/** @typedef {Plan | ((k: number) => Plan)} PlanSource a plan, or a function giving the plan for a k */

/**
 * Validates a request and draws its frame: SVG text (render "svg") or the frame's
 * geometry and draw order (render "geometry"). Same request and plan, same result.
 * @param {unknown} request see api.md
 * @param {PlanSource} source
 */
export function submit(request, source) {
  const settings = normalizeRequest(request);
  const plan = typeof source === 'function' ? source(settings.k) : source;
  if (!plan || plan.k !== settings.k) {
    throw new HypercubeError('plan_unavailable', `No plan for k = ${settings.k} was given`, [{ code: 'plan_unavailable', path: 'k', message: `no plan for k = ${settings.k}` }]);
  }
  const frame = checkFrame(settings, plan.frames, plan.stepsPerSecond);
  const faceAlpha = settings.faceAlpha ?? plan.colors.faceAlpha;
  const list = drawFrame(plan, frame, { style: settings.style, faceAlpha, numerals: settings.numerals, theme: settings.theme, size: settings.size, camera: settings.camera });
  const stage = describeStage(plan, frame);
  const result = {
    k: plan.k, frame, frames: plan.frames, t: (frame - 1) / plan.stepsPerSecond, stepsPerSecond: plan.stepsPerSecond, stage,
    style: settings.style, ...(settings.style === 'translucent' ? { faceAlpha } : { numerals: settings.numerals, numeralsShown: list.numeralsShown }),
    theme: settings.theme, size: settings.size, camera: settings.camera,
    counts: { faces: list.faces.length, edges: list.edges.pairs.length / 2 },
  };
  if (settings.render === 'svg') {
    return { ...result, svg: renderSvg(list, { title: `${plan.k}-cube, frame ${frame}: ${stage.label}`, caption: settings.caption ? stage.label : undefined }) };
  }
  const p = list.points;
  return {
    ...result,
    geometry: {
      scale: list.scale,
      vertices: Array.from({ length: p.length / 3 }, (_, v) => [p[3 * v], p[3 * v + 1], p[3 * v + 2]]),
      faces: list.faces.map((f) => ({
        face: f.face, vertices: Array.from(plan.topology.faces.subarray(4 * f.face, 4 * f.face + 4)), depth: f.depth,
        fill: f.fill, opacity: f.opacity, ...(f.numeral ? { number: Number(f.numeral.text) } : {}),
      })),
      edges: Array.from({ length: list.edges.pairs.length / 2 }, (_, e) => [list.edges.pairs[2 * e], list.edges.pairs[2 * e + 1]]),
      background: list.background, edgeColor: list.edges.color, edgeWidth: list.edges.width,
    },
  };
}
