import { recommendationFilters } from './filters.mjs';
import { openRapidRating } from './rapid.mjs';
import { modelEvidence, prepareCounts } from './evidence.mjs';
import { calibrationYear, latestRatingDate, populationModel } from './calendar.mjs';
import { projectClasses, tasteProfile } from './taste.mjs';
import { preferenceFingerprint } from './fingerprint.mjs';
import { renderTaste } from './charts.mjs';
import {
  ratingsCSV,
  forecastsCSV,
  importRatings,
  importRatingEntries,
  importForecasts,
  saveCSV,
} from './exchange.mjs';
import { validateCatalog, predict, submit, defaultCutoff, gaussianProjection, rankChanges } from './core.mjs';
import { node, percent, signed, scoreText, showDetail } from './detail.mjs';

const el = (id) => document.getElementById(id);
const input = (id) => /** @type {HTMLInputElement} */ (el(id));
const select = (id) => /** @type {HTMLSelectElement} */ (el(id));
const api = { submit, tasteProfile, rankChanges, preferenceFingerprint, gaussianProjection,
  importRatings, importRatingEntries, importForecasts, ratingsCSV, forecastsCSV };
Object.assign(window, { RatingPrediction: api, MediaRatings: api });
const states = new Map();
let active,
  state,
  catalog,
  result,
  baseline,
  baselineModel,
  titles,
  selected,
  taste,
  revision = 0;
const isFilm = (k) => k === 'expanded';
const halfStars = () =>
  !catalog.scaleLabels && catalog.scale.join(',') === '0.5,1,1.5,2,2.5,3,3.5,4,4.5,5';
const wholeStars = () => !catalog.scaleLabels && catalog.scale.join(',') === '1,2,3,4,5';
const binary = () => Boolean(catalog.responsePrompt && catalog.scale.join(',') === '0,1');
const entries = new Map();
const copies = new Map();
let ratingObserver;
const shelfObserver = new IntersectionObserver(
  (records) => {
    for (const entry of records) if (entry.isIntersecting) mountShelfChoices(entry.target);
  },
  { root: el('library'), rootMargin: '200px' },
);

function mountShelfChoices(row) {
  if (row.classList.contains('deferred') && row.isConnected) {
    row.classList.remove('deferred');
    row.append(entryControls(row.dataset.id, 'catalog'));
    syncRow(row);
  }
  shelfObserver.unobserve(row);
}
const panels = [
  {
    key: 'information',
    title: 'Most informative to rate',
    hint: 'bits',
    score: (p) =>
      ((state.weightByFamiliarity && taste?.weightedInformation) || taste?.information)?.get(p.itemId) ?? 0,
    format: (n) => scoreText(n, 3),
  },
  {
    key: 'expected',
    title: 'Highest expected',
    hint: 'Mean',
    score: (p) => p.expected,
    format: (n) => n.toFixed(2),
  },
  { key: 'chance', title: 'Above cutoff', hint: 'Probability', score: (p) => p.chance, format: percent },
  { key: 'ratingChange', title: 'Rating change', hint: 'Mean shift', score: (p) => p.shift, format: signed },
  { key: 'rankChange', title: 'Rank change', hint: 'Places', score: (p) => p.shift, format: signed },
  {
    key: 'precision',
    title: 'Mean / variance',
    hint: 'Ratio',
    score: (p) => p.expected / Math.max(0.01, p.sd ** 2),
    format: (n) => n.toFixed(2),
  },
];
const scaleLabel = (v) => catalog.scaleLabels?.[catalog.scale.indexOf(v)] ?? String(v);
const sameRatings = (a, b) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
function useState(data, key) {
  validateCatalog(data);
  const model =
    data.defaultModel ??
    (key === 'expanded'
      ? data.selection.model
      : data.models.reference
        ? 'reference'
        : data.selection?.ordinalModel);
  return {
    data,
    model: Object.hasOwn(data.models, model) ? model : Object.keys(data.models)[0],
    threshold: defaultCutoff(data.scale),
    weightByFamiliarity: true,
    directions: { ratingChange: 'up', rankChange: 'up' },
    fingerprintViews: new Map(),
    draftDates: Object.create(null),
    appliedDates: Object.create(null),
    draftSources: Object.create(null),
    appliedSources: Object.create(null),
    followedSuggestions: new Set(),
    draft: Object.create(null),
    applied: Object.create(null),
    selection: null,
    evidence: null,
    evidenceMessage: 'Loading observed ratings…',
  };
}
function titleOf(it) {
  if (!isFilm(active)) return it.title;
  return it.title.replace(/^(.+), (The|An|A) (\(\d{4}\))$/, '$2 $1 $3');
}
function revealCatalogButton() {
  const nav = el('domains');
  if (nav.scrollWidth <= nav.clientWidth) return;
  const current = nav.querySelector('button[aria-pressed=true]');
  if (!current) return;
  const button = current.getBoundingClientRect(),
    bounds = nav.getBoundingClientRect();
  if (button.left < bounds.left) nav.scrollLeft += button.left - bounds.left;
  else if (button.right > bounds.right) nav.scrollLeft += button.right - bounds.right;
}
new ResizeObserver(revealCatalogButton).observe(el('domains'));
const sourceMenus = [...document.querySelectorAll('[data-source-domain] > select')]
  .filter(menu => menu instanceof HTMLSelectElement);
function install(key, next) {
  for (const dialog of document.querySelectorAll('dialog[open]'))
    /** @type {HTMLDialogElement} */ (dialog).close();
  active = key;
  state = next;
  catalog = state.data;
  selected = state.selection;
  titles = new Map(catalog.items.map((it) => [it.itemId, titleOf(it)]));
  let domain = key;
  for (const menu of sourceMenus) {
    const label = menu.parentElement;
    label.hidden = ![...menu.options].some(option => option.value === key);
    if (!label.hidden) {
      menu.value = key;
      domain = label.dataset.sourceDomain;
    }
  }
  for (const btn of el('domains').querySelectorAll('button'))
    btn.setAttribute('aria-pressed', String(btn.dataset.key === domain));
  el('domains')
    .querySelector('button[aria-pressed=true]')
    .setAttribute('title', catalog.items.length.toLocaleString() + ' entries');
  revealCatalogButton();
  select('model').replaceChildren(
    ...Object.entries(catalog.models)
      .filter(
        ([k]) =>
          !isFilm(key) ||
          (k !== 'reference' && !(catalog.models.personalized && ['titleChoice', 'ratingYear'].includes(k))),
      )
      .sort(([a], [b]) => Number(b === catalog.defaultModel) - Number(a === catalog.defaultModel))
      .map(([k, m]) => {
        const name =
          k === 'personalized'
            ? 'Title choice + rating year'
            : m.ratingYear
              ? 'Ratings + tags + rating year'
              : m.titleChoice
                ? 'Ratings + tags + title choice'
                : m.kind === 'class-similarity'
                  ? (m.label ?? (isFilm(key) ? 'Ratings + tags' : 'Ratings + item similarity'))
                  : m.kind === 'logit-point'
                    ? 'Historical logit'
                    : (m.kind === 'latent-class' ? 'Latent class' : 'Ordinal probit') +
                      ' · K=' +
                      m.components.length;
        return new Option(
          name +
            (k === catalog.defaultModel
              ? ' · default'
              : !catalog.defaultModel && k === catalog.selection?.model
                ? ' · CV pick'
                : ''),
          k,
        );
      }),
  );
  select('model').value = state.model;
  const attribution = el('dataset-source');
  attribution.replaceChildren();
  const source =
    key === 'expanded'
      ? { title: 'MovieLens terms and citation', url: 'MOVIELENS-LICENSE.txt' }
      : key !== 'custom'
        ? catalog.source
        : null;
  if (source) {
    const link = node('a', source.title);
    link.href = source.url;
    attribution.append(' · ', link);
    if (source.author) attribution.append(' · ' + source.author);
    if (source.license && source.licenseUrl) {
      const license = node('a', source.license);
      license.href = source.licenseUrl;
      attribution.append(' · ', license);
    }
    if (source.notes) attribution.append(node('p', source.notes));
  }
  el('distribution-title').textContent = catalog.responsePrompt
    ? 'Response distribution'
    : 'Rating distribution';
  el('scale-help').textContent =
    catalog.responsePrompt ??
    (halfStars()
      ? 'Choose a half or whole star.'
      : catalog.scaleLabels
        ? catalog.scale.map((v) => scaleLabel(v) + ' = ' + v).join(' · ')
        : 'Choose a value on the rating scale.');
  input('search').value = '';
  el('boards').replaceChildren();
  setupFilters();
  input('quick-session').disabled = false;
  el('library').scrollTop = 0;
  showValidation(catalog.selection);
  rebuildBaseline();
  update(input('auto').checked);
}
function showValidation(selection) {
  const details = el('validation');
  const validRows = (rows) =>
    Array.isArray(rows) &&
    rows.length &&
    rows.every(
      (r) => r && typeof r.label === 'string' && [r.logLoss, r.rmse, r.brier].every(Number.isFinite),
    );
  details.hidden = !(validRows(selection?.cv) && validRows(selection?.holdout));
  if (details.hidden) return;
  el('evaluation').textContent =
    selection.folds +
    ' validation folds, ' +
    selection.validationUsers +
    ' eligible respondents. The CV pick minimized category log loss, giving each person equal weight. ' +
    'After selection, ' +
    selection.testUsers +
    ' separate respondents contributed ' +
    selection.testRatings +
    (catalog.activityNote ? ' held-out activity observations.' : ' test ratings.');
  const full = selection.full;
  el('selection-study').hidden = !isFilm(active);
  if (full)
    el('evaluation').textContent =
      'The deployed fit uses ' +
      full.releaseRatings.toLocaleString() +
      ' ratings from ' +
      full.releaseUsers.toLocaleString() +
      ' respondents. Each of ' +
      full.testUsers.toLocaleString() +
      ' independent test users supplied four ratings. The models predicted ' +
      full.testRatings.toLocaleString() +
      ' remaining ratings. Item-similarity families and strengths were selected on ' +
      full.validationUsers.toLocaleString() +
      ' separate users. The original four-fold comparison selected K on the 1/32 sample.';
  const tables = el('scores');
  tables.replaceChildren();
  for (const [title, rows] of [
    ...(full
      ? [
          ['Learning curve · matched test users', full.learningCurve],
          ['Item similarities · matched test users', full.holdout],
        ]
      : []),
    [
      full ? 'Original 1/32 sample · held-out finalists' : 'Held-out test · family finalists',
      selection.holdout,
    ],
    ['Cross-validation · all candidates', selection.cv],
  ]) {
    const table = node('table', ''),
      header = node('tr', '');
    table.append(node('caption', title));
    for (const label of ['Model', 'Log loss', 'RMSE', 'Brier']) header.append(node('th', label));
    table.createTHead().append(header);
    const body = table.createTBody();
    for (const r of rows) {
      const tr = node('tr', '');
      tr.append(
        ...[r.label, r.logLoss.toFixed(3), r.rmse.toFixed(3), r.brier.toFixed(3)].map((x) => node('td', x)),
      );
      body.append(tr);
    }
    tables.append(table);
  }
}
function rebuildBaseline(
  dates = input('auto').checked ? state.draftDates : state.appliedDates,
  refreshMeans = false,
) {
  baselineModel = populationModel(catalog, catalog.models[state.model], latestRatingDate(dates));
  const population = predict({ ...catalog, models: { population: baselineModel } }, { model: 'population' });
  baseline = new Map(population.predictions.map((p) => [p.itemId, p]));
  if (refreshMeans) {
    const list = el('rated-list');
    let index = 0;
    for (const p of population.predictions) {
      const mean = binary() ? percent(p.expected) : p.expected.toFixed(2);
      entries.get(p.itemId).querySelector('.entry-meta').textContent = mean;
      const copy = copies.get(p.itemId);
      if (copy) {
        copy.querySelector('.entry-meta').textContent = mean;
        if (copy !== list.children[index]) list.insertBefore(copy, list.children[index]);
        index++;
      }
    }
    sortCatalog();
    return;
  }
  shelfObserver.disconnect();
  entries.clear();
  const empty = node('li', 'No matching entries.');
  empty.id = 'empty-list';
  empty.className = 'note';
  copies.clear();
  for (const p of population.predictions) {
    entries.set(p.itemId, entryRow(p, 'catalog'));
    if (Object.hasOwn(state.draft, p.itemId)) copies.set(p.itemId, entryRow(p, 'rated'));
  }
  el('library').replaceChildren(empty);
  const none = node('li', 'Your rated entries appear here.');
  none.id = 'empty-rated';
  none.className = 'note';
  el('rated-list').replaceChildren(...copies.values(), none);
  sortCatalog();
}
function entryRow(p, surface) {
  const li = node('li');
  li.className = 'entry';
  li.dataset.id = p.itemId;
  const head = node('div'),
    name = node('strong', titles.get(p.itemId)),
    mean = node('span', binary() ? percent(p.expected) : p.expected.toFixed(2));
  head.className = 'entry-head';
  mean.className = 'entry-meta';
  mean.title = binary() ? 'Catalog probability of ' + scaleLabel(1) : 'Catalog expected rating';
  head.append(name, mean);
  li.append(head);
  if (surface === 'catalog' && catalog.items.length > 700) {
    li.classList.add('deferred');
    shelfObserver.observe(li);
  } else li.append(entryControls(p.itemId, surface));
  syncRow(li);
  return li;
}
function entryControls(id, surface) {
  const body = node('div');
  body.className = 'rating-row';
  const readout = node('span');
  readout.className = 'rating-readout';
  const clear = node('button', 'Clear');
  clear.className = 'clear';
  clear.setAttribute('aria-label', 'Clear rating for ' + titles.get(id));
  body.append(ratingControls(id, surface), readout, clear);
  return body;
}
function ratingControls(id, surface) {
  return scaleChoices(surface + '-rating-' + id, 'Rate ' + titles.get(id));
}
function scaleChoices(name, groupLabel) {
  const choices = node('span');
  choices.className = 'choices';
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-label', groupLabel);
  for (const v of catalog.scale) {
    const star = halfStars() || wholeStars(),
      label = node('label'),
      radio = document.createElement('input'),
      glyph = node('span', star ? '' : scaleLabel(v));
    label.className = star ? (wholeStars() ? 'choice star whole-star' : 'choice star') : 'choice';
    radio.type = 'radio';
    radio.name = name;
    radio.value = String(v);
    const description = star ? `${scaleLabel(v)} ${v === 1 ? 'star' : 'stars'}` : scaleLabel(v);
    radio.setAttribute('aria-label', description);
    label.title = description;
    label.append(radio, glyph);
    choices.append(label);
  }
  return choices;
}
function markChoices(group, value) {
  for (const r of group.querySelectorAll('input')) {
    r.checked = Number(r.value) === value;
    r.parentElement.classList.toggle('filled', value !== undefined && Number(r.value) <= value);
  }
}
function syncRow(li) {
  const value = state.draft[li.dataset.id],
    rated = value !== undefined;
  li.classList.toggle('rated', rated);
  if (li.classList.contains('deferred')) return;
  markChoices(li.querySelector('.choices'), value);
  li.querySelector('.clear').hidden = !rated;
  li.querySelector('.rating-readout').textContent =
    rated && (halfStars() || wholeStars()) ? value + ' / 5' : '';
}
const moneyBands = [
  [1e7, 'Under $10M'],
  [5e7, '$10M to <$50M'],
  [1e8, '$50M to <$100M'],
  [5e8, '$100M to <$500M'],
  [Infinity, '$500M or more'],
];
function moneyBand(value) {
  return value > 0 ? [moneyBands.find(([end]) => value < end)[1]] : [];
}
function facets(a) {
  return {
    [{
      recipes: 'Course',
      fanfiction: 'Fandom',
      cocktails: 'Base spirit',
      boardgames: 'Game type',
      podcasts: 'Topic',
    }[catalog.domain] ?? 'Genre']: a.genres,
    Tag: a.tags,
    [active === 'albums' ? 'Artist' : active === 'boardgames' ? 'Brand' : 'Author']:
      a.authors ?? (a.author ? [a.author] : []),
    Platform: a.platforms,
    Mode: a.modes,
    Developer: a.developers,
    Publisher: a.publishers,
    Completion: a.completion ? [a.completion] : [],
    Format: a.format ? [a.format] : [],
    Certificate: a.certificate ? [a.certificate] : [],
    Collection: a.collection ? [a.collection] : [],
    'Production budget': moneyBand(a.budget),
    'Reported box office': moneyBand(a.revenue),
    Country: a.country ? [a.country] : [],
    Region: a.region ? [a.region] : [],
    Coast: a.coast ? [a.coast] : [],
    'Annual temperature': Number.isFinite(a.temperature)
      ? [a.temperature < 10 ? 'Under 10 °C' : a.temperature < 15 ? '10 to <15 °C' : '15 °C or warmer']
      : [],
    'Annual precipitation': Number.isFinite(a.precipitation)
      ? [
          a.precipitation < 600
            ? 'Under 600 mm'
            : a.precipitation < 800
              ? '600 to <800 mm'
              : '800 mm or wetter',
        ]
      : [],
  };
}
let metadata, filters;
function setupFilters() {
  metadata = new Map(catalog.items.map((it) => [it.itemId, it.annotations ?? {}]));
  state.filters ??= recommendationFilters(catalog, facets);
  filters = state.filters;
  filters.attach(
    () => {
      filterRows();
      selectVisibleItem();
      renderBoards();
      renderDetail();
    },
    () => result?.predictions.map((p) => p.itemId) ?? [],
  );
  select('sort').replaceChildren(new Option('Catalog mean', 'mean'), new Option('Title A–Z', 'title'));
  if (catalog.items.some((it) => it.annotations?.year))
    select('sort').add(new Option('Newest first', 'year'));
  for (const [key, label] of [
    ['wordCount', 'Longest first'],
    ['chapterCount', 'Most chapters'],
    ['ratingCount', catalog.activityCountLabel ?? 'Most rated'],
    ['revenue', 'Highest reported box office'],
    ['budget', 'Highest production budget'],
    ['gdp', 'Country GDP per capita'],
    ['population', 'Place population'],
    ['temperature', 'Warmest first'],
    ['precipitation', 'Wettest first'],
  ])
    if (catalog.items.some((it) => Number.isFinite(it.annotations?.[key])))
      select('sort').add(new Option(label, key));
}
function sortCatalog() {
  const key = select('sort').value;
  const sorted = [...entries.keys()].sort((a, b) => {
    if (key === 'title') return titles.get(a).localeCompare(titles.get(b));
    if (key === 'mean') return baseline.get(b).expected - baseline.get(a).expected;
    return (metadata.get(b)[key] ?? 0) - (metadata.get(a)[key] ?? 0);
  });
  const empty = el('empty-list');
  el('library').replaceChildren(...sorted.map((id) => entries.get(id)), empty);
  filterRows();
}
function filterRows() {
  if (!state) return;
  const query = input('search').value.trim().toLocaleLowerCase();
  let count = 0;
  for (const [id, li] of entries) {
    li.hidden = !filters.matchesRatingItem(id) || !titles.get(id).toLocaleLowerCase().includes(query);
    if (!li.hidden) count++;
  }
  el('empty-list').hidden = count > 0;
  el('empty-rated').hidden = copies.size > 0;
  el('unrated-count').textContent = String(count);
}
function reveal(id, focus = false) {
  const row = entries.get(id);
  mountShelfChoices(row);
  if (!filters.matchesRatingItem(id)) return;
  if (row.hidden) {
    input('search').value = '';
    filterRows();
  }
  const list = el('library');
  list.querySelector('.catalog-highlight')?.classList.remove('catalog-highlight');
  row.classList.add('catalog-highlight');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  list.scrollTo({
    top:
      list.scrollTop +
      row.getBoundingClientRect().top -
      list.getBoundingClientRect().top -
      (list.clientHeight - row.offsetHeight) / 2,
    behavior: reduced ? 'instant' : 'smooth',
  });
  if (focus) {
    (row.querySelector('input:checked') ?? row.querySelector('input')).focus({ preventScroll: true });
    if (matchMedia('(max-width:690px)').matches)
      list.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
  }
}
function syncDraft() {
  const count = Object.keys(state.draft).length,
    dirty =
      !sameRatings(state.draft, state.applied) ||
      !sameRatings(state.draftSources, state.appliedSources) ||
      !sameRatings(state.draftDates, state.appliedDates);
  el('rated-count').textContent = count + ' / ' + catalog.items.length;
  const clear = input('clear-all');
  clear.disabled = !count && !state.cleared;
  clear.textContent = state.cleared ? 'Undo clear' : 'Clear all';
  input('apply').disabled = !dirty;
  el('pending').hidden = !dirty;
  el('pending').textContent = 'Ratings have changed. Choose Update predictions to refresh the rankings.';
}
function edit(li, value, fromSuggestion = false) {
  state.cleared = null;
  const id = li.dataset.id;
  if (value === undefined) {
    delete state.draft[id];
    delete state.draftSources[id];
    delete state.draftDates[id];
    state.followedSuggestions.delete(id);
  } else {
    if (!Object.hasOwn(state.draft, id) || state.draft[id] !== value)
      state.draftDates[id] = new Date().toISOString().slice(0, 10);
    state.draft[id] = value;
    state.draftSources[id] ??=
      fromSuggestion || state.followedSuggestions.has(id) ? 'suggested' : 'volunteered';
  }
  syncRow(entries.get(id));
  if (value === undefined) {
    if (copies.get(id)?.contains(document.activeElement)) {
      mountShelfChoices(entries.get(id));
      entries.get(id).querySelector('input').focus({ preventScroll: true });
    }
    copies.get(id)?.remove();
    copies.delete(id);
  } else if (copies.has(id)) syncRow(copies.get(id));
  else {
    const copy = entryRow(baseline.get(id), 'rated');
    copies.set(id, copy);
    const list = el('rated-list');
    const next = [...list.children].find(
      (row) =>
        !row.getAttribute('data-id') ||
        baseline.get(row.getAttribute('data-id')).expected < baseline.get(id).expected,
    );
    list.insertBefore(copy, next);
  }
  filterRows();
  syncDraft();
  if (input('auto').checked) update();
  else if (result) renderBoards();
}
function refreshRatingShelves() {
  rebuildBaseline();
  if (input('auto').checked) update();
  else {
    syncDraft();
    if (result) renderBoards();
  }
}
input('quick-session').onclick = () => {
  if (!state || !result) return;
  const opened = state;
  const ids = catalog.items
    .map((it) => it.itemId)
    .filter((id) => !Object.hasOwn(state.draft, id) && filters.matchesRatingItem(id));
  const criteria = [];
  if (taste?.weights.length > 1) {
    if (taste.weightedInformation) criteria.push(['familiarInfo', 'Information × familiarity']);
    criteria.push(['info', 'Most informative']);
  }
  if (catalog.items.some((it) => Number.isFinite(it.annotations?.ratingCount)))
    criteria.push(['count', catalog.activityCountLabel ?? 'Most rated']);
  criteria.push(['expected', 'Highest expected rating'], ['title', 'Title A–Z']);
  const volunteered = Object.keys(state.draft).filter((id) => state.draftSources[id] === 'volunteered');
  const model = catalog.models[state.model];
  const classKey = ['latent-class', 'class-similarity'].includes(model.kind)
    ? state.model
    : Object.keys(catalog.models).find((k) => catalog.models[k].kind === 'latent-class');
  function rank(criterion, answers) {
    if (criterion === 'title') return [...ids].sort((a, b) => titles.get(a).localeCompare(titles.get(b)));
    if (criterion === 'count')
      return [...ids].sort((a, b) => (metadata.get(b).ratingCount ?? 0) - (metadata.get(a).ratingCount ?? 0));
    const ratings = { ...state.draft },
      ratedOn = { ...state.draftDates };
    for (const [id, a] of answers) {
      ratings[id] = a.value;
      ratedOn[id] = a.date;
    }
    const reuse =
      !answers.size &&
      sameRatings(ratings, state.applied) &&
      sameRatings(ratedOn, state.appliedDates) &&
      sameRatings(state.draftSources, state.appliedSources);
    if (criterion === 'expected') {
      const forecasts = reuse
        ? result
        : predict(catalog, { model: state.model, ratings, ratedOn, volunteered });
      const pool = new Set(ids);
      return forecasts.predictions.filter((p) => pool.has(p.itemId)).map((p) => p.itemId);
    }
    const profile = reuse
      ? taste
      : tasteProfile(catalog, ratings, classKey, null, false, volunteered, ratedOn);
    const info = criterion === 'familiarInfo' ? profile.weightedInformation : profile.information;
    return [...ids].filter((id) => info.has(id)).sort((a, b) => info.get(b) - info.get(a));
  }
  openRapidRating({
    catalog,
    stars: halfStars() || wholeStars(),
    ids,
    titles,
    links: state.links,
    criteria,
    rank,
    save(answers) {
      if (!answers.size) return;
      for (const [id, a] of answers) {
        opened.draft[id] = a.value;
        opened.draftSources[id] = 'suggested';
        opened.draftDates[id] = a.date;
      }
      opened.cleared = null;
      if (opened === state) refreshRatingShelves();
    },
  });
};
input('clear-all').onclick = () => {
  if (!state) return;
  if (state.cleared) {
    Object.assign(state, state.cleared);
    state.cleared = null;
  } else {
    state.cleared = {
      draft: state.draft,
      draftSources: state.draftSources,
      draftDates: state.draftDates,
      followedSuggestions: state.followedSuggestions,
    };
    state.draft = Object.create(null);
    state.draftSources = Object.create(null);
    state.draftDates = Object.create(null);
    state.followedSuggestions = new Set();
  }
  refreshRatingShelves();
};
el('shelves').onchange = (event) => {
  const r = event.target;
  if (r instanceof HTMLInputElement && r.type === 'radio') edit(r.closest('.entry'), Number(r.value));
};
el('shelves').onclick = (event) => {
  const button = /** @type {HTMLElement} */ (event.target).closest('.clear');
  if (button) {
    const li = button.closest('.entry');
    li.querySelector('input').focus();
    edit(li, undefined);
  }
};
input('search').oninput = filterRows;
select('sort').onchange = sortCatalog;
function selectVisibleItem() {
  if (!result.predictions.some((p) => p.itemId === selected && filters.matches(p.itemId)))
    selected = result.predictions.find((p) => filters.matches(p.itemId))?.itemId;
  state.selection = selected;
}

input('apply').onclick = () => update();
input('auto').onchange = () => {
  if (state && input('auto').checked) update();
};
function update(applyDraft = true) {
  try {
    const ratings = applyDraft ? state.draft : state.applied;
    const sources = applyDraft ? state.draftSources : state.appliedSources;
    const ratedOn = applyDraft ? state.draftDates : state.appliedDates;
    const model = catalog.models[state.model];
    const latest = latestRatingDate(ratedOn);
    const volunteered = Object.keys(ratings).filter((id) => sources[id] === 'volunteered');
    const next = predict(catalog, {
      model: state.model,
      ratings,
      volunteered,
      ratedOn,
      threshold: state.threshold,
    });
    result = next;
    state.applied = { ...ratings };
    state.appliedSources = { ...sources };
    state.appliedDates = { ...ratedOn };
    if (populationModel(catalog, model, latest) !== baselineModel) rebuildBaseline(ratedOn, true);
    const count = Object.keys(state.applied).length;
    el('context').textContent =
      catalog.name +
      ' · ' +
      (count ? count + ' applied rating' + (count === 1 ? '' : 's') : 'Catalog baseline') +
      ' · ' +
      result.predictions.length +
      ' unrated' +
      (state.contextError ? ' · ' + state.contextError : '');
    const choiceNote = el('choice-note');
    const notes = catalog.activityNote ? [catalog.activityNote] : [];
    choiceNote.hidden = !notes.length && !model.titleChoice && !model.ratingYear;
    if (model.titleChoice) {
      notes.push(
        count
          ? `You picked ${volunteered.length} of ${count} rated titles. App suggestions contribute stars only.`
          : 'Films you pick contribute their titles and stars. App suggestions contribute stars only.',
      );
    }
    if (model.ratingYear && (latest || count || !model.titleChoice)) {
      const range = modelEvidence(catalog, model, 'ratingYear');
      notes.push(
        latest
          ? `Forecast calibration uses ${calibrationYear(range, latest)} (latest rating: ${latest}).`
          : 'Undated ratings use the all-year fit.',
      );
    }
    choiceNote.textContent = notes.join(' ');
    el('weights').textContent =
      model.kind === 'class-similarity'
        ? 'Your ratings update the taste-class probabilities. Ratings above or below what those classes predict also shift forecasts for similar ' +
          (isFilm(active) ? 'films, using rating patterns and MovieLens tags.' : 'entries.')
        : model.kind === 'latent-class'
          ? 'Taste components each learn a star or response distribution for every title. Each answer updates your class probabilities. The forecast averages each class’s distribution using those probabilities.'
          : result.weights.length > 1
            ? 'Taste components (catalog → yours)  ' +
              result.weights
                .map((w, i) => i + 1 + '. ' + percent(w.prior) + ' → ' + percent(w.posterior))
                .join('   ·   ')
            : '';
    if (
      result.weights.some((w) => w.posterior > 0.01 && w.effectiveSamples !== null && w.effectiveSamples < 20)
    )
      el('weights').textContent += ' Integration is imprecise for these ratings.';
    selectVisibleItem();
    const usesClasses = model.kind === 'latent-class' || model.kind === 'class-similarity';
    const classKey = usesClasses
      ? state.model
      : Object.keys(catalog.models).find((k) => catalog.models[k].kind === 'latent-class');
    taste = tasteProfile(
      catalog,
      state.applied,
      classKey,
      usesClasses ? next : null,
      false,
      volunteered,
      ratedOn,
    );
    renderFingerprint();
    renderSnapshot();
    renderBoards();
    renderDetail();
    el('status').textContent = '';
  } catch (error) {
    // A failed model calculation must never leave rankings labeled as a new fit.
    result = null;
    el('taste').hidden = true;
    el('boards').replaceChildren();
    el('detail').hidden = true;
    el('weights').textContent = '';
    el('choice-note').hidden = true;
    el('context').textContent = catalog.name;
    el('status').textContent = error.message;
  }
  syncDraft();
}
function renderFingerprint() {
  const model = catalog.models[state.model];
  const categorical = ['latent-class', 'class-similarity'].includes(model.kind);
  let prefs = state.fingerprintViews.get(state.model);
  if (!prefs) {
    prefs = { axes: undefined, pinned: null, centerClassMeans: false };
    state.fingerprintViews.set(state.model, prefs);
  }
  const request = {
    model: state.model,
    ratings: state.applied,
    ratedOn: state.appliedDates,
    axisIndices: prefs.axes,
  };
  let view;
  if (categorical) {
    const all = prefs.centerClassMeans
      ? projectClasses(baselineModel, catalog.scale, true)
      : taste.projection;
    const indices = prefs.axes ?? all.slice(0, 2).map((axis) => axis.index);
    view = { ...taste, projection: indices.map((i) => all[i]), spectrum: all.map((a) => a.fraction) };
  } else view = gaussianProjection(catalog, request);
  const fp = preferenceFingerprint(catalog, request, view);
  const domain = active === 'expanded' ? 'movies' : active === 'destinations' ? 'cities' : catalog.domain;
  renderTaste(
    view,
    catalog,
    fp,
    domain,
    prefs,
    renderFingerprint,
    state.applied,
    baseline,
    result.predictions,
  );
}
function recommendationHeader(spec, title, count, isShift, weighted) {
  const head = node('div');
  head.className = 'board-head';
  const heading = node('h3', title);
  head.append(heading);
  if (spec.key === 'chance') {
    heading.className = 'cutoff-heading';
    heading.textContent = 'Chance of ≥';
    const cutoff = scaleChoices('chance-cutoff', 'Minimum rating for chance ranking');
    cutoff.id = 'threshold';
    markChoices(cutoff, state.threshold);
    const controls = node('span');
    controls.className = 'cutoff-value';
    controls.append(cutoff, node('span', '(' + state.threshold + ')'));
    heading.append(controls);
  }
  if (isShift) {
    const button = node('button');
    const direction = state.directions[spec.key];
    button.className = 'shift-directions';
    button.dataset.board = spec.key;
    button.dataset.direction = direction;
    button.ariaLabel =
      spec.title + (direction === 'up' ? ': biggest gains. Show falls' : ': biggest falls. Show gains');
    button.title = button.ariaLabel;
    for (const dir of ['up', 'down']) {
      const caret = node('i');
      caret.className = 'caret ' + dir;
      caret.setAttribute('aria-hidden', 'true');
      button.append(caret);
    }
    head.append(button);
  }
  if (spec.key === 'information') {
    const label = node('label'),
      check = node('input');
    check.type = 'checkbox';
    check.id = 'weight-familiarity';
    check.disabled = !taste?.weightedInformation || taste.weights.length < 2;
    check.checked = weighted;
    label.className = 'familiarity-option';
    check.setAttribute('aria-label', 'Weight by familiarity');
    const caption = node('span', 'familiarity');
    const prefix = node('span', 'Weight by ');
    prefix.className = 'weight-prefix';
    caption.prepend(prefix);
    label.append(check, caption);
    label.title = check.disabled
      ? 'Item response counts are unavailable for this catalog.'
      : catalog.activityNote
        ? 'Weight by the fraction of accounts with this recorded action.'
        : 'Use the fraction of catalog respondents who rated each entry as a proxy for familiarity.';
    head.append(label);
  } else head.append(node('small', count + ' · ' + spec.hint));
  return head;
}
function recommendationRow(p, index, spec, isShift, ranks, weighted) {
  const btn = node('button');
  btn.className = 'rank';
  btn.tabIndex = index === 0 ? 0 : -1;
  btn.dataset.id = p.itemId;
  btn.setAttribute('aria-pressed', String(selected === p.itemId));
  const pos = node('span', String(index + 1)),
    score = node(
      'span',
      isShift ? p.prior.toFixed(2) + ' → ' + p.expected.toFixed(2) : spec.format(spec.score(p), p),
    );
  if (isShift) {
    const place = ranks?.get(p.itemId);
    if (!place && binary()) score.textContent = percent(p.prior) + ' → ' + percent(p.expected);
    const change = place ? place.change : p.shift;
    if (place) score.textContent = '#' + place.from + ' → #' + place.to;
    const delta = node(
      'span',
      '(' +
        (place
          ? (change > 0 ? '+' : '') + change
          : binary()
            ? signed(change * 100) + ' pp'
            : signed(change)) +
        ')',
    );
    delta.className = 'shift-delta ' + (change > 0 ? 'rise' : 'fall');
    score.append(' ', delta);
    score.title = place
      ? 'Catalog rank → your rank among these unrated entries'
      : 'Catalog mean → your mean (change)';
  }
  if (spec.key === 'information' && weighted)
    score.title =
      scoreText(taste.information.get(p.itemId), 3) +
      ' bits × ' +
      metadata.get(p.itemId).ratingCount.toLocaleString() +
      ' / ' +
      catalog.fit.users.toLocaleString() +
      ' respondents';
  pos.className = 'rank-index';
  score.className = 'score';
  btn.append(pos, node('span', titles.get(p.itemId)));
  const row = node('div');
  row.dataset.id = p.itemId;
  row.append(btn);
  if (spec.key === 'information') {
    row.className = 'info-row';
    btn.append(score);
    if (index < 12) row.append(ratingControls(p.itemId, 'information'));
  } else {
    row.className = 'forecast-row';
    const rate = node('button');
    const cue = node('span', 'Rate');
    cue.className = 'rate-cue';
    cue.setAttribute('aria-hidden', 'true');
    score.id = 'score-' + spec.key + '-' + index;
    btn.setAttribute('aria-describedby', score.id);
    rate.append(score, cue);
    rate.className = 'quick-rate';
    rate.tabIndex = btn.tabIndex;
    rate.setAttribute('aria-label', 'Rate ' + titles.get(p.itemId) + ' here');
    rate.setAttribute('aria-describedby', score.id);
    rate.title = 'Rate ' + titles.get(p.itemId);
    rate.setAttribute('aria-expanded', 'false');
    row.append(rate);
  }
  return row;
}
const fillRankings = new WeakMap();
function renderBoards() {
  closeRatingChoices();
  const host = el('boards');
  const positions = new Map(
    [...host.querySelectorAll('.ranks')].map((list) => [
      list.getAttribute('data-key'),
      { top: list.scrollTop, count: list.children.length },
    ]),
  );
  ratingObserver?.disconnect();
  const visible = result.predictions.filter((p) => filters.matches(p.itemId));
  const rankMovements = rankChanges(visible);
  const weighted = state.weightByFamiliarity && !!taste?.weightedInformation;
  const fragment = document.createDocumentFragment();
  const activity = binary();
  const shown = activity
    ? panels
        .filter((p) => !['chance', 'precision'].includes(p.key))
        .map((p) =>
          p.key === 'expected'
            ? {
                ...p,
                title:
                  {
                    games: 'Chance of thumbs up',
                    subreddits: 'Chance of a reply',
                    fanfiction: 'Chance of kudos',
                    webfiction: 'Chance of kudos',
                  }[catalog.domain] ?? 'Chance of ' + scaleLabel(1),
                hint: 'Probability',
                format: percent,
              }
            : p.key === 'ratingChange'
              ? { ...p, title: 'Probability change', hint: 'Points' }
              : p,
        )
    : panels;
  host.classList.toggle('activity-boards', activity);
  for (const spec of shown) {
    const board = node('section'),
      list = node('div');
    board.className = 'board';
    list.className = 'ranks';
    list.dataset.key = spec.key;
    const direction = state.directions[spec.key];
    const isShift = Boolean(direction);
    const ranks = spec.key === 'rankChange' ? rankMovements : null;
    const title = spec.key === 'chance' ? 'Chance of ≥ ' + scaleLabel(state.threshold) : spec.title;
    if (spec.key === 'information') {
      board.classList.add('information');
    }
    list.setAttribute('role', 'toolbar');
    list.setAttribute('aria-orientation', 'vertical');
    list.setAttribute('aria-label', title);
    board.append(list);
    if (spec.key === 'information' && taste) {
      const why = node(
        'p',
        weighted
          ? catalog.activityNote
            ? 'Information gain in bits × the share of accounts with the recorded action.'
            : 'Information gain in bits × the share of respondents who rated each entry.'
          : 'Expected information in bits about ' +
              taste.weights.length +
              ' taste classes, given your applied ratings.',
      );
      why.className = 'info-note';
      board.append(why);
    }
    const orderScore = (p) => {
      const delta = ranks ? ranks.get(p.itemId).change : spec.score(p);
      return direction === 'down' ? -delta : delta;
    };
    const items = (spec.key === 'information' ? result.predictions : visible)
      .filter((p) =>
        isShift
          ? orderScore(p) > 0
          : spec.key === 'information'
            ? !!taste &&
              taste.weights.length > 1 &&
              !Object.hasOwn(state.draft, p.itemId) &&
              filters.matchesRatingItem(p.itemId)
            : true,
      )
      .sort((a, b) => orderScore(b) - orderScore(a));
    board.prepend(recommendationHeader(spec, title, items.length, isShift, weighted));
    if (!items.length) {
      const msg = !result.predictions.length
        ? 'All entries rated. Clear one to predict it.'
        : isShift && !Object.keys(state.applied).length
          ? 'Rate an entry to see shifts from the catalog mean.'
          : spec.key === 'information' && (!taste || taste.weights.length < 2)
            ? 'This catalog has no competing taste classes.'
            : isShift && visible.length
              ? emptyShiftMessage(direction, visible, ranks)
              : 'No matching entries.';
      const note = node('p', msg);
      note.className = 'note';
      list.append(note);
    }
    // Long catalogs keep every result in rank order and materialize more rows on scroll.
    let rendered = 0;
    function fill(stop) {
      const rows = document.createDocumentFragment();
      while (rendered < Math.min(items.length, stop)) {
        const row = recommendationRow(items[rendered], rendered, spec, isShift, ranks, weighted);
        rows.append(row);
        if (list.isConnected && spec.key === 'information') ratingObserver.observe(row);
        rendered++;
      }
      list.append(rows);
      if (rendered === items.length) list.onscroll = null;
    }
    const position = positions.get(spec.key);
    fill(items.length <= 600 ? items.length : position?.top ? Math.max(100, position.count) : 100);
    if (rendered < items.length) {
      fillRankings.set(list, fill);
      list.onscroll = () => {
        if (list.scrollTop + list.clientHeight >= list.scrollHeight - 240) fill(rendered + 100);
      };
    }
    fragment.append(board);
  }
  host.replaceChildren(fragment);
  for (const list of host.querySelectorAll('.ranks'))
    list.scrollTop = positions.get(list.getAttribute('data-key'))?.top ?? 0;
  const info = host.querySelector('.information .ranks');
  ratingObserver = new IntersectionObserver(
    (records) => {
      for (const r of records) if (r.isIntersecting) mountChoices(r.target);
    },
    { root: info, rootMargin: '200px' },
  );
  for (const row of info.querySelectorAll('.info-row'))
    if (!row.querySelector('.choices')) ratingObserver.observe(row);
}
function emptyShiftMessage(direction, items, ranks) {
  const up = direction === 'up';
  if (ranks) return 'No unrated entries in this view ' + (up ? 'gained' : 'lost') + ' places.';
  const opposite = items.every((p) => (up ? p.shift < 0 : p.shift > 0));
  const reason = opposite
    ? 'All ' +
      items.length +
      ' predicted ' +
      (items.length === 1 ? 'rating ' : 'ratings ') +
      (up ? 'fell.' : 'rose.')
    : 'No predicted rating ' + (up ? 'rose' : 'fell') + ' in this view.';
  return reason + ' See Rank change to compare places.';
}
function mountChoices(row) {
  if (row?.isConnected && !row.querySelector('.choices')) {
    row.append(ratingControls(row.dataset.id, 'information'));
    ratingObserver?.unobserve(row);
  }
}
function renderDetail() {
  if (!result) return;
  showDetail({
    p: result.predictions.find((p) => p.itemId === selected),
    prior: baseline.get(selected),
    catalog,
    evidence: state.evidence,
    links: state.links?.[selected],
    linkError: state.linkError,
    domain: active,
    ratings: state.applied,
    titles,
    label: scaleLabel,
    model: catalog.models[state.model],
    threshold: state.threshold,
    message: state.evidenceMessage,
  });
}
// Arrow keys move between titles. Tab reaches the active title's rating shortcut.
el('boards').addEventListener('focusin', (event) => {
  const button = event.target;
  if (button instanceof HTMLElement && button.closest('.info-row')) mountChoices(button.closest('.info-row'));
  if (!(button instanceof HTMLButtonElement) || !button.matches('.rank, .quick-rate')) return;
  const rank = button.closest('.forecast-row')?.querySelector('.rank') ?? button;
  for (const peer of button.closest('.ranks').querySelectorAll('button[tabindex="0"]'))
    peer.setAttribute('tabindex', '-1');
  rank.setAttribute('tabindex', '0');
  const rate = rank.nextElementSibling;
  if (rate?.matches('.quick-rate')) rate.setAttribute('tabindex', '0');
});
el('boards').onkeydown = (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement)) return;
  const list = button.closest('.ranks');
  if (!list || !button.matches('.rank')) return;
  if (event.key === 'End') fillRankings.get(list)?.(Infinity);
  else if (event.key === 'ArrowDown' && button.closest('[data-id]')?.parentElement === list.lastElementChild)
    fillRankings.get(list)?.(list.children.length + 100);
  const buttons = Array.from(list.querySelectorAll('button.rank'));
  const idx = buttons.indexOf(button);
  const next = {
    ArrowDown: buttons[idx + 1],
    ArrowUp: buttons[idx - 1],
    Home: buttons[0],
    End: buttons.at(-1),
  };
  if (Object.hasOwn(next, event.key)) {
    event.preventDefault();
    next[event.key]?.focus();
  }
};
// The top layer lets a rating scale extend past the scrolling list without
// changing the row's height. It stays in the row's DOM for keyboard navigation.
let openRating = null;
function closeRatingChoices(restoreFocus = false) {
  if (!openRating) return;
  const { choices, trigger, listeners } = openRating;
  openRating = null;
  listeners.abort();
  choices.hidePopover();
  choices.remove();
  trigger.setAttribute('aria-expanded', 'false');
  trigger.removeAttribute('aria-controls');
  if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
}
function showRatingChoices(row) {
  closeRatingChoices();
  const choices = ratingControls(row.dataset.id, 'recommendation');
  const trigger = row.querySelector('.quick-rate');
  markChoices(choices, state.draft[row.dataset.id]);
  choices.id = 'recommendation-rating';
  choices.popover = 'manual';
  row.append(choices);
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', choices.id);
  const listeners = new AbortController();
  const { signal } = listeners;
  openRating = { choices, trigger, listeners };
  choices.showPopover();
  const position = () => {
    const anchor = trigger.getBoundingClientRect();
    const list = row.closest('.ranks').getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    if (anchor.bottom <= Math.max(0, list.top) || anchor.top >= Math.min(list.bottom, height)) {
      closeRatingChoices();
      return;
    }
    const gap = 6,
      w = choices.offsetWidth,
      h = choices.offsetHeight;
    const x = anchor.right + gap + w <= width ? anchor.right + gap : anchor.left - gap - w;
    choices.style.left = Math.max(gap, Math.min(width - w - gap, x)) + 'px';
    choices.style.top =
      Math.max(gap, Math.min(height - h - gap, (anchor.top + anchor.bottom - h) / 2)) + 'px';
  };
  position();
  if (!openRating) return;
  window.addEventListener('scroll', position, { capture: true, passive: true, signal });
  window.addEventListener('resize', position, { signal });
  const dismissOutside = (event) => {
    if (!choices.contains(event.target) && !trigger.contains(event.target)) closeRatingChoices();
  };
  document.addEventListener('pointerdown', dismissOutside, { capture: true, signal });
  document.addEventListener('focusin', dismissOutside, { signal });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRatingChoices(true);
      }
    },
    { signal },
  );
  const first = choices.querySelector('input:checked') ?? choices.querySelector('input');
  if (first instanceof HTMLInputElement) first.focus({ preventScroll: true });
}
el('boards').onclick = (event) => {
  const target = /** @type {HTMLElement} */ (event.target);
  const action = target.closest('button');
  if (!(action instanceof HTMLButtonElement)) return;
  if (action.dataset.direction) {
    const { board, direction } = action.dataset;
    state.directions[board] = direction === 'up' ? 'down' : 'up';
    renderBoards();
    el('boards').querySelector('.ranks[data-key="' + board + '"]').scrollTop = 0;
    const toggled = el('boards').querySelector('button[data-board="' + board + '"]');
    if (toggled instanceof HTMLElement) toggled.focus({ preventScroll: true });
    return;
  }
  const row = action.closest('.forecast-row');
  const inline = action.matches('.quick-rate');
  const btn = row?.querySelector('.rank') ?? action;
  selected = state.selection = btn.getAttribute('data-id');
  state.followedSuggestions.add(selected);
  for (const b of el('boards').querySelectorAll('.rank[aria-pressed="true"]'))
    b.setAttribute('aria-pressed', 'false');
  for (const b of el('boards').querySelectorAll('.rank[data-id="' + CSS.escape(selected) + '"]'))
    b.setAttribute('aria-pressed', 'true');
  renderDetail();
  const closing = inline && openRating?.trigger === action;
  closeRatingChoices();
  reveal(selected, !inline);
  if (inline && !closing) showRatingChoices(row);
};
el('boards').onchange = (event) => {
  const radio = event.target;
  if (radio instanceof HTMLInputElement && radio.id === 'weight-familiarity') {
    state.weightByFamiliarity = radio.checked;
    renderBoards();
    el('boards').querySelector('.information .ranks').scrollTop = 0;
    el('weight-familiarity').focus({ preventScroll: true });
    return;
  }
  if (!(radio instanceof HTMLInputElement) || radio.type !== 'radio') return;
  if (radio.closest('#threshold')) {
    setCutoff(Number(radio.value));
    return;
  }
  const row = radio.closest('.info-row, .forecast-row');
  if (!(row instanceof HTMLElement)) return;
  const list = row.parentElement;
  const index = [...list.children].indexOf(row);
  const height = row.offsetHeight;
  const id = row.dataset.id;
  const boardKey = list.dataset.key;
  edit(entries.get(id), Number(radio.value), true);
  const updated = el('boards').querySelector('.ranks[data-key="' + boardKey + '"]');
  if (!updated) {
    reveal(id);
    return;
  }
  const next = updated.children[index] ?? updated.lastElementChild;
  if (boardKey !== 'information' && !input('auto').checked) {
    showRatingChoices(updated.querySelector('.forecast-row[data-id="' + CSS.escape(id) + '"]'));
  } else if (next?.querySelector('button')) {
    next.querySelector('button').focus({ preventScroll: true });
  } else entries.get(id).querySelector('input:checked')?.focus({ preventScroll: true });
  if (boardKey === 'information' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    row.classList.add('departing');
    row.inert = true;
    row.setAttribute('aria-hidden', 'true');
    updated.insertBefore(row, updated.children[index] ?? null);
    row
      .animate(
        [
          { height: height + 'px', opacity: 1 },
          { height: height + 'px', opacity: 0, offset: 0.55 },
          { height: '0px', opacity: 0 },
        ],
        { duration: 620, easing: 'ease-in-out', fill: 'forwards' },
      )
      .finished.then(() => row.remove());
  }
  reveal(id);
  const copy = copies.get(id),
    rated = el('rated-list');
  rated.scrollTop += copy.getBoundingClientRect().top - rated.getBoundingClientRect().top;
};
select('model').onchange = () => {
  state.model = select('model').value;
  rebuildBaseline();
  update(input('auto').checked);
};
function setCutoff(value) {
  state.threshold = value;
  if (!result) return;
  result.threshold = state.threshold;
  const start = catalog.scale.indexOf(state.threshold);
  for (const p of result.predictions) p.chance = p.probabilities.slice(start).reduce((a, b) => a + b, 0);
  renderBoards();
  renderDetail();
  const checked = el('threshold').querySelector(':checked');
  el('boards').querySelector('.ranks[data-key=chance]').scrollTop = 0;
  if (checked instanceof HTMLInputElement) checked.focus({ preventScroll: true });
}
async function readJSON(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error('Unable to load ' + path + ' (' + resp.status + ').');
  return resp.json();
}
async function readOptionalJSON(path) {
  try {
    return { data: await readJSON(path), error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}
async function loadEvidence(key, s) {
  try {
    const data = await readJSON(key + '-evidence.json');
    if (
      JSON.stringify(s.data.items.map((it) => it.itemId)) !== JSON.stringify(data.ids) ||
      JSON.stringify(s.data.scale) !== JSON.stringify(data.scale)
    )
      throw new Error('Co-rating data does not match this catalog.');
    await prepareCounts(data);
    if (key === 'destinations') {
      const counts = data.counts.map((row) => row.reduce((sum, n) => sum + n, 0));
      if (counts.reduce((sum, n) => sum + n, 0) !== s.data.fit.ratings)
        throw new Error('Unexpected destination response totals.');
      if (s.data.items.some((it, i) => it.annotations?.ratingCount !== counts[i]))
        throw new Error('Destination counts differ from the catalog.');
    }
    s.evidence = data;
  } catch (e) {
    s.evidenceMessage = e.message;
  }
  if (s === state) renderDetail();
}
const publicCatalogs = new Set([
  ...Array.from(el('domains').querySelectorAll('button[data-key]:not(#custom-domain)'), btn => btn.getAttribute('data-key')),
  ...sourceMenus.flatMap(menu => Array.from(menu.options, option => option.value)),
]);
function catalogFromAddress() {
  const key = new URL(location.href).searchParams.get('catalog');
  if (key && publicCatalogs.has(key)) return key;
  return !key && history.state?.localCatalog && states.has('custom') ? 'custom' : 'expanded';
}
function setCatalogAddress(key, replace) {
  const url = new URL(location.href);
  const localCatalog = key === 'custom';
  if (localCatalog || key === 'expanded') url.searchParams.delete('catalog');
  else url.searchParams.set('catalog', key);
  if (url.href === location.href && Boolean(history.state?.localCatalog) === localCatalog) return;
  history[replace ? 'replaceState' : 'pushState']({ localCatalog }, '', url);
}
async function openCatalog(key, file = null, replace = false) {
  const seq = ++revision;
  try {
    let s = file ? null : states.get(key);
    if (!s) {
      el('status').textContent = 'Loading catalog…';
      const [data, references, context] = file
        ? [JSON.parse(await file.text()), null, null]
        : await Promise.all([
            readJSON(key + '.json'),
            key === 'expanded'
              ? readOptionalJSON('film-links.json')
              : key === 'destinations'
                ? readOptionalJSON('destinations-links.json')
                : null,
            key === 'expanded' ? readOptionalJSON('film-context.json') : null,
          ]);
      if (seq !== revision) return;
      if (key === 'expanded') {
        for (const it of data.items) {
          if (context?.data) {
            const record = context.data[it.itemId];
            if (
              !Number.isSafeInteger(record?.ratingCount) ||
              record.ratingCount <= 0 ||
              record.ratingCount > data.fit.users
            )
              throw new Error('Invalid film rating count for ' + it.title);
            it.annotations = { ...it.annotations, ...record };
          }
          const certificate = references?.data?.[it.itemId]?.certificate;
          if (certificate && !it.annotations?.certificate)
            it.annotations = { ...it.annotations, certificate };
        }
      }
      s = useState(data, key);
      s.links = references?.data;
      if (!file && data.sourceLabel && !s.links) {
        s.links = Object.fromEntries(
          data.items
            .filter((it) => it.annotations?.sourceUrl?.startsWith('https://'))
            .map((it) => [
              it.itemId,
              {
                label: it.annotations.linkLabel ?? data.linkLabel ?? data.sourceLabel,
                sourceUrl: it.annotations.sourceUrl,
                imageUrl: it.annotations.imageUrl?.startsWith('https://') ? it.annotations.imageUrl : null,
              },
            ]),
        );
      }
      s.linkError = references?.error;
      s.contextError = context?.error ? 'Film finances and familiarity counts unavailable.' : null;
      if (file) {
        s.evidenceMessage = 'This fitted catalog includes model probabilities only.';
        el('custom-domain').hidden = false;
      } else void loadEvidence(key, s);
      if (seq !== revision) return;
      states.set(key, s);
    }
    if (seq === revision) {
      install(key, s);
      setCatalogAddress(key, replace);
    }
  } catch (e) {
    if (seq === revision) el('status').textContent = 'Could not open catalog. ' + e.message;
  }
}
el('domains').onclick = (event) => {
  const btn = /** @type {HTMLElement} */ (event.target).closest('[data-key]');
  if (btn instanceof HTMLButtonElement) {
    const menu = sourceMenus.find(menu => menu.parentElement.dataset.sourceDomain === btn.dataset.key);
    void openCatalog(menu?.value ?? btn.dataset.key);
  }
};
for (const menu of sourceMenus) menu.onchange = () => void openCatalog(menu.value);
input('file').onchange = () => {
  const f = input('file').files[0];
  input('file').value = '';
  if (f) void openCatalog('custom', f);
};
window.addEventListener('popstate', () => {
  const key = catalogFromAddress();
  if (key !== active) void openCatalog(key, null, true);
  else {
    ++revision; // A back navigation can cancel an in-flight switch.
    if (el('status').textContent === 'Loading catalog…') el('status').textContent = '';
  }
});
void openCatalog(catalogFromAddress(), null, true);

const divider = el('divider'),
  shelves = el('shelves');
function resize(ratio) {
  const value = Math.max(15, Math.min(85, Math.round(ratio)));
  shelves.style.setProperty('--top', value + 'fr');
  shelves.style.setProperty('--bottom', 100 - value + 'fr');
  divider.setAttribute('aria-valuenow', String(value));
}
divider.onkeydown = (e) => {
  const delta = { ArrowUp: -5, ArrowDown: 5, Home: -100, End: 100 }[e.key];
  if (delta) {
    e.preventDefault();
    resize(Number(divider.getAttribute('aria-valuenow')) + delta);
  }
};
divider.onpointerdown = (e) => {
  divider.setPointerCapture(e.pointerId);
};
divider.onpointermove = (e) => {
  if (divider.hasPointerCapture(e.pointerId)) {
    const b = shelves.getBoundingClientRect();
    resize((100 * (e.clientY - b.top - divider.offsetHeight / 2)) / (b.height - divider.offsetHeight));
  }
};
input('rating-file').onchange = async () => {
  const f = input('rating-file').files[0],
    current = state;
  input('rating-file').value = '';
  if (!f || !current) return;
  try {
    const { ratings: rows, sources, ratedOn } = importRatingEntries(await f.text(), current.data);
    if (state !== current) return;
    for (const id of Object.keys(rows)) {
      state.draftSources[id] = sources[id] ?? state.draftSources[id] ?? 'unknown';
      if (Object.hasOwn(ratedOn, id)) {
        if (ratedOn[id]) state.draftDates[id] = ratedOn[id];
        else delete state.draftDates[id];
      }
    }
    Object.assign(state.draft, rows);
    state.cleared = null;
    refreshRatingShelves();
    if (result) el('status').textContent = 'Imported ' + Object.keys(rows).length + ' ratings.';
  } catch (e) {
    if (state === current) el('status').textContent = e.message;
  }
};
el('save-ratings').onclick = () => {
  if (!state) return;
  const trackSources = Object.values(catalog.models).some((model) => model.titleChoice);
  saveCSV(
    active + '-ratings.csv',
    ratingsCSV(catalog, state.draft, trackSources ? state.draftSources : null, state.draftDates),
  );
};
el('save-forecasts').onclick = () => {
  if (result) saveCSV(active + '-predictions.csv', forecastsCSV(catalog, result, state.model));
};

function renderSnapshot() {
  const snapshot = state.snapshot,
    details = el('snapshot');
  details.hidden = !snapshot;
  if (!snapshot) {
    el('snapshot-body').replaceChildren();
    return;
  }
  const table = node('table'),
    h = table.createTHead().insertRow();
  for (const label of [
    'Item',
    'Saved model',
    'Saved mean',
    'Applied mean',
    'Saved shift',
    'Saved cutoff',
    'Saved chance',
  ])
    h.append(node('th', label));
  const body = table.createTBody(),
    live = new Map(result?.predictions.map((p) => [p.itemId, p.expected]));
  for (const row of snapshot) {
    const tr = body.insertRow();
    for (const value of [
      titles.get(row.itemId),
      row.model,
      row.expected.toFixed(2),
      live.has(row.itemId) ? Number(live.get(row.itemId)).toFixed(2) : '—',
      signed(row.shift),
      scaleLabel(row.cutoff),
      percent(row.chance),
    ])
      tr.append(node('td', value));
  }
  el('snapshot-body').replaceChildren(table);
}
input('prediction-file').onchange = async () => {
  const f = input('prediction-file').files[0],
    current = state;
  input('prediction-file').value = '';
  if (!f || !current) return;
  try {
    const saved = importForecasts(await f.text(), current.data);
    if (state !== current) return;
    state.snapshot = saved;
    renderSnapshot();
    const details = /** @type {HTMLDetailsElement} */ (el('snapshot'));
    details.open = true;
    details.scrollIntoView({ block: 'nearest' });
    el('status').textContent = 'Opened ' + saved.length + ' saved predictions.';
  } catch (e) {
    if (state === current) el('status').textContent = e.message;
  }
};
