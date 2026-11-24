import { openGroupDialog } from './group-dialog.mjs';
import { submitRatingRequest } from './group-profiles.mjs';
import { recommendationPlot } from './recommendation-plot.mjs';
import { surprisePanel } from './rating-surprises.mjs';
import { recommendationFilters } from './filters.mjs';
import { catalogForDomain, renderChoice, showSources, sourceDomains } from './catalog-choices.mjs';
import { minimumAxisShare } from './axis-annotations.mjs';
import { openRapidRating } from './rapid.mjs';
import { renderFilmValidation } from './film-validation.mjs';
import { catalogScores, filmScores, renderModelScores } from './model-scores.mjs';
import { wireFilmCheck } from './film-check-dialog.mjs';
import { modelEvidence, prepareCounts } from './evidence.mjs';
import { calibrationYear, latestRatingDate, populationModel } from './calendar.mjs';
import { rankingWeightControl } from './question-control.mjs';
import { discoveryRanking } from './discovery.mjs';
import { projectClasses, tasteProfile, questionScores } from './taste.mjs';
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
import { validateCatalog, predict, defaultCutoff, gaussianProjection, rankChanges, heldOutRatings } from './core.mjs';
import { node, percent, signed, scoreText, showDetail } from './detail.mjs';

const el = (id) => document.getElementById(id);
const input = (id) => /** @type {HTMLInputElement} */ (el(id));
const select = (id) => /** @type {HTMLSelectElement} */ (el(id));
const api = { submit:submitRatingRequest, heldOutRatings, tasteProfile, questionScores, discoveryRanking, rankChanges, preferenceFingerprint, gaussianProjection,
  importRatings, importRatingEntries, importForecasts, ratingsCSV, forecastsCSV };
Object.assign(window, { RatingPrediction: api, MediaRatings: api });
const states = new Map();
let active,
  state,
  catalog,
  result,
  reviewView,
  baseline,
  baselineModel,
  titles,
  selected,
  taste,
  revision = 0;
const isFilm = (k) => k === 'expanded';
wireFilmCheck(() => {
  if (!isFilm(active) || !result) throw new Error('Open the film catalog and update predictions.');
  if (!sameRatings(state.draft, state.applied) || !sameRatings(state.draftDates, state.appliedDates) ||
      !sameRatings(state.draftSources, state.appliedSources)) throw new Error('Apply your rating edits first.');
  const matched = reviewView?.mode === 'context';
  const rows = matched ? reviewView.rows : result.predictions;
  return {catalog, titles, rankedIds:rows.filter(p => filters.matches(p.itemId)).map(p => p.itemId),
    reviewWeight:state.reviewWeight, ranking:matched ? 'reviewContext' : 'expected',
    request:{model:state.model, ratings:state.applied, ratedOn:state.appliedDates,
      volunteered:Object.keys(state.applied).filter(id => state.appliedSources[id] === 'volunteered')}};
});
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
    familiarityWeight: 0.5,
    reviewWeight: key === 'games' ? 0.75 : 0,
    reviewContext: !data.activityCountLabel && data.domain !== 'cities' && !data.name?.startsWith('Stravl') &&
      data.items.every(it => Number.isSafeInteger(it.annotations?.ratingCount)),
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
el('group-open').onclick = () => {
  if (result) openGroupDialog({catalog, state, titles, matches:id=>filters.matches(id), scaleLabel,
    scaleChoices, markChoices, inspect:id=>{
      inspectItem(id,true);
      el('detail-title').focus({preventScroll:true});
      el('detail').scrollIntoView({block:'nearest'});
    }});
};
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
const limitedEvidence = {
  cocktails: 'Exploratory · Four ratings gave almost the same predictions as an empty profile for 66 held-out cocktail reviewers.',
  recipes: 'Exploratory · Four ratings gave almost the same predictions as an empty profile for 38 held-out Taste of Home reviewers.',
  subreddits: 'Exploratory · Four random answers did little to predict replies in this 2014 archive. With one known reply, top-ten recovery rose from 29.3% to 30.2%.',
};
function showExploratory(open) {
  for (const id of ['domain-cocktails','domain-subreddits']) el(id).hidden = !open;
  el('explore-catalogs').setAttribute('aria-expanded',String(open));
  el('explore-catalogs').textContent = open ? 'Exploratory ▾' : 'Exploratory ▸';
}
el('explore-catalogs').onclick = () => showExploratory(el('explore-catalogs').getAttribute('aria-expanded') !== 'true');
function install(key, next) {
  for (const dialog of document.querySelectorAll('dialog[open]'))
    /** @type {HTMLDialogElement} */ (dialog).close();
  active = key;
  state = next;
  catalog = state.data;
  selected = state.selection;
  titles = new Map(catalog.items.map((it) => [it.itemId, titleOf(it)]));
  const domain = sourceDomains.get(key) ?? key;
  showSources(el('source-choices'), key, openCatalog);
  if (domain === 'cocktails' || domain === 'subreddits') showExploratory(true);
  el('catalog-limit').textContent = limitedEvidence[key] ?? '';
  el('catalog-limit').hidden = !limitedEvidence[key];
  for (const btn of el('domains').querySelectorAll('button[data-key]'))
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-key') === domain));
  const domainButton = el('domains').querySelector('button[aria-pressed=true]');
  domainButton.setAttribute('title', catalog.items.length.toLocaleString() + ' entries');
  el('recommendation-icon').textContent = domainButton.querySelector('i').textContent;
  input('about-open').disabled = false;
  revealCatalogButton();
  const modelChoices = Object.entries(catalog.models)
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
        const description = name + (k === catalog.defaultModel ? ' · default' :
          !catalog.defaultModel && k === catalog.selection?.model ? ' · CV pick' : '');
        return { value: k, label: name, description };
      });
  state.modelChoices = modelChoices;
  const modelMenu = select('model');
  modelMenu.replaceChildren(...modelChoices.map(({value, description}) => new Option(description, value)));
  modelMenu.value = state.model;
  modelMenu.disabled = modelChoices.length === 1;
  el('model-choice').hidden = false;
  void showModelScores();
  modelMenu.onchange = () => {
    state.model = modelMenu.value;
    void showModelScores();
    rebuildBaseline();
    update(input('auto').checked);
  };
  const attribution = el('dataset-source');
  attribution.replaceChildren();
  const source =
    key === 'expanded'
      ? { title: 'MovieLens terms and citation', url: new URL('./MOVIELENS-LICENSE.txt', import.meta.url).href }
      : key !== 'custom'
        ? catalog.source
        : null;
  if (source) {
    const link = node('a', source.title);
    link.href = source.url;
    attribution.append(link);
    if (source.author) attribution.append(' · ' + source.author);
    if (source.license && source.licenseUrl) {
      const license = node('a', source.license);
      license.href = source.licenseUrl;
      attribution.append(' · ', license);
    }
    if (source.notes) attribution.append(node('p', source.notes));
  }
  const creditDocs = { expanded: 'creator-credits.md', tv: 'creator-credits.md', anime: 'book-anime-data.md', books: 'book-anime-data.md' };
  const catalogGuides = {
    'book-crossing': 'book-crossing.md',
    'royalroad-kindle': 'royalroad-data.md',
    'goodreads-fanfiction': 'granular-source-audit.md',
    'kindle-worlds': 'kindle-worlds.md',
  };
  if (Object.hasOwn(creditDocs, key) || Object.hasOwn(catalogGuides, key)) {
    const guide = node('a', creditDocs[key] ? 'Creator credit sources and coverage' : 'Catalog coverage and held-out evaluation');
    guide.href = 'https://github.com/NikVetr/vetr-dev-site/blob/main/media-ratings/' + (creditDocs[key] ?? catalogGuides[key]);
    const sources = node('p');
    sources.append(guide);
    attribution.append(sources);
  }
  el('distribution-title').textContent = catalog.responsePrompt
    ? 'Response distribution'
    : 'Rating distribution';
  el('scale-help').textContent =
    catalog.responsePrompt ??
    (catalog.scaleLabels ? catalog.scale.map((v) => scaleLabel(v) + ' = ' + v).join(' · ') : '');
  input('search').value = '';
  const contextGuide = el('about-discovery');
  contextGuide.hidden = !state.reviewContext;
  contextGuide.replaceChildren();
  if (state.reviewContext) {
    contextGuide.append('Match my picks changes the order using the titles you chose to rate. Both likes and dislikes count as choices. App suggestions and imports with unknown sources contribute only their ratings. At 0% the list ranks by predicted rating.');
    if (key === 'games') {
      contextGuide.append(' At 100% it ranks by shared Steam reviewers and review frequency. With at least four picks, it also considers how widely reviewed your games are. Picks entirely in the most-reviewed tenth already carry that signal through shared reviewers. The approval interval estimates the share of Steam reviewers who recommend each game.');
      const study = node('a', 'Steam ranking evaluation');
      study.href = 'https://github.com/NikVetr/vetr-dev-site/blob/main/media-ratings/discovery-study.md';
      contextGuide.append(' ', study);
    } else contextGuide.append(' At 100% it uses similarities among your picks and how often each item was rated.');
  }
  el('boards').replaceChildren();
  setupFilters();
  input('quick-session').disabled = false;
  el('library').scrollTop = 0;
  showValidation(catalog.selection);
  rebuildBaseline();
  update(input('auto').checked);
}
let utilityReport;
el('about-open').onclick = async () => {
  const key = active, note = el('about-utility');
  note.hidden = true;
  /** @type {HTMLDialogElement} */ (el('about-recommendations')).showModal();
  if (key === 'custom') return;
  try {
    utilityReport ??= readJSON('validation/information-audit.json');
    const audit = (await utilityReport)[key];
    if (active !== key || !audit) return;
    const hasEmpty = Number.isFinite(audit.sameModelNoHintsLoss);
    const before = hasEmpty ? audit.sameModelNoHintsLoss : audit.baselineLoss;
    note.textContent = 'Catalog default · The strongest first question gives ' + scoreText(audit.maxBits, 3) +
      ' bits about taste class. Across ' + audit.testPeople.toLocaleString() + ' held-out people, log loss was ' +
      before.toFixed(4) + (hasEmpty ? ' with answers hidden' : ' for the item-only baseline') +
      ' and ' + audit.personalizedLoss.toFixed(4) + ' with supplied answers. Lower is better.';
    note.hidden = false;
  } catch {
    utilityReport = null;
    if (active === key) { note.textContent = 'The catalog evaluation could not be loaded.'; note.hidden = false; }
  }
};
let filmValidationReport;
function loadFilmReport() {
  filmValidationReport ??= readJSON('validation/film-calibration.json').catch(error => {
    filmValidationReport = null;
    throw error;
  });
  return filmValidationReport;
}
async function showModelScores() {
  const current = state, key = current.model;
  const preview = el('score-preview'), details = el('score-details');
  el('model-scores').hidden = false;
  details.replaceChildren();
  if (active === 'custom') {
    preview.textContent = 'Imported catalog';
    details.textContent = 'No published model evaluation is linked to this import.';
  } else {
    const films = isFilm(active);
    if (films) preview.textContent = 'Loading film scores…';
    try {
      const report = films ? await loadFilmReport() : null;
      if (state !== current || state.model !== key) return;
      const menu = select('model');
      for (const option of menu.options) {
        const scores = films ? filmScores(report, option.value) : catalogScores(catalog, option.value);
        if (menu.options.length > 1) {
          const choice = current.modelChoices.find(c => c.value === option.value);
          const caption = choice.description + ' · ' + scores.menuScore;
          if (option.text !== caption) option.text = caption;
        }
        if (option.value === key) renderModelScores(preview, details, scores);
      }
    } catch {
      if (state === current && state.model === key) {
        preview.textContent = films ? 'Film scores unavailable' : 'Model scores unavailable';
        const retry = node('button', 'Retry loading scores');
        retry.onclick = showModelScores;
        details.replaceChildren(retry);
      }
    }
  }
}
async function showFilmComparison() {
  const host = el('film-comparison');
  if (!isFilm(active) || !/** @type {HTMLDetailsElement} */ (el('validation')).open) return;
  host.textContent = 'Loading matched film scores…';
  try {
    const report = await loadFilmReport();
    if (isFilm(active)) renderFilmValidation(host, report);
  } catch (error) {
    if (isFilm(active)) host.textContent = 'Could not load the matched film scores. ' + error.message;
  }
}
el('validation').addEventListener('toggle', showFilmComparison);
function showValidation(selection) {
  const details = el('validation');
  el('film-comparison').hidden = el('film-check').hidden = !isFilm(active);
  if (isFilm(active)) void showFilmComparison();
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
  const pooling = selection.pooling;
  if (pooling?.holdout?.allSparseTargets) {
    const table = node('table'), head = node('tr');
    table.append(node('caption', 'Steam approval · held-out review predictions'));
    for (const name of ['Prior', 'Player log loss', 'Sparse-game log loss', 'Sparse-game Brier'])
      head.append(node('th', name));
    table.createTHead().append(head);
    const body = table.createTBody();
    for (const [name, stats] of [['Fixed', pooling.baseline], ['Learned from games', pooling.holdout]]) {
      const row = body.insertRow();
      row.insertCell().textContent = name;
      for (const value of [stats.playerLogLoss, stats.allSparseTargets.gameLogLoss, stats.allSparseTargets.gameBrier])
        row.insertCell().textContent = value.toFixed(4);
    }
    tables.append(table);
  }
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
    name = node('button', titles.get(p.itemId)),
    mean = node('span', binary() ? percent(p.expected) : p.expected.toFixed(2));
  head.className = 'entry-head';
  name.type = 'button';
  name.className = 'entry-title';
  name.setAttribute('aria-controls', 'detail');
  if (selected === p.itemId) name.setAttribute('aria-current', 'true');
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
      subreddits: 'Topic',
    }[catalog.domain] ?? 'Genre']: a.genres,
    Tag: a.tags,
    [creditLabel('authors')]:
      a.authors ?? (a.author ? [a.author] : []),
    Director: a.directors,
    [creditLabel('cast')]: a.cast,
    Illustrator: a.illustrators, Translator: a.translators, Editor: a.editors, Creator: a.creators,
    Studio: a.studios,
    Platform: a.platforms,
    Mode: a.modes,
    Developer: a.developers,
    Publisher: a.publishers,
    Completion: a.completion ? [a.completion] : [],
    Format: a.format ? [a.format] : [],
    Certificate: a.certificate ? [a.certificate] : [],
    Collection: a.collection ? [a.collection] : [],
    Volume: catalog.domain === 'royalroad' && a.releaseOrder ? ['Volume ' + a.releaseOrder] : [],
    Series: a.series,
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
  const sorts = [{label:'Catalog mean', value:'mean'}, {label:'Title A–Z', value:'title'}];
  if (catalog.items.some((it) => it.annotations?.year))
    sorts.push({label:'Newest first', value:'year'});
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
      sorts.push({label, value:key});
  for (const key of Object.keys(creditSorts)) {
    if (catalog.items.some(it => creditValues(it.annotations ?? {}, key).length))
      sorts.push({label:creditLabel(key) + ' A–Z', value:key});
  }
  state.sortKey ??= 'mean';
  renderChoice(el('sort-choice'), 'sort', 'Sort by', sorts, state.sortKey, value => {
    state.sortKey = value;
    sortCatalog();
  });
}
const creditSorts = {
  authors: 'Author', directors: 'Director', cast: 'Cast', studios: 'Studio', publishers: 'Publisher',
  creators: 'Creator', illustrators: 'Illustrator', translators: 'Translator', editors: 'Editor', developers: 'Developer',
};
function creditLabel(key) {
  if (key === 'authors') return { albums: 'Artist', boardgames: 'Brand' }[active] ?? 'Author';
  if (key === 'cast' && active === 'anime') return 'Voice cast';
  return creditSorts[key];
}
function creditValues(annotations, key) {
  return annotations[key] ?? (key === 'authors' && annotations.author ? [annotations.author] : []);
}
function sortCatalog() {
  const key = state.sortKey;
  const sorted = [...entries.keys()].sort((a, b) => {
    if (key === 'title') return titles.get(a).localeCompare(titles.get(b));
    if (key === 'mean') return baseline.get(b).expected - baseline.get(a).expected;
    if (Object.hasOwn(creditSorts, key)) {
      const left = creditValues(metadata.get(a), key)[0], right = creditValues(metadata.get(b), key)[0];
      return Number(!left) - Number(!right) || (left ?? '').localeCompare(right ?? '') || titles.get(a).localeCompare(titles.get(b));
    }
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
  else if (result) {
    renderBoards();
    if (id === selected) renderDetail();
  }
}
function refreshRatingShelves() {
  rebuildBaseline();
  if (input('auto').checked) update();
  else {
    syncDraft();
    if (result) {
      renderBoards();
      renderDetail();
    }
  }
}
input('quick-session').onclick = () => {
  if (!state || !result) return;
  const opened = state;
  const ids = catalog.items
    .map((it) => it.itemId)
    .filter((id) => !Object.hasOwn(state.draft, id) && filters.matchesRatingItem(id));
  const criteria = [];
  if (taste && (taste.weights.length > 1 || taste.familiarity)) {
    criteria.push(['info', taste.familiarity ? 'Information and familiarity' : 'Most informative']);
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
    const info = questionScores(profile, opened.familiarityWeight);
    return [...ids].filter((id) => info.has(id)).sort((a, b) => info.get(b) - info.get(a) || a.localeCompare(b));
  }
  openRapidRating({
    catalog,
    stars: halfStars() || wholeStars(),
    ids,
    titles,
    links: state.links,
    criteria,
    rank,
    familiarity: taste?.familiarity ? {
      weight: opened.familiarityWeight,
      set(weight) { opened.familiarityWeight = weight; renderBoards('information'); },
    } : null,
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
  const button = /** @type {HTMLElement} */ (event.target).closest('button');
  const li = button?.closest('.entry');
  if (!li) return;
  if (button.matches('.entry-title') && result) {
    inspectItem(li.getAttribute('data-id'), true);
    el('detail-title').focus({ preventScroll: true });
    el('detail').scrollIntoView({ block: 'nearest' });
  } else if (button.matches('.clear')) {
    li.querySelector('input').focus();
    edit(li, undefined);
  }
};
input('search').oninput = filterRows;
function selectVisibleItem() {
  if (state.inspectFromShelf && titles.has(selected)) return;
  if (!result.predictions.some((p) => p.itemId === selected && filters.matches(p.itemId)))
    setSelection((reviewView?.rows ?? result.predictions).find((p) => filters.matches(p.itemId))?.itemId, false);
}

function refreshDiscovery() {
  reviewView = null;
  if (!state.reviewContext || !state.reviewWeight || state.discoveryError) return;
  const volunteered = Object.keys(state.applied).filter(id => state.appliedSources[id] === 'volunteered');
  if (!volunteered.length) return;
  try {
    reviewView = discoveryRanking(catalog, { predictions: result.predictions, ratings: state.applied,
      volunteered, weight: state.reviewWeight, discovery: state.discovery });
  } catch (error) {
    state.discoveryError = error.message;
  }
}

function setSelection(id, fromShelf) {
  for (const shelf of [entries, copies]) {
    shelf.get(selected)?.querySelector('.entry-title').removeAttribute('aria-current');
    shelf.get(id)?.querySelector('.entry-title').setAttribute('aria-current', 'true');
  }
  selected = state.selection = id;
  scatter.select(id);
  state.inspectFromShelf = fromShelf;
}

function inspectItem(id, fromShelf) {
  setSelection(id, fromShelf);
  for (const b of el('boards').querySelectorAll('.rank[aria-pressed="true"]'))
    b.setAttribute('aria-pressed', 'false');
  for (const b of el('boards').querySelectorAll('.rank[data-id="' + CSS.escape(id) + '"]'))
    b.setAttribute('aria-pressed', 'true');
  renderDetail();
}

const scatter = recommendationPlot((id, visit) => {
  state.followedSuggestions.add(id);
  inspectItem(id, false);
  reveal(id);
  if (visit) {
    el('detail-title').focus({preventScroll:true});
    el('detail').scrollIntoView({block:'nearest'});
  }
});
input('scatter-toggle').onclick = () => {
  if (!result) return;
  state.scatter = !state.scatter;
  renderBoards();
};
const updateSurprises = surprisePanel(el('rating-surprises'), id => {
  inspectItem(id, true);
  el('detail-title').focus({preventScroll:true});
  el('detail').scrollIntoView({block:'nearest'});
});
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
    el('about-model').textContent = state.modelChoices.find(option => option.value === state.model).description + '. ' +
      (model.description ?? (model.kind === 'class-similarity' ? 'Your responses update learned taste classes. Similar items also influence each forecast.' + (isFilm(active) && state.model === 'personalized' ? ' Film similarity uses ratings, tags and shared cast, directors and studios.' : '')
      : model.kind === 'latent-class' ? 'Your answers update the probability of each learned taste class. Their rating distributions combine into each forecast.'
      : model.kind === 'logit-point' ? 'The model conditions a multivariate Gaussian on your transformed ratings.'
      : 'The model conditions on the latent intervals corresponding to your ratings and combines the component forecasts.'));
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
      model.description ?? (model.kind === 'class-similarity'
        ? 'Your ratings update the taste-class probabilities. Ratings above or below what those classes predict also shift forecasts for similar ' +
          (isFilm(active) ? (state.model === 'personalized' ? 'films, using rating patterns, MovieLens tags and shared credits.' : 'films, using rating patterns and MovieLens tags.') : 'entries.')
        : model.kind === 'latent-class'
          ? 'Taste components each learn a star or response distribution for every title. Each answer updates your class probabilities. The forecast averages each class’s distribution using those probabilities.'
          : result.weights.length > 1
            ? 'Taste components (catalog → yours)  ' +
              result.weights
                .map((w, i) => i + 1 + '. ' + percent(w.prior) + ' → ' + percent(w.posterior))
                .join('   ·   ')
            : '');
    if (
      result.weights.some((w) => w.posterior > 0.01 && w.effectiveSamples !== null && w.effectiveSamples < 20)
    )
      el('weights').textContent += ' Integration is imprecise for these ratings.';
    refreshDiscovery();
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
      true,
      volunteered,
      ratedOn,
    );
    renderFingerprint();
    updateSurprises(catalog, {model:state.model, ratings:state.applied, ratedOn:state.appliedDates, volunteered}, titles);
    renderSnapshot();
    renderBoards();
    renderDetail();
    el('status').textContent = '';
  } catch (error) {
    // A failed model calculation must never leave rankings labeled as a new fit.
    result = null;
    updateSurprises(null,null,null);
    el('taste').hidden = true;
    el('boards').replaceChildren();
    input('scatter-toggle').disabled = true;
    el('detail').hidden = true;
    el('weights').textContent = '';
    el('choice-note').hidden = true;
    el('context').textContent = catalog.name;
    el('status').textContent = error.message;
  }
  input('group-open').disabled = !result;
  syncDraft();
}
function renderFingerprint() {
  const model = catalog.models[state.model];
  const categorical = ['latent-class', 'class-similarity'].includes(model.kind);
  let prefs = state.fingerprintViews.get(state.model);
  if (!prefs) {
    prefs = { axes: undefined, pinned: null, centerClassMeans: true, includeSmall: false };
    state.fingerprintViews.set(state.model, prefs);
  }
  const request = {
    model: state.model,
    ratings: state.applied,
    ratedOn: state.appliedDates,
    axisIndices: prefs.axes,
    centerClassMeans: prefs.centerClassMeans, overview: true,
    minimumMapShare: prefs.includeSmall ? 0 : minimumAxisShare,
  };
  let view;
  if (categorical) {
    const all = prefs.centerClassMeans
      ? taste.projection
      : projectClasses(baselineModel, catalog.scale, false);
    const indices = prefs.axes ?? all.slice(0, 2)
      .filter(axis => axis.index === 0 || axis.fraction >= request.minimumMapShare).map(axis => axis.index);
    view = { ...taste, allAxes: all, projection: indices.map((i) => all[i]), spectrum: all.map((a) => a.fraction) };
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
function recommendationHeader(spec, title, count, isShift) {
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
    if (taste?.familiarity) head.append(rankingWeightControl('weight-familiarity', state.familiarityWeight, weight => {
      state.familiarityWeight = weight;
      renderBoards('information');
      el('weight-familiarity').focus({ preventScroll: true });
    }));
  } else if (spec.key === 'expected' && state.reviewContext && !state.discoveryError) {
    head.append(rankingWeightControl('review-weight', state.reviewWeight, weight => {
      state.reviewWeight = weight;
      refreshDiscovery();
      renderBoards('expected');
      el('review-weight')?.focus({ preventScroll: true });
    }, 'discovery'));
  } else head.append(node('small', count + ' · ' + spec.hint));
  return head;
}
function recommendationRow(p, index, spec, isShift, ranks) {
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
  if (spec.key === 'information') {
    score.title = score.textContent + ' of expected information about your taste class';
    if (taste.familiarity) score.title += ' · familiarity percentile ' + Math.round(100 * taste.familiarity.get(p.itemId));
  }
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
function renderBoards(only = '') {
  closeRatingChoices();
  if (state.scatter && only === 'expected') return;
  const host = el('boards');
  const positions = new Map(
    [...host.querySelectorAll('.ranks')].map((list) => [
      list.getAttribute('data-key'),
      { top: list.scrollTop, count: list.children.length },
    ]),
  );
  if (only !== 'expected') ratingObserver?.disconnect();
  const visible = only === 'information' ? [] : result.predictions.filter((p) => filters.matches(p.itemId));
  const rankMovements = only ? null : rankChanges(visible);
  const weighted = Boolean(taste?.familiarity && state.familiarityWeight > 0);
  const questions = weighted ? questionScores(taste, state.familiarityWeight) : taste?.information;
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
  for (const original of shown) {
    if (state.scatter && !['information','ratingChange'].includes(original.key)) continue;
    if (only && original.key !== only) continue;
    const spec = original.key === 'information' ? {
      ...original,
      score: p => questions?.get(p.itemId) ?? 0,
      format: (_, p) => scoreText(taste.information.get(p.itemId), 3) + ' bits',
    } : original;
    const board = node('section'),
      list = node('div');
    board.className = 'board';
    board.dataset.panel = spec.key;
    list.className = 'ranks';
    list.dataset.key = spec.key;
    const direction = state.directions[spec.key];
    const isShift = Boolean(direction);
    const ranks = spec.key === 'rankChange' ? rankMovements : null;
    const reviewBoard = spec.key === 'expected' && state.reviewContext;
    const matched = reviewBoard && reviewView?.mode === 'context';
    const title = matched ? 'Recommended for you' : spec.key === 'chance' ? 'Chance of ≥ ' + scaleLabel(state.threshold) : spec.title;
    if (reviewBoard) board.classList.add('review-context');
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
          ? (state.familiarityWeight === 1 ? 'Ranked by estimated familiarity.' : 'Blends information and familiarity ranks.')
            + ' Each score is the expected information gained about your taste class.'
          : 'Expected information in bits about ' +
              taste.weights.length +
              ' taste classes, given your applied ratings.',
      );
      why.className = 'info-note';
      board.append(why);
    } else if (reviewBoard) {
      const why = node('p', state.discoveryError ? 'Review context unavailable. ' + state.discoveryError
        : matched ? (reviewView.source === 'coReview' ? 'Ordered using games reviewed by the same players.'
          : 'Ordered using item similarity and rating counts.') + (activity ? ' Scores show predicted approval.' : ' Scores show predicted ratings.')
        : !state.reviewWeight ? 'Ordered by predicted rating alone.'
        : reviewView?.anchors ? 'No related reviews found. Ordered by predicted rating.'
        : 'Choose a title yourself in Your ratings to match recommendations to your picks.');
      why.className = 'info-note';
      board.append(why);
    }
    const orderScore = (p) => {
      const delta = ranks ? ranks.get(p.itemId).change : spec.score(p);
      return direction === 'down' ? -delta : delta;
    };
    const items = matched ? reviewView.rows.filter(p => filters.matches(p.itemId))
      : (spec.key === 'information' ? result.predictions : visible)
      .filter((p) =>
        isShift
          ? orderScore(p) > 0
          : spec.key === 'information'
            ? !!taste &&
              (taste.weights.length > 1 || weighted) &&
              !Object.hasOwn(state.draft, p.itemId) &&
              filters.matchesRatingItem(p.itemId)
            : true,
      )
      .sort((a, b) => orderScore(b) - orderScore(a) || (spec.key === 'information' ? a.itemId.localeCompare(b.itemId) : 0));
    board.prepend(recommendationHeader(spec, title, items.length, isShift));
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
        const row = recommendationRow(items[rendered], rendered, spec, isShift, ranks);
        rows.append(row);
        if (list.isConnected && spec.key === 'information') ratingObserver.observe(row);
        rendered++;
      }
      list.append(rows);
      if (rendered === items.length) list.onscroll = null;
    }
    const position = only ? null : positions.get(spec.key);
    fill(items.length <= 600 ? items.length : position?.top ? Math.max(100, position.count) : 100);
    if (rendered < items.length) {
      fillRankings.set(list, fill);
      list.onscroll = () => {
        if (list.scrollTop + list.clientHeight >= list.scrollHeight - 240) fill(rendered + 100);
      };
    }
    fragment.append(board);
  }
  if (only) host.querySelector('.ranks[data-key="' + only + '"]').closest('.board').replaceWith(fragment);
  else {
    host.replaceChildren(fragment);
    const toggle = input('scatter-toggle');
    toggle.disabled = false;
    toggle.setAttribute('aria-pressed', String(Boolean(state.scatter)));
    host.classList.toggle('scatter-mode', Boolean(state.scatter));
    if (state.scatter) {
      host.append(scatter.panel);
      scatter.render({
        rows: visible, ranks: rankMovements, titles, scale: catalog.scale, binary: activity,
        rated: Object.keys(state.applied).length,
        expectedLabel: activity ? shown.find(spec => spec.key === 'expected').title : 'Expected rating',
      }, selected);
    }
  }
  for (const list of only ? [] : host.querySelectorAll('.ranks'))
    list.scrollTop = positions.get(list.getAttribute('data-key'))?.top ?? 0;
  if (only === 'expected') return;
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
// A shelf selection can already be rated. Withhold its answer, title evidence and date
// when comparing it with the forecast from the person's other applied ratings.
let lastHeldOut;
function inspectionForecast() {
  if (selected == null) return { p: null, prior: null };
  const prior = baseline.get(selected);
  if (!Object.hasOwn(state.applied, selected))
    return { prior, p: result.predictions.find(item => item.itemId === selected) };
  if (lastHeldOut?.result === result && lastHeldOut.id === selected && lastHeldOut.threshold === state.threshold)
    return lastHeldOut;
  const ratings = { ...state.applied }, ratedOn = { ...state.appliedDates };
  delete ratings[selected];
  delete ratedOn[selected];
  const volunteered = Object.keys(ratings).filter(id => state.appliedSources[id] === 'volunteered');
  const p = predict(catalog, { model: state.model, ratings, volunteered, ratedOn, threshold: state.threshold, targetId: selected }).predictions[0];
  const population = populationModel(catalog, catalog.models[state.model], latestRatingDate(ratedOn));
  const comparison = population === baselineModel ? prior :
    predict({ ...catalog, models: { population } }, { model: 'population', targetId: selected }).predictions[0];
  lastHeldOut = { result, id: selected, threshold: state.threshold, p, prior: comparison };
  return lastHeldOut;
}
function renderDetail() {
  if (!result) return;
  showDetail({
    ...inspectionForecast(),
    ownRating: state.draft[selected],
    excluded: Object.hasOwn(state.applied, selected),
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
  const action = target.closest('button.rank, button.quick-rate, button[data-direction]');
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
  const id = btn.getAttribute('data-id');
  state.followedSuggestions.add(id);
  inspectItem(id, false);
  const closing = inline && openRating?.trigger === action;
  closeRatingChoices();
  reveal(selected, !inline);
  if (inline && !closing) showRatingChoices(row);
};
el('boards').onchange = (event) => {
  const radio = event.target;
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
  const resp = await fetch(new URL(path, import.meta.url));
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
const sharedArtworkCatalogs = new Set(['subreddits', 'recipes', 'books', 'royalroad-kindle', 'albums', 'games', 'tv']);
let sharedArtwork;
async function artworkFor(key) {
  if (key === 'metacritic') return readOptionalJSON('metacritic-artwork.json');
  if (!sharedArtworkCatalogs.has(key)) return null;
  sharedArtwork ??= readOptionalJSON('catalog-artwork.json');
  const {data, error} = await sharedArtwork;
  if (error) sharedArtwork = undefined;
  return {data: data?.[key], error};
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
  ...sourceDomains.keys(),
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
      const creditsFile = { expanded: 'film-creators', tv: 'tv-creators', anime: 'anime-credits', books: 'books-credits' }[key];
      const [data, references, context, credits, discovery, artwork] = file
        ? [JSON.parse(await file.text()), null, null, null, null, null]
        : await Promise.all([
            readJSON(key + '.json'),
            key === 'expanded'
              ? readOptionalJSON('film-links.json')
              : key === 'destinations'
                ? readOptionalJSON('destinations-links.json')
                : null,
            key === 'expanded' ? readOptionalJSON('film-context.json') : null,
            creditsFile ? readOptionalJSON(creditsFile + '.json') : null,
            key === 'games' ? readOptionalJSON('steam-discovery.json') : null,
            artworkFor(key),
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
      if (credits?.data || artwork?.data) {
        for (const item of data.items) {
          const credit = credits?.data?.[item.itemId];
          const art = artwork?.data?.[item.itemId];
          if (credit || art) item.annotations = { ...item.annotations, ...credit, ...art };
        }
      }
      s = useState(data, key);
      s.discovery = discovery?.data;
      s.discoveryError = discovery?.error;
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
                royalRoad: /^https:\/\/www\.royalroad\.com\/fiction\/[1-9]\d*$/.test(it.annotations.royalRoadUrl) ? it.annotations.royalRoadUrl : null,
                ao3: /^https:\/\/archiveofourown\.org\/works\/[1-9]\d*$/.test(it.annotations.storyUrl) ? it.annotations.storyUrl : null,
                ffn: /^https:\/\/www\.fanfiction\.net\/s\/[1-9]\d*$/.test(it.annotations.storyUrl) ? it.annotations.storyUrl : null,
                fanProgram: it.annotations.worldUrl?.startsWith('https://') ? it.annotations.worldUrl : null,
                imageUrl: it.annotations.imageUrl?.startsWith('https://') ? it.annotations.imageUrl : null,
                imageSourceUrl: it.annotations.imageSourceUrl ?? it.annotations.imageRightsUrl,
                imageCredit: it.annotations.imageCredit,
                imageLicense: it.annotations.imageLicense,
                imageLicenseUrl: it.annotations.imageLicenseUrl,
                imageCaption: it.annotations.imageCaption,
              },
            ]),
        );
      }
      s.linkError = references?.error;
      s.contextError = [context?.error && 'Film finances and familiarity counts unavailable.',
        credits?.error && 'Creator credits unavailable.', artwork?.error && 'Supplemental catalog artwork unavailable.'].filter(Boolean).join(' ');
      if (file) {
        s.evidenceMessage = 'This fitted catalog includes model probabilities only.';
        el('custom-domain').hidden = false;
      } else if (data.observationsNote) s.evidenceMessage = data.observationsNote;
      else void loadEvidence(key, s);
      if (seq !== revision) return;
      states.set(key, s);
    }
    if (seq === revision) {
      install(key, s);
      setCatalogAddress(key, replace);
    }
  } catch (e) {
    if (seq === revision) {
      if (active) showSources(el('source-choices'), active, openCatalog);
      el('status').textContent = 'Could not open catalog. ' + e.message;
    }
  }
}
el('domains').onclick = (event) => {
  const btn = /** @type {HTMLElement} */ (event.target).closest('[data-key]');
  if (btn instanceof HTMLButtonElement) {
    void openCatalog(catalogForDomain(btn.dataset.key));
  }
};
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
    if (el('status').textContent === 'Loading catalog…') {
      el('status').textContent = '';
      showSources(el('source-choices'), active, openCatalog);
    }
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
