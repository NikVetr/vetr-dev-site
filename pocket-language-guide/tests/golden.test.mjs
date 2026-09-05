// Golden layout signatures, and the acceptance test against the original XeLaTeX sheet.
//
// The rest of the suite asserts structure -- face counts, flush columns, no stranded
// heading, the two renderers agreeing on how much ink is on the page -- and it has
// caught a great deal. What it cannot catch is output that is structurally valid and
// visually wrong. Every misplaced Hebrew niqqud was still inside a legal run, and the
// page-wide ink comparison in tests/render.spec.js saw the whole bug as 0.87% of a 2%
// tolerance. This file exists for that class.
//
// **The baseline is the geometry, not the pixels.** Four alternatives were weighed:
//
// - *Full-page rasters at low DPI with a perceptual tolerance.* Measured and rejected.
//   The same PDF rasterised by poppler/splash and poppler/cairo on one machine differs
//   in 23.1% of its pixels at 72dpi, 15.7% at 150dpi and 8.0% at 300dpi (RMSE 0.14,
//   0.14, 0.12). Lower DPI is worse, not better: at 72dpi a pixel is a point across and
//   straddles several edges of 5pt type. The signal is the mark-offset class, measured
//   in summary.md at 0.87% of pixels for Hebrew and 0.003% for Devanagari, so a
//   tolerance that survives a FreeType or poppler upgrade is eighteen to two hundred
//   times too loose to see the bug it was added for. And a failure reads "37 pixels
//   differ", which tells a maintainer nothing about what moved.
// - *Per-glyph position dumps.* Rejected on size and on redundancy: a face carries
//   about a thousand runs and ten thousand glyphs, and a glyph's position is its run's
//   origin plus advances the committed font subsets already pin. The one thing a glyph
//   dump adds over a run dump is the GPOS offsets the PDF applies, and those are here
//   as the `glyphs` lines below -- a handful per pair rather than ten thousand.
// - *SVG DOM snapshots.* Rejected: they freeze the renderer's serialisation rather than
//   the layout, so they churn on rounding or attribute order, and a face is 1.5MB of
//   mostly corpus text. Renderer fidelity is already tests/render.spec.js's job.
// - *A whole-sheet dump of every run.* Rejected on churn, which is this project's
//   standing complaint about literal assertions -- see the header of tests/counts.js.
//   Eight thousand lines per pair, all of which move when one concept joins the bank,
//   all for the same uninteresting reason.
//
// So a signature is the geometry of a fixed handful of *probe* items, in coordinates
// local to each item's own box, taken at a pinned fit. Positions are exact, a failure
// names the run that moved, and adding a concept to the corpus does not touch the file.
//
// **The pinned spec is the original's own configuration**, not the app's default:
// `latex-reference` on zero-inset borderless paper at nominal type scale, with
// `padding: 0` and `split: 'adaptive'`, which is the configuration tests/solve.test.mjs
// already established reproduces the hand-built sheets. That lets one plan per pair
// serve both halves of this file -- the signature, and the comparison against the
// original PDF -- and it makes the numbers in a baseline the theme's own numbers, which
// is what makes them readable.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseTable } from '../core/csv.js';
import { paperSpec } from '../core/pack.js';
import { createSheetContext, buildSheet } from '../core/sheet.js';
import { contentBox } from '../core/solve/index.js';
import { planToPdf } from '../render/pdf.js';
import { referenceSpec } from '../scripts/spec.mjs';
import { pdfMarks, pdfPageBox, pdfPages } from './pdfgeom.mjs';

const DIR = 'tests/golden';
/** Rewrite the baselines instead of comparing against them. */
const UPDATE = process.env.UPDATE_GOLDEN === '1';
/**
 * The original PDF, for rewriting `latex-reference.txt`.
 *
 * It is not in the repository, and could not be rebuilt from the `.tex` here even if it
 * were: `extarticle.cls`, Inter, Noto Sans Condensed and TeX Gyre Heros are all absent
 * on this machine, so `xelatex` cannot get past the preamble. 172KB of unbuildable
 * input against 3KB of the facts about it worth comparing -- so the digest is committed
 * and the PDF is named on the command line when it changes:
 *
 *   unzip -j tmp/mandarin_travel_cheatsheets_*_v2_bundle.zip \
 *     'mandarin_travel_cheatsheet_generic_full_verified_v2.*' -d tmp/golden-work
 *   env UPDATE_GOLDEN=1 \
 *     GOLDEN_REFERENCE_PDF=tmp/golden-work/mandarin_travel_cheatsheet_generic_full_verified_v2.pdf \
 *     npm run test:unit
 */
const REFERENCE_PDF = process.env.GOLDEN_REFERENCE_PDF ?? '';

/**
 * A TeX point over a PostScript point.
 *
 * `\hrule height 0.90pt` in a LaTeX preamble is 0.90 TeX points, 1/72.27in;
 * `data/themes/latex-reference.json` transcribed all of those numbers as PostScript
 * points, 1/72in. So every rule and every leading in our sheet is 0.374% larger than
 * the original's, which on a 0.22pt hairline is 0.0008pt -- below `min_rule_pt` for
 * every paper preset in the registry, and below any printer's resolution. That makes it
 * a note rather than a defect, and it is what lets the comparisons below be exact
 * instead of approximate.
 */
const TEX_PT = 72 / 72.27;

const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});
const paper = Object.fromEntries(
  parseTable(await readFile('data/registry/paper.csv', 'utf8')).map((r) => [r.preset_id, r]),
);
const sectionRows = parseTable(await readFile('data/registry/sections.csv', 'utf8'));
const icons = JSON.parse(await readFile('data/icons.json', 'utf8'));
const theme = await ctx.theme('latex-reference');

/** @param {number} v */
const num = (v) => v.toFixed(2);
/** @param {number} v */
const col = (v) => v.toFixed(2).padStart(7);

/**
 * The column grid, recovered from where the ink actually is rather than from either
 * preamble.
 *
 * A section rule and a row's shading are drawn at their column's own left edge and span
 * its whole width, so the wide shapes carry the grid. Narrow ones must be excluded: the
 * original shades a reference table's four cells separately, and those inner edges
 * repeat often enough to look like columns -- eighteen of them, on a four-column sheet.
 * @param {import('./pdfgeom.mjs').Shape[]} shapes
 */
function columnEdges(shapes) {
  const wide = shapes.filter((s) => s.w > 100);
  /** @type {Map<number, number>} */ const widths = new Map();
  for (const s of wide) {
    const key = Number(num(s.w));
    widths.set(key, (widths.get(key) ?? 0) + 1);
  }
  // Rounding at the boundary splits one edge in two -- the original's third column
  // reports both 253.82 and 253.83 -- so near-identical edges are one edge.
  /** @type {number[]} */ const lefts = [];
  for (const x of [...new Set(wide.map((s) => Number(num(s.x))))].sort((a, b) => a - b)) {
    if (wide.filter((s) => Math.abs(s.x - x) < 0.02).length <= 10) continue;
    if (!lefts.length || x - lefts[lefts.length - 1] > 0.5) lefts.push(x);
  }
  return { lefts, width: [...widths].sort((a, b) => b[1] - a[1])[0][0] };
}

/**
 * The baselines inside one phrase row, as offsets from its first.
 *
 * **This is the one part of the original's typography the font difference does not
 * spoil, and the reason is that TeX rescales a font but never a `\baselineskip`.** Its
 * `\entry` puts the target and the gloss on one baseline and the romanisation and the
 * respelling on their own, so a row has three, and the two offsets are the theme's
 * `leading` for those fields less its `rowGap`.
 *
 * Recovered by splitting the column's baselines at the row boundaries -- the glue
 * between rows stretches, so those gaps are both large and variable where the ones
 * inside a row are neither -- and taking the commonest triple. Rows whose gloss wrapped
 * have four or more and are left out.
 * @param {import('./pdfgeom.mjs').Placement[]} placements
 * @param {number} until  x of the second column, so this reads the first alone
 */
function rowBaselines(placements, until) {
  const ys = [...new Set(placements.filter((p) => p.x < until).map((p) => Number(p.y.toFixed(3))))]
    .sort((a, b) => b - a);
  /** @type {Map<string, number>} */ const triples = new Map();
  /** @type {number[]} */ let row = [];
  for (const y of ys) {
    if (row.length && row[row.length - 1] - y > 8) {
      if (row.length === 3) {
        const key = row.map((v) => (row[0] - v).toFixed(3)).join(' ');
        triples.set(key, (triples.get(key) ?? 0) + 1);
      }
      row = [];
    }
    row.push(y);
  }
  const best = [...triples].sort((a, b) => b[1] - a[1])[0];
  if (!best) throw new Error('no three-baseline row found in the first column');
  return best[0].split(' ').map(Number);
}

/**
 * Facts about the original, one per line, keyed on the first word. `group` repeats --
 * one per content group -- so it is collected separately.
 * @param {string} text
 */
function readDigest(text) {
  /** @type {Map<string, number[]>} */ const fields = new Map();
  /** @type {Map<string, string>} */ const groups = new Map();
  /** @type {string[]} */ let palette = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [key, ...rest] = line.trim().split(/\s+/);
    if (key === 'group') groups.set(rest[0], rest[1]);
    else if (key === 'palette') palette = rest;
    else fields.set(key, rest.filter((v) => /^-?[\d.]+$/.test(v)).map(Number));
  }
  return { fields, groups, palette };
}

/** @param {Map<string, number[]>} fields @param {string} key */
function digest(fields, key) {
  const held = fields.get(key);
  if (!held) throw new Error(`${DIR}/latex-reference.txt has no \`${key}\` line`);
  return held;
}

/**
 * The original PDF reduced to a digest, for `env UPDATE_GOLDEN=1 GOLDEN_REFERENCE_PDF=...`.
 *
 * Every number is read out of the file's own content stream. The `group` lines are the
 * one thing a PDF cannot answer -- a coloured rule does not say which content group it
 * belongs to -- so they come from the `\colorlet` table in the `.tex` beside it.
 * @param {string} pdfPath
 * @param {Map<string,string>} carried  group colours to keep if the `.tex` is absent
 */
async function buildReferenceDigest(pdfPath, carried) {
  const bytes = await readFile(pdfPath);
  const marks = pdfMarks(bytes);
  // Icon outlines reach the page as stroked path segments a fraction of a point across.
  // They are ink, but they are not the sheet's furniture, and their colour is set with
  // `RG` rather than `rg` -- so they are out of a palette or a grid comparison.
  const ink = marks.shapes.filter((s) => s.w >= 3 && s.h >= 0.15);
  const { lefts, width: colWidth } = columnEdges(ink);
  const rules = [...new Set(ink.filter((s) => s.h < 1.2 && s.w > 100)
    .map((s) => Number(s.h.toFixed(3))))].sort((a, b) => a - b);
  /** @type {Map<number, number>} */ const accents = new Map();
  for (const s of marks.shapes.filter((s) => s.w < 1.5 && s.h > 3)) {
    const key = Number(s.w.toFixed(3));
    accents.set(key, (accents.get(key) ?? 0) + 1);
  }
  const accent = [...accents].sort((a, b) => b[1] - a[1])[0][0];

  // One page: a row's baselines are read by walking down a column, and pooling four
  // pages interleaves their rows.
  const step = rowBaselines(pdfPages(bytes)[0].placements, lefts[1]);

  /** @type {Map<string,string>} */ let groups = carried;
  const source = await readFile(pdfPath.replace(/\.pdf$/, '.tex'), 'utf8').catch(() => '');
  if (source) {
    const named = { Comm: 'comm', Money: 'money', Move: 'move', Stay: 'stay', Alert: 'alert' };
    groups = new Map();
    for (const [, group, color] of source.matchAll(/\\colorlet\{(\w+)\}\{(\w+)\}/g)) {
      const role = named[/** @type {keyof typeof named} */ (color)];
      if (role) groups.set(group.toLowerCase(), role);
    }
  }

  return `${[
    '# The hand-built XeLaTeX Mandarin sheet this project was derived from, reduced to',
    '# the facts about it that can still be compared.',
    '#',
    '# Read out of the PDF\'s own content stream by tests/pdfgeom.mjs. Nothing here comes',
    '# from a raster, because a raster comparison against this document is measurably',
    '# meaningless: page 1 of it against our page 1 is RMSE 0.3124 at 150dpi, while page 1',
    '# of it against page 2 *of itself* is 0.2964 -- so any threshold that accepts the',
    '# matched pair also accepts a mismatched one, and prefers it. See the acceptance test.',
    '#',
    '# The PDF is not in the repository and cannot be rebuilt here: extarticle.cls, Inter,',
    '# Noto Sans Condensed and TeX Gyre Heros are all absent, so xelatex cannot get past',
    '# its preamble. Hence this digest.',
    '#',
    `# Source:  ${pdfPath.split('/').at(-1)}`,
    '# Rewrite: env UPDATE_GOLDEN=1 GOLDEN_REFERENCE_PDF=<that pdf> npm run test:unit',
    '#',
    '# What legitimately differs, and is therefore not recorded here:',
    '#  - the page count: 4 against our 8, because the concept bank went from 413 to 813',
    '#  - the fitted type scale, and which row lands in which column',
    '#  - the type sizes. **Every fontspec face in this document is set at 0.787 of the',
    '#    size its own preamble asks for** -- measured: the entry row\'s 7.30/7.01/5.53/5.22',
    '#    are drawn at 5.7726/5.5139/4.3497/4.1059 and the 7.54 heading at 5.9307, one',
    '#    ratio throughout -- because `\\defaultfontfeatures{...Scale=MatchLowercase}`',
    '#    rescales every face it loads. The theme transcribed the preamble\'s nominal',
    '#    numbers, so "scale 1.0" here is 1.27x what this sheet printed. It comes out even',
    '#    on the page because Noto Sans\'s x-height is about three quarters of Inter\'s.',
    '#  - the glyphs: Inter and Noto Sans Condensed against our Noto Sans, Noto Sans CJK',
    '#    *JP* against our SC, FontAwesome 5 against Lucide',
    '#  - the bottom edge of the ink: this sheet stops 3 to 10pt short of its bottom',
    '#    margin and ours flushes, which is a difference in our favour',
    '',
    `page      ${pdfPageBox(bytes).map(num).join(' ')}`,
    `column    x ${lefts.map(num).join(' ')} width ${num(colWidth)}`,
    `ink       x ${num(Math.min(...ink.map((s) => s.x)))} ${num(Math.max(...ink.map((s) => s.x + s.w)))}`
      + ` top ${num(Math.max(...ink.map((s) => s.y + s.h)))}`,
    `rule      ${rules.join(' ')}`,
    `accent    ${accent}`,
    `baseline  ${step.map((v) => v.toFixed(3)).join(' ')}`,
    `palette   ${[...new Set(ink.map((s) => s.fill))].sort().join(' ')}`,
    '',
    '# Section colour coding, from the original\'s own \\colorlet table: one colour per',
    '# content group, which is the mapping a reader of either sheet learns.',
    ...[...groups].sort().map(([group, role]) => `group     ${group} ${role}`),
  ].join('\n')}\n`;
}

let reference = readDigest(await readFile(`${DIR}/latex-reference.txt`, 'utf8').catch(() => ''));
if (UPDATE && REFERENCE_PDF) {
  const text = await buildReferenceDigest(REFERENCE_PDF, reference.groups);
  await writeFile(`${DIR}/latex-reference.txt`, text);
  reference = readDigest(text);
}
if (!reference.fields.size) {
  throw new Error(`${DIR}/latex-reference.txt is missing. Write it deliberately:\n`
    + '  env UPDATE_GOLDEN=1 GOLDEN_REFERENCE_PDF=<the original pdf> npm run test:unit');
}

/**
 * The sections a signature is taken over.
 *
 * Eight, chosen so the pinned sheet carries every shape the engine can set and nothing
 * else: all four item templates, all three heading levels, a `note`, and each of the
 * five section colour roles. Pinning the selection is what keeps the sheet small enough
 * to solve four times in a unit test -- 0.2s a pair against 1.9s for the whole bank --
 * and what keeps a concept added to `hotel-requests` out of these files.
 */
const SECTIONS = [
  'social-basics', // level 1, comm: `entry`, the two-column phrase row
  'quick-responses', // level 2, comm: `ref`, four columns of shared width
  'payment-receipt', // level 3, money: `refphrase`
  'numbers-money', // level 1, money: `num`, the only template with a numeral column
  'time-words', // level 1, stay
  'trail-words', // level 1, move
  'emergency-medical', // level 1, alert -- and the region's emergency numbers, a `note`
  // The one section with open slots. A slot prints as a rule in the theme's ink
  // (the original's `\Blank`, `\rule{0.47in}{0.42pt}`), which is the only furniture
  // on either sheet drawn in the body colour -- so without this the palettes differ
  // by exactly that, and the `slotAsRule` path has no baseline at all.
  'utility-templates',
];

/**
 * Enough faces for that selection at nominal scale on every pair.
 *
 * Raise it if a baseline starts failing on its `spec faces` line: a pinned scale that
 * does not fit comes back as an empty plan, which `solvePinned` refuses out loud.
 */
const PINNED_FACES = 4;

/**
 * The items a signature records, in the order they are written.
 *
 * `heading:` and `note:` name a section rather than a concept, because neither carries
 * one -- a heading's hit box is keyed on its section and so is a note's, so the two are
 * told apart by authored order, which is the order the plan lists them in.
 *
 * Chosen for shape rather than for content: one of every template, one of every heading
 * level, the note, and one open slot. `excuse-me-sorry` is here as well as `hello`
 * because it is long enough to wrap a cell, which is the case where the per-row split
 * search does something.
 */
const PROBES = [
  'heading:social-basics',
  'social-basics.hello',
  'social-basics.excuse-me-sorry',
  'heading:quick-responses',
  'quick-responses.yes-right',
  'heading:payment-receipt',
  'payment-receipt.how-much-in-total',
  'numbers-money.s-n',
  'heading:emergency-medical',
  'note:emergency-medical',
  // An open slot, which prints as a rule on the target's side and an ellipsis on the
  // reader's -- the original's `\Blank` against its `\dots`. It is the only furniture
  // either sheet draws in the body ink, and it is drawn by a path nothing else uses.
  'utility-templates.i-want-to-go-to',
];

/**
 * The pairs a signature is taken for: four scripts with four different failure modes,
 * which is why one Latin baseline would not do.
 * @type {{target:string, source:string, why:string, fields:import('../core/types.js').FieldId[]}[]}
 */
const PAIRS = [
  {
    target: 'es',
    source: 'en',
    why: 'Latin both sides -- the case with no shaping and no direction to get wrong',
    fields: [],
  },
  {
    target: 'zh-Hans',
    source: 'en',
    why: 'Han -- em-wide advances, a script that breaks anywhere, and the original\'s own pair',
    fields: [],
  },
  {
    target: 'ar',
    source: 'en',
    why: 'right to left, and cursive -- a glyph drawn alone would lose its joining',
    fields: [],
  },
  {
    target: 'he',
    source: 'en',
    why: 'GPOS mark attachment -- niqqud are zero-advance glyphs whose outlines sit at positive x',
    // The pointed column is `script_alt` and is off by default, so the one pair whose
    // failure mode is mark positioning would print no marks at all without this. It is
    // the learner's column, and it is where the offsets were being dropped.
    fields: ['script_alt'],
  },
];

/**
 * The original's configuration, with the content pinned.
 *
 * `print-shop-bleed` is the zero-inset borderless paper, which reproduces the
 * original's 1.662in columns exactly; the app's default keeps 8.5pt clear of the
 * ET-8550's bordered edge, which is a safety decision and tests/solve.test.mjs's
 * subject rather than this file's. `scale: 1` sets every field at the theme's own
 * authored size, so a baseline reads in the theme's numbers.
 * @param {typeof PAIRS[number]} pair
 */
async function solvePinned(pair) {
  const base = await referenceSpec(pair.target, pair.source);
  const spec = /** @type {import('../core/types.js').SheetSpec} */ ({
    ...base,
    paper: paperSpec({ paper }, 'print-shop-bleed'),
    geometry: { ...base.geometry, faces: PINNED_FACES },
    autoFaces: false,
    scale: 1,
    padding: 0,
    split: 'adaptive',
    fieldSet: [...base.fieldSet, ...pair.fields],
    selection: {
      sections: Object.fromEntries(
        sectionRows.map((r) => [r.section_id, SECTIONS.includes(r.section_id)]),
      ),
      items: {},
    },
  });
  const { plan } = await buildSheet(ctx, spec);
  const failed = plan.warnings.filter((w) => w.severity === 'error');
  if (!plan.faces.length || failed.length) {
    throw new Error(`${pair.target}: the pinned selection will not fit ${PINNED_FACES} faces at `
      + `nominal scale (${failed.map((w) => w.code).join(', ') || 'no faces'}). Raise PINNED_FACES `
      + 'and rewrite the baselines.');
  }
  return { spec, plan };
}

/**
 * Advance width of a run in points, from the face the plan itself named.
 *
 * Not re-measured through `ctx.measurer`, which would re-derive the number the solver
 * already used from the pieces the line breaker made. This asks the font how wide the
 * string on the page actually is, so a font subset whose advances moved shows up here
 * even when every position stayed put -- and tests/fonts.test.mjs checks that the
 * subsets carry the glyphs, not what they measure.
 * @param {import('../core/types.js').TextRun} run
 */
function runWidth(run) {
  const parts = /^(.*)-(\d+)(i?)$/.exec(run.fontId);
  if (!parts) throw new Error(`unparsable face id ${run.fontId}`);
  const face = ctx.registry.face(parts[1], Number(parts[2]), parts[3] === 'i');
  return (face.font.layout(run.text).advanceWidth / face.upem) * run.size;
}

/**
 * The first baselines of one item's grid columns.
 *
 * The plan carries no cell identity -- one run per word, with an absolute baseline --
 * so the item's runs are grouped into lines by equal baseline and reduced to the lines
 * that *head* a grid column: those with no line above them overlapping in x. A wrapped
 * cell's later lines sit under its own first line and a column's later cells under its
 * first, so what is left is the row's first lines.
 *
 * **An open slot is a rect, not a run, and leaving it out gave a false positive.** On
 * `tlh <- he` the target cell reads "slot + word", so line 1's *runs* start 35pt into
 * the column and line 2 at 3pt -- no overlap, so line 2 read as a second column head
 * 7.47pt down. The slot rects are folded into the line above them: an item's only rects
 * are the accent bar (`w = accentPt`, under a point), the shading and the row rule (both
 * the full column width) and the slots, so the width test names them exactly, and a slot
 * is drawn `size * 0.08` under its own baseline -- far nearer it than the next line is.
 * @param {import('../core/types.js').Face} face
 * @param {import('../core/types.js').HitBox} hit
 */
function firstBaselines(face, hit) {
  /** @param {number} x @param {number} y */
  const inside = (x, y) => x >= hit.x - 0.01 && x <= hit.x + hit.w + 0.01
    && y >= hit.y - 0.01 && y <= hit.y + hit.h + 0.01;
  /** @type {{y:number, lo:number, hi:number, cells:Set<string>}[]} */ const lines = [];
  for (const run of face.runs) {
    if (!inside(run.x, run.y)) continue;
    const cell = `${run.fontId}|${run.size}|${run.italic}|${run.fill}`;
    const held = lines.find((l) => Math.abs(l.y - run.y) < 1e-9);
    if (held) {
      held.lo = Math.min(held.lo, run.x);
      held.hi = Math.max(held.hi, run.x + runWidth(run));
      held.cells.add(cell);
    } else {
      lines.push({ y: run.y, lo: run.x, hi: run.x + runWidth(run), cells: new Set([cell]) });
    }
  }
  lines.sort((a, b) => a.y - b.y);
  // **An item with an open slot is not measurable this way, and the arithmetic says
  // why rather than a threshold being chosen.** A slot prints as a rule, which is a
  // rect and not a run, so a line made only of one is invisible here -- and the target
  // cell of `where-can-i-buy` opens with exactly that. Its second line then reads as a
  // second column head, and on `ar <- hi` the reported delta was that cell's whole
  // 9.49pt Arabic leading, 8.35pt. Attaching each rect to the line above it does not
  // rescue the case either: a misaligned row's two columns are within a point of each
  // other, so the slot attaches to the wrong column's line as readily as its own.
  // These rows are 0.8% of the sheet and their geometry is frozen exactly by the
  // signature baselines above -- `utility-templates.i-want-to-go-to` is a probe -- so
  // this reports them as unmeasurable rather than guessing.
  //
  // An item's only rects are the accent bar (`w = accentPt`, under a point), the
  // shading and the row rule (both the full column width), and the slots, so the width
  // test names the slots exactly.
  const measurable = !face.rects.some((rect) => inside(rect.x, rect.y)
    && rect.w > 1 && rect.w < hit.w - 1);
  return {
    heads: lines.filter((line, i) => !lines.slice(0, i)
      .some((above) => above.lo < line.hi - 0.01 && line.lo < above.hi - 0.01)),
    cells: lines.length ? lines[0].cells.size : 0,
    measurable,
  };
}

/**
 * The hit box a probe names, and everything painted inside it.
 *
 * Membership is by anchor point -- a run's baseline, a rect's or an icon's top-left --
 * which is unambiguous because an item's hit box is the full column width and exactly
 * as tall as its atom, and the atoms tile the column without overlapping.
 * @param {import('../core/types.js').LayoutPlan} plan
 * @param {string} probe
 */
function probeBox(plan, probe) {
  const [kind, id] = probe.includes(':')
    ? /** @type {[string,string]} */ (probe.split(':'))
    : ['item', probe];
  for (const face of plan.faces) {
    const section = face.hits.filter((h) => !h.conceptId && h.sectionId === id);
    const hit = kind === 'item'
      ? face.hits.find((h) => h.conceptId === id)
      : section[kind === 'heading' ? 0 : 1];
    if (!hit) continue;
    /** @param {number} x @param {number} y */
    const inside = (x, y) => x >= hit.x - 0.01 && x <= hit.x + hit.w + 0.01
      && y >= hit.y - 0.01 && y <= hit.y + hit.h + 0.01;
    return {
      hit,
      rects: face.rects.filter((r) => inside(r.x, r.y)),
      runs: face.runs.filter((r) => inside(r.x, r.y)),
      icons: face.icons.filter((i) => inside(i.x, i.y)),
    };
  }
  throw new Error(`${probe} is not on the sheet, so the probe list is stale`);
}

/**
 * Where the PDF put each glyph of a run, as offsets from the run's own origin.
 *
 * One block means the run was drawn whole, which is the path every script but the
 * mark-positioned ones takes. Several means `render/pdf.js` pulled the offset glyphs out
 * and placed them itself, and the numbers are the offsets the shaper asked for -- which
 * is the whole of the bug that shipped undetected, since a niqqud half a letter out is
 * still inside a legal run.
 *
 * The runs are re-laid on a bare page rather than read back out of the sheet's own PDF,
 * so a block's x is the run's own offset and nothing has to be matched through several
 * faces of near-coincident baselines.
 * @param {import('../core/types.js').TextRun[]} runs
 */
async function glyphBlocks(runs) {
  const pitch = 24;
  const laid = runs.map((run, i) => ({ ...run, x: 20, y: pitch * (i + 1) }));
  const plan = /** @type {import('../core/types.js').LayoutPlan} */ ({
    pageW: 400,
    pageH: pitch * (laid.length + 1),
    scale: 1,
    looseness: [],
    warnings: [],
    geometry: /** @type {any} */ ({}),
    faces: [{ rects: [], icons: [], hits: [], runs: laid }],
  });
  const { placements } = pdfMarks(await planToPdf(plan, {
    loadFont: (file) => readFile(`data/fonts/${file}`), icons, date: new Date(0),
  }));
  return laid.map((run) => {
    // PDF's y counts up from the bottom; render/pdf.js is the only place that flips.
    const baseline = plan.pageH - run.y;
    const blocks = placements.filter((p) => Math.abs(p.y - baseline) < 0.01)
      .sort((a, b) => a.x - b.x);
    if (!blocks.length) throw new Error(`nothing was drawn for ${JSON.stringify(run.text)}`);
    return { run, offsets: blocks.map((b) => b.x - run.x) };
  });
}

/**
 * One pair's signature, as the text that gets committed.
 * @param {typeof PAIRS[number]} pair
 * @param {import('../core/types.js').SheetSpec} spec
 * @param {import('../core/types.js').LayoutPlan} plan
 * @param {{run:import('../core/types.js').TextRun, offsets:number[]}[]} blocks
 */
function signature(pair, spec, plan, blocks) {
  const box = contentBox(spec.geometry, spec.paper);
  /** @type {string[]} */ const out = [
    `# pocket-language-guide golden layout signature -- ${pair.target} <- ${pair.source}`,
    '#',
    `# ${pair.why}.`,
    '#',
    '# Written by tests/golden.test.mjs. Do not edit by hand; rewrite it deliberately:',
    '#   env UPDATE_GOLDEN=1 npm run test:unit',
    '#',
    '# The fit is pinned and the selection is eight named sections, so nothing here moves',
    '# when the corpus grows. Every position is in points from the top-left of the item\'s',
    '# own box, so an item is described independently of where on the sheet it landed.',
    '# What does move these numbers is a theme size, a leading, a pad, a rule weight, a',
    '# change in a committed font subset\'s advances, or a solver change -- which is the',
    '# point. `split: adaptive` means an `entry` row solves its own divider, so its',
    '# geometry does not depend on its neighbours either; the three table templates share',
    '# one split across their group by design, so a row joining `quick-responses` or',
    '# `numbers-money` will move those.',
    '#',
    '#   run     dx  dy(baseline)  advance  face size  fill  dir  text',
    '#   rect    dx  dy(top)       w x h    fill',
    '#   icon    dx  dy(top)       size     name  fill',
    '#   glyphs  one line per target-script run: how many blocks render/pdf.js drew it in,',
    '#           and where. The only place a dropped GPOS mark offset is visible.',
    '',
    `spec     ${pair.target} <- ${pair.source}   theme ${spec.themeId}   paper ${spec.paper.presetId}`,
    `spec     faces ${spec.geometry.faces} pinned   scale ${plan.scale.toFixed(3)} pinned   `
      + `padding ${num(spec.padding)}   split ${spec.split}   arrangement ${spec.arrangement}`,
    `spec     fields ${spec.fieldSet.join(' ')}`,
    `spec     sections ${SECTIONS.join(' ')}`,
    `box      left ${num(box.left)}   top ${num(box.top)}   width ${num(box.width)}   `
      + `height ${num(box.height)}   colWidth ${num(box.colWidth)}`,
    `column   x ${Array.from({ length: spec.geometry.columns },
      (_, c) => num(box.left + c * (box.colWidth + spec.geometry.columnGap))).join('  ')}`,
    '',
  ];
  for (const probe of PROBES) {
    const { hit, rects, runs, icons } = probeBox(plan, probe);
    out.push(`item     ${probe.padEnd(34)} box ${num(hit.w)} x ${num(hit.h)}`);
    for (const r of rects) {
      out.push(`  rect ${col(r.x - hit.x)} ${col(r.y - hit.y)}  ${num(r.w)} x ${num(r.h)}  ${r.fill}`
        + `${r.r === undefined ? '' : `  r ${num(r.r)}`}`
        + `${r.opacity === undefined ? '' : `  opacity ${num(r.opacity)}`}`);
    }
    for (const i of icons) {
      out.push(`  icon ${col(i.x - hit.x)} ${col(i.y - hit.y)}  ${num(i.size)}  ${i.name}  ${i.fill}`);
    }
    for (const r of runs) {
      out.push(`  run  ${col(r.x - hit.x)} ${col(r.y - hit.y)}  ${num(runWidth(r)).padStart(6)}  `
        + `${r.fontId} ${num(r.size)}  ${r.fill} ${r.dir}  ${JSON.stringify(r.text)}`);
    }
    out.push('');
  }
  for (const { run, offsets } of blocks) {
    out.push(`glyphs   ${run.fontId} ${num(run.size)}  ${String(offsets.length).padStart(2)} `
      + `block${offsets.length === 1 ? ' ' : 's'}  ${offsets.map((o) => `+${num(o)}`).join(' ')}  `
      + `${JSON.stringify(run.text)}`);
  }
  return `${out.join('\n')}\n`;
}

/**
 * Compare against the committed baseline, or rewrite it when asked.
 *
 * The failure names the first line that changed and counts the rest, because a baseline
 * whose diff nobody can read is a baseline nobody maintains.
 * @param {string} name @param {string} produced
 */
async function match(name, produced) {
  const path = `${DIR}/${name}`;
  if (UPDATE) {
    await writeFile(path, produced);
    return;
  }
  /** @type {string|null} */ let want = null;
  try {
    want = await readFile(path, 'utf8');
  } catch {
    want = null;
  }
  if (want === null) {
    assert.fail(`${path} is missing. Write it deliberately:\n`
      + '  env UPDATE_GOLDEN=1 npm run test:unit');
  }
  if (want === produced) return;
  const mine = produced.split('\n');
  const theirs = want.split('\n');
  let first = -1;
  let changed = 0;
  for (let i = 0; i < Math.max(mine.length, theirs.length); i += 1) {
    if (mine[i] === theirs[i]) continue;
    if (first < 0) first = i;
    changed += 1;
  }
  assert.fail(`${path}: ${changed} of ${theirs.length} lines changed, first at line ${first + 1}\n`
    + `  was  ${JSON.stringify(theirs[first] ?? '<end of file>')}\n`
    + `  now  ${JSON.stringify(mine[first] ?? '<end of file>')}\n`
    + `  Every line names the run, rect or icon it describes: git diff ${path}.\n`
    + '  If the change is intended, rewrite it: env UPDATE_GOLDEN=1 npm run test:unit');
}

/** @type {Map<string, {spec:import('../core/types.js').SheetSpec, plan:import('../core/types.js').LayoutPlan}>} */
const solved = new Map();
for (const pair of PAIRS) solved.set(pair.target, await solvePinned(pair));

/** @param {string} target */
function pinned(target) {
  const held = solved.get(target);
  if (!held) throw new Error(`${target} was not solved`);
  return held;
}

for (const pair of PAIRS) {
  const { spec, plan } = pinned(pair.target);

  test(`${pair.target} <- ${pair.source} sets its probe items exactly as the baseline says`, async () => {
    // One run per distinct target-script string among the probes: that is where a mark
    // can be misplaced and where a cursive glyph would lose its joining.
    const stack = ctx.corpus.scripts[ctx.corpus.languages[pair.target].script].font_stack;
    /** @type {Map<string, import('../core/types.js').TextRun>} */ const wanted = new Map();
    for (const probe of PROBES) {
      if (probe.includes(':')) continue;
      for (const run of probeBox(plan, probe).runs) {
        if (run.fontId.startsWith(`${stack}-`)) wanted.set(`${run.fontId} ${run.text}`, run);
      }
    }
    assert.ok(wanted.size >= 4, `only ${wanted.size} target-script runs among the probes`);
    await match(`${pair.target}__${pair.source}.txt`,
      signature(pair, spec, plan, await glyphBlocks([...wanted.values()])));
  });

  test(`${pair.target} <- ${pair.source} keeps every run inside the box its hit names`, () => {
    // The plan-side form of "row highlights offset from the rows they name". A hit box
    // is what the studio draws its highlight and its drag handles from, so a run that is
    // not inside the box naming its own concept is a row you cannot click, or a highlight
    // over the wrong words -- and every structural assertion in the suite passes either
    // way. Ink crossing into the gutter is the same test from the other side, since a hit
    // box is exactly one column wide.
    const box = contentBox(spec.geometry, spec.paper);
    assert.ok(plan.faces.some((f) => f.runs.length && f.hits.length),
      'nothing was laid out, so this asserts nothing');
    for (const [index, face] of plan.faces.entries()) {
      for (const run of face.runs) {
        const holding = face.hits.filter((h) => run.x >= h.x - 0.01 && run.x <= h.x + h.w + 0.01
          && run.y >= h.y - 0.01 && run.y <= h.y + h.h + 0.01);
        assert.equal(holding.length, 1,
          `face ${index + 1}: ${JSON.stringify(run.text)} at ${num(run.x)},${num(run.y)} `
          + `sits in ${holding.length} hit boxes`);
        const overhang = run.x + runWidth(run) - (holding[0].x + holding[0].w);
        assert.ok(overhang <= 0.5, `face ${index + 1}: ${JSON.stringify(run.text)} runs `
          + `${num(overhang)}pt past the column that holds it`);
      }
      for (const hit of face.hits) {
        assert.ok(hit.x >= box.left - 0.01 && hit.x + hit.w <= box.left + box.width + 0.01,
          `face ${index + 1}: the hit box for ${hit.conceptId ?? hit.sectionId} is outside the content box`);
      }
    }
  });

  test(`${pair.target} <- ${pair.source} puts a row's headwords on one baseline`, () => {
    // The defect this file's first pass found: a target headword sitting *below* its
    // own gloss, by 1.22pt on `he <- en` -- a quarter of the type size -- because
    // `atoms.js` aligned a grid row's cells by their line-box **tops** while the
    // per-script `leading_factor` gave those boxes different heights. Every assertion
    // in the suite passed either way, which is what this test is for.
    //
    // The original is an `\hbox` of two `\vtop`s, so it shares the *first* line's
    // baseline and nothing below it: on its page 1 the target and the gloss share
    // 333.70 while their second lines land 5.00 and 5.30 under it. So this asserts the
    // first baselines and says nothing about the rest.
    //
    // Only for `valign: 'top'`. The four-column reference tables are `valign:
    // 'middle'`, transcribing `array`'s `m{}` columns, and the original centres those
    // -- on its page 2 a two-line respelling sits at 173.15/167.45 against its row's
    // shared 170.30 -- so a stagger there is the reference behaviour.
    const centred = new Set(Object.values(theme.templates)
      .filter((/** @type {any} */ t) => t.valign === 'middle')
      .map((/** @type {any} */ t) => t.id));
    let paired = 0;
    for (const [index, face] of plan.faces.entries()) {
      for (const hit of face.hits) {
        if (!hit.conceptId) continue;
        if (centred.has(ctx.corpus.concepts[hit.conceptId]?.default_template)) continue;
        const { heads, cells, measurable } = firstBaselines(face, hit);
        if (!measurable) continue;
        // Two or more distinct cell signatures on the row's first line: two cells on
        // one baseline, which is the property being asserted. It has to be counted
        // separately from the head count, because once two columns *do* share a
        // baseline they group into one line and a correct row has one head, not two.
        if (cells >= 2) paired += 1;
        // 1e-6 rather than 0: a column is placed at `ascent - ownAscent` and then draws
        // at `+ ownAscent`, and `(a - b) + b` is not bit-identical to `a` in binary
        // floating point. The residual measured over all 462 pairs is under 1e-14pt.
        const delta = heads.length < 2 ? 0 : heads[heads.length - 1].y - heads[0].y;
        assert.ok(delta < 1e-6, `face ${index + 1}: the ${heads.length} columns of `
          + `${hit.conceptId} head at ${heads.map((h) => num(h.y)).join(', ')} -- `
          + `${num(delta)}pt apart, and a grid row shares one first baseline`);
      }
    }
    assert.ok(paired >= 20, `only ${paired} rows put two cells on their first baseline`);
  });
}

/**
 * Our Mandarin sheet, at the original's own configuration, as marks on a page.
 *
 * The same reader does both sides, so the comparison is like with like rather than one
 * document read through its PDF and the other through its plan.
 */
const oursPdf = await planToPdf(pinned('zh-Hans').plan, {
  loadFont: (file) => readFile(`data/fonts/${file}`), icons, date: new Date(0),
});
const oursMarks = pdfMarks(oursPdf);
// Icon outlines reach the page as stroked path segments a fraction of a point across.
// They are ink, but they are not the sheet's furniture, so they are out of a palette or
// a grid comparison -- and the original's icons come from a different family anyway.
const oursInk = oursMarks.shapes.filter((s) => s.w >= 3 && s.h >= 0.15);

test('the original sheet\'s page frame and column grid still hold', () => {
  // **Not a perceptual diff, and the measurement says why rather than a threshold being
  // tuned until it passes.** Page 1 of the original against page 1 of our Mandarin sheet
  // at 150dpi greyscale is RMSE 0.3124, with 29.5% of pixels differing. Page 1 of the
  // original against *page 2 of itself* is 0.2964, and page 2 of the original against
  // our page 1 is 0.3060 -- so a metric tuned to accept the matched pair also accepts a
  // deliberately mismatched one, and in fact prefers it. Two pages of dense 5pt type are
  // about equally different from each other whatever is on them, and the page's content
  // legitimately changed: 413 concepts became 813, and a third line of type joined every
  // row when the respelling column was filled for every pair.
  //
  // The frame did not change, and it is exact.
  assert.deepEqual(pdfPageBox(oursPdf), digest(reference.fields, 'page'), 'page box');

  // The column grid, recovered from where the ink actually is rather than from either
  // preamble: a section rule and a row accent are drawn at their column's own left edge.
  const { spec } = pinned('zh-Hans');
  const { lefts } = columnEdges(oursInk);
  const want = digest(reference.fields, 'column');
  assert.equal(lefts.length, want.length - 1, `column edges found: ${lefts.join(' ')}`);
  lefts.forEach((x, i) => assert.ok(Math.abs(x - want[i]) < 0.05,
    `column ${i + 1} starts at ${num(x)} where the original starts at ${want[i]}`));
  const box = contentBox(spec.geometry, spec.paper);
  assert.ok(Math.abs(box.colWidth - want[want.length - 1]) < 0.02,
    `column width ${num(box.colWidth)} against the original's ${want[want.length - 1]}`);

  // The outer frame: the left, right and top edges of the ink. The bottom is left out on
  // purpose -- our columns flush to the bottom margin by construction and the hand-built
  // sheet stops 3 to 10pt short of it.
  const [left, right, top] = digest(reference.fields, 'ink');
  assert.ok(Math.abs(Math.min(...oursInk.map((s) => s.x)) - left) < 0.05
    && Math.abs(Math.max(...oursInk.map((s) => s.x + s.w)) - right) < 0.05,
    `ink spans ${num(Math.min(...oursInk.map((s) => s.x)))}..`
    + `${num(Math.max(...oursInk.map((s) => s.x + s.w)))} against ${left}..${right}`);
  assert.ok(Math.abs(Math.max(...oursInk.map((s) => s.y + s.h)) - top) < 0.05,
    `ink reaches ${num(Math.max(...oursInk.map((s) => s.y + s.h)))} against the original's ${top}`);
});

test('the original sheet\'s rule weights and row rhythm are still the theme\'s own numbers', () => {
  // Two claims, both exact, and the TeX-point factor is what makes them exact rather
  // than approximate. The renderer draws the theme's numbers; the theme's numbers are
  // the original's numbers read as PostScript points instead of TeX points.
  const themeRules = [theme.templates.entry.rulePt,
    ...Object.values(theme.headings).map((/** @type {any} */ h) => h.rulePt)]
    .map(Number).sort((a, b) => a - b);
  const ourRules = [...new Set(oursInk.filter((s) => s.h < 1.2 && s.w > 100)
    .map((s) => Number(s.h.toFixed(3))))].sort((a, b) => a - b);
  assert.deepEqual(ourRules, themeRules, 'the PDF draws a rule weight the theme does not name');
  digest(reference.fields, 'rule').forEach((original, i) => {
    const ours = themeRules[i] * TEX_PT;
    assert.ok(Math.abs(ours - original) < 0.001,
      `the ${themeRules[i]}pt rule reads ${ours.toFixed(4)} in TeX points, `
      + `where the original drew ${original}`);
  });

  // The row accent, the one piece of section colour on every row. Compared as the
  // commonest narrow shape rather than the set, because an icon's stroke is narrow too.
  /** @type {Map<number, number>} */ const accents = new Map();
  for (const s of oursMarks.shapes.filter((s) => s.w < 1.5 && s.h > 3)) {
    const key = Number(s.w.toFixed(3));
    accents.set(key, (accents.get(key) ?? 0) + 1);
  }
  const ourAccent = [...accents].sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(ourAccent, Number(theme.templates.entry.accentPt), 'row accent width');
  const [originalAccent] = digest(reference.fields, 'accent');
  assert.ok(Math.abs(ourAccent * TEX_PT - originalAccent) < 0.001,
    `row accent ${ourAccent} reads ${(ourAccent * TEX_PT).toFixed(4)} in TeX points, `
    + `where the original drew ${originalAccent}`);

  // **The row rhythm, which is the one part of the original's typography that survived
  // its own `Scale=MatchLowercase` unscaled**: TeX rescales a font, never a
  // `\baselineskip`. So the two baseline steps inside a phrase row -- gloss to respell
  // and script to romanisation -- are the original's `\fontsize{}{}` second arguments
  // less its `\vskip-0.34pt`, and they are the theme's `leading` less its `rowGap`. This
  // is the number that says the type scale was transcribed rather than approximated,
  // and it is the one comparison of *typography* rather than furniture that the font
  // difference does not spoil.
  //
  // It is a claim about the theme file, not about the plan, and the difference is worth
  // knowing: `atoms.js` puts a field's baseline at its own face's ascent/descent split
  // inside a grid row as tall as that row's tallest leading, which lands the second line
  // 0.29 to 0.40pt lower than `leading - rowGap` -- and, on the row above, puts the
  // target and the gloss on baselines 0.22 to 1.24pt apart where the original's `\vtop`
  // pair shares one. Both are frozen in the four signatures rather than asserted here,
  // because the second is arguably a defect and freezing it means a fix reads as an
  // intentional diff.
  const fields = /** @type {import('../core/types.js').FieldStyle[]} */ (theme.templates.entry.fields);
  const steps = [0, ...['respell', 'roman'].map((name) => {
    const field = fields.find((f) => f.field === name);
    if (!field) throw new Error(`the entry template has no ${name} field`);
    return (field.leading + Number(theme.templates.entry.rowGap)) * TEX_PT;
  }).sort((a, b) => a - b)];
  const original = digest(reference.fields, 'baseline');
  assert.equal(original.length, steps.length, 'the digest records all three baselines');
  original.forEach((was, i) => {
    assert.ok(Math.abs(steps[i] - was) < 0.001,
      `baseline ${i + 1} of a phrase row is ${steps[i].toFixed(4)} below the first, `
      + `where the original had ${was}`);
  });
});

test('the original sheet\'s palette and section colour coding still hold', () => {
  // The palette, with two documented differences. The original paints a white rectangle
  // behind every unshaded row where we leave the paper alone, so `#FFFFFF` is dropped
  // from its side. And the original's blank-slot rules (`\rule{0.47in}{0.42pt}`, 28 of
  // them) come out pure black rather than in its own `Ink` -- an inconsistency in the
  // original, since the type beside them is `#111820`; ours draw in the theme's ink like
  // everything else, so the two are matched rather than compared.
  const ours = new Set(oursInk.map((s) => s.fill));
  const original = new Set(reference.palette
    .filter((c) => c !== '#FFFFFF')
    .map((c) => (c === '#000000' ? String(theme.colors.ink) : c)));
  assert.deepEqual([...ours].sort(), [...original].sort(), 'palette');
  for (const [role, hex] of Object.entries(theme.colors.roles)) {
    assert.ok(ours.has(String(hex)), `nothing is drawn in the ${role} section colour`);
  }
  for (const key of ['ink', 'rule', 'shade']) {
    assert.ok(ours.has(String(theme.colors[key])), `nothing is drawn in the theme's ${key}`);
  }

  // **Colour is this sheet's category cue, so which section takes which is the one
  // editorial decision in it.** The original codes by content *group*, one `\colorlet`
  // each, and that mapping is what a reader of either sheet learns: orange is money, red
  // is an emergency. `data/registry/sections.csv` carries a role per *section*, which is
  // finer -- so the property is that every section in a group still takes one colour, and
  // that it is the colour the original gave that group.
  /** @type {Map<string, Set<string>>} */ const roles = new Map();
  for (const row of sectionRows) {
    roles.set(row.group, (roles.get(row.group) ?? new Set()).add(row.color_role));
  }
  for (const [group, taken] of roles) {
    assert.equal(taken.size, 1, `group ${group} is coded in ${[...taken].join(' and ')}`);
    const was = reference.groups.get(group);
    // `slang` is the only group the original did not have. A group it did have must not
    // change colour, because that changes what the sheet means.
    if (was) assert.equal([...taken][0], was, `group ${group} changed colour`);
  }
  assert.ok([...reference.groups.keys()].every((g) => roles.has(g)),
    `a group the original coloured is gone: ${[...reference.groups.keys()].filter((g) => !roles.has(g)).join(' ')}`);
});
