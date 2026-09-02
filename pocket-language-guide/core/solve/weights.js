// Balance the columns by proposing items to add or drop.
//
// Two things make an item worth its space: how important it is on its own, and how
// much it adds to what is already there. A sheet with "Hello" on it gains little
// from "Hello (polite)" -- they answer the same need -- so value decays with each
// item already chosen from the same coverage cluster. That is the whole point of
// cluster_id in the corpus.
//
// Nothing is applied here. The result is a reviewable diff: the solver is guessing
// at what a traveller wants, and it should have to ask.

import { appliesTo } from '../pack.js';
import { buildAtoms } from './atoms.js';
import { breakColumns } from './columnbreak.js';

/** Value of the k-th item taken from one cluster, relative to the first. */
const CLUSTER_DECAY = 0.55;

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

  /** How many items from each cluster are already in. */
  /** @type {Record<string,number>} */ const clusterUse = {};
  for (const id of included) {
    const cluster = corpus.concepts[id]?.cluster_id;
    if (cluster) clusterUse[cluster] = (clusterUse[cluster] ?? 0) + 1;
  }

  /** @param {Record<string,string>} concept */
  const valueOf = (concept) => {
    const used = clusterUse[concept.cluster_id] ?? 0;
    return Number(concept.importance) * CLUSTER_DECAY ** used;
  };

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
  const ranked = candidates
    .map((c) => ({ concept: c, value: valueOf(c), cost: height.get(c.concept_id) ?? Infinity }))
    .filter((c) => Number.isFinite(c.cost) && c.cost > 0)
    .sort((a, b) => b.value / b.cost - a.value / a.cost);

  /** @type {import('../types.js').DiffEntry[]} */ const adds = [];
  let budget = slack;
  /** @type {Record<string,number>} */ const takenFromCluster = { ...clusterUse };
  /** Sections this pass has already paid a heading for. */
  const opened = new Set(liveSections);
  for (const item of ranked) {
    const section = item.concept.section_id;
    // Bringing back a hidden section costs its heading as well as the row, and only
    // for the first item taken from it. Charging it keeps the estimate honest: a
    // proposal that promised to fill 12pt and actually filled 22 would overflow the
    // sheet the reader was told it would tidy.
    const overhead = opened.has(section) ? 0 : (headingHeight.get(section) ?? 0);
    const cost = item.cost + overhead;
    if (budget < cost) continue;
    const cluster = item.concept.cluster_id;
    // Re-price against choices made earlier in this same pass.
    const taken = takenFromCluster[cluster] ?? 0;
    const value = Number(item.concept.importance) * CLUSTER_DECAY ** taken;
    if (value < 0.15) continue;
    budget -= cost;
    takenFromCluster[cluster] = taken + 1;
    opened.add(section);
    adds.push({
      conceptId: item.concept.concept_id,
      sectionId: section,
      label: `${input.targetRows[item.concept.concept_id].text} — `
        + `${input.sourceRows[item.concept.concept_id].text}`,
      reason: [
        `fills ${cost.toFixed(0)}pt`,
        overhead ? `opens ${corpus.sectionById[section].title_en}` : '',
        taken
          ? `${taken} similar item(s) already in, so counted lower`
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
  const cheapest = ranked.reduce((best, item) => {
    const cost = item.cost
      + (opened.has(item.concept.section_id) ? 0 : headingHeight.get(item.concept.section_id) ?? 0);
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
