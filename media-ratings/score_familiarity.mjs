// Select the nearest-title boost on held-out people using the same ranking code as the browser.
import { readFileSync, writeFileSync } from 'node:fs';
import { familiarityRanks } from './questions.mjs';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const ids = input.catalog.items.map((it) => it.itemId);
function coverage(profiles, strengths) {
  const scores = new Map(strengths.map((s) => [s, []]));
  for (const { given, recorded } of profiles) {
    const rated = Object.fromEntries(given.map((id) => [id, 1]));
    const other = ids.filter((id) => !Object.hasOwn(rated, id));
    const known = new Set(recorded);
    for (const [strength, hits] of scores) {
      const ranks = familiarityRanks(input.catalog, rated, strength);
      const top = [...other].sort((a, b) => ranks.get(b) - ranks.get(a)).slice(0, 20);
      hits.push(top.filter((id) => known.has(id)).length / top.length);
    }
  }
  return scores;
}
function mean(rows) {
  return rows.reduce((a, b) => a + b, 0) / rows.length;
}
const grid = [0, 0.5, 1, 2, 4];
const validation = coverage(input.validation, grid);
const summary = Array.from(validation, ([strength, values]) => ({ strength, recordedInTop20: mean(values) }));
const selected = summary.reduce((a, b) => (a.recordedInTop20 >= b.recordedInTop20 ? a : b)).strength;
const test = coverage(input.test, [0, selected]);
const deltas = test.get(selected).map((value, i) => value - test.get(0)[i]);
const difference = mean(deltas);
const halfWidth =
  1.96 *
  Math.sqrt(deltas.reduce((s, d) => s + (d - difference) ** 2, 0) / (deltas.length * (deltas.length - 1)));
writeFileSync(
  process.argv[3],
  JSON.stringify(
    {
      trainingRespondents: input.trainingRespondents,
      validationRespondents: input.validation.length,
      testRespondents: input.test.length,
      given: 4,
      outcome:
        'Fraction of the top 20 suggested titles with another recorded MovieLens rating by the same respondent',
      validation: summary,
      selected,
      test: {
        counts: mean(test.get(0)),
        withProximity: mean(test.get(selected)),
        difference,
        ci95: [difference - halfWidth, difference + halfWidth],
      },
    },
    null,
    2,
  ) + '\n',
);
