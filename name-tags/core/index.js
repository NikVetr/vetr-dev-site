// The tool's single entry point. The page (through its worker),
// window.NameTags and cli.mjs all call submit(); nothing here touches the
// DOM. Stages, as R's nametag_submit():
//   1. validate the request; trays and cells (request.js, tray.js)
//   2. split names into lines, capitals rule (names.js)
//   3. measure lines and place glyph outlines (layout.js, font.js)
//   4. fit each two-line tag around its decoration (layout.js, boxes.js)
//   5. decorations: helix (helix.js), Hershey + EKG (hershey.js), logos (logo.js)
//   6. one SVG per tray-full (svg.js)

import { tagHersheyEkg } from './hershey.js';
import { tagHelix } from './helix.js';
import { layoutDnaTag, layoutPlainTag, measureTags } from './layout.js';
import { logoDrawing, readLogo } from './logo.js';
import { applyCapsRule } from './names.js';
import { normalizeRequest } from './request.js';
import { rMersenneTwister } from '../../shared/rng.js';
import { renderSheet } from './svg.js';
import { assignCells } from './tray.js';
import { missingChars } from './font.js';

export { DEFAULTS, DEFAULT_HERSHEY_EKG, DEFAULT_STYLE, FONTS, NameTagsError, logoType } from './request.js';
export { TRAY_PRESETS } from './tray.js';
export { parseNamesCsv, parseNamesText, splitNameLines } from './names.js';

/**
 * @typedef {{ done: number, total: number, name: string }} Progress
 * @typedef {ReturnType<typeof submit>} Result
 */

/**
 * Validates a request, lays out its names on the tray and draws the sheets.
 * Same request (seed included), same result.
 * @param {unknown} request see api.md
 * @param {{ onProgress?: (progress: Progress) => void }} [options] onProgress is called after each tag
 */
export function submit(request, { onProgress } = {}) {
  const s = normalizeRequest(request);
  const { tray, style } = s;
  const placements = assignCells(s.names.length, tray.n_cells, s.cells);
  const rng = rMersenneTwister(s.seed);
  /** @type {string[]} */
  const warnings = [];
  const origin = (/** @type {number} */ i) => {
    const [cx, cy] = tray.centers[placements[i].cell - 1];
    return [cx - tray.cell_in[0] / 2, cy - tray.cell_in[1] / 2];
  };
  const progress = (/** @type {number} */ i) => onProgress?.({ done: i + 1, total: s.names.length, name: s.names[i].name });
  /** @type {import('./svg.js').CellDrawing[]} */
  const drawings = [];
  /** @type {Record<string, any>[]} */
  let tags;

  if (s.decoration === 'logo') {
    /** @type {Map<string, ReturnType<typeof readLogo>>} */
    const logos = new Map();
    tags = s.names.map((n, i) => {
      const file = n.logo ?? /** @type {string} */ (s.logo.file);
      if (!logos.has(file)) logos.set(file, readLogo(file, tray.cell_in, s.logo, `names[${i}]`));
      drawings.push(logoDrawing(/** @type {ReturnType<typeof readLogo>} */ (logos.get(file)), origin(i), tray.cell_in, s.logo));
      progress(i);
      return { name: n.name, sheet: placements[i].sheet, cell: placements[i].cell, decoration: 'logo', logo: { type: logos.get(file)?.type } };
    });
  } else {
    const adj = [style.name_center_adj_prop[0] * tray.cell_in[0], style.name_center_adj_prop[1] * tray.cell_in[1]];
    const family = s.font.family;
    if (s.decoration === 'hershey_ekg') {
      tags = s.lines.map((lines, i) => {
        const tag = tagHersheyEkg(lines, tray.cell_in, style, s.hershey_ekg, rng.norm);
        drawings.push({ origin: origin(i), layers: [{ kind: 'shape', polygons: tag.polygons, dx: adj[0], dy: adj[1] }] });
        progress(i);
        return { name: s.names[i].name, lines, sheet: placements[i].sheet, cell: placements[i].cell, decoration: 'hershey_ekg', fit: null };
      });
    } else {
      const linesList = style.smallcaps ? s.lines.map(applyCapsRule) : s.lines;
      const missing = missingChars(linesList.flat().join(''), family);
      if (missing.length) warnings.push(`${family} has no glyph for ${missing.map((c) => JSON.stringify(c)).join(' ')}; they are drawn as its empty-box glyph`);
      const centers = placements.map((p) => tray.centers[p.cell - 1]);
      const { measured, meanIar2f } = measureTags(linesList, centers, family, tray.cell_in, tray.page_in, style);
      tags = measured.map((m, i) => {
        const dna = s.decoration === 'dna' && m.metrics.length === 2; // one-line names carry no helix
        const tag = dna
          ? layoutDnaTag(m, centers[i], tray.cell_in, style, meanIar2f, rng.unif, (w) => warnings.push(w))
          : layoutPlainTag(m, centers[i], tray.cell_in, style);
        /** @type {import('./svg.js').Layer[]} */
        const layers = tag.lines.map((l) => ({ kind: 'glyphs', polygons: l.glyphs, dx: adj[0], dy: adj[1] + l.lowerQ }));
        if (dna) layers.push({ kind: 'helix', polygons: tagHelix(tag, adj).polygons, dx: 0, dy: 0 });
        drawings.push({ origin: origin(i), layers });
        progress(i);
        return { name: s.names[i].name, lines: tag.text, sheet: placements[i].sheet, cell: placements[i].cell, decoration: dna ? 'dna' : 'none', fit: tag.fit };
      });
    }
  }

  const kind = s.decoration === 'logo' ? 'logos' : 'names';
  const sheetNumbers = [...new Set(placements.map((p) => p.sheet))];
  const sheets = sheetNumbers.map((sheet) => ({
    kind,
    sheet,
    file: `${s.output.prefix}_${kind}_grid_${sheet}.svg`,
    svg: renderSheet(tray, drawings.filter((_, i) => placements[i].sheet === sheet)),
  }));
  return {
    tray: { name: tray.name, page_in: tray.page_in, cell_in: tray.cell_in, n_cells: tray.n_cells },
    sheets,
    tags,
    warnings,
  };
}
