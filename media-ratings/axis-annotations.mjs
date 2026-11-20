// These thresholds select descriptions for the fingerprint, without changing the PCA or forecasts.
export const minimumAxisShare = 0.01;
const catalogs = new WeakMap();
const fields = [
  'genres',
  'tags',
  'region',
  'country',
  'format',
  'certificate',
  'platforms',
  'modes',
  'coast',
  'completion',
  'collection',
  'series',
  'studios',
  'directors',
  'publishers',
  'developers',
  'authors',
];
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function groupLabel(field, value, domain) {
  if (field === 'country' && /^[A-Z]{2}$/.test(value)) return names.of(value);
  if (field === 'coast')
    return value === 'Within 25 km of coast'
      ? 'Coastal places'
      : value === 'Over 25 km from coast'
        ? 'Inland places'
        : value;
  if (field === 'genres' && domain === 'games') {
    const name = value.replace(/ (?:video )?games?$/i, '');
    if (name === 'role-playing') return 'RPG';
    if (name === 'action role-playing') return 'Action RPG';
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  if (field === 'genres' && domain === 'fanfiction') return value + ' fandom';
  if (field === 'tags' && value.toLowerCase() === 'imdb top 250') return 'IMDb Top 250';
  if (field === 'tags' && /^oscar \(.+\)$/i.test(value)) return 'Oscar for ' + value.slice(7, -1);
  if (field === 'genres' && value === 'Childrens') return 'Children’s books';
  if (field === 'directors') return 'Directed by ' + value;
  if (field === 'developers') return 'Developed by ' + value;
  if (field === 'publishers' || field === 'studios') return value.replace(/,?\s+(?:llc|inc\.?)$/i, '');
  if (field === 'authors') {
    if (domain === 'boardgames') return 'Games by ' + value;
    return 'By ' + value;
  }
  if (field === 'collection' || field === 'series')
    return /\b(collection|series|trilogy)$/i.test(value) ? value : value + ' series';
  return value;
}

// Midranks keep ties (release years and episode counts in particular) together.
function ranks(values) {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const result = new Float64Array(values.length);
  for (let i = 0; i < order.length; ) {
    let end = i + 1;
    while (end < order.length && values[order[end]] === values[order[i]]) end++;
    for (let j = i; j < end; j++) result[order[j]] = (i + end - 1) / 2;
    i = end;
  }
  return result;
}
function centered(values) {
  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  const norm = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0));
  return Float64Array.from(values, (x) => (norm ? (x - mean) / norm : 0));
}
function indexFor(catalog) {
  if (catalogs.has(catalog)) return catalogs.get(catalog);
  const { items, domain } = catalog,
    n = items.length;
  const min = Math.max(2, Math.min(12, Math.ceil(n * 0.025)));
  const titles = new Set(items.map((item) => normalize(item.title.replace(/\s*\(\d{4}\)$/, ''))));
  const groups = new Map();
  for (const [i, { annotations = {} }] of items.entries()) {
    const seen = new Set();
    for (const field of fields) {
      const values = annotations[field];
      for (const value of Array.isArray(values) ? values : [values]) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const name = groupLabel(field, value.trim(), domain);
        const id = normalize(name);
        if ((field === 'tags' || field === 'genres') && titles.has(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        if (!groups.has(id)) groups.set(id, { name, id, field, members: [] });
        groups.get(id).members.push(i);
      }
    }
  }
  const quantities = [];
  const countPoles = catalog.activityCountLabel
    ? domain === 'subreddits'
      ? ['Fewer repliers', 'More repliers']
      : ['Fewer kudos', 'More kudos']
    : ['Less reviewed', 'More reviewed'];
  for (const [field, low, high] of [
    ['year', 'Earlier releases', 'Later releases'],
    ['ratingCount', ...countPoles],
    ['wordCount', 'Shorter works', 'Longer works'],
    ['chapterCount', 'Fewer chapters', 'More chapters'],
    ['episodes', 'Fewer episodes', 'More episodes'],
    ['population', 'Smaller places', 'Larger places'],
    ['temperature', 'Cooler climates', 'Warmer climates'],
    ['precipitation', 'Drier climates', 'Wetter climates'],
    ['gdp', 'Lower country GDP per capita', 'Higher country GDP per capita'],
  ]) {
    const ids = [],
      values = [];
    items.forEach(({ annotations }, i) => {
      const v = annotations?.[field];
      if (Number.isFinite(v)) {
        ids.push(i);
        values.push(v);
      }
    });
    if (ids.length < Math.max(4, n * 0.5) || new Set(values).size < 4) continue;
    quantities.push({ id: field, low, high, ids, values: centered(ranks(values)) });
  }
  const index = {
    groups: [...groups.values()].filter((g) => g.members.length >= min && n - g.members.length >= min),
    quantities,
    descriptions: new WeakMap(),
  };
  catalogs.set(catalog, index);
  return index;
}

// Compare like with like in the category panel (e.g. genres with genres).
export function comparisonGroups(catalog) {
  const index = indexFor(catalog);
  if (index.comparison) return index.comparison;
  const genreHeading =
    {
      fanfiction: 'Fandom preferences',
      recipes: 'Course preferences',
      cocktails: 'Base spirit preferences',
      boardgames: 'Game type preferences',
      podcasts: 'Topic preferences',
      subreddits: 'Community topics',
    }[catalog.domain] ?? 'Genre preferences';
  const headings = {
    genres: genreHeading,
    region: 'Regional preferences',
    platforms: 'Platform preferences',
    tags: 'Tag preferences',
    format: 'Format preferences',
    country: 'Country preferences',
    modes: 'Play mode preferences',
    certificate: 'Audience ratings',
    completion: 'Publication status',
    developers: 'Developer preferences',
    publishers: 'Publisher preferences',
    authors: 'Creator preferences',
  };
  for (const [field, heading] of Object.entries(headings)) {
    const groups = index.groups.filter((group) => group.field === field);
    if (groups.length >= 2) {
      index.comparison = { heading, groups };
      return index.comparison;
    }
  }
  index.comparison = { heading: 'Category preferences', groups: [] };
  return index.comparison;
}

// Require association both with the actual loadings and their ranks. A lone extreme
// title in an otherwise ordinary group cannot name a component on its own.
function corroborated(r, rankR, size) {
  const minimum = Math.max(0.12, Math.min(0.25, 2 / Math.sqrt(size)));
  if (r * rankR <= 0 || Math.abs(r) < minimum || Math.abs(rankR) < Math.max(0.1, minimum * 0.65)) return 0;
  return Math.sign(r) * Math.sqrt(Math.abs(r * rankR));
}
function associations(index, loadings, quantities) {
  const n = loadings.length,
    magnitude = centered(loadings),
    ordering = centered(ranks(loadings));
  const low = [],
    high = [],
    pairs = [];
  for (const group of index.groups) {
    const size = group.members.length,
      scale = Math.sqrt(n / (size * (n - size)));
    const correlation = (values) => group.members.reduce((sum, i) => sum + values[i], 0) * scale;
    const loadingR = correlation(magnitude);
    const r = corroborated(loadingR, correlation(ordering), n);
    if (r) (r < 0 ? low : high).push({ ...group, strength: Math.abs(r), loadingR });
  }
  for (const q of quantities) {
    const correlation = (values) => {
      const matched = centered(q.ids.map((i) => values[i]));
      return matched.reduce((sum, v, k) => sum + v * q.values[k], 0);
    };
    const r = corroborated(correlation(loadings), correlation(ordering), q.ids.length);
    if (r)
      pairs.push({
        low: r > 0 ? q.low : q.high,
        high: r > 0 ? q.high : q.low,
        keys: [q.id],
        strength: Math.abs(r),
        comparable: true,
        secondary: q.id === 'ratingCount' || !!q.modelBased,
        evidence:
          q.evidence ??
          q.ids.length +
            ' entries with recorded ' +
            ({
              ratingCount: 'counts',
              wordCount: 'word counts',
              chapterCount: 'chapter counts',
              gdp: 'country GDP per capita',
            }[q.id] ?? q.id) +
            '.',
      });
  }
  const strongest = (rows) =>
    rows.sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id)).slice(0, 8);
  for (const left of strongest(low))
    for (const right of strongest(high)) {
      const comparable = left.field === right.field;
      pairs.push({
        low: left.name,
        high: right.name,
        keys: [left.id, right.id],
        strength: Math.sqrt(left.strength * right.strength),
        comparable,
        evidence: [left, right]
          .map(
            (group) =>
              group.name +
              ' (' +
              group.field +
              ') · ' +
              group.members.length +
              ' entries · loading r = ' +
              group.loadingR.toFixed(2),
          )
          .join(' / '),
      });
    }
  // A supported tag can also describe its contrast with the remaining entries.
  for (const side of [low, high])
    for (const tag of side.slice(0, 3)) {
      if (tag.strength < 0.22) continue;
      const other = 'Other entries';
      pairs.push({
        low: side === low ? tag.name : other,
        high: side === high ? tag.name : other,
        keys: [tag.id, other],
        strength: tag.strength * 0.75,
        evidence: tag.name + ' · ' + tag.members.length + ' of ' + n + ' entries.',
      });
    }
  return pairs.sort((a, b) => b.strength - a.strength || a.low.localeCompare(b.low));
}

export function describeAxes(catalog, axes, baseline, spread) {
  const index = indexFor(catalog);
  if (index.descriptions.has(axes)) return index.descriptions.get(axes);
  const quantities = [...index.quantities];
  if (!catalog.activityCountLabel) {
    const ids = catalog.items.map((_, i) => i);
    const add = (id, low, high, values, evidence) => {
      if (new Set(values).size > 1)
        quantities.push({
          id,
          low,
          high,
          ids,
          values: centered(ranks(values)),
          modelBased: true,
          evidence,
        });
    };
    add(
      'baseline',
      'Lower catalog ratings',
      'Higher catalog ratings',
      baseline,
      'Associated with the model’s average rating across respondents.',
    );
    if (catalog.scale.length > 2)
      add(
        'spread',
        'More agreement',
        'More disagreement',
        spread,
        'Associated with the model’s spread of ratings across respondents.',
      );
  }
  const used = new Set();
  const unlabeled = {
    label: 'Unlabeled component',
    low: null,
    high: null,
    interpretable: false,
    evidence: '',
  };
  const descriptions = axes.map((axis) => {
    if (axis.fraction < minimumAxisShare) return unlabeled;
    const lo = axis.loadings[axis.low],
      hi = axis.loadings[axis.high];
    if (lo > 0 || hi < 0) {
      if (used.has('level')) return unlabeled;
      used.add('level');
      return {
        label: 'Overall rating',
        low: lo > 0 ? 'Lower scores' : 'Higher scores',
        high: lo > 0 ? 'Higher scores' : 'Lower scores',
        interpretable: true,
        evidence: 'All item loadings have the same sign.',
      };
    }
    const candidates = associations(index, axis.loadings, quantities);
    const choose = (pool) => {
      if (!pool.length) return undefined;
      const eligible = pool.filter(
        (c) => c.strength >= pool[0].strength * 0.75 && c.keys.every((k) => !used.has(k)),
      );
      if (!eligible.length) return undefined;
      return eligible.find((c) => c.comparable && c.strength >= 0.8 * eligible[0].strength) ?? eligible[0];
    };
    const best =
      choose(candidates.filter((c) => !c.secondary)) ?? choose(candidates.filter((c) => c.secondary));
    if (!best) return unlabeled;
    best.keys.forEach((k) => used.add(k));
    return {
      label: 'Preference contrast',
      low: best.low,
      high: best.high,
      interpretable: true,
      evidence: best.evidence,
    };
  });
  index.descriptions.set(axes, descriptions);
  return descriptions;
}
