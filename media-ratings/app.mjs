import { validateCatalog, predict, submit, defaultCutoff } from './core.mjs';
import { node, percent, signed, showDetail } from './detail.mjs';

const el = (id) => document.getElementById(id);
const input = (id) => /** @type {HTMLInputElement} */ (el(id));
const select = (id) => /** @type {HTMLSelectElement} */ (el(id));
Object.assign(window, { MediaRatings: { submit } });
const states = new Map();
let active,
  state,
  catalog,
  result,
  baseline,
  titles,
  selected,
  revision = 0;
const panels = [
  {
    key: 'expected',
    title: 'Highest expected',
    hint: 'Mean',
    score: (p) => p.expected,
    format: (n) => n.toFixed(2),
  },
  { key: 'chance', title: 'Above cutoff', hint: 'Probability', score: (p) => p.chance, format: percent },
  {
    key: 'absolute',
    title: 'Biggest surprise',
    hint: 'Absolute shift',
    score: (p) => Math.abs(p.shift),
    format: (_, p) => signed(p.shift),
  },
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
function useState(data) {
  validateCatalog(data);
  const model = data.models.reference ? 'reference' : data.selection?.ordinalModel;
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
  if (active !== 'movielens') return it.title;
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
    ...Object.entries(catalog.models).map(([k, m]) => {
      const name =
        m.kind === 'logit-point'
          ? 'Historical logit'
          : (m.kind === 'latent-class' ? 'Latent class' : 'Ordinal probit') + ' · K=' + m.components.length;
      return new Option(name + (k === catalog.selection?.model ? ' · CV pick' : ''), k);
    }),
  );
  select('model').value = state.model;
  select('threshold').replaceChildren(...catalog.scale.map((v) => new Option(scaleLabel(v), String(v))));
  select('threshold').value = String(state.threshold);
  el('scale-help').textContent =
    key === 'movielens'
      ? 'Choose a half or whole star.'
      : catalog.scaleLabels
        ? catalog.scale.map((v) => scaleLabel(v) + ' = ' + v).join(' · ')
        : 'Choose a value on the rating scale.';
  input('search').value = '';
  input('rated-only').checked = false;
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
  const tables = el('scores');
  tables.replaceChildren();
  for (const [title, rows] of [
    ['Held-out test · family finalists', selection.holdout],
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
  const empty = node('li', 'No matching entries.');
  empty.id = 'empty-list';
  empty.className = 'note';
  el('library').replaceChildren(...population.predictions.map(entryRow), empty);
  filterRows();
}
function entryRow(p) {
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
  const body = node('div'),
    choices = node('div');
  body.className = 'rating-row';
  choices.className = 'choices';
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-label', 'Rate ' + titles.get(p.itemId));
  for (const v of catalog.scale) {
    const star = active === 'movielens',
      label = node('label'),
      radio = document.createElement('input'),
      glyph = node('span', star ? '' : scaleLabel(v));
    label.className = star ? 'choice star' : 'choice';
    radio.type = 'radio';
    radio.name = 'rating-' + p.itemId;
    radio.value = String(v);
    const description = scaleLabel(v) + (star ? ' stars' : '');
    radio.setAttribute('aria-label', description);
    label.title = description;
    label.append(radio, glyph);
    choices.append(label);
  }
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
function syncRow(li) {
  const value = state.draft[li.dataset.id],
    rated = value !== undefined;
  li.classList.toggle('rated', rated);
  for (const r of li.querySelectorAll('input')) {
    r.checked = rated && Number(r.value) === value;
    r.parentElement.classList.toggle('filled', rated && Number(r.value) <= value);
  }
  li.querySelector('.clear').hidden = !rated;
  li.querySelector('.rating-readout').textContent = rated && active === 'movielens' ? value + ' / 5' : '';
}
function filterRows() {
  if (!state) return;
  const query = input('search').value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const li of el('library').querySelectorAll('li')) {
    if (!li.classList.contains('entry')) continue;
    const id = li.dataset.id;
    li.hidden = !(
      titles.get(id).toLocaleLowerCase().includes(query) &&
      (!input('rated-only').checked || Object.hasOwn(state.draft, id))
    );
    if (!li.hidden) visible++;
  }
  el('empty-list').hidden = visible > 0;
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
  syncRow(li);
  filterRows();
  syncDraft();
  if (input('auto').checked) update(state.draft);
}
el('library').onchange = (event) => {
  const r = /** @type {HTMLInputElement} */ (event.target);
  if (r.type === 'radio') edit(r.closest('.entry'), Number(r.value));
};
el('library').onclick = (event) => {
  const button = /** @type {HTMLElement} */ (event.target).closest('.clear');
  if (button) {
    const li = button.closest('.entry');
    li.querySelector('input').focus();
    edit(li, undefined);
  }
};
input('search').oninput = filterRows;
input('rated-only').onchange = filterRows;
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
    el('weights').textContent =
      result.weights.length > 1
        ? 'Taste components (catalog → yours)  ' +
          result.weights
            .map((w, i) => i + 1 + '. ' + percent(w.prior) + ' → ' + percent(w.posterior))
            .join('   ·   ')
        : '';
    if (
      result.weights.some((w) => w.posterior > 0.01 && w.effectiveSamples !== null && w.effectiveSamples < 20)
    )
      el('weights').textContent += ' Integration is imprecise for these ratings.';
    if (!result.predictions.some((p) => p.itemId === selected)) selected = result.predictions[0]?.itemId;
    state.selection = selected;
    renderBoards();
    renderDetail();
    el('status').textContent = '';
  } catch (error) {
    // A failed model calculation must never leave rankings labeled as a new fit.
    result = null;
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
  const fragment = document.createDocumentFragment();
  for (const spec of panels) {
    const board = node('section'),
      head = node('div'),
      list = node('div');
    board.className = 'board';
    head.className = 'board-head';
    list.className = 'ranks';
    list.dataset.key = spec.key;
    const isShift = ['up', 'down', 'absolute'].includes(spec.key);
    const title = spec.key === 'chance' ? 'Chance of ≥ ' + scaleLabel(state.threshold) : spec.title;
    head.append(node('h3', title), node('small', spec.hint));
    list.setAttribute('role', 'toolbar');
    list.setAttribute('aria-orientation', 'vertical');
    list.setAttribute('aria-label', title);
    board.append(head, list);
    const items = result.predictions
      .filter((p) =>
        spec.key === 'up'
          ? p.shift > 0
          : spec.key === 'down'
            ? p.shift < 0
            : spec.key === 'absolute'
              ? Math.abs(p.shift) > 0
              : true,
      )
      .sort((a, b) => spec.score(b) - spec.score(a));
    if (!items.length) {
      const msg = !result.predictions.length
        ? 'All entries rated. Clear one to predict it.'
        : isShift && !Object.keys(state.applied).length
          ? 'Rate an entry to see shifts from the catalog mean.'
          : 'No shifts in this direction.';
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
        score = node('span', spec.format(spec.score(p), p));
      pos.className = 'rank-index';
      score.className = 'score';
      btn.append(pos, node('span', titles.get(p.itemId)), score);
      list.append(btn);
    }
    fragment.append(board);
  }
  host.replaceChildren(fragment);
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
    kind: catalog.models[state.model].kind,
    threshold: state.threshold,
    message: state.evidenceMessage,
  });
}
// One tab stop per ranking; arrow keys move through its scrollable entries.
el('boards').addEventListener('focusin', (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement)) return;
  for (const peer of button.parentElement.querySelectorAll('button'))
    peer.tabIndex = peer === button ? 0 : -1;
});
el('boards').onkeydown = (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement)) return;
  const list = button.parentElement;
  const next = {
    ArrowDown: button.nextElementSibling,
    ArrowUp: button.previousElementSibling,
    Home: list.firstElementChild,
    End: list.lastElementChild,
  };
  if (Object.hasOwn(next, event.key)) {
    event.preventDefault();
    next[event.key]?.focus();
  }
};
el('boards').onclick = (event) => {
  const btn = /** @type {HTMLElement} */ (event.target).closest('button.rank');
  if (!(btn instanceof HTMLButtonElement)) return;
  selected = state.selection = btn.dataset.id;
  for (const b of el('boards').querySelectorAll('button'))
    b.setAttribute('aria-pressed', String(b.dataset.id === selected));
  renderDetail();
  const heading = el('detail-title');
  if (matchMedia('(max-width:690px)').matches || heading.getBoundingClientRect().top > innerHeight - 60)
    heading.focus();
};
select('model').onchange = () => {
  state.model = select('model').value;
  rebuildBaseline();
  update(input('auto').checked ? state.draft : state.applied);
};
select('threshold').onchange = () => {
  state.threshold = Number(select('threshold').value);
  if (!result) return;
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
      s = useState(file ? JSON.parse(await file.text()) : await readJSON(key + '.json'));
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
void openCatalog('movielens');
