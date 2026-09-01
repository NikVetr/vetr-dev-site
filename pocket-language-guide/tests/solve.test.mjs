import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet, loadFontsFor } from '../core/sheet.js';
import { loadLanguage, loadRespellOverrides, buildBlocks } from '../core/pack.js';
import { buildAtoms } from '../core/solve/atoms.js';
import { breakColumns } from '../core/solve/columnbreak.js';
import { distribute } from '../core/solve/justify.js';
import { contentBox } from '../core/solve/index.js';
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

test('at the fitted scale, glue absorbs all slack so columns flush top and bottom', async () => {
  const { plan } = await buildSheet(ctx, { ...spec, scale: 0 });
  const worst = Math.max(...plan.looseness);
  assert.ok(worst < 1, `worst unabsorbed slack ${worst.toFixed(2)}pt`);
});

test('a column too loose to flush is reported rather than quietly left ragged', async () => {
  // Deliberately under-fill: half the sections at full size cannot flush 16 columns.
  const sections = Object.fromEntries(
    ctx.corpus.sections.filter((_, i) => i % 2).map((s) => [s.section_id, false]),
  );
  const { plan } = await buildSheet(ctx, { ...spec, selection: { sections, items: {} } });
  const loose = Math.max(...plan.looseness, 0);
  if (loose > 1) {
    assert.ok(plan.warnings.some((w) => w.code === 'loose-columns'),
      'unabsorbed slack was not reported');
  }
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
  // The reference sheet arrived at four by hand; auto should agree.
  assert.equal(plan.faces.length, 4);
  assert.equal(plan.geometry.faces, 4);
  assert.equal(plan.faces.length % 2, 0, 'a sheet is two faces, so the count must be even');
  assert.ok(plan.scale > 0.7 && plan.scale <= 1, `scale ${plan.scale}`);
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
  assert.ok(codes.includes('no-fit') || codes.includes('break-failed'),
    `expected a failure warning, got ${codes.join(', ')}`);
  const fixes = plan.warnings.flatMap((w) => w.fixes ?? []).map((f) => f.label);
  assert.ok(fixes.length > 0, 'a failure should come with something to do about it');
  assert.ok(fixes.some((l) => /page count follow/.test(l)),
    `expected an auto-faces remedy, got ${fixes.join(' | ')}`);
});

test('auto reproduces the hand-built originals at their own spacing', async () => {
  // Both reference sheets settled on four faces by hand. They were typeset with
  // almost no padding -- consecutive rows held apart by a 0.22pt rule -- which is
  // `padding: 0`. At that spacing the solver must still reach four, because
  // matching the originals is the acceptance criterion for the whole engine.
  for (const [target, source] of [['zh-Hans', 'en'], ['ja', 'en'], ['en', 'ja']]) {
    const { plan } = await buildSheet(ctx, {
      ...(await referenceSpec(target, source)), scale: 0, padding: 0,
    });
    assert.equal(plan.faces.length, 4, `${target} <- ${source}`);
    assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
  }
});

test('asking for more padding costs paper, never legibility', async () => {
  // The densest pair cannot hold its content on four faces once the text is given
  // room to breathe, so auto takes a pair rather than shrinking the type toward
  // its floor. That is the intended trade and the reason padding is a control.
  const base = { ...(await referenceSpec('ja', 'en')), scale: 0 };
  const tight = (await buildSheet(ctx, { ...base, padding: 0 })).plan;
  const roomy = (await buildSheet(ctx, { ...base, padding: 1.6 })).plan;
  assert.equal(tight.faces.length, 4);
  assert.ok(roomy.faces.length > tight.faces.length,
    `padding should buy faces: ${tight.faces.length} -> ${roomy.faces.length}`);
  assert.ok(roomy.scale > tight.scale,
    `and the type should not get smaller: ${tight.scale} -> ${roomy.scale}`);
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
