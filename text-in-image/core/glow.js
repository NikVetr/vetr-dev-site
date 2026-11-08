// A drawing-only halo shared by the app/export renderer and landing example.
// Blur one whole glyph layer, then put its crisp original over the halo.
/** @param {string} id internal SVG filter identifier
 * @param {number} fontSize glyph size in the drawing's units
 * @param {[number,number,number,number]} bounds [x,y,width,height] of the output region
 * @param {number} [strength] validated strength, 0–4; 1 retains the original soft glow
 */
export function textGlowFilter(id, fontSize, bounds, strength = 1) {
  const [x,y,width,height] = bounds;
  const blur = Number((fontSize * .22 * Math.sqrt(strength)).toFixed(4));
  const opacity = Number((.6 * strength).toFixed(4));
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="${blur}"/><feComponentTransfer><feFuncR type="linear" slope=".85" intercept=".15"/><feFuncG type="linear" slope=".85" intercept=".15"/><feFuncB type="linear" slope=".85" intercept=".15"/><feFuncA type="linear" slope="${opacity}"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}
