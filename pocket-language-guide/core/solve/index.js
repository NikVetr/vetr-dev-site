// Solve a sheet: measure, split, break into columns, flush, and emit a LayoutPlan.
//
// The plan holds absolute point positions and text already broken into single
// lines, so every renderer -- DOM preview, SVG/PNG, PDF -- draws the same thing
// and none of them makes a layout decision.

import { resolveField } from '../fonts.js';
import { emergencyNote } from '../pack.js';
import { buildAtoms } from './atoms.js';
import { breakColumns } from './columnbreak.js';
import { backgroundRects } from './background.js';
import { placeColumn } from './justify.js';

// Scale 0 puts every field at the smallest size its own script can carry, so the
// search has no separate floor to respect.
const SCALE_MIN = 0.02;
const SCALE_MAX = 1.8;
/**
 * Auto-fit will not inflate type past the theme's own sizes, even when there is
 * room. Those sizes were transcribed from a hand-tuned original, so exceeding them
 * is not an improvement -- and for a CJK target it actively hurts: a Japanese
 * entry that fits on one line at nominal size wraps at 1.04x, because the string
 * has almost no break opportunities. Leftover space goes to the glue instead,
 * which is what the LaTeX original did with its `fil` row stretch and is where its
 * airiness came from. A reader who wants bigger type can still ask for it; SCALE_MAX
 * is the ceiling for that explicit choice.
 */
const AUTO_SCALE_MAX = 1;
const AUTOFIT_STEPS = 7;
/**
 * The fit search runs on a grid rather than on the continuum. 0.005 of scale is
 * well under a tenth of a point of type, so nothing visible is lost -- and it
 * means every candidate face count probes the *same* scales, which lets them share
 * measured atoms. Without it the searches drifted apart and each face count paid
 * for its own measurement: 4.6s on the fully translated Japanese sheet.
 */
const SCALE_STEP = 0.01;

// A sheet is printed double-sided, so faces come in pairs: one sheet is two faces,
// and an odd count means running a sheet with a blank back. Auto therefore steps in
// twos -- from the card's own count, which carries the parity rather than imposing
// it. The phone preset's natural count is one, because a screen has no back, and
// stepping in twos from there gives 1, 3, 5: still one image per face, none of them
// half-used.
const FACE_STEP = 2;
const MAX_AUTO_FACES = 24;

// Below this the type is close enough to its floor to read as squeezed, so auto
// spends another pair of faces instead. Set under the Japanese reference sheet's
// own 0.478, which is a legitimate, deliberately tight layout that should not be
// second-guessed.
export const COMFORT = 0.45;

/** A column left this fraction of itself empty is reported as loose. */
export const LOOSE_FRACTION = 0.06;

/**
 * Usable content box, after the printer's own margins. Borderless printing
 * enlarges the page to guarantee bleed, so the outer edge is cropped and the safe
 * area has to be inset by half the enlargement on each side.
 * @param {import('../types.js').Geometry} g
 * @param {import('../types.js').PaperSpec} paper
 */
/**
 * How tall a running head or foot is, as a multiple of the theme's smallest type.
 * One line plus the air that keeps it off the first row.
 */
/** How tall the furniture band is, in multiples of the type it is set in. It was
 * 2.1 -- a whole blank line above the text and most of one below -- which is a lot
 * of a 360pt card to spend on a folio. 1.5 leaves a half-line of air on each side,
 * which is what furniture needs and no more. */
const HEAD_LINES = 1.5;

/**
 * @param {import('../types.js').Geometry} g
 * @param {import('../types.js').PaperSpec} paper
 * @param {number} [headPt]  a band reserved for a running head, at top or bottom
 */
export function contentBox(g, paper, headPt = 0) {
  const insetX = paper.borderless ? (g.pageW * paper.oversprayPct) / 200 : paper.nonprintablePt;
  const insetY = paper.borderless ? (g.pageH * paper.oversprayPct) / 200 : paper.nonprintablePt;
  // A lock screen's reserved bands are the same shape as a printer's dead zone:
  // area the sheet may not use because something else will be there. So they go
  // through the same max(), and every downstream consumer -- the breaker, the
  // auto-fit, all three renderers -- needs no knowledge of them.
  const reserveTop = g.pageH * (g.reserve?.top ?? 0);
  const reserveBottom = g.pageH * (g.reserve?.bottom ?? 0);
  const left = Math.max(g.marginLeft, insetX);
  const right = Math.max(g.marginRight, insetX);
  // The head's band is *added* to the margin rather than max()ed into it: a
  // printer's dead zone and a lock screen's clock are areas the sheet may not use,
  // where a running head is area the sheet is using for something else. Taking the
  // larger of the two would let a wide margin swallow the head's own line.
  const top = Math.max(g.marginTop, insetY, reserveTop) + (headPt > 0 ? headPt : 0);
  const bottom = Math.max(g.marginBottom, insetY, reserveBottom) + (headPt < 0 ? -headPt : 0);
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
 * Whether the chosen paper demands a larger minimum than the theme's smallest
 * field, which is the one case where "smallest legible size" cannot be honoured.
 * @param {SolveInput} input
 */
function paperTooCoarse(input) {
  const { theme, spec, corpus } = input;
  const targetIso = corpus.languages[spec.target].script;
  const sourceIso = corpus.languages[spec.source].script;
  const shown = new Set(spec.fieldSet);
  /** @type {{field:string, size:number, floor:number, script:string}|null} */ let worst = null;

  for (const template of Object.values(theme.templates)) {
    for (const f of /** @type {any} */ (template).fields) {
      if (!shown.has(f.field)) continue;
      const iso = resolveField(f.field, targetIso, sourceIso, corpus.scripts).iso;
      const script = corpus.scripts[iso];
      if (!script) continue;
      const floor = Number(script.min_size_pt) + Number(spec.paper.minSizeDelta);
      if (floor > f.size && (!worst || floor - f.size > worst.floor - worst.size)) {
        worst = { field: f.field, size: f.size, floor, script: script.name };
      }
    }
  }
  return worst;
}

/**
 * Columns the reader switched on that will print nothing on this sheet.
 *
 * A field draws only where two things meet: a template with a cell for it, and rows
 * with something in that cell. Both halves have failed silently. `script_alt`, `ipa`
 * and `literal` were in no template at all for a while, so three of the seven
 * toggles were no-ops; `ipa` now has its cell in `entry` and is still empty in every
 * language in the corpus, so it is a no-op again for an entirely different reason.
 * The symptom is identical either way -- a checkbox that does nothing, in the panel
 * whose whole subject is where text lands -- so this answers the reader's question
 * rather than either cause, and it stops answering it the moment the column is
 * filled.
 * @param {SolveInput} input
 * @returns {import('../types.js').FieldId[]}
 */
function emptyColumns({ blocks, theme, spec, corpus }) {
  /** @type {Set<string>} */ const drawn = new Set();
  let anyRows = false;
  for (const block of blocks) {
    const rows = block.rows;
    if (block.kind !== 'items' || !rows?.length) continue;
    anyRows = true;
    const template = theme.templates[block.templateId ?? 'entry'];
    for (const f of /** @type {import('../types.js').FieldStyle[]} */ (template.fields)) {
      if (!drawn.has(f.field) && rows.some((r) => (r.values[f.field] ?? '').trim())) {
        drawn.add(f.field);
      }
    }
  }
  // A blank sheet has nothing to say about any column; `nothing-selected` says the
  // useful thing instead.
  if (!anyRows) return [];
  // Two columns are empty without anything being missing. `numeral` is not a column
  // a reader turns on -- it is the gloss cell under another name, which the panel
  // keeps in the set regardless. And a Latin-script language declares no
  // romanisation system, so `roman` is inapplicable rather than unfilled, which is
  // why the panel disables the romanisation menu instead of offering one; reporting
  // it would be true and useless on nine of the sixteen languages.
  const noRomanisation = !corpus.languages[spec.target].romanizations;
  return spec.fieldSet.filter((f) => (
    f !== 'numeral' && !drawn.has(f) && !(f === 'roman' && noRomanisation)
  ));
}

/**
 * @typedef {Object} SolveInput
 * @property {import('../types.js').Block[]} blocks
 * @property {any} theme
 * @property {import('../types.js').SheetSpec} spec
 * @property {Awaited<ReturnType<import('../pack.js').loadCorpus>>} corpus
 * @property {ReturnType<import('../measure.js').createMeasurer>} measurer
 * @property {ReturnType<import('../fonts.js').createFontRegistry>} registry
 * @property {string} [respellLegend]  the reader's own key to the respelling column,
 *   from the `legend` field of their rule table. Passed in rather than read here,
 *   because the solver does not load files.
 */

/**
 * How tall the head's band is for this spec, signed: positive at the top, negative
 * at the bottom, zero when there is none. The sign is what lets `contentBox` take
 * it out of the right margin without a second parameter.
 * @param {import('../types.js').SheetSpec} spec
 * @param {any} theme
 */
function headBand(spec, theme) {
  const at = spec.head?.at ?? 'none';
  if (at === 'none') return 0;
  const pt = headSize(theme) * HEAD_LINES;
  return at === 'top' ? pt : -pt;
}

/** The smallest type the theme uses, which is what furniture is set in.
 * @param {any} theme */
function headSize(theme) {
  const sizes = Object.values(theme.templates)
    .flatMap((/** @type {any} */ tmpl) => (tmpl.fields ?? []).map((/** @type {any} */ f) => f.size))
    .filter((/** @type {any} */ n) => typeof n === 'number');
  return sizes.length ? Math.min(...sizes) : 5.2;
}

/**
 * The head's two slots, resolved to text.
 *
 * Derived rather than typed wherever it can be, so a label stays right when the
 * pair or the region changes underneath it -- which is the whole reason this is not
 * simply two strings.
 * @param {import('./index.js').SolveInput} input
 * @param {number} face  zero-based
 * @param {number} faces
 */
function headText(input, face, faces) {
  const { spec, corpus } = input;
  const name = (/** @type {string} */ code) => corpus.languages[code]?.exonym_en ?? code;

  /** @param {import('../types.js').HeadSlot} [slot] @returns {import('../types.js').HeadPart[]} */
  const one = (slot) => {
    if (slot === 'page') return [{ text: `${face + 1} / ${faces}`, bold: false }];
    if (slot === 'pair') {
      return [{ text: `${name(spec.target)} \u2192 ${name(spec.source)}`, bold: false }];
    }
    if (slot === 'region') {
      const text = emergencyNote(corpus, spec.region)?.text ?? '';
      if (!text) return [];
      // The digits bold and the service words plain. This is the one piece of
      // furniture somebody reads in an emergency, and a number set in the same
      // 5.2pt muted grey as everything else is a number nobody finds -- so the part
      // that has to be found is the part that is emphasised.
      return text.split(/(\d[\d\s/-]*)/).filter(Boolean)
        .map((part) => ({ text: part, bold: /\d/.test(part) }));
    }
    // The reader's own respelling key, which the rule table carries in the reader's
    // own language -- `legend` in `data/respell/rules/<reader>__<accent>.json`. It is
    // the one thing on the card that explains the card, so it belongs in furniture
    // rather than taking a column.
    if (slot === 'legend') return [{ text: (input.respellLegend ?? '').trim(), bold: false }];
    if (slot === 'custom') return [{ text: (spec.head?.text ?? '').trim(), bold: false }];
    return [];
  };

  /** A position's slots, joined with a bullet. A saved spec may hold a bare slot. */
  /** @param {import('../types.js').HeadSlot|import('../types.js').HeadSlot[]} [at] */
  const position = (at) => {
    const slots = (Array.isArray(at) ? at : [at]).filter(Boolean);
    /** @type {import('../types.js').HeadPart[]} */ const out = [];
    for (const slot of slots) {
      const parts = one(slot).filter((p) => p.text);
      if (!parts.length) continue;
      if (out.length) out.push({ text: ' \u2022 ', bold: false });
      out.push(...parts);
    }
    // **A part may not end in a space.** `measurer.width` drops a trailing space --
    // `"110 "` measures exactly as wide as `"110"` -- so advancing the pen by each
    // part's own width closed up every gap between them and the emergency line came
    // out as `China:110police·119fire·120ambulance`. A leading space *is* counted, so
    // the space moves to the front of the part that follows it and the widths sum.
    for (let i = 0; i < out.length - 1; i += 1) {
      const spaces = /\s+$/.exec(out[i].text);
      if (!spaces) continue;
      out[i].text = out[i].text.slice(0, -spaces[0].length);
      out[i + 1].text = spaces[0] + out[i + 1].text;
    }
    return out.filter((part) => part.text);
  };

  return {
    left: position(spec.head?.left),
    center: position(spec.head?.center),
    right: position(spec.head?.right),
  };
}

/**
 * @param {SolveInput} input
 * @returns {import('../types.js').LayoutPlan}
 */
export function layout(input) {
  const { blocks, theme, spec, corpus, measurer, registry } = input;
  const band = headBand(spec, theme);
  const box = contentBox(spec.geometry, spec.paper, band);
  /** @type {import('../types.js').Warning[]} */ const warnings = [];

  const targetScript = corpus.scripts[corpus.languages[spec.target].script];
  // Nothing can render below its script's floor now, so the search runs from 0.
  const scaleFloor = SCALE_MIN;
  const coarse = paperTooCoarse(input);

  // Atoms depend on the scale and the column width, not on how many columns there
  // are, so the same set is valid for every candidate face count. Auto-faces tries
  // several counts and each runs its own fit search, which meant the same scales
  // were measured three times over -- 4.6s on the fully translated Japanese sheet.
  // The breaker only reads atoms, so sharing them is safe.
  /** @type {Map<number, import('./atoms.js').Atom[]>} */ const measured = new Map();
  const measureOnly = (/** @type {number} */ scale) => {
    const key = Math.round(scale * 1e6);
    let atoms = measured.get(key);
    if (!atoms) {
      atoms = buildAtoms({
        blocks, theme, spec, corpus, measurer, registry, colWidth: box.colWidth, scale,
        withPaint: false,
      });
      measured.set(key, atoms);
    }
    return atoms;
  };

  const autoFaces = spec.autoFaces !== false;
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
      code: autoFaces ? 'no-fit.auto' : 'no-fit.pinned',
      severity: 'error',
      params: { faces: autoFaces ? MAX_AUTO_FACES : faces, columns: spec.geometry.columns },
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
  if (coarse) {
    warnings.push({
      code: 'paper-too-coarse',
      severity: 'warn',
      params: {
        script: coarse.script,
        floor: coarse.floor.toFixed(2),
        field: coarse.field,
        size: coarse.size.toFixed(2),
      },
      message: `This paper needs ${coarse.script} text at ${coarse.floor.toFixed(2)}pt, but the `
        + `theme sets its ${coarse.field} column at ${coarse.size.toFixed(2)}pt. That column is `
        + 'enlarged to stay readable, which costs room elsewhere. Photo stock holds finer type.',
    });
  }
  for (const field of emptyColumns(input)) {
    warnings.push({
      code: 'empty-column',
      severity: 'warn',
      params: { field },
      message: `The ${field} column is switched on, but nothing on this sheet has one, `
        + 'so it prints nothing. Fill it in with the CSV import, or switch the column off.',
    });
  }
  if (targetScript.word_break === 'dict') {
    warnings.push({
      code: 'no-dictionary-breaking',
      severity: 'warn',
      params: { script: targetScript.name },
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
      params: { thinnest: thinnest.toFixed(2), minimum: spec.paper.minRulePt.toFixed(2) },
      message: `The thinnest rule is ${thinnest.toFixed(2)}pt, below the `
        + `${spec.paper.minRulePt.toFixed(2)}pt this paper can hold. It may print `
        + 'as nothing. Try photo stock, or a theme with heavier rules.',
    });
  }
  if (spec.inkMode !== 'full') {
    warnings.push({
      code: spec.inkMode === 'mono' ? 'ink-mode.mono' : 'ink-mode.lowInk',
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
      params: { region: spec.region },
      message: `No emergency numbers on file for ${spec.region}. Look them up before `
        + 'you travel and add them with the CSV import.',
    });
  } else if (emergency?.reason === 'unreviewed') {
    warnings.push({
      code: 'emergency-unreviewed',
      severity: 'warn',
      params: { region: emergency.region.iso3166 },
      message: `The emergency numbers on file for ${emergency.region.name_en} have not `
        + 'been checked by a fluent speaker, so they are left off the sheet. Verify them '
        + 'and raise their confidence, or add your own with the CSV import.',
    });
  }
  if (box.clipped) {
    warnings.push({
      code: 'margin-below-safe-area',
      severity: 'warn',
      params: { inset: box.insetX.toFixed(1), preset: spec.paper.presetId },
      message: `Margins were widened to ${box.insetX.toFixed(1)}pt to stay inside `
        + `the ${spec.paper.presetId} printable area.`,
    });
  }

  // Downstream -- the renderers, imposition, the balance solver -- works from the
  // resolved count, so auto is invisible past this point.
  const geometry = { ...spec.geometry, faces };
  const atoms = buildAtoms({
    blocks, theme, spec: { ...spec, geometry }, corpus, measurer, registry,
    colWidth: box.colWidth, scale, withPaint: true,
  });
  if (!atoms.length) {
    warnings.push({
      code: 'nothing-selected',
      severity: 'warn',
      message: 'Nothing is selected, so the sheet is blank. Switch a section back on '
        + 'in the content panel.',
    });
  }
  const broken = breakColumns(atoms, box.height, bins);
  if (broken.failure) {
    // Only speak once. The no-fit warning above already explains this in the
    // reader's terms and carries the remedies; the breaker's own message is
    // internal detail.
    if (!noFit) {
      warnings.push({
        code: 'break-failed',
        severity: 'error',
        params: {
          scale: spec.scale.toFixed(2),
          columns: spec.geometry.faces * spec.geometry.columns,
        },
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
    // Where each atom landed, for a `sections` background: the wash follows the
    // columns, so it needs the placed rectangles rather than the block list.
    /** @type {{colorRole:string, x:number, y:number, w:number, h:number}[]} */
    const placed = [];
    for (let c = 0; c < spec.geometry.columns; c += 1) {
      const bin = f * spec.geometry.columns + c;
      const indices = broken.columns[bin] ?? [];
      const x = box.left + c * (box.colWidth + spec.geometry.columnGap);
      const columnAtoms = indices.map((i) => atoms[i]);
      const { offsets, residual } = placeColumn(columnAtoms, box.top, broken.slack[bin]);
      looseness.push(residual);
      // Slack the glue could not absorb without opening a canyon is left over, and
      // it has to go *somewhere*. Against a neighbour it goes at the bottom, because
      // a short column whose first row no longer lines up with the column beside it
      // looks like a mistake rather than like whitespace. With no neighbour there is
      // nothing to line up with, so it splits above and below -- which is what the
      // phone wallpaper needs: at the `essential` priority step the content is one
      // face and ends 19% early, and 71pt of blank under the last row reads as the
      // sheet having been cut off, between a reserved clock band above it and a
      // reserved widget band below.
      const drop = spec.geometry.columns === 1 ? residual / 2 : 0;
      columnAtoms.forEach((atom, k) => {
        const dy = offsets[k] + drop;
        if (atom.colorRole) {
          placed.push({
            colorRole: atom.colorRole, x, y: dy, w: box.colWidth, h: atom.height,
          });
        }
        if (!atom.paint) return;
        for (const r of atom.paint.rects) face.rects.push({ ...r, x: r.x + x, y: r.y + dy });
        for (const r of atom.paint.runs) face.runs.push({ ...r, x: r.x + x, y: r.y + dy });
        for (const i of atom.paint.icons) face.icons.push({ ...i, x: i.x + x, y: i.y + dy });
        for (const h of atom.paint.hits) face.hits.push({ ...h, x: h.x + x, y: h.y + dy });
      });
    }
    // The running head, drawn after the columns so it is never something the
    // breaker has to reason about: its band came out of the margin in `contentBox`,
    // so by here the space is already its own.
    if (band !== 0) {
      const size = headSize(theme);
      const { left, center, right } = headText(input, f, faces);
      const y = band > 0
        ? box.top - size * 0.9
        : box.top + box.height + size * 1.35;
      // The reader's own face: a running head is read by whoever the sheet is
      // glossed into, the same as the gloss column.
      const sourceIso = corpus.languages[spec.source].script;
      const stack = registry.stackFor(corpus.scripts[sourceIso].font_stack, spec.typeface);
      /** @type {import('../measure.js').RunStyle} */
      const style = {
        stack, size, weight: 400, italic: false, leading: size * 1.2,
        dir: /** @type {'ltr'|'rtl'} */ (corpus.scripts[sourceIso].direction),
        wordBreak: /** @type {'space'|'any'|'dict'} */ (corpus.scripts[sourceIso].word_break),
        slotAsRule: false,
      };
      /** @param {import('../types.js').HeadPart[]} parts */
      const widthOf = (parts) => parts.reduce(
        (sum, part) => sum + measurer.width(part.text, { ...style, weight: part.bold ? 700 : 400 }),
        0,
      );
      /** @param {import('../types.js').HeadPart[]} parts @param {number} room */
      const fit = (parts, room) => {
        // Trimmed from the end rather than dropped, because half a label still says
        // which sheet this is -- and a phone card is 180pt wide, where the emergency
        // line alone is wider than the whole band.
        const out = parts.map((part) => ({ ...part }));
        while (out.length && widthOf(out) > room) {
          const last = out[out.length - 1];
          if (last.text.length > 2) last.text = last.text.slice(0, -2);
          else out.pop();
        }
        if (out.length && widthOf(out) < widthOf(parts)) {
          out[out.length - 1].text += '\u2026';
        }
        return out;
      };

      // The corners are folios and short labels; the middle is where the emergency
      // line goes and is the one that gives way, because it is also the only one
      // whose absence loses nothing a reader can see is missing. Sized in that
      // order: corners first, then whatever is left over for the centre.
      const leftW = widthOf(left);
      const rightW = widthOf(right);
      const gap = size;
      const placedHead = /** @type {[import('../types.js').HeadPart[], number, 'start'|'end'|'mid'][]} */ ([
        [fit(left, Math.max(0, box.width - rightW - gap)), box.left, 'start'],
        [fit(right, Math.max(0, box.width - leftW - gap)), box.left + box.width, 'end'],
        [
          fit(center, Math.max(0, box.width - leftW - rightW - gap * 2)),
          box.left + box.width / 2,
          'mid',
        ],
      ]);

      for (const [parts, anchor, align] of placedHead) {
        if (!parts.length) continue;
        const total = widthOf(parts);
        let x = align === 'end' ? anchor - total : align === 'mid' ? anchor - total / 2 : anchor;
        for (const part of parts) {
          const partStyle = { ...style, weight: /** @type {number} */ (part.bold ? 700 : 400) };
          face.runs.push({
            text: part.text,
            x,
            y,
            // The resolved face, not the stack: a run's `fontId` keys the renderer's
            // face table, and a stack name is not in it.
            fontId: measurer.faceKey(partStyle),
            size,
            // Emphasis is carried by weight *and* ink: the band is set in the muted
            // grey, and a bold grey number at 5.2pt is not much louder than a plain
            // one, so an emphasised part takes the body colour too.
            fill: part.bold ? theme.colors.ink : theme.colors.muted,
            bold: part.bold,
            italic: false,
            dir: style.dir,
          });
          x += measurer.width(part.text, partStyle);
        }
      }
    }
    // Behind everything, so it goes on the front of the list rather than the back.
    // Per face, not per sheet: a `sections` wash follows the sections that landed on
    // *this* face, which is the whole point of it.
    face.rects.unshift(...backgroundRects({
      spec,
      theme,
      pageW: spec.geometry.pageW,
      pageH: spec.geometry.pageH,
      placed,
      regions: corpus.regions,
      languageRegions: (corpus.languages[spec.target]?.regions ?? '').split(';').filter(Boolean),
    }));
    faceList.push(face);
  }

  if (autoFaces && !noFit && scale < COMFORT - 1e-6 && faces >= MAX_AUTO_FACES) {
    warnings.push({
      code: 'card-too-small',
      severity: 'warn',
      params: { faces },
      message: `Even ${faces} faces of this card leave the type near its smallest `
        + 'readable size. A larger card, or fewer sections, would read better.',
      fixes: findFixes(input, box, scaleFloor),
    });
  }

  // The last column with anything in it is where the content ran out, and every
  // column after it is empty. Neither is a layout failure -- a sheet's text does not
  // conveniently end on a column boundary -- so they are excluded. What remains is
  // the case worth reporting: a column in the middle that the breaker could not
  // fill, because the next block would not fit in what was left.
  const lastUsed = looseness.reduce(
    (last, _, bin) => ((broken.columns[bin] ?? []).length ? bin : last), -1,
  );
  const loose = looseness
    .filter((r, bin) => bin < lastUsed && r > box.height * LOOSE_FRACTION).length;
  if (loose && atoms.length) {
    warnings.push({
      code: 'loose-columns',
      severity: 'info',
      params: { count: loose },
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

/** How far to look when searching for a geometry that would fit. */
const MAX_EXTRA_COLUMNS = 3;

/**
 * Remedies for content that will not fit, each verified to actually work rather
 * than merely suggested. Ordered by how little they disturb the sheet: more
 * columns first (same paper, denser look), then dropping the least important
 * sections. Adding faces is not offered while auto is on, because auto already
 * searched that.
 *
 * @param {SolveInput} input
 * @param {ReturnType<typeof contentBox>} box
 * @param {number} scaleFloor
 * @returns {import('../types.js').WarningFix[]}
 */
function findFixes(input, box, scaleFloor) {
  const { blocks, theme, spec, corpus, measurer, registry } = input;
  /** @type {import('../types.js').WarningFix[]} */ const fixes = [];

  /** @param {import('../types.js').Geometry} geometry */
  const fitsWith = (geometry) => {
    const probeBox = contentBox(geometry, spec.paper);
    if (probeBox.colWidth < 40 || probeBox.height < 40) return false;
    const atoms = buildAtoms({
      blocks, theme, spec: { ...spec, geometry }, corpus, measurer, registry,
      colWidth: probeBox.colWidth, scale: scaleFloor, withPaint: false,
    });
    return !breakColumns(atoms, probeBox.height, geometry.faces * geometry.columns).failure;
  };

  if (spec.autoFaces === false) {
    for (let extra = FACE_STEP; extra <= MAX_AUTO_FACES; extra += FACE_STEP) {
      const faces = spec.geometry.faces + extra;
      if (!fitsWith({ ...spec.geometry, faces })) continue;
      fixes.push({
        label: `Use ${faces} faces instead of ${spec.geometry.faces}`,
        patch: { geometry: { ...spec.geometry, faces } },
      });
      break;
    }
    fixes.push({ label: 'Let the page count follow the content', patch: { autoFaces: true } });
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
      blocks: kept, theme, spec, corpus, measurer, registry,
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

  // A fix offered twice is a fix that looks broken.
  const seen = new Set();
  return fixes.filter((fix) => !seen.has(fix.label) && seen.add(fix.label));
}

/**
 * How many faces to use, and the type scale to use in them.
 *
 * Not simply the fewest that fit. Now that each field shrinks toward its own floor,
 * fewer faces is always achievable by making everything tiny, which is not what
 * anyone wants. So the search is anchored on the card's natural count -- two sheets
 * of photo paper is four faces -- and moves off it only for a reason:
 *
 *   - it gives up a pair only if the content still fits at full size, so losing
 *     paper never costs type size;
 *   - it takes a pair only when the content will not fit at all.
 *
 * That is what the reference sheets do by hand: both settled on four faces and let
 * the type find its own size, which for Japanese meant 4.4pt respellings.
 *
 * @param {(scale:number)=>import('./atoms.js').Atom[]} build
 * @param {ReturnType<typeof contentBox>} box
 * @param {import('../types.js').SheetSpec} spec
 * @param {number} scaleFloor
 * @returns {{faces:number, scale:number|null}}
 */
function solveFaces(build, box, spec, scaleFloor) {
  const columns = spec.geometry.columns;
  /** @param {number} faces @param {number} scale */
  const fitsAt = (faces, scale) => !breakColumns(
    build(scale), box.height, faces * columns,
  ).failure;
  /** @param {number} faces */
  const fittedAt = (faces) => autofit(build, box.height, faces * columns, scaleFloor);

  const anchor = Math.max(1, spec.geometry.faces || FACE_STEP);
  let faces = anchor;

  // Give up paper only when it is free. The floor is one face, not one sheet: for
  // an even anchor the step lands on two either way, and for the phone's anchor of
  // one there is nothing to give back.
  while (faces - FACE_STEP >= 1 && fitsAt(faces - FACE_STEP, 1)) {
    faces -= FACE_STEP;
  }

  if (spec.scale > 0) {
    // An explicit type size is the reader's decision; only add paper if it is
    // needed to honour it.
    while (faces < MAX_AUTO_FACES && !fitsAt(faces, spec.scale)) faces += FACE_STEP;
    return { faces, scale: fitsAt(faces, spec.scale) ? spec.scale : null };
  }

  // Otherwise take another pair while the type would still be squeezed.
  //
  // "The fitted scale is below COMFORT" and "COMFORT does not fit" are the same
  // statement, because the fitted scale is the largest one that fits and fitting
  // is monotone in scale. Testing the second is one measurement instead of a whole
  // search -- and it is a measurement at the *same* scale for every candidate face
  // count, so after the first it is free. That took the fully translated Japanese
  // sheet from 3.3s to well under a second.
  while (faces < MAX_AUTO_FACES && !fitsAt(faces, COMFORT)) faces += FACE_STEP;
  return { faces, scale: fittedAt(faces) };
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
  const snap = (/** @type {number} */ s) => Math.round(s / SCALE_STEP) * SCALE_STEP;
  const clamp = (/** @type {number} */ s) => snap(
    Math.min(AUTO_SCALE_MAX, Math.max(scaleFloor, s)),
  );
  const fits = (/** @type {number} */ scale) => !breakColumns(build(scale), height, bins).failure;

  const atoms = build(1);
  const natural = atoms.reduce((sum, a, i) => sum + a.height + (i ? a.gapBefore.natural : 0), 0);
  const guess = clamp(Math.sqrt((height * bins) / Math.max(1, natural)));

  let lo = scaleFloor;
  let hi = AUTO_SCALE_MAX;
  if (fits(guess)) {
    lo = guess;
    hi = clamp(guess * 1.25);
    if (fits(hi)) return hi === AUTO_SCALE_MAX ? AUTO_SCALE_MAX : hi;
  } else {
    hi = guess;
    lo = clamp(guess * 0.8);
    if (!fits(lo)) {
      if (!fits(scaleFloor)) return null;
      lo = scaleFloor;
    }
  }

  for (let i = 0; i < AUTOFIT_STEPS; i += 1) {
    const mid = snap((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
