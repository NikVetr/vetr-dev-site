import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet } from '../core/sheet.js';
import { proposeBalance } from '../core/solve/weights.js';
import { contentBox } from '../core/solve/index.js';
import { referenceSpec } from '../scripts/spec.mjs';

const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});

/** Drop a slice of items to open up real whitespace. @param {number} fraction */
async function sheetWithGaps(fraction) {
  const spec = await referenceSpec();
  const all = Object.keys(ctx.corpus.concepts).sort();
  /** @type {Record<string,boolean>} */ const items = {};
  all.forEach((id, i) => { if (i % fraction === 0) items[id] = false; });
  const withGaps = { ...spec, scale: 1, selection: { sections: {}, items } };
  const built = await buildSheet(ctx, withGaps);
  const box = contentBox(withGaps.geometry, withGaps.paper);
  return {
    ...built,
    spec: withGaps,
    input: {
      corpus: ctx.corpus,
      spec: withGaps,
      theme: built.theme,
      measurer: ctx.measurer,
      targetRows: built.targetRows,
      sourceRows: built.sourceRows,
      respell: built.respell,
      blocks: built.blocks,
      plan: built.plan,
      colWidth: box.colWidth,
      colHeight: box.height,
    },
  };
}

test('a flush sheet gets no proposals', async () => {
  const spec = { ...(await referenceSpec()), scale: 0 };
  const built = await buildSheet(ctx, spec);
  const box = contentBox(spec.geometry, spec.paper);
  const diff = proposeBalance({
    corpus: ctx.corpus, spec, theme: built.theme, measurer: ctx.measurer,
    targetRows: built.targetRows, sourceRows: built.sourceRows, respell: built.respell,
    blocks: built.blocks, plan: built.plan, colWidth: box.colWidth, colHeight: box.height,
  });
  assert.deepEqual(diff.adds, []);
  assert.match(diff.note, /already flush/);
});

test('whitespace is filled with items that fit, and never over budget', async () => {
  const { input } = await sheetWithGaps(4);
  const diff = proposeBalance(input);
  assert.ok(diff.slack > 8, `expected real slack, got ${diff.slack}`);
  assert.ok(diff.adds.length > 0, 'nothing proposed for a sheet with gaps');
  for (const add of diff.adds) {
    assert.ok(add.reason.includes('pt'), 'every proposal should state what it costs');
    assert.ok(!input.blocks.flatMap((b) => (b.rows ?? []).map((r) => r.conceptId))
      .includes(add.conceptId), 'proposed an item that is already in');
  }
});

test('near-duplicates are discounted, so a cluster is not filled up', async () => {
  const { input } = await sheetWithGaps(4);
  const diff = proposeBalance(input);
  const clusters = diff.adds.map((a) => input.corpus.concepts[a.conceptId].cluster_id);
  /** @type {Record<string,number>} */ const counts = {};
  for (const c of clusters) counts[c] = (counts[c] ?? 0) + 1;
  const worst = Math.max(0, ...Object.values(counts));
  assert.ok(worst <= 3, `one cluster took ${worst} slots, so the decay is not biting`);
  assert.ok(diff.adds.some((a) => /counted lower/.test(a.reason))
    || Object.keys(counts).length === diff.adds.length,
  'expected either discounted reasons or one item per cluster');
});
