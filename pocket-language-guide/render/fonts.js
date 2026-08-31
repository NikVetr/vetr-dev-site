// Font ids <-> CSS. Shared by the DOM preview and the SVG renderer so both name
// the same faces the measurer used.
//
// A run's fontId is the face the measurer actually resolved, so the CSS must
// declare exactly that weight and style. Letting the browser synthesise a bold or
// an oblique would change advance widths that the layout already committed to.

/** @typedef {{stack:string, weight:number, italic:boolean, file:string}} ManifestFace */

/** @param {string} stack */
export function familyFor(stack) {
  return `plg-${stack}`;
}

/**
 * fontId -> what to put in `font-family` / `font-weight` / `font-style`.
 * @param {{faces:ManifestFace[]}} manifest
 */
export function cssFaces(manifest) {
  /** @type {Record<string,{family:string, weight:number, italic:boolean, file:string, stack:string}>} */
  const out = {};
  for (const f of manifest.faces) {
    out[f.file] = {
      family: familyFor(f.stack), weight: f.weight, italic: f.italic, file: f.file, stack: f.stack,
    };
  }
  return out;
}

/**
 * `@font-face` rules for the given stacks. woff2 only: every target browser has
 * supported it for years, and shipping a second format would double the payload
 * for the offline cache.
 * @param {{faces:ManifestFace[]}} manifest
 * @param {string[]} stacks
 * @param {string} basePath  where the woff2 files are served from
 */
export function fontFaceCss(manifest, stacks, basePath = 'data/fonts') {
  const wanted = new Set(stacks);
  return manifest.faces
    .filter((f) => wanted.has(f.stack))
    .map((f) => [
      '@font-face {',
      `  font-family: "${familyFor(f.stack)}";`,
      `  src: url("${basePath}/${f.file}.woff2") format("woff2");`,
      `  font-weight: ${f.weight};`,
      `  font-style: ${f.italic ? 'italic' : 'normal'};`,
      '  font-display: block;',
      '}',
    ].join('\n'))
    .join('\n\n');
}
