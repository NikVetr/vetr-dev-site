// The tool's single entry point. The page, window.Helix and cli.mjs all call submit();
// nothing here touches the DOM.
//   request.js  validation and defaults
//   helix.js    helix mode: R's draw_DNA, through shared/helix.js
//   braid.js    braid mode: R's braid_segment
//   draw.js     the drawing as SVG: filled, outlines or centrelines

import { braidDrawing } from './braid.js';
import { renderSvg } from './draw.js';
import { helixDrawing } from './helix.js';
import { normalizeRequest } from './request.js';
import { bendDrawing } from './path.js';

export { BRAID_DEFAULTS, HELIX_DEFAULTS, HelixError, OUTPUT_DEFAULTS } from './request.js';

/**
 * Validates a request and draws it. Nothing is random: the same request gives the same result.
 * @param {unknown} request see api.md
 */
export function submit(request) {
  const req = normalizeRequest(request);
  const drawing = designDrawing(req);
  const { svg, width, height, strokeWidth, outlineWidth, at } = renderSvg(drawing, req.output);
  return {
    request: req,
    unit: req.output.unit,
    width,
    height,
    strokeWidth,
    outlineWidth,
    svg,
    geometry: drawing.geometry(at),
  };
}

/** Shared raw design geometry for the standalone editor and fitted decorations.
 * The optional guide owns orientation, length and band width; original shape
 * settings still determine turns, crossings, depth and strand proportions.
 * @param {import('./request.js').Request} req A normalized request.
 */
export function designDrawing(req) {
  if (!req.path) return req.mode === 'helix' ? helixDrawing(req.helix) : braidDrawing(req.braid);
  const source = req.mode === 'helix'
    ? helixDrawing({...req.helix, rotation: 90})
    : braidDrawing({...req.braid, rotation: 0});
  return bendDrawing(source, req.path);
}
