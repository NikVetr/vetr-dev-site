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
  const included = new Set(blocks.flatMap((b) => (b.rows ?? []).map((r) => r.conceptId)));

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

  // Candidates: items this pair can render, in sections the reader has left on,
  // that are currently switched off. A section the reader turned off stays off --
  // that was a decision, not an oversight.
  const liveSections = new Set(blocks.map((b) => b.sectionId));
  const candidates = corpus.sections
    .filter((s) => liveSections.has(s.section_id))
    .flatMap((s) => (corpus.conceptsByGroup[s.group] ?? [])
      .filter((c) => c.section_id === s.section_id))
    .filter((c) => !included.has(c.concept_id))
    .filter((c) => input.targetRows[c.concept_id] && input.sourceRows[c.concept_id])
    .filter((c) => c.default_template !== 'note');

  if (!candidates.length) {
    return {
      adds: [], removes: [], slack,
      note: `${slack.toFixed(0)}pt of whitespace, but every available item is already in. `
        + 'Try one fewer face, or a larger type size.',
    };
  }

  const height = measureHeights(input, candidates);

  // Greedy by value per point: the classic knapsack heuristic, and the ordering a
  // person would defend -- most useful thing that fits, then the next.
  const ranked = candidates
    .map((c) => ({ concept: c, value: valueOf(c), cost: height.get(c.concept_id) ?? Infinity }))
    .filter((c) => Number.isFinite(c.cost) && c.cost > 0)
    .sort((a, b) => b.value / b.cost - a.value / a.cost);

  /** @type {import('../types.js').DiffEntry[]} */ const adds = [];
  let budget = slack;
  /** @type {Record<string,number>} */ const takenFromCluster = { ...clusterUse };
  for (const item of ranked) {
    if (budget < item.cost) continue;
    const cluster = item.concept.cluster_id;
    // Re-price against choices made earlier in this same pass.
    const taken = takenFromCluster[cluster] ?? 0;
    const value = Number(item.concept.importance) * CLUSTER_DECAY ** taken;
    if (value < 0.15) continue;
    budget -= item.cost;
    takenFromCluster[cluster] = taken + 1;
    adds.push({
      conceptId: item.concept.concept_id,
      sectionId: item.concept.section_id,
      label: `${input.targetRows[item.concept.concept_id].text} — `
        + `${input.sourceRows[item.concept.concept_id].text}`,
      reason: taken
        ? `fills ${item.cost.toFixed(0)}pt; ${taken} similar item(s) already in, so counted lower`
        : `fills ${item.cost.toFixed(0)}pt; importance ${Number(item.concept.importance).toFixed(2)}`,
    });
    if (budget < MIN_WORTH_FILLING_PT) break;
  }

  return {
    adds,
    removes: [],
    slack,
    note: adds.length
      ? `${slack.toFixed(0)}pt of whitespace across the columns. `
        + `These ${adds.length} item(s) would use ${(slack - budget).toFixed(0)}pt of it.`
      : `${slack.toFixed(0)}pt of whitespace, but nothing left is worth the space.`,
  };
}

/**
 * Height each candidate would occupy, measured rather than guessed: item heights
 * vary by several points depending on whether the text wraps.
 * @param {BalanceInput} input
 * @param {Record<string,string>[]} candidates
 * @returns {Map<string,number>}
 */
function measureHeights(input, candidates) {
  const { corpus, spec, theme, measurer, colWidth, plan } = input;
  /** @type {Map<string,number>} */ const out = new Map();

  // One synthetic block per template, so each candidate is measured in the shape
  // it would actually be drawn in.
  /** @type {Record<string, Record<string,string>[]>} */ const byTemplate = {};
  for (const c of candidates) {
    (byTemplate[c.default_template] ??= []).push(c);
  }

  for (const [templateId, group] of Object.entries(byTemplate)) {
    const section = corpus.sectionById[group[0].section_id];
    /** @type {import('../types.js').Block[]} */
    const probe = [{
      kind: 'items',
      sectionId: section.section_id,
      colorRole: section.color_role,
      stretch: 0,
      templateId,
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
    }];
    const atoms = buildAtoms({
      blocks: probe, theme, spec, corpus, measurer, colWidth,
      scale: plan.scale, withPaint: false,
    });
    // buildAtoms emits one atom per row for an items block, in order.
    atoms.forEach((atom, i) => {
      if (group[i]) out.set(group[i].concept_id, atom.height);
    });
  }
  return out;
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
    measurer: input.measurer, colWidth: input.colWidth, scale: input.plan.scale,
    withPaint: false,
  });
  const bins = input.spec.geometry.faces * input.spec.geometry.columns;
  return !breakColumns(atoms, input.colHeight, bins).failure;
}
