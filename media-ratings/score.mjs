// Per-respondent metrics for identical reveal/target masks across all candidates.
import { readFileSync, writeFileSync } from 'node:fs';
import { predict, validateCatalog } from './core.mjs';
const { catalog, profiles, threshold } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
validateCatalog(catalog);
const scores = [];
for (const model of Object.keys(catalog.models)) {
  let n = 0,
    logLoss = 0,
    mse = 0,
    brier = 0;
  for (const { ratings, targets } of profiles) {
    const { predictions } = predict(catalog, { model, ratings, threshold });
    const count = Object.keys(targets).length;
    n += count;
    for (const p of predictions) {
      if (!Object.hasOwn(targets, p.itemId)) continue;
      const truth = targets[p.itemId];
      logLoss -= Math.log(p.probabilities[catalog.scale.indexOf(truth)]) / count;
      mse += (p.expected - truth) ** 2 / count;
      brier += (p.chance - Number(truth >= threshold)) ** 2 / count;
    }
  }
  if (!Number.isFinite(logLoss + mse + brier)) throw new Error('Non-finite validation score for ' + model);
  const users = profiles.length;
  scores.push({ model, users, targets: n, logLoss: logLoss / users, mse: mse / users, brier: brier / users });
}
writeFileSync(process.argv[3], JSON.stringify(scores));
