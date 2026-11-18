import { validateCatalog, predict, submit, defaultCutoff } from './core.mjs';
const el = (id) => document.getElementById(id);
const select = (id) => /** @type {HTMLSelectElement} */ (el(id));
const node = (tag, text) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
const option = (text, value) => new Option(text, String(value));
const percent = (n) => (n * 100).toFixed(1) + '%';
Object.assign(window, { MediaRatings: { submit } });
let catalog, ratings, result;
const scaleLabel = (value) => catalog.scaleLabels?.[catalog.scale.indexOf(value)] ?? String(value);
function install(data) {
  validateCatalog(data);
  catalog = data;
  ratings = Object.create(null);
  el('name').textContent = data.name;
  select('model').replaceChildren(
    ...Object.entries(data.models).map(([key, m]) =>
      option(
        m.kind === 'ordinal-probit'
          ? 'Ordinal probit · ' + m.components.length + ' component' + (m.components.length === 1 ? '' : 's')
          : 'Historical logit reference',
        key,
      ),
    ),
  );
  if (data.models.reference) select('model').value = 'reference';
  for (const id of ['value', 'threshold']) {
    select(id).replaceChildren(
      ...data.scale.map((v) => option(data.scaleLabels ? v + ' · ' + scaleLabel(v) : String(v), v)),
    );
    select(id).value = String(defaultCutoff(data.scale));
  }
  update();
}
function update() {
  try {
    result = predict(catalog, {
      model: select('model').value,
      ratings,
      threshold: Number(select('threshold').value),
    });
    const current = select('item').value;
    select('item').replaceChildren(
      ...catalog.items
        .filter((it) => !Object.hasOwn(ratings, it.itemId))
        .map((it) => option(it.title, it.itemId)),
    );
    if ([...select('item').options].some((o) => o.value === current)) select('item').value = current;
    /** @type {HTMLButtonElement} */ (el('add')).disabled = !select('item').options.length;
    el('rated').replaceChildren();
    for (const it of catalog.items.filter((it) => Object.hasOwn(ratings, it.itemId))) {
      const li = node('li', ''),
        btn = node('button', '×');
      btn.setAttribute('aria-label', 'Remove ' + it.title);
      btn.onclick = () => {
        delete ratings[it.itemId];
        update();
      };
      li.append(node('span', it.title + ' · ' + scaleLabel(ratings[it.itemId])), btn);
      el('rated').append(li);
    }
    el('empty').hidden = !!Object.keys(ratings).length;
    el('weights').textContent =
      result.weights.length > 1
        ? 'Taste components (prior → yours): ' +
          result.weights
            .map((w, i) => i + 1 + ' · ' + percent(w.prior) + ' → ' + percent(w.posterior))
            .join('    |    ')
        : '';
    if (
      result.weights.some((w) => w.posterior > 0.01 && w.effectiveSamples !== null && w.effectiveSamples < 20)
    )
      el('weights').textContent += ' Integration is imprecise for these ratings.';
    el('event').textContent = 'P(≥ ' + result.threshold + ')';
    render();
    el('status').textContent = '';
  } catch (e) {
    el('status').textContent = e.message;
  }
}
function render() {
  const by = select('rank').value;
  const score = (p) =>
    ({
      up: p.shift,
      down: -p.shift,
      absolute: Math.abs(p.shift),
      precision: p.expected / Math.max(0.01, p.sd ** 2),
      expected: p.expected,
      chance: p.chance,
    })[by];
  const sorted = [...result.predictions].sort((a, b) => score(b) - score(a));
  el('caption').textContent = sorted.length
    ? sorted.length + ' unrated items'
    : 'All items rated. Remove a rating to predict it.';
  el('rows').replaceChildren();
  for (const p of sorted) {
    const tr = node('tr', ''),
      td = node('td', ''),
      details = node('details', '');
    details.append(node('summary', p.title));
    details.ontoggle = () => {
      if (!details.open || details.childElementCount > 1) return;
      details.append(node('p', 'Catalog mean ' + p.prior.toFixed(2)));
      const distribution = node('div', '');
      distribution.className = 'distribution';
      for (const [j, rating] of catalog.scale.entries()) {
        const bar = document.createElement('meter');
        bar.min = 0;
        bar.max = 1;
        bar.value = p.probabilities[j];
        bar.setAttribute('aria-label', 'Probability of rating ' + rating);
        distribution.append(node('span', scaleLabel(rating)), bar, node('span', percent(bar.value)));
      }
      details.append(distribution);
    };
    td.append(details);
    tr.append(
      td,
      ...[
        p.expected.toFixed(2),
        (p.shift > 0 ? '+' : '') + p.shift.toFixed(2),
        percent(p.chance),
        p.sd.toFixed(2),
      ].map((t) => node('td', t)),
    );
    el('rows').append(tr);
  }
}
el('add').onclick = () => {
  ratings[select('item').value] = Number(select('value').value);
  update();
};
select('rank').onchange = () => {
  if (result) render();
};
select('model').onchange = update;
select('threshold').onchange = update;
let revision = 0,
  activeCatalog = 'movielens';
async function openCatalog(key) {
  const seq = ++revision;
  try {
    const res = await fetch('./' + key + '.json');
    if (!res.ok) throw new Error('Catalog unavailable.');
    const data = await res.json();
    if (seq === revision) {
      install(data);
      activeCatalog = key;
    }
  } catch (e) {
    if (seq === revision) {
      select('catalog').value = activeCatalog;
      el('status').textContent = e.message;
    }
  }
}
select('catalog').onchange = () => openCatalog(select('catalog').value);
const file = /** @type {HTMLInputElement} */ (el('file'));
file.onchange = async () => {
  const selected = file.files[0];
  if (!selected) return;
  file.value = '';
  const seq = ++revision;
  try {
    const data = JSON.parse(await selected.text());
    if (seq === revision) {
      install(data);
      activeCatalog = 'custom';
      select('catalog').value = activeCatalog;
    }
  } catch (e) {
    if (seq === revision) el('status').textContent = 'Could not open catalog. ' + e.message;
  }
};
openCatalog('movielens');
