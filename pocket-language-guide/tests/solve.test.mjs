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
const bins = spec.geometry.faces * spec.geometry.columns;

await loadFontsFor(ctx, spec.target, spec.source);
const theme = await ctx.theme(spec.themeId);
const targetRows = await loadLanguage(ctx.loadText, spec.target, ctx.corpus.groups);
const sourceRows = await loadLanguage(ctx.loadText, spec.source, ctx.corpus.groups);
const respell = await loadRespellOverrides(ctx.loadText, spec.target, spec.source, spec.accent);
const blocks = buildBlocks({ corpus: ctx.corpus, targetRows, sourceRows, respell, spec });
const atoms = buildAtoms({
  blocks, theme, spec, corpus: ctx.corpus, measurer: ctx.measurer,
  colWidth: box.colWidth, scale: 1, withPaint: true,
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

test('auto-fit reaches the requested face count', async () => {
  const { plan } = await buildSheet(ctx, { ...spec, scale: 0 });
  assert.equal(plan.faces.length, spec.geometry.faces);
  assert.ok(plan.scale > 0.9 && plan.scale < 1.3, `scale ${plan.scale}`);
  assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
});

test('too little room is reported, not silently truncated', async () => {
  const cramped = {
    ...spec,
    geometry: { ...spec.geometry, faces: 1, columns: 2 },
    scale: 0,
  };
  const { plan } = await buildSheet(ctx, cramped);
  const codes = plan.warnings.map((w) => w.code);
  assert.ok(codes.includes('no-fit') || codes.includes('break-failed'),
    `expected a failure warning, got ${codes.join(', ')}`);
});
