import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet } from '../core/sheet.js';
import { proposeBalance, substitutesOf } from '../core/solve/weights.js';
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
  // Pin the geometry and the type size so the gaps come from the missing items
  // rather than from auto quietly choosing a different page count.
  const withGaps = {
    ...spec,
    geometry: { ...spec.geometry, faces: 4 },
    scale: 1,
    selection: { sections: {}, items },
  };
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
      registry: ctx.registry,
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
  // Asserted against a flush plan rather than against the default sheet. Faces come
  // in pairs, so the default now has real slack in its last pair and proposing
  // items for it is the correct answer -- which made this test measure the corpus
  // size instead of the rule it is about.
  const spec = await referenceSpec();
  const built = await buildSheet(ctx, spec);
  built.plan = { ...built.plan, looseness: built.plan.looseness.map(() => 0) };
  const box = contentBox(spec.geometry, spec.paper);
  const diff = proposeBalance({
    corpus: ctx.corpus,
    // The resolved geometry, since the spec asked for auto faces.
    spec: { ...spec, geometry: built.plan.geometry },
    theme: built.theme,
    measurer: ctx.measurer,
    registry: ctx.registry,
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

test('the redundancy table says what cluster_id cannot', () => {
  const { corpus } = ctx;
  /** @type {Record<string,number>} */ const keep = { none: 1, partial: 0.7, duplicate: 0.35 };
  let crossCluster = 0;
  let contradictsCluster = 0;
  for (const [a, partners] of Object.entries(corpus.redundancy)) {
    assert.ok(corpus.concepts[a], `redundancy.csv names ${a}, which is not a concept`);
    for (const [b, relation] of Object.entries(partners)) {
      // Stored once per pair in id order, so the loader has to mirror it: a pair
      // recorded one way round would discount one of the two and not the other.
      assert.equal(corpus.redundancy[b]?.[a], relation, `${a} x ${b} is one-way`);
      assert.equal(substitutesOf(corpus, corpus.concepts[a]).get(b), keep[relation],
        `${a} x ${b} is rated ${relation} but does not price like one`);
      const sameCluster = corpus.concepts[a].cluster_id === corpus.concepts[b].cluster_id;
      if (!sameCluster) crossCluster += 1;
      if (sameCluster && relation === 'none') contradictsCluster += 1;
    }
  }
  // These two are the whole argument for a pair table over a flat group: a relation
  // between two clusters cannot be written as a cluster, and neither can the
  // *absence* of one inside a cluster -- `toilets.water-sign` holds "drinking water"
  // and "not for drinking", which are opposites and not substitutes at all.
  assert.ok(crossCluster > 0, 'every rated relation is inside one cluster, so the '
    + 'sparse table is buying nothing over cluster_id');
  assert.ok(contradictsCluster > 0, 'nothing in the table contradicts a cluster');
});

test('an unrated pair in one cluster keeps the flat cluster prior', () => {
  const { corpus } = ctx;
  const pair = Object.values(corpus.conceptsByCluster)
    .filter((ids) => ids.length > 1)
    .flatMap((ids) => ids.slice(1).map((b) => [ids[0], b]))
    .find(([a, b]) => !corpus.redundancy[a]?.[b]);
  assert.ok(pair, 'no unrated cluster left to check the fallback with');
  assert.equal(substitutesOf(corpus, corpus.concepts[pair[0]]).get(pair[1]), 0.55);
});

/**
 * One row of one section on two faces: 2,700pt of slack, so the pass walks far
 * enough down the corpus to reach the pairs the pilot actually rated. The gappy
 * sheet above never does -- it fills its 250pt with cheap one-word reference rows,
 * none of which the pilot covers.
 */
async function nearlyEmptySheet() {
  const spec0 = await referenceSpec();
  /** @type {Record<string,boolean>} */ const sections = {};
  for (const s of ctx.corpus.sections) sections[s.section_id] = s.section_id === 'toilets';
  /** @type {Record<string,boolean>} */ const items = {};
  for (const c of Object.values(ctx.corpus.concepts)) {
    if (c.section_id === 'toilets' && c.concept_id !== 'toilets.accessible-toilet') {
      items[c.concept_id] = false;
    }
  }
  const spec = {
    ...spec0,
    geometry: { ...spec0.geometry, faces: 2 },
    scale: 1,
    selection: { sections, items },
  };
  const built = await buildSheet(ctx, spec);
  const box = contentBox(spec.geometry, spec.paper);
  return {
    corpus: ctx.corpus,
    spec,
    theme: built.theme,
    measurer: ctx.measurer,
    registry: ctx.registry,
    targetRows: built.targetRows,
    sourceRows: built.sourceRows,
    respell: built.respell,
    blocks: built.blocks,
    plan: built.plan,
    colWidth: box.colWidth,
    colHeight: box.height,
  };
}

test('a rated substitute cuts a proposal, and the reason says so', async () => {
  const input = await nearlyEmptySheet();
  const diff = proposeBalance(input);
  // Grown in proposal order, because the pass discounts against what it has already
  // taken as well as against what the card came with -- that is the submodularity.
  const onCard = new Set(input.blocks.flatMap(
    (b) => (b.rows ?? []).flatMap((r) => [r.conceptId, ...(r.mergedFrom ?? [])]),
  ));
  let byTable = 0;
  for (const add of diff.adds) {
    const concept = input.corpus.concepts[add.conceptId];
    const cut = [...substitutesOf(input.corpus, concept)]
      .filter(([id, f]) => f < 1 && onCard.has(id));
    assert.equal(/counted lower/.test(add.reason), cut.length > 0,
      `${add.conceptId} has ${cut.length} substitute(s) in, and says "${add.reason}"`);
    byTable += cut.filter(([id]) => input.corpus.redundancy[add.conceptId]?.[id]
      && input.corpus.concepts[id].cluster_id !== concept.cluster_id).length;
    onCard.add(add.conceptId);
  }
  // Not just that the discount fires, but that it fires on a pair no `cluster_id`
  // could have held -- `toilets.may-i-have-the-toilet-key` against
  // `building-words.key`, two sections apart. That is the whole point of the table.
  assert.ok(byTable > 0, 'no proposal was cut by a cross-cluster rated relation');
});
