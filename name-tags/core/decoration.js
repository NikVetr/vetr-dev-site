// Optional standalone Helix/Braid geometry, uniformly fitted to the reserved DNA
// box. The tag optimizer and its existing underline/descender gaps are unchanged.
import { designDrawing } from '../../helix/core/index.js';
import { HelixError } from '../../helix/core/request.js';
import { bounds, union } from '../../shared/polygon.js';
import { mapRings } from './geometry.js';
import { helixOutline, tagHelixPieces } from './helix.js';
import { NameTagsError } from './request.js';

/** Prepare filled black engraving geometry once, shared by every tag.
 * @param {NonNullable<import('./request.js').Settings['decoration_design']>} request */
export function customDecoration(request) {
  let drawing;
  try { drawing = designDrawing(request); }
  catch (error) {
    if (!(error instanceof HelixError)) throw error;
    throw new NameTagsError(error.code, error.message, error.issues.map(issue => ({ ...issue, path: `decoration_design${issue.path ? `.${issue.path}` : ''}` })));
  }
  const polygons = union(drawing.fills.flatMap(group => group.shapes.flat(2)), 'nonzero');
  const box = bounds(polygons.flat());
  if (!box.every(Number.isFinite) || !(box[2] > box[0] && box[3] > box[1])) {
    throw new NameTagsError('invalid_decoration', 'The custom decoration needs filled geometry with positive width and height.', [{ code: 'empty_geometry', path: 'decoration_design', message: 'choose a drawing with positive filled width and height' }]);
  }
  const geometry = request.path ? /** @type {{path:{length:number,requestedWidth:number,width:number,narrowed:boolean,smoothing:number,minRadius:number|null}}} */ (drawing.geometry((x, y) => [x, y])) : null;
  const path = geometry ? { length: geometry.path.length, requestedWidth: geometry.path.requestedWidth, width: geometry.path.width,
    narrowed: geometry.path.narrowed, smoothing: geometry.path.smoothing, minRadius: geometry.path.minRadius } : null;
  return { polygons, box, path };
}

/** Preserve the original underline to the right of the reserved helix box.
 * @param {import('./layout.js').Tag} tag @param {number[]} adj
 * @param {ReturnType<typeof customDecoration>} design */
export function fitCustomDecoration(tag, adj, design) {
  const decoration = /** @type {import('./layout.js').DnaDecoration} */ (tag.decoration);
  const [x0, y0, x1, y1] = decoration.bbox.map((value, i) => value + adj[i % 2]);
  const [sx0, sy0, sx1, sy1] = design.box;
  const scale = Math.min((x1 - x0) / (sx1 - sx0), (y1 - y0) / (sy1 - sy0));
  if (!(scale > 0 && Number.isFinite(scale))) throw new NameTagsError('invalid_decoration', 'The fitted tag has no positive decoration box.');
  const dx = (x0 + x1 - scale * (sx0 + sx1)) / 2;
  const dy = (y0 + y1 - scale * (sy0 + sy1)) / 2;
  const polygons = design.polygons.map(poly => mapRings(poly, (x, y) => [scale * x + dx, scale * y + dy]));
  const legacy = tagHelixPieces(tag, adj);
  // Use only the original horizontal extension, not a bounding-box crop of
  // the helix (its ribbons extend slightly beyond the box at their ends).
  // The shared generator already split these pieces at all descender gaps.
  const straight = legacy.shape.pieces.map(piece => {
    const indices = piece.x.map((x, i) => i).filter(i => piece.x[i] >= x1 - 1e-10 && Math.abs(piece.y[i] - y0) < 1e-10);
    return { x: indices.map(i => piece.x[i]), y: indices.map(i => piece.y[i]), lwd: indices.map(i => piece.lwd[i]) };
  }).filter(piece => piece.x.length > 2 && Math.max(...piece.x) > Math.min(...piece.x));
  const underline = helixOutline(straight, 1);
  return { polygons, underline, gaps: legacy.gaps, fit: { box_in: [x0, y0, x1, y1], bounds_in: bounds(polygons.flat()), scale, offset_in: [dx, dy] } };
}
