import { readFileSync } from 'node:fs';
import { predict, validateCatalog } from './core.mjs';
const { catalog, profiles } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
validateCatalog(catalog);
for (const model of Object.keys(catalog.models)) {
  for (const personalized of [false, true]) {
    let n = 0,
      squared = 0,
      logLoss = 0,
      brier = 0;
    for (const { ratings, targets } of Object.values(profiles)) {
      const { predictions } = predict(catalog, { model, ratings: personalized ? ratings : {}, threshold: 4 });
      for (const p of predictions) {
        if (!Object.hasOwn(targets, p.itemId)) continue;
        const truth = targets[p.itemId];
        squared += (p.expected - truth) ** 2;
        logLoss -= Math.log(p.probabilities[catalog.scale.indexOf(truth)]);
        brier += (p.chance - Number(truth >= 4)) ** 2;
        n++;
      }
    }
    console.log({
      model,
      personalized,
      users: Object.keys(profiles).length,
      n,
      rmse: Math.sqrt(squared / n),
      logLoss: logLoss / n,
      brier: brier / n,
    });
  }
}
