import { modelEvidence } from './evidence.mjs';

// Counts are in catalog item and rating-scale order within each calendar year.
export function validRatingDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

export function latestRatingDate(dates) {
  return Object.values(dates).reduce((latest, date) => (date > latest ? date : latest), '');
}

export function calibrationYear(calendar, date) {
  return Math.max(calendar.firstYear, Math.min(calendar.lastYear, Number(date.slice(0, 4))));
}

const calendarFits = new WeakMap();
export function populationModel(catalog, selected, date = '') {
  const base = selected.kind === 'class-similarity' ? catalog.models[selected.base] : selected;
  const calendar = modelEvidence(catalog, selected, 'ratingYear');
  if (!calendar || !date) return base;
  const year = calibrationYear(calendar, date);
  if (!calendarFits.has(calendar)) calendarFits.set(calendar, new WeakMap());
  const byBase = calendarFits.get(calendar);
  const levels = catalog.scale.length;
  if (!byBase.has(base)) {
    const pooled = new Float64Array(catalog.items.length * levels).fill(1 / levels);
    for (const counts of calendar.counts) {
      for (let j = 0; j < pooled.length; j++) pooled[j] += counts[j];
    }
    for (let offset = 0; offset < pooled.length; offset += levels) {
      const row = pooled.subarray(offset, offset + levels);
      const total = row.reduce((a, b) => a + b);
      for (let j = 0; j < levels; j++) row[j] /= total;
    }
    byBase.set(base, { pooled, years: new Map() });
  }
  const { pooled, years } = byBase.get(base);
  if (!years.has(year)) {
    const counts = calendar.counts[year - calendar.firstYear];
    // Shrink the year's category counts with 100 pseudo-ratings from the
    // film's pooled distribution. The common row denominator cancels when
    // each class distribution is normalized below.
    const ratios = Float64Array.from(counts, (n, j) => (n / pooled[j] + 100) ** calendar.strength);
    const components = base.components.map((c) => ({
      ...c,
      probabilities: c.probabilities.map((row, i) => {
        const mass = row.map((p, j) => p * ratios[i * levels + j]);
        const total = mass.reduce((a, b) => a + b);
        return mass.map((v) => v / total);
      }),
    }));
    years.set(year, { ...base, components });
  }
  return years.get(year);
}
