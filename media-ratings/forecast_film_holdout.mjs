// Emit one aligned probability block per respondent, using the browser's scoring engine.
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { predict, validateCatalog } from './core.mjs';

const [catalogPath, ...models] = process.argv.slice(2);
const catalog = validateCatalog(JSON.parse(readFileSync(catalogPath, 'utf8')));
for await (const line of createInterface({input: process.stdin, crlfDelay: Infinity})) {
  const {ratings, ratedOn, targets} = JSON.parse(line);
  const ids = Object.keys(targets);
  if (!ids.length || ids.some(id => Object.hasOwn(ratings, id))) throw new Error('Invalid target mask');
  const truth = ids.map(id => catalog.scale.indexOf(targets[id]));
  if (truth.includes(-1)) throw new Error('Target outside the catalog scale');
  const forecasts = Object.fromEntries(models.map(model => {
    const {predictions} = predict(catalog, {model, ratings, ratedOn, volunteered: Object.keys(ratings)});
    const byId = new Map(predictions.map(p => [p.itemId, p.probabilities]));
    if (predictions.length !== byId.size || ids.some(id => !byId.has(id))) throw new Error('Missing or duplicate forecast');
    return [model, ids.map(id => byId.get(id))];
  }));
  if (!process.stdout.write(JSON.stringify({truth, forecasts}) + '\n')) await once(process.stdout, 'drain');
}
