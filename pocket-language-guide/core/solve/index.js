// Solve a sheet: measure, split, break into columns, flush, and emit a LayoutPlan.
//
// The plan holds absolute point positions and text already broken into single
// lines, so every renderer -- DOM preview, SVG/PNG, PDF -- draws the same thing
// and none of them makes a layout decision.

import { buildAtoms } from './atoms.js';
import { breakColumns } from './columnbreak.js';
import { placeColumn } from './justify.js';

const SCALE_MIN = 0.5;
const SCALE_MAX = 1.8;
const AUTOFIT_STEPS = 7;

/** A column left this fraction of itself empty is reported as loose. */
const LOOSE_FRACTION = 0.06;

/**
 * Usable content box, after the printer's own margins. Borderless printing
 * enlarges the page to guarantee bleed, so the outer edge is cropped and the safe
 * area has to be inset by half the enlargement on each side.
 * @param {import('../types.js').Geometry} g
 * @param {import('../types.js').PaperSpec} paper
 */
export function contentBox(g, paper) {
  const insetX = paper.borderless ? (g.pageW * paper.oversprayPct) / 200 : paper.nonprintablePt;
  const insetY = paper.borderless ? (g.pageH * paper.oversprayPct) / 200 : paper.nonprintablePt;
  const left = Math.max(g.marginLeft, insetX);
  const right = Math.max(g.marginRight, insetX);
  const top = Math.max(g.marginTop, insetY);
  const bottom = Math.max(g.marginBottom, insetY);
  const width = g.pageW - left - right;
  const height = g.pageH - top - bottom;
  return {
    left, top, width, height,
    colWidth: (width - g.columnGap * (g.columns - 1)) / g.columns,
    clipped: g.marginLeft < insetX || g.marginTop < insetY,
    insetX, insetY,
  };
}

/**
 * Smallest type size any field would use at scale 1, and the floor imposed by the
 * target script and the chosen paper.
 * @param {any} theme
 * @param {Record<string,string>} script
 * @param {import('../types.js').PaperSpec} paper
 */
function sizeFloor(theme, script, paper) {
  const sizes = Object.values(theme.templates)
    .flatMap((/** @type {any} */ t) => t.fields.map((/** @type {any} */ f) => f.size));
  return {
    smallest: Math.min(...sizes, theme.note.size),
    floor: Number(script.min_size_pt) + Number(paper.minSizeDelta),
  };
}

/**
 * @typedef {Object} SolveInput
 * @property {import('../types.js').Block[]} blocks
 * @property {any} theme
 * @property {import('../types.js').SheetSpec} spec
 * @property {Awaited<ReturnType<import('../pack.js').loadCorpus>>} corpus
 * @property {ReturnType<import('../measure.js').createMeasurer>} measurer
 */

/**
 * @param {SolveInput} input
 * @returns {import('../types.js').LayoutPlan}
 */
export function layout(input) {
  const { blocks, theme, spec, corpus, measurer } = input;
  const box = contentBox(spec.geometry, spec.paper);
  const bins = spec.geometry.faces * spec.geometry.columns;
  /** @type {import('../types.js').Warning[]} */ const warnings = [];

  const targetScript = corpus.scripts[corpus.languages[spec.target].script];
  const { smallest, floor } = sizeFloor(theme, targetScript, spec.paper);
  const scaleFloor = Math.max(SCALE_MIN, floor / smallest);

  const measureOnly = (/** @type {number} */ scale) => buildAtoms({
    blocks, theme, spec, corpus, measurer, colWidth: box.colWidth, scale, withPaint: false,
  });

  let scale = spec.scale;
  if (spec.scale <= 0) {
    const fitted = autofit(measureOnly, box.height, bins, scaleFloor);
    scale = fitted ?? scaleFloor;
    if (fitted === null) {
      warnings.push({
        code: 'no-fit',
        severity: 'error',
        message: `Content will not fit ${spec.geometry.faces} face(s) of `
          + `${spec.geometry.columns} columns at any legible size. Remove sections, `
          + 'add a face, or add a column.',
      });
    }
  }
  if (smallest * scale < floor - 1e-6) {
    warnings.push({
      code: 'below-min-size',
      severity: 'warn',
      message: `Smallest text is ${(smallest * scale).toFixed(2)}pt, below the `
        + `${floor.toFixed(2)}pt floor for ${targetScript.name} on this paper.`,
    });
  }
  if (targetScript.word_break === 'dict') {
    warnings.push({
      code: 'no-dictionary-breaking',
      severity: 'warn',
      message: `${targetScript.name} needs dictionary line breaking, which is not `
        + 'implemented yet; lines may break mid-word.',
    });
  }
  if (box.clipped) {
    warnings.push({
      code: 'margin-below-safe-area',
      severity: 'warn',
      message: `Margins were widened to ${box.insetX.toFixed(1)}pt to stay inside `
        + `the ${spec.paper.presetId} printable area.`,
    });
  }

  const atoms = buildAtoms({
    blocks, theme, spec, corpus, measurer, colWidth: box.colWidth, scale, withPaint: true,
  });
  const broken = breakColumns(atoms, box.height, bins);
  if (broken.failure) {
    warnings.push({ code: 'break-failed', severity: 'error', message: broken.failure });
    return {
      pageW: spec.geometry.pageW, pageH: spec.geometry.pageH,
      faces: [], warnings, scale, looseness: [],
    };
  }

  /** @type {import('../types.js').Face[]} */ const faces = [];
  /** @type {number[]} */ const looseness = [];
  for (let f = 0; f < spec.geometry.faces; f += 1) {
    /** @type {import('../types.js').Face} */
    const face = { rects: [], runs: [], icons: [], hits: [] };
    for (let c = 0; c < spec.geometry.columns; c += 1) {
      const bin = f * spec.geometry.columns + c;
      const indices = broken.columns[bin] ?? [];
      const x = box.left + c * (box.colWidth + spec.geometry.columnGap);
      const columnAtoms = indices.map((i) => atoms[i]);
      const { offsets, residual } = placeColumn(columnAtoms, box.top, broken.slack[bin]);
      looseness.push(residual);
      columnAtoms.forEach((atom, k) => {
        const dy = offsets[k];
        if (!atom.paint) return;
        for (const r of atom.paint.rects) face.rects.push({ ...r, x: r.x + x, y: r.y + dy });
        for (const r of atom.paint.runs) face.runs.push({ ...r, x: r.x + x, y: r.y + dy });
        for (const i of atom.paint.icons) face.icons.push({ ...i, x: i.x + x, y: i.y + dy });
        for (const h of atom.paint.hits) face.hits.push({ ...h, x: h.x + x, y: h.y + dy });
      });
    }
    faces.push(face);
  }

  const loose = looseness.filter((r) => r > box.height * LOOSE_FRACTION).length;
  if (loose) {
    warnings.push({
      code: 'loose-columns',
      severity: 'info',
      message: `${loose} column(s) could not be filled evenly. Try "Balance columns" `
        + 'to propose items that would take up the space.',
    });
  }

  return {
    pageW: spec.geometry.pageW, pageH: spec.geometry.pageH, faces, warnings, scale, looseness,
  };
}

/**
 * Largest type scale whose content still fits the requested faces.
 *
 * Column widths are fixed while type grows, so content height rises roughly with
 * the square of the scale. That gives a good analytic first guess, and the search
 * only has to bracket around it -- which matters because each probe re-measures
 * and re-breaks the whole sheet.
 * @param {(scale:number)=>import('./atoms.js').Atom[]} build
 * @param {number} height @param {number} bins @param {number} scaleFloor
 * @returns {number|null}
 */
function autofit(build, height, bins, scaleFloor) {
  const clamp = (/** @type {number} */ s) => Math.min(SCALE_MAX, Math.max(scaleFloor, s));
  const fits = (/** @type {number} */ scale) => !breakColumns(build(scale), height, bins).failure;

  const atoms = build(1);
  const natural = atoms.reduce((sum, a, i) => sum + a.height + (i ? a.gapBefore.natural : 0), 0);
  const guess = clamp(Math.sqrt((height * bins) / Math.max(1, natural)));

  let lo = scaleFloor;
  let hi = SCALE_MAX;
  if (fits(guess)) {
    lo = guess;
    hi = clamp(guess * 1.25);
    if (fits(hi)) return hi === SCALE_MAX ? SCALE_MAX : hi;
  } else {
    hi = guess;
    lo = clamp(guess * 0.8);
    if (!fits(lo)) {
      if (!fits(scaleFloor)) return null;
      lo = scaleFloor;
    }
  }

  for (let i = 0; i < AUTOFIT_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
