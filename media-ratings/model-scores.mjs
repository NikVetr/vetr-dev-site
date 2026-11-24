import { node, scoreText } from './detail.mjs';
import { filmScoreFields, fourStarGap } from './film-validation.mjs';

export function filmScores(report, key) {
  const row = report.models[key];
  const {people, ratings} = report.confirmation;
  return {
    menuScore: 'loss ' + row.logLoss.toFixed(4) + ' · gap ' + fourStarGap(row),
    preview: 'Log loss ' + row.logLoss.toFixed(4) + ' · Four-star gap ' + fourStarGap(row),
    metrics: filmScoreFields.map(([name, format]) => [name, format(row)]),
    sample: 'MovieLens 2022–23 · ' + people.toLocaleString() + ' people supplied four dated ratings each. ' +
      'The models predicted ' + ratings.toLocaleString() + ' later ratings.',
    note: 'Lower loss and error scores are better. The four-star gap is the weighted mean absolute difference between predicted and observed rates across ten probability bands, in percentage points. Predictive coverage should be close to 90% after adjusting for ties.',
  };
}

export function catalogScores(catalog, key) {
  const selection = catalog.selection;
  const model = catalog.models[key];
  const missing = (reason) => ({preview: 'Scores unavailable', menuScore: 'no holdout score', metrics: [], sample: reason, note: ''});
  if (!Array.isArray(selection?.holdout)) return missing('This catalog has no model-specific evaluation.');
  let row;
  if (selection.pooling && model.prior) {
    return missing('The published class-only scores used the earlier fixed prior. The updated Steam fit was evaluated with game tags.');
  } else if (selection.pooling && key === catalog.defaultModel) {
    const {playerLogLoss, playerBrier} = selection.pooling.holdout;
    row = {logLoss: playerLogLoss, brier: playerBrier, rmse: Math.sqrt(playerBrier)};
  } else if (model.kind === 'class-similarity' && selection.model === key) {
    // These catalogs publish the validation-selected adjustment under its candidate label.
    row = selection.holdout.find(r => r.label === selection.cv?.[0]?.label);
  } else if (model.kind === 'latent-class') {
    const k = model.components.length;
    const label = 'Latent class, K=' + k;
    row = selection.holdout.find(r => r.label === label || r.label === label + ', prior=' + model.strength ||
      (r.k === k && r.activityShrinkage === selection.activityShrinkage));
  } else if (model.kind === 'logit-point' || model.kind === 'ordinal-probit') {
    const label = model.kind === 'logit-point' ? 'Historical logit reference' : 'Ordinal probit, K=' + model.components.length;
    row = selection.holdout.find(r => r.label === label);
  }
  if (!row || ![row.logLoss, row.rmse, row.brier].every(Number.isFinite))
    return missing('The catalog has no matching held-out scores for this model.');
  return {
    menuScore: 'loss ' + scoreText(row.logLoss, 4),
    preview: 'Log loss ' + scoreText(row.logLoss, 4),
    metrics: [['Log loss', scoreText(row.logLoss, 4)], ['RMSE', scoreText(row.rmse, 4)], ['Brier score', scoreText(row.brier, 4)]],
    sample: 'Held-out evaluation · ' + selection.testUsers.toLocaleString() + ' respondents and ' +
      selection.testRatings.toLocaleString() + ' recorded observations.',
    note: 'Lower scores are better. This evaluation reports no calibration gap or predictive interval coverage.',
  };
}

export function renderModelScores(preview, details, scores) {
  preview.textContent = scores.preview;
  details.replaceChildren();
  if (scores.metrics.length) {
    const list = node('dl');
    for (const [label, value] of scores.metrics) {
      const item = node('div');
      item.append(node('dt', label), node('dd', value));
      list.append(item);
    }
    details.append(list);
  }
  details.append(node('p', scores.sample));
  if (scores.note) details.append(node('p', scores.note));
}
