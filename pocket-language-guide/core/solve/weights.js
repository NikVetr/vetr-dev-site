// Balance the columns by proposing items to add or drop.
//
// Two things make an item worth its space: how important it is on its own, and how
// much it adds to what is already there. A sheet with "Hello" on it gains little
// from "Hello (polite)" -- they answer the same need -- so an item's value is
// discounted once by every substitute already on the card.
//
// Which items substitute for which comes from `data/registry/redundancy.csv`, a
// sparse ternary table over concept pairs, with `cluster_id` standing in for the
// pairs nobody has rated yet. The two say different things and the table is the
// more precise of them: a cluster is flat and disjoint, so it cannot say that
// `toilets.water-sign`'s two rows ("drinking water" / "not for drinking") are
// opposites rather than substitutes, and it cannot say that
// `room-problems.the-toilet-will-not-flush` is word for word the row in `toilets`.
//
// Nothing is applied here. The result is a reviewable diff: the solver is guessing
// at what a traveller wants, and it should have to ask.

import { appliesTo } from '../pack.js';
import { buildAtoms } from './atoms.js';
import { breakColumns } from './columnbreak.js';

/**
 * How much of an item's value survives one rated substitute already being in.
 *
 * Ternary because that is the resolution three independent passes over the pilot
 * actually support. **The noisy judgement is whether a relation exists at all**: of
 * the 90 pairs any judge called related, only 25 were called related by all three
 * (Fleiss kappa 0.60 on that binary call). The *level* is the reliable part -- of
 * the 27 pairs all three agreed were related, 25 agreed which of the two levels it
 * was. A finer scale would be subdividing under a gate that is itself only
 * moderately reliable.
 *
 * It is also all the greedy can use: it ranks by value per point among candidates
 * whose `importance` steps by about 0.02, so "full value / a haircut / barely worth
 * the row" is the distinction that moves a decision, and a fifth of a level is not.
 * The same numbers are why `partial` is a 30% cut and not a deletion -- a relation
 * two judges of three could see should lower a row, not remove it.
 */
const RELATION_KEEP = { none: 1, partial: 0.7, duplicate: 0.35 };

/**
 * The same figure for a pair inside one `cluster_id` that nothing has rated: the
 * flat decay the table is refining, kept as the prior so that unrated sections
 * behave exactly as they did before the table existed.
 *
 * It is a prior and not a measurement, and the pilot suggests a pessimistic one:
 * five of the six rated same-cluster pairs came back `partial` (0.7) rather than
 * anything harsher, and the sixth -- "drinking water" / "not for drinking" -- is not
 * a relation at all. Corpus-wide it is worse than that: 94% of same-cluster pairs
 * are in `numbers-money.currency` and `numbers-money.misc`, which hold the number
 * line and the currency word/symbol pairs, and those are complements. Rating
 * `numbers-money` is the single highest-value thing left to do here.
 *
 * Exported because `ui/chips.js` prices the same candidates against the same table
 * and must not carry a second copy of this number.
 */
export const CLUSTER_KEEP = 0.55;

/** Ignore slivers: a column short by less than this is not worth disturbing. */
const MIN_WORTH_FILLING_PT = 8;

/**
 * @typedef {Object} BalanceInput
 * @property {Awaited<ReturnType<import('../pack.js').loadCorpus>>} corpus
 * @property {import('../types.js').SheetSpec} spec
 * @property {any} theme
 * @property {ReturnType<import('../measure.js').createMeasurer>} measurer
 * @property {ReturnType<import('../fonts.js').createFontRegistry>} registry
 * @property {Record<string,Record<string,string>>} targetRows
 * @property {Record<string,Record<string,string>>} sourceRows
 * @property {Record<string,string>} respell
 * @property {import('../types.js').Block[]} blocks       what the sheet shows now
 * @property {import('../types.js').LayoutPlan} plan      the solved sheet
 * @property {number} colWidth
 * @property {number} colHeight
 */

/**
 * @param {BalanceInput} input
 * @returns {import('../types.js').Diff & {slack:number, note:string}}
 */
export function proposeBalance(input) {
  const { corpus, spec, blocks, plan } = input;
  // A row can stand for more than one concept: two that came out as the same target
  // text are folded into one, and both are on the sheet.
  const included = new Set(blocks.flatMap(
    (b) => (b.rows ?? []).flatMap((r) => [r.conceptId, ...(r.mergedFrom ?? [])]),
  ));

  // How much room there is to play with: slack the glue could not absorb, which is
  // exactly the whitespace a reader would notice.
  const slack = plan.looseness.reduce((a, b) => a + b, 0);

  if (slack < MIN_WORTH_FILLING_PT) {
    return {
      adds: [], removes: [], slack,
      note: 'Every column is already flush. Nothing to propose.',
    };
  }

  // Candidates come from two places. Sections already on the card offer the items
  // the reader switched off individually -- proposing one back is a suggestion, not
  // an override, since nothing here is applied without a click. The larger source is
  // the seven sections `default_on: 0` keeps off the default card -- customs,
  // children, accessibility and the rest -- which the app hid rather than the
  // reader, and which are exactly what belongs in leftover space. A *section* the
  // reader turned off by hand stays off; that one was a decision.
  //
  // Every filter `buildBlocks` applies has to be applied here too, `applies_to`
  // included. Without it the candidate set was *precisely* the concepts that cannot
  // render on this pair -- the Japanese yen on a Spanish sheet -- so every proposal
  // was unaddable and ticking one changed nothing.
  const liveSections = new Set(blocks.map((b) => b.sectionId));
  const offered = corpus.sections.filter((s) => liveSections.has(s.section_id)
    || (s.default_on === '0' && spec.selection.sections[s.section_id] !== true));
  const candidates = offered
    .flatMap((s) => (corpus.conceptsByGroup[s.group] ?? [])
      .filter((c) => c.section_id === s.section_id))
    .filter((c) => !included.has(c.concept_id))
    .filter((c) => appliesTo(c, spec.target))
    // Same rule as `buildBlocks`: a reader who asked for the top of the corpus
    // should not be offered the bottom of it, with `importance 0.31` given as the
    // reason.
    .filter((c) => Number(c.importance) >= spec.priority)
    .filter((c) => input.targetRows[c.concept_id] && input.sourceRows[c.concept_id])
    .filter((c) => c.default_template !== 'note');

  if (!candidates.length) {
    return {
      adds: [], removes: [], slack,
      note: `${slack.toFixed(0)}pt of whitespace, but every available item is already in. `
        + 'Try one fewer face, or a larger type size.',
    };
  }

  const { height, headingHeight } = measureHeights(input, candidates, liveSections);

  // Greedy by value per point: the classic knapsack heuristic, and the ordering a
  // person would defend -- most useful thing that fits, then the next.
  //
  // **Re-picked every round rather than sorted once.** The objective is submodular:
  // an item's value is multiplied by a keep-factor below 1 for every substitute
  // already in, so taking one item changes what its substitutes are worth, and
  // opening a section changes what everything in that section *costs*. (A product
  // of factors in (0, 1] over a growing set is non-increasing, which is exactly the
  // diminishing-returns property the bound needs; the old flat
  // `0.55 ** clusterCount` was the special case where every factor was equal.)
  //
  // Sorting once and re-pricing while walking the fixed order got the skipping
  // right and the ordering wrong -- a sibling whose value had just been cut kept its
  // original rank, so it could still be taken ahead of an equally cheap item nothing
  // substitutes for, which is the redundancy this scorer exists to avoid. Re-selecting
  // the best each round is the textbook greedy for a monotone submodular objective
  // under a knapsack constraint, and it is what earns the (1 - 1/e) guarantee that
  // makes searching the subsets unnecessary.
  //
  // O(n) per round over a few dozen rounds, which is nothing next to one measure
  // pass -- the costs are already in hand before this starts.
  const pool = candidates
    .map((c) => ({
      concept: c,
      cost: height.get(c.concept_id) ?? Infinity,
      substitutes: substitutesOf(corpus, c),
    }))
    .filter((c) => Number.isFinite(c.cost) && c.cost > 0);

  /** @type {import('../types.js').DiffEntry[]} */ const adds = [];
  let budget = slack;
  /** What the card would carry: what it has now, plus what this pass has taken. */
  const onCard = new Set(included);
  /** Sections this pass has already paid a heading for. */
  const opened = new Set(liveSections);

  /**
   * What an item is worth and costs *now*, given what this pass has taken.
   * @param {{concept:any, cost:number, substitutes:Map<string,number>}} item
   */
  const priceNow = (item) => {
    const section = item.concept.section_id;
    // Bringing back a hidden section costs its heading as well as the row, and only
    // for the first item taken from it. Charging it keeps the estimate honest: a
    // proposal that promised to fill 12pt and actually filled 22 would overflow the
    // sheet the reader was told it would tidy.
    const overhead = opened.has(section) ? 0 : (headingHeight.get(section) ?? 0);
    let keep = 1;
    let taken = 0;
    // `factor === 1` is a pair the raters looked at and called independent. It is in
    // the map to shadow the cluster it shares, not to be counted: reporting "1
    // similar item already in" for a row whose value was not touched would be
    // telling the reader the opposite of what the table says.
    for (const [other, factor] of item.substitutes) {
      if (factor === 1 || !onCard.has(other)) continue;
      keep *= factor;
      taken += 1;
    }
    const value = Number(item.concept.importance) * keep;
    return { cost: item.cost + overhead, overhead, taken, value };
  };

  const left = new Set(pool);
  for (;;) {
    /** @type {{item:any, priced:any}|null} */ let best = null;
    let bestRatio = -Infinity;
    for (const item of left) {
      const priced = priceNow(item);
      if (priced.value < 0.15 || budget < priced.cost) continue;
      const ratio = priced.value / priced.cost;
      if (ratio > bestRatio) { bestRatio = ratio; best = { item, priced }; }
    }
    if (!best) break;
    const { item, priced } = best;
    left.delete(item);
    const section = item.concept.section_id;
    budget -= priced.cost;
    onCard.add(item.concept.concept_id);
    opened.add(section);
    adds.push({
      conceptId: item.concept.concept_id,
      sectionId: section,
      label: `${input.targetRows[item.concept.concept_id].text} — `
        + `${input.sourceRows[item.concept.concept_id].text}`,
      reason: [
        `fills ${priced.cost.toFixed(0)}pt`,
        priced.overhead ? `opens ${corpus.sectionById[section].title_en}` : '',
        priced.taken
          ? `${priced.taken} similar item(s) already in, so counted lower`
          : `importance ${Number(item.concept.importance).toFixed(2)}`,
      ].filter(Boolean).join('; '),
    });
    if (budget < MIN_WORTH_FILLING_PT) break;
  }

  if (adds.length) {
    return {
      adds,
      removes: [],
      slack,
      note: `${slack.toFixed(0)}pt of whitespace across the columns. `
        + `These ${adds.length} item(s) would use ${(slack - budget).toFixed(0)}pt of it.`,
    };
  }

  // Nothing fit. Say what the cheapest thing would have cost rather than just "no",
  // because the reader's next move depends on which it is: a near miss means one
  // fewer face or a larger type size, and a wide miss means the sheet is simply full.
  const cheapest = pool.reduce((best, item) => {
    const cost = priceNow(item).cost;
    return cost < best ? cost : best;
  }, Infinity);
  return {
    adds: [],
    removes: [],
    slack,
    note: Number.isFinite(cheapest) && cheapest > slack
      ? `${slack.toFixed(0)}pt of whitespace, and the smallest thing left to add needs `
        + `${cheapest.toFixed(0)}pt — a row plus the heading of the section it lives in. `
        + 'One fewer face, or a larger type size, would take up the space instead.'
      : `${slack.toFixed(0)}pt of whitespace, but nothing left is worth the space.`,
  };
}

/**
 * Everything that would make this concept worth less, and how much of its value
 * each one leaves. Sparse by construction -- most concepts substitute for nothing
 * at all, so most of these maps are empty and the loop that reads them is free.
 *
 * A rated pair wins over the cluster it may also share, in both directions: a
 * cluster-mate the raters called `none` keeps its full value, and a pair in two
 * different clusters that the raters called `duplicate` is discounted even though
 * `cluster_id` has no way to say so.
 * @param {BalanceInput['corpus']} corpus
 * @param {Record<string,string>} concept
 * @returns {Map<string,number>}
 */
export function substitutesOf(corpus, concept) {
  /** @type {Map<string,number>} */ const out = new Map();
  const rated = corpus.redundancy[concept.concept_id] ?? {};
  for (const [other, relation] of Object.entries(rated)) {
    out.set(other, RELATION_KEEP[/** @type {keyof typeof RELATION_KEEP} */ (relation)]);
  }
  for (const other of corpus.conceptsByCluster[concept.cluster_id] ?? []) {
    if (other !== concept.concept_id && !out.has(other)) out.set(other, CLUSTER_KEEP);
  }
  return out;
}

/**
 * Height each candidate would occupy, measured rather than guessed: item heights
 * vary by several points depending on whether the text wraps. Also the height of
 * each hidden section's heading, since bringing one back costs that too.
 *
 * Grouped by section as well as by template. It used to group by template alone and
 * take the section from the first candidate in the group, which gave every other
 * section in that group the wrong colour role and the wrong alternating shade --
 * measured against a row style the sheet would never draw.
 * @param {BalanceInput} input
 * @param {Record<string,string>[]} candidates
 * @param {Set<string>} liveSections  sections already on the card
 * @returns {{height:Map<string,number>, headingHeight:Map<string,number>}}
 */
function measureHeights(input, candidates, liveSections) {
  const { corpus, spec, theme, measurer, registry, colWidth, plan } = input;
  /** @type {Map<string,number>} */ const height = new Map();
  /** @type {Map<string,number>} */ const headingHeight = new Map();

  /** @param {import('../types.js').Block[]} blocks */
  const probe = (blocks) => buildAtoms({
    blocks, theme, spec, corpus, measurer, registry, colWidth,
    scale: plan.scale, withPaint: false,
  });

  /** @type {Map<string, Record<string,string>[]>} */ const groups = new Map();
  for (const c of candidates) {
    const key = `${c.section_id}\u0000${c.default_template}`;
    groups.set(key, (groups.get(key) ?? []).concat(c));
  }

  // Headings are measured on their own. Put one in the same probe as its rows and
  // `buildAtoms` fuses it with the first two of them -- that is the keep-with-next
  // rule, and it is right for the sheet -- which would leave the row heights
  // misaligned with the candidates they belong to.
  for (const sectionId of new Set(candidates.map((c) => c.section_id))) {
    if (liveSections.has(sectionId)) continue;
    const section = corpus.sectionById[sectionId];
    const atoms = probe([{
      kind: 'heading',
      sectionId,
      colorRole: section.color_role,
      stretch: 0,
      level: /** @type {1|2|3} */ (Number(section.default_level)),
      text: section.title_en,
      icon: section.icon || null,
    }]);
    headingHeight.set(sectionId, atoms[0]?.height ?? 0);
  }

  for (const group of groups.values()) {
    const section = corpus.sectionById[group[0].section_id];
    const atoms = probe([{
      kind: 'items',
      sectionId: section.section_id,
      colorRole: section.color_role,
      stretch: 0,
      templateId: group[0].default_template,
      rows: group.map((c) => ({
        conceptId: c.concept_id,
        weight: Number(c.importance),
        values: {
          script: input.targetRows[c.concept_id].text,
          roman: input.targetRows[c.concept_id][`romanization_${spec.romanization}`] ?? '',
          ipa: input.targetRows[c.concept_id].ipa || '',
          gloss: input.sourceRows[c.concept_id].text,
          numeral: input.sourceRows[c.concept_id].text,
          respell: input.respell[c.concept_id] ?? '',
        },
      })),
    }]);
    // With no heading in the probe there is nothing to fuse, so this is one atom
    // per row, in order.
    atoms.forEach((atom, i) => {
      if (group[i]) height.set(group[i].concept_id, atom.height);
    });
  }
  return { height, headingHeight };
}

/**
 * Whether a set of changes actually fits. Used after the reader edits the proposal,
 * because accepting a subset can still overflow.
 * @param {BalanceInput} input
 * @param {import('../types.js').Block[]} blocks
 * @returns {boolean}
 */
export function fits(input, blocks) {
  const atoms = buildAtoms({
    blocks, theme: input.theme, spec: input.spec, corpus: input.corpus,
    measurer: input.measurer, registry: input.registry, colWidth: input.colWidth,
    scale: input.plan.scale, withPaint: false,
  });
  const bins = input.spec.geometry.faces * input.spec.geometry.columns;
  return !breakColumns(atoms, input.colHeight, bins).failure;
}
