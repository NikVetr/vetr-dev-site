import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet, loadFontsFor } from '../core/sheet.js';
import { proposeBalance, substitutesOf } from '../core/solve/weights.js';
import { contentBox } from '../core/solve/index.js';
import { parseTable } from '../core/csv.js';
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
  /** @type {Record<string,string[]>} */ const byCluster = {};
  for (const add of diff.adds) {
    const cluster = input.corpus.concepts[add.conceptId].cluster_id;
    (byCluster[cluster] ??= []).push(add.conceptId);
  }
  // **A cap on slots per cluster was the wrong invariant, and the table is why.**
  // This asserted `worst <= 3` and now fails at 5: the five are 0, 1, 8, 9 and 10,
  // the digits this harness punched out of the number line, and putting them back
  // is the correct answer rather than a decay that stopped biting.
  // `numbers-money.misc` is one `cluster_id` of complements, so what the test should
  // require is that the pass only fills a cluster up where the *table* says its
  // members do not substitute -- three or fewer otherwise.
  for (const [cluster, ids] of Object.entries(byCluster)) {
    if (ids.length <= 3) continue;
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        assert.equal(input.corpus.redundancy[a]?.[b], 'none',
          `${cluster} took ${ids.length} slots, and ${a} x ${b} is `
          + `${input.corpus.redundancy[a]?.[b] ?? 'unrated'} rather than independent`);
      }
    }
  }
  // "or at least one proposal says `counted lower`" used to be asserted here too.
  // It no longer holds and should not: on this sheet the pass reaches only cheap
  // reference rows and nothing it takes has a substitute already in, which is the
  // right outcome and not a broken discount. That the discount fires, and says so,
  // is `a rated substitute cuts a proposal` below, on a sheet that reaches the
  // rated pairs.
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

/**
 * The counting sequence, as the priority ladder and the section picker both have to
 * be able to cut it: a *prefix*. `0 1 2 4 6` is a broken card, and the only thing
 * that stops a value-ranking greedy producing one is that no digit discounts
 * another -- if 3 were worth less for 2 being present it would sort below rows from
 * other sections and the sequence would come back with holes in it.
 *
 * `numbers-money.misc` is one `cluster_id`, so before the table said otherwise the
 * flat prior discounted every digit by every other one. `scripts/build_redundancy.py`
 * asserts these pairs `none` by rule (`number-line`), and three independent passes
 * over a sample of 11 of them agreed.
 */
test('no digit of the number line discounts another', async () => {
  const { corpus } = ctx;
  // By the English gloss, not the slug: every number row's `slug_en` is `item`.
  const english = parseTable(await readFile('data/lang/en/numbers.csv', 'utf8'), 'en');
  const digits = english
    .filter((r) => /^\d$|^10$/.test(r.text))
    .map((r) => corpus.concepts[r.concept_id])
    .filter((c) => c.section_id === 'numbers-money');
  assert.equal(digits.length, 11, `expected 0-10, found ${digits.length}`);
  for (const a of digits) {
    const substitutes = substitutesOf(corpus, a);
    for (const b of digits) {
      if (a === b) continue;
      assert.equal(substitutes.get(b.concept_id), 1,
        `${a.slug_en} discounts ${b.slug_en} by ${substitutes.get(b.concept_id)}, `
        + 'so a budget cut can perforate the number line');
    }
  }
});

/**
 * A currency word and its `-symbol` row have to carry *one* relation between them,
 * whatever that relation is. They are 31 pairs of identical shape, so a table that
 * rated some and asserted others at a different level would price the yen and the
 * euro differently for no reason in the world -- which is exactly what happened
 * while the rule said `none` and the raters said `partial`, until the rule was
 * corrected to what the passes measured.
 *
 * This does not assert *which* level: that is the raters' to change. It asserts the
 * pairs are all in the table and all agree. Note what no keep-factor can do,
 * though: `scripts/validate_data.py` separately requires the two rows to have the
 * same `applies_to`, because "both or neither" is a constraint and this table holds
 * marginal value. A budget that ranks by value orphans currency words; measured
 * corpus-wide it orphans about one per target.
 */
test('a currency word and its symbol carry one relation', () => {
  const { corpus } = ctx;
  const pairs = Object.values(corpus.concepts)
    .filter((c) => corpus.concepts[`${c.concept_id}-symbol`])
    .map((c) => [c.concept_id, `${c.concept_id}-symbol`]);
  assert.ok(pairs.length > 20, `expected the currency pairs, found ${pairs.length}`);
  const levels = new Set();
  for (const [word, symbol] of pairs) {
    const relation = corpus.redundancy[word]?.[symbol];
    assert.ok(relation, `${word} x ${symbol} has no row, so the flat cluster prior `
      + 'decides it -- and the prior is the thing the table exists to replace');
    levels.add(relation);
  }
  assert.equal(levels.size, 1,
    `the word/symbol pairs carry ${[...levels].join(' and ')}; one shape, one relation`);
});

/** A flush card with one weaker duplicate and a valuable absent alternative. */
async function exchangeFixture() {
  const spec = await referenceSpec();
  await loadFontsFor(ctx, spec.target, spec.source);
  const section = { section_id: 'exchange', group: 'social', color_role: 'comm',
    default_level: '1', title_en: 'Exchange', default_on: '1' };
  const concept = (/** @type {string} */ id, /** @type {number} */ importance) => ({
    concept_id: id, section_id: 'exchange', default_template: 'entry',
    importance: String(importance), cluster_id: id,
  });
  const concepts = { weak: concept('weak', 0.8), keep: concept('keep', 0.95), better: concept('better', 0.84) };
  const corpus = { ...ctx.corpus, sections: [section], sectionById: { exchange: section },
    concepts, conceptsByGroup: { social: Object.values(concepts) },
    conceptsByCluster: {}, redundancy: { weak: { keep: 'duplicate' }, keep: { weak: 'duplicate' } } };
  const rows = { weak: { text: 'Maybe' }, keep: { text: 'Yes' }, better: { text: 'Help' } };
  const blocks = /** @type {import('../core/types.js').Block[]} */ ([{
    kind: 'items', sectionId: 'exchange', colorRole: 'comm', stretch: 0, templateId: 'entry',
    rows: /** @type {('weak'|'keep')[]} */ (['weak', 'keep']).map((id) => ({ conceptId: id, weight: Number(concepts[id].importance),
      values: { script: rows[id].text, gloss: rows[id].text } })),
  }]);
  return /** @type {any} */ ({ ...ctx, corpus, spec: { ...spec, selection: { sections: {}, items: {} } },
    theme: await ctx.theme(spec.themeId), targetRows: rows, sourceRows: rows, respell: {}, blocks,
    colWidth: 100, colHeight: 300, allowRemovals: true,
    plan: { scale: 1, looseness: [0], faces: [{ hits: [{ conceptId: 'weak', h: 100 }] }] } });
}

test('a flush card can offer one higher-value swap without modifying its selection', async () => {
  const input = await exchangeFixture();
  const before = JSON.stringify(input.spec.selection);
  const diff = proposeBalance(input);
  assert.deepEqual(diff.removes.map((r) => r.conceptId), ['weak']);
  assert.deepEqual(diff.adds.map((r) => r.conceptId), ['better']);
  assert.equal(JSON.stringify(input.spec.selection), before);
  assert.equal(proposeBalance({ ...input, allowRemovals: false }).removes.length, 0);
});

test('removal proposals protect emergency, high-importance, personal and explicitly picked rows', async () => {
  const input = await exchangeFixture();
  const check = () => assert.equal(proposeBalance(input).removes.length, 0);
  input.spec.selection.items.weak = true;
  check();
  delete input.spec.selection.items.weak;
  input.edits = { extras: [], overrides: { weak: { values: { gloss: 'Mine' } } } };
  check();
  delete input.edits;
  input.corpus.concepts.weak.importance = '0.85';
  check();
  input.corpus.concepts.weak.importance = '0.8';
  input.corpus.sectionById.exchange.group = 'emergency';
  check();
  input.corpus.sectionById.exchange.group = 'social';
  input.blocks[0].rows[0].mergedFrom = ['another'];
  check();
});

test('a redundant row can be offered for optional removal when no replacement exists', async () => {
  const input = await exchangeFixture();
  delete input.corpus.concepts.better;
  const diff = proposeBalance(input);
  assert.equal(diff.adds.length, 0);
  assert.equal(diff.removes[0].conceptId, 'weak');
  assert.match(diff.removes[0].reason, /similar wording is already included/);
  assert.match(diff.note, /Optionally remove/);
});

test('an unrated cluster cannot justify dropping a complementary row or a marginal swap', async () => {
  const input = await exchangeFixture();
  input.corpus.redundancy = {};
  input.corpus.concepts.weak.cluster_id = 'compass';
  input.corpus.concepts.keep.cluster_id = 'compass';
  input.corpus.conceptsByCluster = { compass: ['weak', 'keep'] };
  // The prior cuts .80 to .44; the absent .84 row would look much better if
  // ranking discount alone were enough to discard an independent direction.
  assert.deepEqual(proposeBalance(input).removes, []);
  delete input.corpus.concepts.better;
  assert.deepEqual(proposeBalance(input).removes, []);
});

test('a replacement without duplicate evidence must improve undiscounted importance', async () => {
  const input = await exchangeFixture();
  input.corpus.redundancy = {};
  input.corpus.concepts.weak.importance = '0.4';
  const diff = proposeBalance(input);
  assert.equal(diff.removes[0].conceptId, 'weak');
  assert.equal(diff.adds[0].conceptId, 'better');
  assert.match(diff.removes[0].reason, /lower priority/);
});

test('reviewing a swap at fixed geometry refuses addition alone and accepts its matching removal', async () => {
  const base = await referenceSpec('es', 'en');
  const spec = { ...base, autoFaces: false, scale: 1, region: '',
    geometry: { ...base.geometry, pageW: 120, pageH: 90, columns: 1, faces: 1 },
    selection: {
      sections: Object.fromEntries(ctx.corpus.sections.map((s) => [s.section_id, s.section_id === 'social-basics'])),
      items: Object.fromEntries(Object.values(ctx.corpus.concepts)
        .filter((c) => c.section_id === 'social-basics').map((c) => [c.concept_id, false])),
    } };
  const edits = { overrides: {}, extras: [
    { conceptId: 'custom.old', sectionId: 'social-basics', template: 'entry', weight: 1,
      values: { script: 'Please help me now '.repeat(3), gloss: 'Please help me now '.repeat(3) } },
    { conceptId: 'custom.new', sectionId: 'social-basics', template: 'entry', weight: 1,
      values: { script: 'Please show me how '.repeat(3), gloss: 'Please show me how '.repeat(3) } },
  ] };
  const review = (/** @type {boolean} */ old, /** @type {boolean} */ added) => buildSheet(ctx, {
    ...spec, selection: { ...spec.selection,
      items: { ...spec.selection.items, 'custom.old': old, 'custom.new': added } },
  }, edits);
  assert.equal((await review(true, false)).plan.faces.length, 1);
  const withoutRemoval = await review(true, true);
  assert.equal(withoutRemoval.plan.faces.length, 0);
  assert.ok(withoutRemoval.plan.warnings.some((w) => w.severity === 'error'));
  assert.equal((await review(false, true)).plan.faces.length, 1);
  assert.equal(edits.extras.length, 2, 'a removal only changes inclusion, never authored content');
});
