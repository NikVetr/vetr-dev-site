// Blocks -> atoms: the unit the column breaker moves around.
//
// An atom is one indivisible piece of vertical material with a known height and,
// optionally, everything needed to draw it in atom-local coordinates. All the
// measurement and per-row width solving happens here, exactly once, so nothing
// downstream re-wraps text.
//
// A heading is bound to the first rows of the block it introduces, which makes a
// heading stranded at the foot of a column structurally impossible rather than
// something the breaker has to be penalised out of.

import { resolveField, isTargetSide } from '../fonts.js';
import { inkWidth } from '../measure.js';
import { chooseSplit, chooseSharedWidths } from './rowsplit.js';
import { arrangeTemplate } from './arrange.js';

// How many of a section's opening rows are held in the same column as its
// heading.
const KEEP_ROWS = 2;

// Cost of starting a new column at this atom, on the same scale as the breaker's
// slack penalty, which is 1000 * (fraction of the column left empty)^2. So
// BREAK_IN_GROUP = 12 means continuing a table into the next column is preferred
// once it saves more than about 11% of a column of whitespace -- which is the
// trade the reference sheet makes too, splitting "Communication" across columns.
const BREAK_SECTION = 0;
const BREAK_BLOCK = 4;
const BREAK_IN_GROUP = 12;

// Ceiling on how far one gap may stretch, so an underfull column stays visibly
// underfull instead of being stretched into a ladder of canyons.
//
// Points at nominal type size, so they scale with `spacingRatio` -- the curve the
// type actually travels -- and not with the raw scale. Against `scale` the ceiling
// shrank faster than the rows it separates, so at a fitted 0.7 the row gaps could
// no longer take the slack they used to and a few points of it landed at the foot
// of the column instead.
const MAX_STRETCH_ROW = 3;
const MAX_STRETCH_SECTION = 7;

/** @typedef {import('../types.js').Rect} Rect */
/** @typedef {import('../types.js').TextRun} TextRun */
/** @typedef {import('../types.js').IconMark} IconMark */
/** @typedef {import('../types.js').HitBox} HitBox */

/** @typedef {{rects:Rect[], runs:TextRun[], icons:IconMark[], hits:HitBox[]}} Paint */

/**
 * @typedef {Object} Atom
 * @property {'heading'|'item'|'note'} kind
 * @property {string} sectionId
 * @property {number} height
 * @property {{natural:number, stretch:number, max:number}} gapBefore
 * @property {number} breakCost
 * @property {boolean} keepWithNext  a column may not end on this atom
 * @property {Paint|null} paint
 */

/** Colours resolved once for the sheet, including ink-saving modes.
 * @param {any} theme @param {import('../types.js').SheetSpec['inkMode']} inkMode */
function makePalette(theme, inkMode) {
  const mono = inkMode === 'mono';
  const roles = Object.fromEntries(Object.entries(theme.colors.roles)
    .map(([k, v]) => [k, mono ? theme.colors.ink : v]));
  return {
    ink: theme.colors.ink,
    muted: mono ? theme.colors.ink : theme.colors.muted,
    rule: theme.colors.rule,
    paper: theme.colors.paper,
    // Row shading is the first thing to go when saving ink; the coloured accent
    // rules stay, because they carry the section coding.
    shade: inkMode === 'full' ? theme.colors.shade : theme.colors.paper,
    roles,
  };
}

/**
 * @param {Object} ctx
 * @param {any} ctx.theme
 * @param {import('../types.js').SheetSpec} ctx.spec
 * @param {Awaited<ReturnType<import('../pack.js').loadCorpus>>} ctx.corpus
 * @param {ReturnType<import('../measure.js').createMeasurer>} ctx.measurer
 * @param {ReturnType<import('../fonts.js').createFontRegistry>} ctx.registry
 * @param {number} ctx.colWidth
 * @param {number} ctx.scale
 */
function makeContext({ theme, spec, corpus, measurer, registry, colWidth, scale }) {
  /**
   * How a type size responds to the scale.
   *
   * A single multiplier applied to every field cannot express what the reference
   * sheets actually do: the Japanese edition sets its Latin respellings at 4.44pt
   * while keeping Japanese larger, because Latin stays readable smaller than kanji
   * does. So below the nominal size each field travels toward *its own* floor
   * rather than shrinking in lockstep -- scale 1 is the theme's size, scale 0 is
   * every field at the smallest its script can carry, and above 1 it is a plain
   * multiplier.
   * @param {number} nominal @param {number} floor
   */
  const sizeAt = (nominal, floor) => {
    const limit = Math.min(floor, nominal);
    return scale > 1 ? nominal * scale : limit + (nominal - limit) * scale;
  };
  const targetLang = corpus.languages[spec.target];
  const sourceLang = corpus.languages[spec.source];
  if (!targetLang) throw new Error(`unknown target language ${spec.target}`);
  if (!sourceLang) throw new Error(`unknown source language ${spec.source}`);
  const targetScriptRow = corpus.scripts[targetLang.script];

  /**
   * How spacing responds to the scale -- which is *not* how the scale itself does.
   *
   * Padding used to be `spec.padding * scale`, and that quietly stopped being
   * right when each field started travelling toward its own legibility floor
   * rather than shrinking in lockstep. Type stops shrinking; padding kept going.
   * Measured on the Japanese reference sheet at its fitted 0.478: the largest type
   * renders at 84% of nominal while the padding sat at 48% -- 57% of the breathing
   * room the type size implies, which is why it read as tighter than the LaTeX
   * original it reproduces. Spacing now follows the same curve the type does, so
   * the proportion between them holds at every scale.
   */
  const spacingRatio = (() => {
    const nominal = theme.templates.entry?.fields?.[0]?.size ?? 7.3;
    const floor = Number(targetScriptRow.min_size_pt) + Number(spec.paper.minSizeDelta);
    return sizeAt(nominal, floor) / nominal;
  })();
  // Extra breathing room the reader asked for, on top of the theme's own padding.
  // The reference sheet's is essentially zero -- consecutive rows are held apart by
  // a 0.22pt rule alone -- which is tight enough to read as cramped even before the
  // scaling bug above.
  const padding = (spec.padding ?? 0) * spacingRatio;
  const palette = makePalette(theme, spec.inkMode);
  const shown = new Set(spec.fieldSet);

  const typeface = spec.typeface ?? 'sans';

  /** @param {import('../types.js').FieldStyle} fs @returns {import('../measure.js').RunStyle} */
  const styleFor = (fs) => {
    const { stack, dir, iso } = resolveField(fs.field, targetLang.script, sourceLang.script, corpus.scripts);
    const script = corpus.scripts[iso];
    const floor = Number(script.min_size_pt) + Number(spec.paper.minSizeDelta);
    const size = sizeAt(fs.size, floor);
    // Dense reference tables ask for the narrow Latin face. Only Latin has one; for
    // any other script the request is simply ignored.
    const base = fs.condensed && stack === 'latin' ? 'latin-cond' : stack;
    return {
      stack: registry.stackFor(base, typeface),
      dir,
      wordBreak: /** @type {'space'|'any'|'dict'} */ (script.word_break),
      size,
      // Leading keeps the theme's ratio to the size, with a per-script floor: the
      // reference's 1.02x is safe for Latin and Han but clips Devanagari and Thai.
      leading: Math.max(size * (fs.leading / fs.size), size * Number(script.leading_factor)),
      weight: fs.bold ? 700 : 400,
      italic: fs.italic,
      slotAsRule: isTargetSide(fs.field),
    };
  };


  return {
    theme,
    spec,
    measurer,
    colWidth,
    scale,
    sizeAt,
    padding,
    spacingRatio,
    palette,
    shown,
    styleFor,
    // An RTL target mirrors the whole item grid, so the target's own writing keeps
    // hugging the outer edge and the source gloss keeps hugging the other one.
    mirror: targetScriptRow.direction === 'rtl',
    /** @param {import('../types.js').FieldStyle} fs @param {string} role */
    colorFor: (fs, role) => (fs.color === 'section' ? palette.roles[role] : palette[fs.color]),
    sourceStack: (() => {
      const resolved = resolveField('gloss', targetLang.script, sourceLang.script, corpus.scripts);
      return { ...resolved, stack: registry.stackFor(resolved.stack, typeface) };
    })(),
    sourceFloor: Number(corpus.scripts[sourceLang.script].min_size_pt)
      + Number(spec.paper.minSizeDelta),
    sourceBreak: /** @type {'space'|'any'|'dict'} */ (
      corpus.scripts[sourceLang.script].word_break),
    // Advanced by itemAtoms: the reference alternates row shading per section.
    rowIndex: 0,
  };
}

/**
 * Lay out one text field inside a box, returning runs plus the height consumed.
 * @param {ReturnType<typeof makeContext>} ctx
 * @param {string} text
 * @param {import('../measure.js').RunStyle} style
 * @param {{x:number, y:number, w:number, align:'start'|'end'|'center', fill:string}} box
 */
function paintField(ctx, text, style, box) {
  /** @type {TextRun[]} */ const runs = [];
  /** @type {Rect[]} */ const rects = [];
  const { lines } = ctx.measurer.wrap(text, box.w, style);
  const baseline = ctx.measurer.baselineOffset(style);

  // Pieces are in logical order. A right-to-left line therefore starts at its
  // *right* edge and walks left, which is the whole of what was wrong with Arabic:
  // laid out left-to-right, "as-salam alaykum" printed with the words in the
  // opposite order to the one an Arabic reader reads them in.
  const rtl = style.dir === 'rtl';

  lines.forEach((line, i) => {
    const width = inkWidth(line);
    const offset = box.align === 'end' ? box.w - width
      : box.align === 'center' ? (box.w - width) / 2
        : 0;
    const left = box.x + offset;
    const y = box.y + i * style.leading;
    // Where the next piece's advance box begins, measured from the line's start
    // edge -- the left for ltr, the right for rtl.
    let cursor = rtl ? left + width : left;
    for (const piece of line) {
      // `w` carries any trailing space, `inkW` does not. In a right-to-left line
      // that space sits to the *left* of the word, so the ink has to be flushed to
      // the right of its advance box rather than the left.
      const x = rtl ? cursor - piece.inkW : cursor;
      if (piece.type === 'slot') {
        // An open slot is a rule sitting just under the baseline, not a run of
        // underscores -- which is what made the reference's CJK slots space badly.
        rects.push({
          x, y: y + baseline + style.size * 0.08, w: piece.w * 0.94,
          h: Math.max(0.35, style.size * 0.055), fill: box.fill,
        });
      } else if (piece.text.trim() !== '') {
        runs.push({
          // Trimmed, because the position now comes from the ink width: leaving the
          // space in would draw it on the wrong side of a right-to-left word.
          text: piece.text.trim(), x, y: y + baseline, fontId: ctx.measurer.faceKey(style),
          size: style.size, fill: box.fill, bold: style.weight >= 700,
          italic: style.italic, dir: style.dir,
        });
      }
      cursor += rtl ? -piece.w : piece.w;
    }
  });

  return { runs, rects, height: lines.length * style.leading };
}

/**
 * @param {ReturnType<typeof makeContext>} ctx
 * @param {import('../types.js').Block} block
 * @returns {Atom}
 */
function headingAtom(ctx, block) {
  const level = block.level ?? 1;
  const h = ctx.theme.headings[String(level)];
  const s = ctx.scale;
  const size = ctx.sizeAt(h.size, ctx.sourceFloor);
  const style = {
    stack: ctx.sourceStack.stack,
    dir: ctx.sourceStack.dir,
    // A section title is read by the source-language reader, so it breaks the
    // way that language does -- see noteAtom for what hardcoding this cost.
    wordBreak: ctx.sourceBreak,
    size,
    leading: size * (h.leading / h.size),
    weight: 700,
    italic: false,
    slotAsRule: false,
  };
  const color = ctx.palette.roles[block.colorRole];
  const iconW = h.iconSize > 0 && block.icon ? h.iconSize * s + h.iconGap * s : 0;
  const textTop = h.spaceBefore * ctx.spacingRatio + ctx.padding * 0.5;
  const painted = paintField(ctx, block.text ?? '', style, {
    x: iconW, y: textTop, w: ctx.colWidth - iconW, align: 'start', fill: ctx.palette.ink,
  });
  const ruleY = textTop + painted.height + h.gapBeforeRule * ctx.spacingRatio;
  const height = ruleY + h.rulePt + h.gapAfterRule * ctx.spacingRatio + ctx.padding * 0.5;

  /** @type {IconMark[]} */ const icons = [];
  if (iconW > 0 && block.icon) {
    icons.push({
      name: block.icon, size: h.iconSize * s, fill: color,
      x: 0, y: textTop + (style.leading - h.iconSize * s) / 2,
    });
  }

  return {
    kind: 'heading',
    sectionId: block.sectionId,
    height,
    gapBefore: {
      natural: ctx.theme.sectionSep.natural * s,
      stretch: ctx.theme.sectionSep.stretch,
      max: MAX_STRETCH_SECTION * ctx.spacingRatio,
    },
    breakCost: BREAK_SECTION,
    keepWithNext: false,
    paint: {
      rects: [...painted.rects, { x: 0, y: ruleY, w: ctx.colWidth, h: h.rulePt, fill: color }],
      runs: painted.runs,
      icons,
      hits: [{ x: 0, y: 0, w: ctx.colWidth, h: height, sectionId: block.sectionId }],
    },
  };
}

/**
 * Cells for one item, grouped into grid columns and mirrored for an RTL target.
 * @param {ReturnType<typeof makeContext>} ctx
 * @param {any} template
 * @param {import('../types.js').ItemRow} row
 */
function cellGrid(ctx, template, row) {
  const fields = template.fields.filter(
    (/** @type {import('../types.js').FieldStyle} */ f) => ctx.shown.has(f.field),
  );
  /** @type {{text:string, style:import('../measure.js').RunStyle, fs:import('../types.js').FieldStyle}[][]} */
  const columns = Array.from({ length: template.cols }, () => []);
  for (const raw of fields) {
    const fs = /** @type {import('../types.js').FieldStyle} */ (raw);
    columns[fs.col].push({ text: row.values[fs.field] ?? '', style: ctx.styleFor(fs), fs });
  }
  for (const column of columns) column.sort((a, b) => a.fs.row - b.fs.row);
  return ctx.mirror ? columns.slice().reverse() : columns;
}

/** @param {'start'|'end'|'center'} align @param {boolean} mirror */
function resolveAlign(align, mirror) {
  if (!mirror || align === 'center') return align;
  return align === 'start' ? 'end' : 'start';
}

/**
 * @param {ReturnType<typeof makeContext>} ctx
 * @param {import('../types.js').Block} block
 * @param {import('../types.js').ItemRow[]} rows
 * @param {boolean} withPaint
 * @returns {Atom[]}
 */
function itemAtoms(ctx, block, rows, withPaint) {
  const base = ctx.theme.templates[block.templateId ?? 'entry'];
  if (!base) throw new Error(`unknown template ${block.templateId}`);
  const template = arrangeTemplate(base, ctx.spec.arrangement ?? 'two-column', ctx.shown);
  const s = ctx.scale;
  // All four sides, not just top and bottom. Holding the horizontal insets back was
  // meant to protect the usable width, but those insets are exactly the gap between
  // the text and the accent rule down the left edge -- so turning padding up moved
  // the two halves of an entry apart while leaving the text jammed against the bar,
  // which is not what "more breathing room" means. The width it costs is about 1%
  // of a column.
  const pad = template.pad.map((/** @type {number} */ v) => v * ctx.spacingRatio + ctx.padding);
  const rowGap = template.rowGap * ctx.spacingRatio + ctx.padding * 0.6;
  const colGap = template.colGap * ctx.spacingRatio + ctx.padding * 0.5;
  const gutter = colGap * (template.cols - 1);
  const avail = ctx.colWidth - pad[3] - pad[1] - gutter;
  const grids = rows.map((row) => cellGrid(ctx, template, row));

  // Shared-width templates solve their columns once for the whole group; phrase
  // rows solve per row, which is what lets a long phrase borrow width from a
  // short gloss.
  const shared = template.widthMode === 'shared'
    ? chooseSharedWidths(grids, avail, template, ctx.measurer)
    : null;

  const startRow = ctx.rowIndex;
  return rows.map((row, i) => {
    const grid = grids[i];
    const widths = shared ? shared.widths : chooseSplit(grid, avail, template, ctx.measurer).widths;
    const rowStretch = template.rowStretch ?? 1;
    const stacks = grid.map((cells, j) => {
      const live = cells.filter((c) => c.text !== '');
      const height = live.reduce(
        (sum, c, k) => sum + ctx.measurer.wrap(c.text, widths[j], c.style).height
          + (k > 0 ? rowGap : 0),
        0,
      );
      return { live, height };
    });
    const gridHeight = Math.max(0, ...stacks.map((st) => st.height)) * rowStretch;
    const height = pad[0] + gridHeight + pad[2];

    if (!withPaint) {
      return atomShell(ctx, block, height, i, template);
    }

    /** @type {Rect[]} */ const rects = [];
    /** @type {TextRun[]} */ const runs = [];
    const shaded = template.shadeAlternate && (startRow + i) % 2 === 1;
    rects.push({ x: 0, y: 0, w: ctx.colWidth, h: height, fill: shaded ? ctx.palette.shade : ctx.palette.paper });
    rects.push({ x: 0, y: 0, w: template.accentPt, h: height, fill: ctx.palette.roles[block.colorRole] });
    rects.push({ x: 0, y: height - template.rulePt, w: ctx.colWidth, h: template.rulePt, fill: ctx.palette.rule });

    let x = pad[3];
    grid.forEach((cells, j) => {
      const live = cells.filter((c) => c.text !== '');
      const stackHeight = stacks[j].height;
      let y = pad[0] + (template.valign === 'middle' ? (gridHeight - stackHeight) / 2 : 0);
      live.forEach((cell, k) => {
        if (k > 0) y += rowGap;
        const painted = paintField(ctx, cell.text, cell.style, {
          x, y, w: widths[j],
          align: resolveAlign(cell.fs.align, ctx.mirror),
          fill: ctx.colorFor(cell.fs, block.colorRole),
        });
        rects.push(...painted.rects);
        runs.push(...painted.runs);
        y += painted.height;
      });
      x += widths[j] + colGap;
    });

    const atom = atomShell(ctx, block, height, i, template);
    atom.paint = {
      rects,
      runs,
      icons: [],
      hits: [{ x: 0, y: 0, w: ctx.colWidth, h: height, conceptId: row.conceptId, sectionId: block.sectionId }],
    };
    return atom;
  });
}

/**
 * @param {ReturnType<typeof makeContext>} ctx
 * @param {import('../types.js').Block} block
 * @param {number} height @param {number} i  index within the block
 * @param {any} template
 * @returns {Atom}
 */
function atomShell(ctx, block, height, i, template) {
  return {
    kind: 'item',
    sectionId: block.sectionId,
    height,
    gapBefore: { natural: 0, stretch: template.stretch, max: MAX_STRETCH_ROW * ctx.spacingRatio },
    breakCost: i === 0 ? BREAK_BLOCK : BREAK_IN_GROUP,
    keepWithNext: false,
    paint: null,
  };
}

/**
 * @param {ReturnType<typeof makeContext>} ctx
 * @param {import('../types.js').Block} block
 * @param {boolean} withPaint
 * @returns {Atom}
 */
function noteAtom(ctx, block, withPaint) {
  const n = ctx.theme.note;
  const s = ctx.scale;
  const pad = n.pad.map((/** @type {number} */ v) => v * ctx.spacingRatio + ctx.padding);
  const size = ctx.sizeAt(n.size, ctx.sourceFloor);
  const style = {
    stack: ctx.sourceStack.stack,
    dir: ctx.sourceStack.dir,
    // A note is prose in the *reader's* language, so it breaks the way that
    // language does. This was hardcoded to 'space', which is silently wrong for
    // every reader whose script has none: a Japanese or Chinese note is one
    // unbreakable run, and it painted straight past the right edge of its own
    // shaded box rather than wrapping inside it. Three translators hit it and
    // wrote around it by inserting spaces into their prose by hand.
    wordBreak: ctx.sourceBreak,
    size,
    leading: size * (n.leading / n.size),
    weight: 400,
    italic: false,
    slotAsRule: false,
  };
  const inner = ctx.colWidth - pad[1] - pad[3];
  const painted = paintField(ctx, block.text ?? '', style, {
    x: pad[3], y: pad[0], w: inner, align: 'start', fill: ctx.palette.muted,
  });
  const height = pad[0] + painted.height + pad[2];

  return {
    kind: 'note',
    sectionId: block.sectionId,
    height,
    gapBefore: {
      natural: n.spaceBefore * s, stretch: n.stretch, max: MAX_STRETCH_ROW * ctx.spacingRatio,
    },
    breakCost: BREAK_BLOCK,
    keepWithNext: false,
    paint: withPaint
      ? {
        rects: [
          { x: 0, y: 0, w: ctx.colWidth, h: height, fill: ctx.palette.shade, r: n.radius * s },
          ...painted.rects,
        ],
        runs: painted.runs,
        icons: [],
        hits: [{ x: 0, y: 0, w: ctx.colWidth, h: height, sectionId: block.sectionId }],
      }
      : null,
  };
}

/**
 * @param {Object} args
 * @param {import('../types.js').Block[]} args.blocks
 * @param {any} args.theme
 * @param {import('../types.js').SheetSpec} args.spec
 * @param {Awaited<ReturnType<import('../pack.js').loadCorpus>>} args.corpus
 * @param {ReturnType<import('../measure.js').createMeasurer>} args.measurer
 * @param {ReturnType<import('../fonts.js').createFontRegistry>} args.registry
 * @param {number} args.colWidth
 * @param {number} args.scale
 * @param {boolean} [args.withPaint]
 * @returns {Atom[]}
 */
export function buildAtoms({
  blocks, theme, spec, corpus, measurer, registry, colWidth, scale, withPaint = true,
}) {
  const ctx = makeContext({ theme, spec, corpus, measurer, registry, colWidth, scale });

  /** @type {Atom[]} */ const atoms = [];
  for (const block of blocks) {
    if (block.kind === 'heading') {
      // The reference resets its row-shading counter at each heading.
      ctx.rowIndex = 0;
      atoms.push(headingAtom(ctx, block));
    } else if (block.kind === 'note') {
      atoms.push(noteAtom(ctx, block, withPaint));
    } else {
      const rows = block.rows ?? [];
      atoms.push(...itemAtoms(ctx, block, rows, withPaint));
      ctx.rowIndex += rows.length;
    }
  }

  // Bind each heading to its opening rows. This is a constraint handed to the
  // breaker rather than a merge of the atoms: merging was the first
  // implementation, and it froze the gaps inside the merged run at their natural
  // size while every later gap in the same column stretched to flush the bottom
  // -- so the first two rows of every section printed visibly tighter than the
  // rest of it. Leaving the atoms separate lets the glue treat all of them alike.
  for (let i = 0; i < atoms.length; i += 1) {
    if (atoms[i].kind !== 'heading') continue;
    for (let k = 0; k < KEEP_ROWS; k += 1) {
      const bound = atoms[i + k + 1];
      if (!bound || bound.kind === 'heading') break;
      atoms[i + k].keepWithNext = true;
    }
  }
  return atoms;
}
