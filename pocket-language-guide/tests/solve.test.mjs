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
  assert.ok(Math.abs(box.colWidth - 119.66) < 0.01, `colWidth ${box.colWidth}`);
  assert.ok(Math.abs(box.height - 347.76) < 0.01, `height ${box.height}`);
});

test('no heading can be stranded: each is fused with the rows it introduces', () => {
  const headings = atoms.filter((a) => a.kind === 'heading');
  assert.equal(headings.length, blocks.filter((b) => b.kind === 'heading').length);
  for (const h of headings) {
    // A fused heading carries its own rule plus the rows' backgrounds and rules.
    assert.ok((h.paint?.hits.length ?? 0) > 1, `heading ${h.sectionId} absorbed no rows`);
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
  // Deliberately under-fill. A quarter of the sections, not a half: the corpus has
  // grown enough that half of it still fills every column, which would make this
  // test pass without ever exercising the thing it is about.
  const sections = Object.fromEntries(
    ctx.corpus.sections.filter((_, i) => i % 4).map((s) => [s.section_id, false]),
  );
  const { plan } = await buildSheet(ctx, { ...spec, selection: { sections, items: {} } });
  // Judged against the engine's own threshold rather than a number of our own: a
  // point or two of residue is invisible, and the engine only speaks up past
  // LOOSE_FRACTION of a column.
  const box = contentBox(plan.geometry, spec.paper);
  const loose = plan.looseness.filter((r) => r > box.height * LOOSE_FRACTION).length;
  assert.ok(loose > 0, 'this selection was supposed to under-fill');
  assert.ok(plan.warnings.some((w) => w.code === 'loose-columns'),
    `${loose} loose column(s) went unreported`);
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
  const { plan } = await buildSheet(ctx, {
    ...spec, geometry: { ...spec.geometry, faces: 6 }, scale: 0,
  });
  assert.equal(plan.faces.length, 6);
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
