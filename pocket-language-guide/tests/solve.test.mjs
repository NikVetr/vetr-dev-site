import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet, loadFontsFor } from '../core/sheet.js';
import { loadLanguage, loadRespellOverrides, buildBlocks } from '../core/pack.js';
import { buildAtoms } from '../core/solve/atoms.js';
import { breakColumns } from '../core/solve/columnbreak.js';
import { distribute } from '../core/solve/justify.js';
import { contentBox, COMFORT, LOOSE_FRACTION } from '../core/solve/index.js';
import { referenceSpec } from '../scripts/spec.mjs';

const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});
const spec = await referenceSpec();
const box = contentBox(spec.geometry, spec.paper);

await loadFontsFor(ctx, spec.target, spec.source);
const theme = await ctx.theme(spec.themeId);
const targetRows = await loadLanguage(ctx.loadText, spec.target, ctx.corpus.groups);
const sourceRows = await loadLanguage(ctx.loadText, spec.source, ctx.corpus.groups);
const respell = await loadRespellOverrides(ctx.loadText, spec.target, spec.source, spec.accent);
const blocks = buildBlocks({ corpus: ctx.corpus, targetRows, sourceRows, respell, spec });
// The spec asks for auto faces, so the resolved count comes back on the plan.
const solved = (await buildSheet(ctx, spec)).plan;
const bins = solved.geometry.faces * solved.geometry.columns;
const atoms = buildAtoms({
  blocks, theme, spec: { ...spec, geometry: solved.geometry }, corpus: ctx.corpus,
  measurer: ctx.measurer, registry: ctx.registry, colWidth: box.colWidth,
  scale: solved.scale, withPaint: true,
});

test('content box reproduces the reference geometry', () => {
  // The reference sheet was printed borderless, with the margins in its own
  // preamble and nothing taken off for a printer's dead zone. That is what these
  // two numbers are: 1.662in columns and the full height between its margins.
  // Asserted against a zero-inset paper rather than whatever the app defaults to,
  // because the default is a safety decision -- it currently keeps 8.5pt clear of
  // the ET-8550's bordered edge -- and this test is about the geometry maths.
  const bare = { ...spec.paper, borderless: true, oversprayPct: 0, nonprintablePt: 0 };
  const reference = contentBox(spec.geometry, bare);
  assert.ok(Math.abs(reference.colWidth - 119.66) < 0.01, `colWidth ${reference.colWidth}`);
  assert.ok(Math.abs(reference.height - 347.76) < 0.01, `height ${reference.height}`);
});

test('the shipped default keeps clear of the printer edge', () => {
  // And the default the app actually renders insets by that dead zone, which is
  // the difference the gallery thumbnails used to get wrong.
  assert.equal(spec.paper.presetId, 'et8550-5x7-photo-bordered');
  assert.ok(spec.paper.nonprintablePt > 0, 'the bordered preset has a dead zone');
  assert.ok(box.height < 347.76, `height ${box.height} should be inset`);
});

test('no heading can be stranded: each is bound to the rows it introduces', () => {
  const headings = atoms.filter((a) => a.kind === 'heading');
  assert.equal(headings.length, blocks.filter((b) => b.kind === 'heading').length);
  atoms.forEach((atom, i) => {
    if (atom.kind !== 'heading' || !atoms[i + 1] || atoms[i + 1].kind === 'heading') return;
    assert.ok(atom.keepWithNext, `heading ${atom.sectionId} is not bound to its rows`);
  });
  // And the breaker honours the binding, so no column ends on a bound atom.
  for (const col of breakColumns(atoms, box.height, bins).columns) {
    const end = col.at(-1);
    if (end === undefined) continue;
    assert.ok(!atoms[end].keepWithNext,
      `column ends at atom ${end} in ${atoms[end].sectionId}, mid keep-with-next`);
  }
});

test('the rows opening a section sit at the same pitch as the rest of it', () => {
  // The binding above used to be a merge: a heading and its first two rows became
  // one atom, so the gaps between them were frozen at their natural size while
  // every later gap in the column stretched to flush the bottom. The first two
  // rows of every section printed measurably tighter than the rest, which is only
  // visible once the paint is placed -- a merge hides it from the atom list
  // entirely, which is why this test reads the finished plan.
  for (const face of solved.faces) {
    /** @type {Map<string, typeof face.hits>} */ const columns = new Map();
    for (const hit of face.hits) {
      if (!hit.conceptId) continue;
      const key = `${hit.x.toFixed(1)}\u0000${hit.sectionId}`;
      columns.set(key, (columns.get(key) ?? []).concat(hit));
    }
    for (const [key, run] of columns) {
      if (run.length < 3) continue;
      const gap = (/** @type {number} */ i) => run[i + 1].y - (run[i].y + run[i].h);
      assert.ok(Math.abs(gap(0) - gap(1)) < 0.6,
        `${key}: opening gap ${gap(0).toFixed(2)}pt against ${gap(1).toFixed(2)}pt`);
    }
  }
});

test('every atom fits a column, and each is placed exactly once', () => {
  const tooTall = atoms.filter((a) => a.height > box.height);
  assert.deepEqual(tooTall, []);
  const broken = breakColumns(atoms, box.height, bins);
  assert.equal(broken.failure, null);
  const placed = broken.columns.flat();
  assert.equal(placed.length, atoms.length);
  assert.ok(placed.every((v, i) => v === i), 'atom order was not preserved');
});

test('no column overflows its height', () => {
  const broken = breakColumns(atoms, box.height, bins);
  broken.columns.forEach((col, i) => {
    const used = col.reduce(
      (sum, k, n) => sum + atoms[k].height + (n ? atoms[k].gapBefore.natural : 0),
      0,
    );
    assert.ok(used <= box.height + 0.01, `column ${i} used ${used} of ${box.height}`);
  });
});

test('at the fitted scale, glue absorbs the slack in all but the last pair', async () => {
  const { plan } = await buildSheet(ctx, { ...spec, scale: 0 });
  const columns = plan.geometry.columns;
  // Faces come in pairs and the content does not divide evenly into them, so the
  // final pair carries whatever is left over. Every column before it must flush.
  const full = plan.looseness.slice(0, -2 * columns);
  const worst = Math.max(...full, 0);
  assert.ok(worst < 1, `worst unabsorbed slack outside the last pair ${worst.toFixed(2)}pt`);
  // And even there the shortfall stays a small fraction of a column, rather than
  // leaving a visibly empty one.
  const box = contentBox(plan.geometry, spec.paper);
  const tail = Math.max(...plan.looseness.slice(-2 * columns), 0);
  assert.ok(tail < box.height * 0.25, `last pair left ${tail.toFixed(1)}pt unabsorbed`);
});

test('a column too loose to flush is reported rather than quietly left ragged', async () => {
  // Deliberately under-fill, with an eighth of the sections. It was a quarter, and
  // before that a half; each time the sheet learned to absorb more slack the old
  // fraction stopped under-filling and this test started passing without ever
  // exercising the thing it is about. The guard below is what catches that.
  const sections = Object.fromEntries(
    ctx.corpus.sections.filter((_, i) => i % 8).map((s) => [s.section_id, false]),
  );
  const { plan } = await buildSheet(ctx, { ...spec, selection: { sections, items: {} } });
  // Judged against the engine's own threshold rather than a number of our own: a
  // point or two of residue is invisible, and the engine only speaks up past
  // LOOSE_FRACTION of a column. Excluding the trailing columns for the same
  // reason it does -- a sheet's content does not end on a column boundary, so the
  // last column with anything in it is short by nature and not a fault.
  const box = contentBox(plan.geometry, spec.paper);
  const lastUsed = plan.looseness.length - 1
    - [...plan.looseness].reverse().findIndex((r) => r < box.height - 1e-6);
  const loose = plan.looseness
    .filter((r, bin) => bin < lastUsed && r > box.height * LOOSE_FRACTION).length;
  assert.ok(loose > 0, 'this selection was supposed to under-fill');
  assert.ok(plan.warnings.some((w) => w.code === 'loose-columns'),
    `${loose} loose column(s) went unreported`);
});

test('a note in a spaceless script wraps inside its own box', async () => {
  // A note is prose in the reader's language, and its break class was hardcoded
  // to 'space'. Japanese and Chinese have none, so the whole paragraph was a
  // single unbreakable run and painted straight past the right edge of its shaded
  // box. Nothing downstream re-measures a placed run, so it was invisible except
  // on the page -- three translators hit it and wrote around it by hand.
  const conceptId = 'numbers-money.number-and-classifier-notes';
  const pair = { ...spec, target: 'zh-Hans', source: 'ja' };
  const { plan } = await buildSheet(ctx, pair, {
    overrides: {
      [conceptId]: { values: { gloss: '\u6570\u306e\u4f5c\u308a\u65b9'.repeat(40) }, include: true },
    },
    extras: [],
  });
  const box = contentBox(plan.geometry, pair.paper);
  const pitch = box.colWidth + plan.geometry.columnGap;
  /** @param {import('../core/types.js').TextRun} run */
  const overshoot = (run) => {
    const parts = /^(.*)-(\d+)(i?)$/.exec(run.fontId);
    if (!parts) throw new Error(`unparsable face id ${run.fontId}`);
    const width = ctx.measurer.width(run.text, {
      stack: parts[1],
      weight: Number(parts[2]),
      italic: parts[3] === 'i',
      size: run.size,
      leading: run.size,
      dir: run.dir,
      wordBreak: 'space',
      slotAsRule: false,
    });
    const column = Math.round((run.x - box.left) / pitch);
    return run.x + width - (box.left + column * pitch + box.colWidth);
  };
  const runs = plan.faces.flatMap((f) => f.runs);
  assert.ok(runs.length, 'the sheet rendered nothing to check');
  const worst = Math.max(...runs.map(overshoot));
  assert.ok(worst < 0.01, `a run runs ${worst.toFixed(2)}pt past its column`);
});

test('distribute respects per-gap ceilings and reports what it cannot place', () => {
  const gaps = [
    { natural: 0, stretch: 1, max: 3 },
    { natural: 0, stretch: 1, max: 3 },
  ];
  const easy = distribute(gaps, 4);
  assert.deepEqual(easy.extra, [2, 2]);
  assert.equal(easy.residual, 0);

  const capped = distribute(gaps, 10);
  assert.deepEqual(capped.extra, [3, 3]);
  assert.equal(capped.residual, 4);

  const weighted = distribute([{ natural: 0, stretch: 3, max: 99 }, { natural: 0, stretch: 1, max: 99 }], 8);
  assert.deepEqual(weighted.extra, [6, 2]);
});

test('solving twice gives byte-identical output', async () => {
  const a = await buildSheet(ctx, spec);
  const b = await buildSheet(ctx, spec);
  assert.equal(JSON.stringify(a.plan), JSON.stringify(b.plan));
});

test('auto faces picks the fewest pairs that hold the content legibly', async () => {
  const { plan } = await buildSheet(ctx, spec);
  // Not a fixed number: the corpus grows, and the point of auto is that the count
  // follows the content. What must hold is that it is a whole number of
  // double-sided sheets, that it stopped as soon as the type was comfortable, and
  // that one pair fewer genuinely would not have done.
  assert.equal(plan.faces.length % 2, 0, 'a sheet is two faces, so the count must be even');
  assert.equal(plan.geometry.faces, plan.faces.length);
  assert.ok(plan.scale >= COMFORT, `settled at ${plan.scale}, below comfort`);
  assert.ok(plan.scale <= 1, `auto should not exceed nominal, got ${plan.scale}`);
  const tighter = await buildSheet(ctx, {
    ...spec, autoFaces: false, geometry: { ...spec.geometry, faces: plan.faces.length - 2 },
  });
  assert.ok(tighter.plan.faces.length === 0
      || tighter.plan.scale < COMFORT
      || tighter.plan.warnings.some((w) => w.severity === 'error'),
  `${plan.faces.length - 2} faces would have been comfortable at ${tighter.plan.scale}`);
  assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
});

test('auto-fit never inflates type past the theme\'s own sizes', async () => {
  // Above nominal it is not an improvement, and for a CJK target it wraps entries
  // that fit on one line at the designed size. Leftover room becomes glue instead.
  for (const [target, source] of [['en', 'ja'], ['en', 'zh-Hans'], ['zh-Hans', 'ja']]) {
    const { plan } = await buildSheet(ctx, { ...(await referenceSpec(target, source)), scale: 0 });
    assert.ok(plan.scale <= 1 + 1e-9, `${target} <- ${source} auto-fitted to ${plan.scale}`);
  }
  // An explicit request still gets bigger type than nominal.
  const big = await buildSheet(ctx, { ...spec, scale: 1.3 });
  assert.ok(big.plan.scale > 1, `explicit 1.3x gave ${big.plan.scale}`);
});

test('bigger type means more faces, not a broken sheet', async () => {
  const small = await buildSheet(ctx, { ...spec, scale: 0.9 });
  const large = await buildSheet(ctx, { ...spec, scale: 1.3 });
  assert.ok(large.plan.faces.length > small.plan.faces.length,
    `${large.plan.faces.length} should exceed ${small.plan.faces.length}`);
  for (const plan of [small.plan, large.plan]) {
    assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
    assert.equal(plan.faces.length % 2, 0);
  }
});

test('a fixed face count is honoured rather than overridden', async () => {
  // `autoFaces: false` is the pin; a number in the geometry alone is only the
  // anchor auto starts from, and this test used to assert on that instead -- so it
  // was really asserting where auto happened to land, and broke the moment the
  // default padding changed.
  const { plan } = await buildSheet(ctx, {
    ...spec, autoFaces: false, geometry: { ...spec.geometry, faces: 6 }, scale: 0,
  });
  assert.equal(plan.faces.length, 6);
  assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
});

test('a pinned face count with too little room is reported, not truncated', async () => {
  const cramped = {
    ...spec,
    autoFaces: false,
    geometry: { ...spec.geometry, faces: 2, columns: 2 },
    scale: 0,
  };
  const { plan } = await buildSheet(ctx, cramped);
  const codes = plan.warnings.map((w) => w.code);
  assert.ok(codes.some((c) => c.startsWith('no-fit')) || codes.includes('break-failed'),
    `expected a failure warning, got ${codes.join(', ')}`);
  const fixes = plan.warnings.flatMap((w) => w.fixes ?? []).map((f) => f.label);
  assert.ok(fixes.length > 0, 'a failure should come with something to do about it');
  assert.ok(fixes.some((l) => /page count follow/.test(l)),
    `expected an auto-faces remedy, got ${fixes.join(' | ')}`);
});

test('auto reproduces the hand-built originals at their own spacing', async () => {
  // Both reference sheets settled on four faces by hand, typeset with almost no
  // padding -- consecutive rows held apart by a 0.22pt rule -- which is
  // `padding: 0`. Reproducing that is the acceptance criterion for the engine.
  //
  // The comparison has to be against the *original content*, not against whatever
  // the default sheet currently holds: the corpus went from 413 concepts to 755,
  // so the default legitimately needs six faces now, and asserting four on it
  // would only be measuring the corpus size. The reviewed rows are identifiable by
  // provenance, so the selection is narrowed to exactly the hand-built sheet.
  for (const [target, source] of [['zh-Hans', 'en'], ['ja', 'en'], ['en', 'ja']]) {
    const spec0 = { ...(await referenceSpec(target, source)), scale: 0, padding: 0 };
    const rows = await loadLanguage(ctx.loadText, target, ctx.corpus.groups);
    /** @type {Record<string, boolean>} */ const items = {};
    let original = 0;
    for (const [cid, row] of Object.entries(rows)) {
      const reviewed = !/agent|expansion/.test(row.provenance ?? '');
      if (reviewed) original += 1;
      else items[cid] = false;
    }
    assert.ok(original > 300, `${target}: only ${original} reviewed rows`);
    const { plan } = await buildSheet(ctx, {
      ...spec0, selection: { sections: {}, items },
    });
    assert.equal(plan.faces.length, 4, `${target} <- ${source}`);
    assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
  }
});

test('asking for more padding costs paper, never legibility', async () => {
  // Given room to breathe, content that no longer fits takes another pair of faces
  // rather than shrinking the type toward its floor. That is the intended trade and
  // the whole reason padding is a control rather than a constant.
  const base = { ...(await referenceSpec('zh-Hans', 'en')), scale: 0 };
  const tight = (await buildSheet(ctx, { ...base, padding: 0 })).plan;
  const roomy = (await buildSheet(ctx, { ...base, padding: 3.6 })).plan;
  assert.ok(roomy.faces.length >= tight.faces.length,
    `padding should never buy fewer faces: ${tight.faces.length} -> ${roomy.faces.length}`);
  assert.ok(roomy.faces.length > tight.faces.length || roomy.scale <= tight.scale,
    'if the face count held, the type must have absorbed the padding');
  assert.ok(roomy.scale >= COMFORT,
    `type fell below comfort at ${roomy.scale} instead of taking paper`);
});

test('each field shrinks toward its own floor, not in lockstep', async () => {
  // The Japanese sheet only fits four faces because its Latin respellings go
  // smaller than its Japanese does -- which a single multiplier cannot express.
  const { plan } = await buildSheet(ctx, { ...(await referenceSpec('ja', 'en')), scale: 0 });
  const sizes = plan.faces.flatMap((f) => f.runs.map((r) => ({ font: r.fontId, size: r.size })));
  const latin = Math.min(...sizes.filter((s) => s.font.startsWith('latin')).map((s) => s.size));
  const japanese = Math.min(...sizes.filter((s) => s.font.startsWith('cjk')).map((s) => s.size));
  assert.ok(latin < japanese, `latin ${latin.toFixed(2)}pt should go below japanese ${japanese.toFixed(2)}pt`);
  assert.ok(latin >= 4.4 - 0.01, `latin ${latin.toFixed(2)}pt below its 4.4pt floor`);
  assert.ok(japanese >= 5.0 - 0.01, `japanese ${japanese.toFixed(2)}pt below its 5.0pt floor`);
});

test('an empty selection reports itself instead of measuring as NaN', async () => {
  /** @type {Record<string, boolean>} */ const off = {};
  for (const s of ctx.corpus.sections) off[s.section_id] = false;
  const { plan } = await buildSheet(ctx, {
    ...spec, selection: { ...spec.selection, sections: off },
  });
  assert.ok(plan.looseness.every(Number.isFinite), `looseness ${plan.looseness}`);
  assert.equal(plan.looseness.length, plan.geometry.faces * plan.geometry.columns);
  assert.ok(plan.warnings.some((w) => w.code === 'nothing-selected'));
});
