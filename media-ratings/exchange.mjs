import { validRatingDate } from './calendar.mjs';
import { parseTable, serialize, stripFormulaGuard } from '../pocket-language-guide/core/csv.js';

export const ratingSources = {
  volunteered: 'Picked by me',
  suggested: 'App suggestion',
  unknown: 'Unspecified',
};

export function ratingsCSV(catalog, ratings, sources = null, ratedOn = null) {
  return serialize(
    ['catalog', 'itemId', 'title', 'rating', ...(sources ? ['source'] : []), ...(ratedOn ? ['ratedOn'] : [])],
    catalog.items
      .filter((i) => Object.hasOwn(ratings, i.itemId))
      .map((i) => ({
        catalog: catalog.name,
        ...i,
        rating: String(ratings[i.itemId]),
        source: sources?.[i.itemId] ?? 'unknown',
        ratedOn: ratedOn?.[i.itemId] ?? '',
      })),
  );
}
export function importRatings(text, catalog) {
  return importRatingEntries(text, catalog).ratings;
}
export function importRatingEntries(text, catalog) {
  const sources = Object.create(null),
    ratedOn = Object.create(null);
  const entries = parseTable(text, 'Ratings CSV'),
    items = new Set(catalog.items.map((i) => i.itemId));
  if (!entries.length) throw new Error('Ratings CSV is empty.');
  const ratings = Object.create(null);
  for (const [i, row] of entries.entries()) {
    const id = stripFormulaGuard(row.itemId ?? ''),
      raw = stripFormulaGuard(row.rating ?? '').trim(),
      value = Number(raw);
    if (
      (row.catalog && stripFormulaGuard(row.catalog) !== catalog.name) ||
      !items.has(id) ||
      !raw ||
      !catalog.scale.includes(value) ||
      Object.hasOwn(ratings, id)
    )
      throw new Error(
        'Row ' + (i + 2) + ' requires a unique itemId and a rating on the current catalog scale.',
      );
    const source = row.source?.trim();
    if (source) {
      if (!Object.hasOwn(ratingSources, source))
        throw new Error('Unknown rating source in row ' + (i + 2) + '.');
      sources[id] = source;
    }
    if (row.ratedOn !== undefined) {
      const date = row.ratedOn.trim();
      if (date && !validRatingDate(date))
        throw new Error('Expected a YYYY-MM-DD rating date in row ' + (i + 2) + '.');
      ratedOn[id] = date;
    }
    ratings[id] = value;
  }
  return { ratings, sources, ratedOn };
}
export function forecastsCSV(catalog, result, model) {
  const header = [
    'catalog',
    'model',
    'itemId',
    'title',
    'expected',
    'prior',
    'shift',
    'sd',
    'cutoff',
    'probabilityAtCutoff',
    ...catalog.scale.map((v) => 'P(' + v + ')'),
  ];
  const lines = [header.join(',')];
  for (const p of result.predictions) {
    // Apply spreadsheet formula guards to text fields. Keep signed statistics numeric.
    const names = header.slice(0, 4),
      fields = serialize(names, [{ catalog: catalog.name, model, itemId: p.itemId, title: p.title }]);
    const textFields = fields.slice(fields.indexOf('\r\n') + 2).replace(/\r?\n$/, '');
    lines.push(
      [textFields, p.expected, p.prior, p.shift, p.sd, result.threshold, p.chance, ...p.probabilities].join(
        ',',
      ),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
export function saveCSV(name, text) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Imported forecasts are a saved model output, kept separately from supplied ratings.
export function importForecasts(text, catalog) {
  const rows = parseTable(text, 'Predictions CSV'),
    ids = new Set(catalog.items.map((it) => it.itemId)),
    seen = new Set();
  if (!rows.length) throw new Error('Predictions CSV is empty.');
  return rows.map((row, i) => {
    const id = stripFormulaGuard(row.itemId ?? '');
    const read = (key) => {
      const raw = stripFormulaGuard(row[key] ?? '').trim(),
        n = Number(raw);
      if (!raw || !Number.isFinite(n))
        throw new Error('Invalid ' + key + ' in prediction row ' + (i + 2) + '.');
      return n;
    };
    if (stripFormulaGuard(row.catalog ?? '') !== catalog.name || !row.model || !ids.has(id) || seen.has(id))
      throw new Error('Prediction rows must identify unique entries in the current catalog.');
    seen.add(id);
    const expected = read('expected'),
      prior = read('prior'),
      shift = read('shift'),
      sd = read('sd'),
      cutoff = read('cutoff'),
      chance = read('probabilityAtCutoff'),
      probs = catalog.scale.map((v) => read('P(' + v + ')'));
    const impliedMean = probs.reduce((sum, p, j) => sum + p * catalog.scale[j], 0);
    const impliedVariance = probs.reduce((sum, p, j) => sum + p * (catalog.scale[j] - impliedMean) ** 2, 0);
    const impliedChance = probs.reduce((sum, p, j) => sum + (catalog.scale[j] >= cutoff ? p : 0), 0);
    const tolerance = 1e-6 * Math.max(1, catalog.scale.at(-1) - catalog.scale[0]);
    if (
      !catalog.scale.includes(cutoff) ||
      probs.some((p) => p < 0 || p > 1 + 1e-8) ||
      Math.abs(probs.reduce((a, b) => a + b, 0) - 1) > 1e-6 ||
      Math.abs(expected - impliedMean) > tolerance ||
      Math.abs(sd - Math.sqrt(impliedVariance)) > tolerance ||
      Math.abs(chance - impliedChance) > 1e-6 ||
      prior < catalog.scale[0] - tolerance ||
      prior > catalog.scale.at(-1) + tolerance ||
      sd < 0 ||
      chance < 0 ||
      chance > 1 + 1e-8 ||
      Math.abs(expected - prior - shift) > 1e-6
    )
      throw new Error('Invalid distribution or score in prediction row ' + (i + 2) + '.');
    return {
      itemId: id,
      expected,
      prior,
      shift,
      sd,
      cutoff,
      chance,
      probs,
      model: stripFormulaGuard(row.model),
    };
  });
}
