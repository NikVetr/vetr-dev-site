import { tasteProfile } from './taste.mjs';
import { renderTaste } from './charts.mjs';
import { ratingsCSV, forecastsCSV, importRatings, importForecasts, saveCSV } from './exchange.mjs';
import { validateCatalog, predict, submit, defaultCutoff, gaussianProjection } from './core.mjs';
import { node, percent, signed, showDetail } from './detail.mjs';

const el = (id) => document.getElementById(id);
const input = (id) => /** @type {HTMLInputElement} */ (el(id));
const select = (id) => /** @type {HTMLSelectElement} */ (el(id));
Object.assign(window, {
  MediaRatings: {
    submit,
    tasteProfile,
    gaussianProjection,
    importRatings,
    importForecasts,
    ratingsCSV,
    forecastsCSV,
  },
});
const cutoff = select('threshold');
const states = new Map();
let active,
  state,
  catalog,
  result,
  baseline,
  titles,
  selected,
  taste,
  revision = 0;
const isFilm = (k) => k === 'expanded';
const entries = new Map();
const copies = new Map();
let ratingObserver;
const panels = [
  {
    key: 'information',
    title: 'Most informative to rate',
    hint: 'bits',
    score: (p) => taste?.information.get(p.itemId) ?? 0,
    format: (n) => n.toFixed(3),
  },
  {
    key: 'expected',
    title: 'Highest expected',
    hint: 'Mean',
    score: (p) => p.expected,
    format: (n) => n.toFixed(2),
  },
  { key: 'chance', title: 'Above cutoff', hint: 'Probability', score: (p) => p.chance, format: percent },
  { key: 'up', title: 'Biggest rise', hint: 'Shift ↑', score: (p) => p.shift, format: signed },
  {
    key: 'down',
    title: 'Biggest fall',
    hint: 'Shift ↓',
    score: (p) => -p.shift,
    format: (_, p) => signed(p.shift),
  },
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
function install(key, next) {
  active = key;
  state = next;
  catalog = state.data;
  selected = state.selection;
  titles = new Map(catalog.items.map((it) => [it.itemId, titleOf(it)]));
  for (const btn of el('domains').querySelectorAll('button'))
    btn.setAttribute('aria-pressed', String(btn.dataset.key === key));
  select('model').replaceChildren(
    ...Object.entries(catalog.models)
      .sort(([a], [b]) => Number(b === catalog.defaultModel) - Number(a === catalog.defaultModel))
      .map(([k, m]) => {
        const name =
          m.kind === 'class-similarity'
            ? 'Ratings + tags'
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
  cutoff.replaceChildren(...catalog.scale.map((v) => new Option(scaleLabel(v), String(v))));
  cutoff.value = String(state.threshold);
  el('scale-help').textContent = isFilm(key)
    ? 'Choose a half or whole star.'
    : catalog.scaleLabels
      ? catalog.scale.map((v) => scaleLabel(v) + ' = ' + v).join(' · ')
      : 'Choose a value on the rating scale.';
  input('search').value = '';
  el('boards').replaceChildren();
  setupFilters();
  el('library').scrollTop = 0;
  showValidation(catalog.selection);
  rebuildBaseline();
  update(input('auto').checked ? state.draft : state.applied);
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
    ' test ratings.';
  const full = selection.full;
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
function rebuildBaseline() {
  const population = predict(catalog, { model: state.model });
  baseline = new Map(population.predictions.map((p) => [p.itemId, p]));
  entries.clear();
  const empty = node('li', 'No matching entries.');
  empty.id = 'empty-list';
  empty.className = 'note';
  copies.clear();
  for (const p of population.predictions) {
    entries.set(p.itemId, entryRow(p, 'catalog'));
    if (Object.hasOwn(state.draft, p.itemId)) copies.set(p.itemId, entryRow(p, 'rated'));
  }
  el('library').replaceChildren(...entries.values(), empty);
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
    mean = node('span', p.expected.toFixed(2));
  head.className = 'entry-head';
  mean.className = 'entry-meta';
  mean.title = 'Catalog expected rating';
  head.append(name, mean);
  const body = node('div');
  body.className = 'rating-row';
  const choices = ratingControls(p.itemId, surface);
  const readout = node('span');
  readout.className = 'rating-readout';
  const clear = node('button', 'Clear');
  clear.className = 'clear';
  clear.setAttribute('aria-label', 'Clear rating for ' + titles.get(p.itemId));
  body.append(choices, readout, clear);
  li.append(head, body);
  syncRow(li);
  return li;
}
function ratingControls(id, surface) {
  const choices = node('div');
  choices.className = 'choices';
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-label', 'Rate ' + titles.get(id));
  for (const v of catalog.scale) {
    const star = isFilm(active),
      label = node('label'),
      radio = document.createElement('input'),
      glyph = node('span', star ? '' : scaleLabel(v));
    label.className = star ? 'choice star' : 'choice';
    radio.type = 'radio';
    radio.name = surface + '-rating-' + id;
    radio.value = String(v);
    const description = scaleLabel(v) + (star ? ' stars' : '');
    radio.setAttribute('aria-label', description);
    label.title = description;
    label.append(radio, glyph);
    choices.append(label);
  }
  return choices;
}
function syncRow(li) {
  const value = state.draft[li.dataset.id],
    rated = value !== undefined;
  li.classList.toggle('rated', rated);
  for (const r of li.querySelectorAll('input')) {
    r.checked = rated && Number(r.value) === value;
    r.parentElement.classList.toggle('filled', rated && Number(r.value) <= value);
  }
  li.querySelector('.clear').hidden = !rated;
  li.querySelector('.rating-readout').textContent = rated && isFilm(active) ? value + ' / 5' : '';
}
function facets(a) {
  return {
    Genre: a.genres,
    Tag: a.tags,
    Certificate: a.certificate ? [a.certificate] : [],
    Decade: a.year ? [Math.floor(a.year / 10) * 10 + 's'] : [],
    Collection: a.collection ? [a.collection] : [],
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
let metadata, facetIds;
function setupFilters() {
  metadata = new Map(catalog.items.map((it) => [it.itemId, it.annotations ?? {}]));
  facetIds = new Map();
  const groups = new Map();
  for (const [id, a] of metadata) {
    for (const [group, values] of Object.entries(facets(a))) {
      for (const value of values ?? []) {
        const key = group + '/' + value;
        if (!facetIds.has(key)) {
          facetIds.set(key, new Set());
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push(value);
        }
        facetIds.get(key).add(id);
      }
    }
  }
  const facet = select('facet');
  facet.replaceChildren(new Option('All categories', ''));
  for (const [group, values] of groups) {
    const opt = document.createElement('optgroup');
    opt.label = group;
    for (const value of values.sort((a, b) => a.localeCompare(b))) {
      const key = group + '/' + value;
      opt.append(new Option(value + ' (' + facetIds.get(key).size + ')', key));
    }
    facet.append(opt);
  }
  facet.disabled = !groups.size;
  select('sort').replaceChildren(new Option('Catalog mean', 'mean'), new Option('Title A–Z', 'title'));
  if (catalog.items.some((it) => it.annotations?.year))
    select('sort').add(new Option('Newest first', 'year'));
  for (const [key, label] of [
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
function inFacet(id) {
  return !select('facet').value || facetIds.get(select('facet').value).has(id);
}
function filterRows() {
  if (!state) return;
  const query = input('search').value.trim().toLocaleLowerCase();
  let count = 0;
  for (const [id, li] of entries) {
    li.hidden = !inFacet(id) || !titles.get(id).toLocaleLowerCase().includes(query);
    if (!li.hidden) count++;
  }
  el('empty-list').hidden = count > 0;
  el('empty-rated').hidden = copies.size > 0;
  el('unrated-count').textContent = String(count);
}
function reveal(id, focus = false) {
  const row = entries.get(id);
  if (row.hidden) {
    input('search').value = '';
    filterRows();
  }
  const list = el('library');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  list.scrollTo({
    top:
      list.scrollTop +
      row.getBoundingClientRect().top -
      list.getBoundingClientRect().top -
      (list.clientHeight - row.offsetHeight) / 2,
    behavior: reduced ? 'instant' : 'smooth',
  });
  if (!reduced)
    row.animate(
      [
        { outline: '2px solid var(--accent)', outlineOffset: '-3px' },
        { outline: '2px solid transparent', outlineOffset: '-3px' },
      ],
      1400,
    );
  if (focus) {
    row.querySelector('input').focus({ preventScroll: true });
    if (matchMedia('(max-width:690px)').matches)
      list.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
  }
}
function syncDraft() {
  const count = Object.keys(state.draft).length,
    dirty = !sameRatings(state.draft, state.applied);
  el('rated-count').textContent = count + ' / ' + catalog.items.length + ' rated';
  input('apply').disabled = !dirty;
  el('pending').hidden = !dirty;
  el('pending').textContent = 'Ratings have changed. Choose Update predictions to refresh the rankings.';
}
function edit(li, value) {
  if (value === undefined) delete state.draft[li.dataset.id];
  else state.draft[li.dataset.id] = value;
  const id = li.dataset.id;
  syncRow(entries.get(id));
  if (value === undefined) {
    if (copies.get(id)?.contains(document.activeElement))
      entries.get(id).querySelector('input').focus({ preventScroll: true });
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
  if (input('auto').checked) update(state.draft);
  else if (result) renderBoards();
}
el('shelves').onchange = (event) => {
  const r = /** @type {HTMLInputElement} */ (event.target);
  if (r.type === 'radio') edit(r.closest('.entry'), Number(r.value));
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
select('facet').onchange = () => {
  filterRows();
  if (result) {
    selectVisibleItem();
    renderBoards();
    renderDetail();
  }
};
function selectVisibleItem() {
  if (!result.predictions.some((p) => p.itemId === selected && inFacet(p.itemId)))
    selected = result.predictions.find((p) => inFacet(p.itemId))?.itemId;
  state.selection = selected;
}

input('apply').onclick = () => update(state.draft);
input('auto').onchange = () => {
  if (state && input('auto').checked) update(state.draft);
};
function update(ratings) {
  try {
    const next = predict(catalog, { model: state.model, ratings, threshold: state.threshold });
    result = next;
    state.applied = { ...ratings };
    const count = Object.keys(state.applied).length;
    el('context').textContent =
      catalog.name +
      ' · ' +
      (count ? count + ' applied rating' + (count === 1 ? '' : 's') : 'Catalog baseline') +
      ' · ' +
      result.predictions.length +
      ' unrated';
    const model = catalog.models[state.model];
    el('weights').textContent =
      model.kind === 'class-similarity'
        ? 'Your ratings update the taste-class probabilities. Ratings above or below what the classes predict also shift the forecasts for similar films. Similarity uses rating patterns and MovieLens tags.'
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
    taste = tasteProfile(catalog, state.applied, classKey, usesClasses ? next : null);
    const view = usesClasses
      ? taste
      : gaussianProjection(catalog, { model: state.model, ratings: state.applied });
    renderTaste(view, catalog);
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
    el('context').textContent = catalog.name;
    el('status').textContent = error.message;
  }
  syncDraft();
}
function renderBoards() {
  const host = el('boards');
  const positions = new Map(
    [...host.querySelectorAll('.ranks')].map((list) => [list.getAttribute('data-key'), list.scrollTop]),
  );
  ratingObserver?.disconnect();
  const visible = result.predictions.filter((p) => inFacet(p.itemId));
  const fragment = document.createDocumentFragment();
  for (const spec of panels) {
    const board = node('section'),
      head = node('div'),
      list = node('div');
    board.className = 'board';
    head.className = 'board-head';
    list.className = 'ranks';
    list.dataset.key = spec.key;
    const isShift = ['up', 'down'].includes(spec.key);
    const title = spec.key === 'chance' ? 'Chance of ≥ ' + scaleLabel(state.threshold) : spec.title;
    const heading = node('h3', spec.key === 'chance' ? 'Chance of ≥ ' : title);
    head.append(heading);
    if (spec.key === 'chance') {
      cutoff.hidden = false;
      heading.append(cutoff);
    }
    if (spec.key === 'information') {
      board.classList.add('information');
      head.title = 'Expected reduction in categorical class uncertainty, given the applied ratings.';
    }
    list.setAttribute('role', 'toolbar');
    list.setAttribute('aria-orientation', 'vertical');
    list.setAttribute('aria-label', title);
    board.append(head, list);
    if (spec.key === 'information' && taste) {
      const why = node(
        'p',
        'Expected information about ' + taste.weights.length + ' taste classes, given your applied ratings.',
      );
      why.className = 'info-note';
      board.append(why);
    }
    const items = visible
      .filter((p) =>
        spec.key === 'up'
          ? p.shift > 0
          : spec.key === 'down'
            ? p.shift < 0
            : spec.key === 'information'
              ? !!taste && taste.weights.length > 1 && !Object.hasOwn(state.draft, p.itemId)
              : true,
      )
      .sort((a, b) => spec.score(b) - spec.score(a));
    head.append(node('small', items.length + ' · ' + spec.hint));
    if (!items.length) {
      const msg = !result.predictions.length
        ? 'All entries rated. Clear one to predict it.'
        : isShift && !Object.keys(state.applied).length
          ? 'Rate an entry to see shifts from the catalog mean.'
          : spec.key === 'information' && (!taste || taste.weights.length < 2)
            ? 'This catalog has no competing taste classes.'
            : isShift && visible.length
              ? (spec.key === 'up'
                  ? 'No unrated title in this view rises above'
                  : 'No unrated title in this view falls below') +
                ' its catalog mean with your current ratings.'
              : 'No matching entries.';
      const note = node('p', msg);
      note.className = 'note';
      list.append(note);
    }
    for (const [index, p] of items.entries()) {
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
      if (isShift) score.title = 'Catalog mean → your mean (' + signed(p.shift) + ')';
      pos.className = 'rank-index';
      score.className = 'score';
      btn.append(pos, node('span', titles.get(p.itemId)), score);
      if (spec.key === 'information') {
        const row = node('div');
        row.className = 'info-row';
        row.dataset.id = p.itemId;
        row.append(btn);
        if (index < 12) row.append(ratingControls(p.itemId, 'information'));
        list.append(row);
      } else list.append(btn);
    }
    fragment.append(board);
  }
  host.replaceChildren(fragment);
  for (const list of host.querySelectorAll('.ranks'))
    list.scrollTop = positions.get(list.getAttribute('data-key')) ?? 0;
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
    domain: active,
    ratings: state.applied,
    titles,
    label: scaleLabel,
    model: catalog.models[state.model],
    threshold: state.threshold,
    message: state.evidenceMessage,
  });
}
// One tab stop per ranking; arrow keys move through its scrollable entries.
el('boards').addEventListener('focusin', (event) => {
  const button = event.target;
  if (button instanceof HTMLElement && button.closest('.info-row')) mountChoices(button.closest('.info-row'));
  if (!(button instanceof HTMLButtonElement) || !button.matches('.rank')) return;
  for (const peer of button.closest('.ranks').querySelectorAll('button'))
    peer.tabIndex = peer.dataset.id === button.dataset.id ? 0 : -1;
});
el('boards').onkeydown = (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement)) return;
  const list = button.closest('.ranks');
  if (!list || !button.matches('.rank')) return;
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
el('boards').onclick = (event) => {
  const target = /** @type {HTMLElement} */ (event.target);
  const btn = target.closest('button.rank');
  if (!(btn instanceof HTMLButtonElement)) return;
  selected = state.selection = btn.dataset.id;
  for (const b of el('boards').querySelectorAll('button'))
    if (b.classList.contains('rank')) b.setAttribute('aria-pressed', String(b.dataset.id === selected));
  renderDetail();
  if (['up', 'down'].includes(btn.closest('.ranks').getAttribute('data-key'))) {
    reveal(selected, true);
    return;
  }
  const heading = el('detail-title');
  if (matchMedia('(max-width:690px)').matches || heading.getBoundingClientRect().top > innerHeight - 60)
    heading.focus();
};
el('boards').onchange = (event) => {
  const radio = event.target;
  if (!(radio instanceof HTMLInputElement) || radio.type !== 'radio') return;
  const row = radio.closest('div.info-row');
  if (!(row instanceof HTMLElement)) return;
  const list = row.parentElement;
  const index = [...list.children].indexOf(row);
  const height = row.offsetHeight;
  const id = row.dataset.id;
  edit(entries.get(id), Number(radio.value));
  const updated = el('boards').querySelector('.information .ranks');
  const next = updated.children[index] ?? updated.lastElementChild;
  if (next) next.querySelector('button')?.focus({ preventScroll: true });
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
  update(input('auto').checked ? state.draft : state.applied);
};
cutoff.onchange = () => {
  state.threshold = Number(cutoff.value);
  if (!result) return;
  result.threshold = state.threshold;
  const start = catalog.scale.indexOf(state.threshold);
  for (const p of result.predictions) p.chance = p.probabilities.slice(start).reduce((a, b) => a + b, 0);
  renderBoards();
  renderDetail();
};
async function readJSON(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error('Unable to load ' + path + ' (' + resp.status + ').');
  return resp.json();
}
async function loadEvidence(key, s) {
  try {
    const data = await readJSON(key + '-evidence.json');
    if (
      JSON.stringify(s.data.items.map((it) => it.itemId)) !== JSON.stringify(data.ids) ||
      JSON.stringify(s.data.scale) !== JSON.stringify(data.scale)
    )
      throw new Error('Co-rating data does not match this catalog.');
    if (data.packedFile) {
      const resp = await fetch('./' + data.packedFile);
      if (!resp.ok) throw new Error('Co-rating counts unavailable.');
      const bytes = new Uint8Array(await resp.arrayBuffer());
      const buffer =
        bytes[0] === 31 && bytes[1] === 139
          ? await new Response(
              new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
            ).arrayBuffer()
          : bytes.buffer;
      data.packed = new Uint16Array(buffer);
      if (data.packed.length !== ((data.ids.length * (data.ids.length - 1)) / 2) * data.scale.length ** 2)
        throw new Error('Incomplete paired counts.');
    }
    s.evidence = data;
  } catch (e) {
    s.evidenceMessage = e.message;
  }
  if (s === state) renderDetail();
}
async function openCatalog(key, file = null) {
  const seq = ++revision;
  try {
    let s = file ? null : states.get(key);
    if (!s) {
      el('status').textContent = 'Loading catalog…';
      s = useState(file ? JSON.parse(await file.text()) : await readJSON(key + '.json'), key);
      if (seq !== revision) return;
      states.set(key, s);
      if (file) {
        s.evidenceMessage = 'This fitted catalog includes model probabilities only.';
        el('custom-domain').hidden = false;
      } else void loadEvidence(key, s);
    }
    if (seq === revision) install(key, s);
  } catch (e) {
    if (seq === revision) el('status').textContent = 'Could not open catalog. ' + e.message;
  }
}
el('domains').onclick = (event) => {
  const btn = /** @type {HTMLElement} */ (event.target).closest('[data-key]');
  if (btn instanceof HTMLButtonElement) void openCatalog(btn.dataset.key);
};
input('file').onchange = () => {
  const f = input('file').files[0];
  input('file').value = '';
  if (f) void openCatalog('custom', f);
};
void openCatalog('expanded');

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
    const rows = importRatings(await f.text(), current.data);
    if (state !== current) return;
    Object.assign(state.draft, rows);
    rebuildBaseline();
    syncDraft();
    if (input('auto').checked) update(state.draft);
    if (result) el('status').textContent = 'Imported ' + Object.keys(rows).length + ' ratings.';
  } catch (e) {
    if (state === current) el('status').textContent = e.message;
  }
};
el('save-ratings').onclick = () => {
  if (state) saveCSV(active + '-ratings.csv', ratingsCSV(catalog, state.draft));
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
