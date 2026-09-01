// Solve a sheet: measure, split, break into columns, flush, and emit a LayoutPlan.
//
// The plan holds absolute point positions and text already broken into single
// lines, so every renderer -- DOM preview, SVG/PNG, PDF -- draws the same thing
// and none of them makes a layout decision.

import { resolveField } from '../fonts.js';
import { emergencyNote } from '../pack.js';
import { buildAtoms } from './atoms.js';
import { breakColumns } from './columnbreak.js';
import { placeColumn } from './justify.js';

const SCALE_MIN = 0.5;
const SCALE_MAX = 1.8;
const AUTOFIT_STEPS = 7;

// A sheet is printed double-sided, so faces come in pairs: one sheet is two faces,
// and an odd count means running a sheet with a blank back. Auto therefore steps in
// twos.
const FACE_STEP = 2;
const MAX_AUTO_FACES = 24;

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
 * How far the type may shrink before something becomes illegible.
 *
 * Each field has its own floor, because each is written in its own script: a
 * romanisation or a respelling is Latin and reads fine at 4.4pt, while Han needs
 * 5pt to stay distinguishable. Applying the target script's floor to every field
 * -- as this once did -- pinned the whole sheet to the strictest script it
 * contained and left auto-fit almost no room to work in.
 *
 * @param {SolveInput} input
 * @returns {{scaleFloor:number, binding:{field:string, size:number, floor:number, script:string}|null}}
 */
function legibilityFloor(input) {
  const { theme, spec, corpus } = input;
  const targetIso = corpus.languages[spec.target].script;
  const sourceIso = corpus.languages[spec.source].script;
  const shown = new Set(spec.fieldSet);

  /** @type {{field:string, size:number, floor:number, script:string}[]} */ const limits = [];
  const add = (/** @type {string} */ field, /** @type {number} */ size, /** @type {string} */ iso) => {
    const script = corpus.scripts[iso];
    if (!script) return;
    limits.push({
      field,
      size,
      floor: Number(script.min_size_pt) + Number(spec.paper.minSizeDelta),
      script: script.name,
    });
  };

  for (const template of Object.values(theme.templates)) {
    for (const f of /** @type {any} */ (template).fields) {
      if (!shown.has(f.field)) continue;
      add(f.field, f.size, resolveField(f.field, targetIso, sourceIso, corpus.scripts).iso);
    }
  }
  // Notes are prose in the reader's own language.
  add('note', theme.note.size, sourceIso);

  if (!limits.length) return { scaleFloor: SCALE_MIN, binding: null };
  let binding = limits[0];
  for (const limit of limits) {
    if (limit.floor / limit.size > binding.floor / binding.size) binding = limit;
  }
  return {
    scaleFloor: Math.max(SCALE_MIN, binding.floor / binding.size),
    binding,
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
  /** @type {import('../types.js').Warning[]} */ const warnings = [];

  const targetScript = corpus.scripts[corpus.languages[spec.target].script];
  const { scaleFloor, binding } = legibilityFloor(input);

  const measureOnly = (/** @type {number} */ scale) => buildAtoms({
    blocks, theme, spec, corpus, measurer, colWidth: box.colWidth, scale, withPaint: false,
  });

  const autoFaces = spec.geometry.faces <= 0;
  const resolved = autoFaces
    ? solveFaces(measureOnly, box, spec, scaleFloor)
    : { faces: spec.geometry.faces, scale: null };
  const faces = resolved.faces;
  const bins = faces * spec.geometry.columns;

  let scale = resolved.scale ?? spec.scale;
  let noFit = autoFaces && resolved.scale === null && spec.scale <= 0;
  if (!autoFaces && spec.scale <= 0) {
    const fitted = autofit(measureOnly, box.height, bins, scaleFloor);
    scale = fitted ?? scaleFloor;
    noFit = fitted === null;
  }
  if (autoFaces && resolved.scale === null) {
    scale = spec.scale > 0 ? spec.scale : scaleFloor;
    noFit = true;
  }
  if (noFit) {
    warnings.push({
      code: 'no-fit',
      severity: 'error',
      message: autoFaces
        ? `Even ${MAX_AUTO_FACES} faces of ${spec.geometry.columns} `
          + `${spec.geometry.columns === 1 ? 'column' : 'columns'} will not hold this at a `
          + 'legible size.'
        : `The content will not fit ${faces} ${faces === 1 ? 'face' : 'faces'} of `
          + `${spec.geometry.columns} `
          + `${spec.geometry.columns === 1 ? 'column' : 'columns'} at a legible size.`,
      fixes: findFixes(input, box, scaleFloor),
    });
  }
  if (binding && binding.size * scale < binding.floor - 1e-6) {
    warnings.push({
      code: 'below-min-size',
      severity: 'warn',
      message: `The smallest ${binding.script} text is `
        + `${(binding.size * scale).toFixed(2)}pt, below the ${binding.floor.toFixed(2)}pt `
        + 'this paper can hold legibly.',
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
  const thinnest = Math.min(
    ...Object.values(theme.templates).map((/** @type {any} */ t) => Math.min(t.rulePt, t.accentPt)),
    ...Object.values(theme.headings).map((/** @type {any} */ h) => h.rulePt),
  );
  if (thinnest < spec.paper.minRulePt - 1e-6) {
    warnings.push({
      code: 'hairline-too-thin',
      severity: 'warn',
      message: `The thinnest rule is ${thinnest.toFixed(2)}pt, below the `
        + `${spec.paper.minRulePt.toFixed(2)}pt this paper can hold. It may print `
        + 'as nothing. Try photo stock, or a theme with heavier rules.',
    });
  }
  if (spec.inkMode !== 'full') {
    warnings.push({
      code: 'ink-mode',
      severity: 'info',
      message: spec.inkMode === 'mono'
        ? 'Black and white: section colours are gone, so headings are told apart by '
          + 'their icons and titles alone.'
        : 'Low ink: row shading is off. Coloured rules are kept, since they carry '
          + 'the section coding.',
    });
  }
  // Emergency numbers are the one thing on the sheet that must not be guessed, so
  // an unreviewed set is left off and said out loud rather than quietly printed.
  const emergency = emergencyNote(corpus, spec.region);
  if (spec.region && !emergency) {
    warnings.push({
      code: 'no-emergency-numbers',
      severity: 'warn',
      message: `No emergency numbers on file for ${spec.region}. Look them up before `
        + 'you travel and add them with the CSV import.',
    });
  } else if (emergency?.reason === 'unreviewed') {
    warnings.push({
      code: 'emergency-unreviewed',
      severity: 'warn',
      message: `The emergency numbers on file for ${emergency.region.name_en} have not `
        + 'been checked by a fluent speaker, so they are left off the sheet. Verify them '
        + 'and raise their confidence, or add your own with the CSV import.',
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

  // Downstream -- the renderers, imposition, the balance solver -- works from the
  // resolved count, so auto is invisible past this point.
  const geometry = { ...spec.geometry, faces };
  const atoms = buildAtoms({
    blocks, theme, spec: { ...spec, geometry }, corpus, measurer,
    colWidth: box.colWidth, scale, withPaint: true,
  });
  const broken = breakColumns(atoms, box.height, bins);
  if (broken.failure) {
    // Only speak once. The no-fit warning above already explains this in the
    // reader's terms and carries the remedies; the breaker's own message is
    // internal detail.
    if (!noFit) {
      warnings.push({
        code: 'break-failed',
        severity: 'error',
        message: spec.scale > 0
          ? `At ${spec.scale.toFixed(2)}x the content does not fit `
            + `${spec.geometry.faces * spec.geometry.columns} columns.`
          : broken.failure,
        fixes: findFixes(input, box, scaleFloor),
      });
    }
    return {
      pageW: spec.geometry.pageW, pageH: spec.geometry.pageH,
      faces: [], warnings, scale, looseness: [], geometry: { ...spec.geometry, faces },
    };
  }

  /** @type {import('../types.js').Face[]} */ const faceList = [];
  /** @type {number[]} */ const looseness = [];
  for (let f = 0; f < faces; f += 1) {
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
    faceList.push(face);
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
    pageW: geometry.pageW,
    pageH: geometry.pageH,
    faces: faceList,
    warnings,
    scale,
    looseness,
    geometry,
  };
}

/**
 * Fewest faces that hold the content legibly, and the type scale to use in them.
 *
 * Content height at the smallest legible type gives a hard lower bound on the face
 * count -- nothing can fit in fewer, however the type is set -- so the search
 * starts there instead of at two, and the first count that works is the answer.
 * Usually that is one auto-fit rather than several.
 *
 * @param {(scale:number)=>import('./atoms.js').Atom[]} build
 * @param {ReturnType<typeof contentBox>} box
 * @param {import('../types.js').SheetSpec} spec
 * @param {number} scaleFloor
 * @returns {{faces:number, scale:number|null}}
 */
function solveFaces(build, box, spec, scaleFloor) {
  const perFace = box.height * spec.geometry.columns;
  if (perFace <= 0) return { faces: FACE_STEP, scale: null };

  const smallest = build(scaleFloor);
  const natural = smallest.reduce(
    (sum, atom, i) => sum + atom.height + (i ? atom.gapBefore.natural : 0),
    0,
  );
  const lowerBound = Math.max(FACE_STEP, Math.ceil(natural / perFace));
  const start = Math.ceil(lowerBound / FACE_STEP) * FACE_STEP;

  for (let n = start; n <= MAX_AUTO_FACES; n += FACE_STEP) {
    const bins = n * spec.geometry.columns;
    if (spec.scale > 0) {
      const atoms = build(spec.scale);
      if (!breakColumns(atoms, box.height, bins).failure) return { faces: n, scale: spec.scale };
    } else {
      const fitted = autofit(build, box.height, bins, scaleFloor);
      if (fitted !== null) return { faces: n, scale: fitted };
    }
  }
  return { faces: MAX_AUTO_FACES, scale: null };
}

/** How far to look when searching for a geometry that would fit. */
const MAX_EXTRA_FACES = 8;
const MAX_EXTRA_COLUMNS = 3;

/**
 * Remedies for content that will not fit, each verified to actually work rather
 * than merely suggested. Ordered by how little they disturb the sheet: more faces
 * first (same look, more paper), then more columns (denser look, same paper), then
 * dropping the least important sections.
 *
 * @param {SolveInput} input
 * @param {ReturnType<typeof contentBox>} box
 * @param {number} scaleFloor
 * @returns {import('../types.js').WarningFix[]}
 */
function findFixes(input, box, scaleFloor) {
  const { blocks, theme, spec, corpus, measurer } = input;
  /** @type {import('../types.js').WarningFix[]} */ const fixes = [];

  /** @param {import('../types.js').Geometry} geometry */
  const fitsWith = (geometry) => {
    const probeBox = contentBox(geometry, spec.paper);
    if (probeBox.colWidth < 40 || probeBox.height < 40) return false;
    const atoms = buildAtoms({
      blocks, theme, spec: { ...spec, geometry }, corpus, measurer,
      colWidth: probeBox.colWidth, scale: scaleFloor, withPaint: false,
    });
    const bins = geometry.faces * geometry.columns;
    return !breakColumns(atoms, probeBox.height, bins).failure;
  };

  // Auto already searched the face counts, so suggesting more of them would be
  // repeating a question that has been answered.
  if (spec.geometry.faces > 0) {
    for (let extra = 1; extra <= MAX_EXTRA_FACES; extra += 1) {
      const faces = spec.geometry.faces + extra;
      if (!fitsWith({ ...spec.geometry, faces })) continue;
      fixes.push({
        label: `Use ${faces} faces instead of ${spec.geometry.faces}`,
        patch: { geometry: { ...spec.geometry, faces } },
      });
      break;
    }
  } else {
    fixes.push({ label: 'Let the type size fit the page', patch: { scale: 0 } });
  }

  for (let extra = 1; extra <= MAX_EXTRA_COLUMNS; extra += 1) {
    const columns = spec.geometry.columns + extra;
    if (!fitsWith({ ...spec.geometry, columns })) continue;
    fixes.push({
      label: `Use ${columns} columns instead of ${spec.geometry.columns}`,
      patch: { geometry: { ...spec.geometry, columns } },
    });
    break;
  }

  // Last resort: shed sections, least important first, until it fits. Reported as
  // a count so the reader knows the size of the concession before taking it.
  const ranked = [...corpus.sections]
    .filter((section) => blocks.some((b) => b.sectionId === section.section_id))
    .sort((a, b) => Number(a.importance) - Number(b.importance));
  /** @type {Record<string,boolean>} */ const dropped = {};
  for (const section of ranked) {
    dropped[section.section_id] = false;
    const kept = blocks.filter((b) => dropped[b.sectionId] !== false);
    const atoms = buildAtoms({
      blocks: kept, theme, spec, corpus, measurer,
      colWidth: box.colWidth, scale: scaleFloor, withPaint: false,
    });
    const bins = spec.geometry.faces * spec.geometry.columns;
    if (breakColumns(atoms, box.height, bins).failure) continue;
    const count = Object.keys(dropped).length;
    fixes.push({
      label: `Drop the ${count} least important ${count === 1 ? 'section' : 'sections'}`,
      patch: {
        selection: {
          sections: { ...spec.selection.sections, ...dropped },
          items: spec.selection.items,
        },
      },
    });
    break;
  }

  if (spec.scale > 0 && spec.geometry.faces > 0) {
    fixes.unshift({ label: 'Fit the type to the page automatically', patch: { scale: 0 } });
  }
  // A fix offered twice is a fix that looks broken.
  const seen = new Set();
  return fixes.filter((fix) => !seen.has(fix.label) && seen.add(fix.label));
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
