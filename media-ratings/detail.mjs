import { showRecognition } from './recognition.mjs';
import { pairIndex, comparisonGrids } from './evidence.mjs';
import { latentPairs } from './latent.mjs';
import { pairPlot } from './charts.mjs';
// The counts for an unordered pair are stored once. Rows here always represent
// the rated comparison and columns always represent the selected recommendation.
export function jointCounts(data, target, rated) {
  const i = data.ids.indexOf(target),
    j = data.ids.indexOf(rated);
  if (i < 0 || j < 0 || i === j) throw new Error('Invalid co-rating pair.');
  const hi = Math.max(i, j),
    lo = Math.min(i, j),
    n = data.scale.length;
  const pair = pairIndex(hi, lo);
  let cells;
  if (data.packedLayout === 'binary-overlap') {
    const both = data.pairGrids ? data.pairGrids.get(pair)[0] : data.packed[pair],
      left = data.counts[lo][1],
      right = data.counts[hi][1];
    cells = [data.cohortSize - left - right + both, right - both, left - both, both];
    if (cells.some((n) => n < 0)) throw new Error('Inconsistent binary co-rating counts.');
  } else if (data.pairGrids) cells = data.pairGrids.get(pair);
  else cells = data.packed ? data.packed.subarray(pair * n * n, (pair + 1) * n * n) : data.pairs[pair];
  const rows = data.scale.map((_, a) => data.scale.map((_, b) => cells[j < i ? a * n + b : b * n + a]));
  let total = 0,
    x = 0,
    y = 0,
    xx = 0,
    xy = 0,
    yy = 0;
  rows.forEach((row, a) =>
    row.forEach((count, b) => {
      const u = data.scale[a],
        v = data.scale[b];
      total += count;
      x += count * u;
      y += count * v;
      xx += count * u * u;
      xy += count * u * v;
      yy += count * v * v;
    }),
  );
  const denominator = Math.sqrt((total * xx - x * x) * (total * yy - y * y));
  return { rows, total, r: denominator > 0 ? (total * xy - x * y) / denominator : null };
}

const el = (id) => document.getElementById(id);
/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} [text] */
export function node(tag, text = '') {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
}
// Preserve small but material score differences in sparse activity catalogs.
export const scoreText = (n, digits) =>
  Math.abs(n) >= 1e-12 && Math.abs(n) < 0.5 * 10 ** -digits ? n.toPrecision(2) : n.toFixed(digits);
export const percent = (n) => scoreText(n * 100, 1) + '%';
export const signed = (n) => (n > 0 ? '+' : '') + scoreText(n, 2);
const numeric = (n) => n.toFixed(2);

export function shortAnnotations(a) {
  return [
    a.author ?? a.authors?.join(', '),
    a.format,
    ...(a.genres ?? []),
    a.certificate,
    a.country,
    a.region,
  ]
    .filter(Boolean)
    .join(' · ');
}

function distribution(scale, label, baseline, forecast, counts, source) {
  const observed = counts?.reduce((a, b) => a + b, 0);
  const series = [
    { name: 'Catalog model', values: baseline, color: 'var(--prior)' },
    { name: 'For you', values: forecast, color: 'var(--accent)' },
  ];
  if (observed) series.push({ name: source, values: counts.map((n) => n / observed), color: 'var(--raw)' });
  const legend = el('legend');
  legend.replaceChildren();
  for (const s of series) {
    const key = node('span', s.name);
    key.className = 'key';
    key.style.setProperty('--series', s.color);
    legend.append(key);
  }
  const chart = node('div');
  chart.className = 'chart';
  chart.setAttribute('aria-hidden', 'true');
  const cap = Math.min(1, Math.ceil(Math.max(...series.flatMap((s) => s.values)) * 10) / 10);
  const table = node('table');
  table.className = 'distribution-table';
  const head = table.createTHead().insertRow();
  head.append(...['Rating', ...series.map((s) => s.name)].map((n) => node('th', n)));
  const body = table.createTBody();
  for (const [j, v] of scale.entries()) {
    const bin = node('div'),
      bars = node('div'),
      tick = node('span', label(v));
    bin.className = 'bin';
    bars.className = 'bars';
    tick.className = 'tick';
    const row = body.insertRow();
    row.append(node('th', label(v)));
    for (const s of series) {
      const bar = node('span');
      bar.className = 'bar';
      bar.style.setProperty('--series', s.color);
      bar.style.height = (100 * s.values[j]) / cap + '%';
      bars.append(bar);
      row.append(node('td', percent(s.values[j])));
    }
    bin.title = label(v) + ' · ' + series.map((s) => s.name + ' ' + percent(s.values[j])).join(', ');
    bin.append(bars, tick);
    chart.append(bin);
  }
  const details = node('details');
  details.append(node('summary', 'View probabilities'), table);
  const note = node(
    'p',
    'Probability from 0 to ' + percent(cap) + (observed ? ' · ' + observed + ' observed ratings' : ''),
  );
  note.className = 'evidence-note';
  el('distribution').replaceChildren(note, chart, details);
}
function coRatings(data, p, ratings, titles, label, message, preferred, gaussian, source) {
  const host = el('comparison');
  host.replaceChildren(node('h3', 'Observed co-ratings'));
  const note = (text) => {
    const para = node('p', text);
    para.className = 'evidence-note';
    host.append(para);
  };
  if (!data) {
    note(message);
    return;
  }
  const ids = Object.keys(ratings).filter((id) => id !== p.itemId);
  if (ids.length && data.packedFiles && !data.pairGrids) {
    const loading = node('p', 'Loading observed co-ratings…');
    loading.className = 'evidence-note';
    host.append(loading);
    comparisonGrids(data, p.itemId, ids, () => loading.isConnected)
      .then((parts) => {
        if (loading.isConnected)
          coRatings(
            { ...data, pairGrids: parts },
            p,
            ratings,
            titles,
            label,
            message,
            preferred,
            gaussian,
            source,
          );
      })
      .catch((error) => {
        loading.textContent = error.message;
      });
    return;
  }
  const comparisons = ids
    .map((id) => ({ id, ...jointCounts(data, p.itemId, id) }))
    .sort(
      (a, b) =>
        (b.r === null ? -1 : Math.abs(b.r)) - (a.r === null ? -1 : Math.abs(a.r)) || b.total - a.total,
    );
  if (!comparisons.length) {
    note('Rate an entry to compare its observed ratings with this recommendation.');
    return;
  }
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Compare observed ratings with a rated entry');
  select.replaceChildren(...comparisons.map((c) => new Option(titles.get(c.id), c.id)));
  if (comparisons.some((c) => c.id === preferred)) {
    select.value = preferred;
    select.dataset.chosen = preferred;
  }
  const panel = node('div');
  function draw() {
    const c = comparisons.find((c) => c.id === select.value);
    const caption = node(
      'p',
      source +
        ' · ' +
        c.total +
        ' co-raters · ' +
        (c.r === null ? 'Correlation undefined' : 'Pearson r on recorded scores = ' + c.r.toFixed(2)),
    );
    caption.className = 'evidence-note';
    const table = node('table');
    table.className = 'heat';
    table.setAttribute(
      'aria-label',
      'Joint rating counts. Rows are comparison ratings and columns are recommendation ratings.',
    );
    const header = table.createTHead().insertRow();
    header.append(node('th', '↓ / →'), ...data.scale.map((v) => node('th', label(v))));
    const body = table.createTBody();
    const peak = Math.max(1, ...c.rows.flat());
    for (const [a, counts] of c.rows.entries()) {
      const tr = body.insertRow();
      if (data.scale[a] === ratings[c.id]) tr.className = 'observed';
      tr.append(node('th', label(data.scale[a])));
      for (const [b, n] of counts.entries()) {
        const cell = node('td', n ? String(n) : '·');
        if (n) {
          const intensity = Math.sqrt(n / peak);
          cell.style.background = 'hsl(' + (190 + 42 * intensity) + ' 60% ' + (95 - 60 * intensity) + '%)';
          cell.style.color = intensity > 0.7 ? 'white' : '#142136';
        }
        cell.title = label(data.scale[a]) + ' × ' + label(data.scale[b]) + ' · ' + n + ' co-raters';
        tr.append(cell);
      }
    }
    const help = node(
      'p',
      'Columns rate the recommendation. The outlined row is your ' +
        label(ratings[c.id]) +
        ' rating for the comparison.',
    );
    help.className = 'evidence-note';
    const key = node('p', 'Cell count  ·  0  ');
    key.className = 'heat-key';
    key.append(node('i'), node('span', '  ' + peak));
    panel.replaceChildren(caption, table, key, help);
    if (gaussian && c.total) {
      const details = node('details');
      details.append(node('summary', 'Sampled latent scores'));
      details.ontoggle = () => {
        if (!details.open || details.childElementCount > 1) return;
        try {
          const pts = latentPairs(
            gaussian,
            data.scale,
            data.ids.indexOf(p.itemId),
            data.ids.indexOf(c.id),
            c.rows,
          );
          const lo = gaussian.kind === 'logit-point' ? 0 : data.scale[0];
          details.append(
            pairPlot(pts, lo, data.scale.at(-1)),
            node(
              'p',
              pts.length +
                ' simulated pairs within the recorded rating bins. Horizontal: ' +
                titles.get(p.itemId) +
                '. Vertical: ' +
                titles.get(c.id) +
                '. ' +
                (gaussian.kind === 'logit-point'
                  ? 'Logit reference, transformed with the inverse logit.'
                  : 'Ordinal Gaussian mixture, mapped between category cutpoints.') +
                ' Each draw represents uncertainty within an observed pair.',
            ),
          );
        } catch (e) {
          details.append(node('p', e.message));
        }
      };
      panel.append(details);
    }
  }
  if (comparisons.length > 1) note('Comparisons are ordered by absolute correlation among co-raters.');
  select.onchange = () => {
    select.dataset.chosen = select.value;
    draw();
  };
  host.append(select, panel);
  draw();
}

export function showDetail({
  p,
  prior,
  catalog,
  evidence,
  links: targets,
  linkError,
  domain,
  ratings,
  titles,
  label,
  threshold,
  model,
  message,
}) {
  const kind = model.kind;
  const detail = el('detail'),
    oldTitle = detail.dataset.id;
  const previous = oldTitle === p?.itemId ? el('comparison').querySelector('select')?.dataset.chosen : null;
  detail.hidden = !p;
  showRecognition(el('detail-image'), p ? targets : null, p ? titles.get(p.itemId) : '');
  if (!p) return;
  detail.dataset.id = p.itemId;
  el('detail-title').textContent = titles.get(p.itemId);
  const a = catalog.items.find((it) => it.itemId === p.itemId)?.annotations ?? {};
  el('annotations').textContent = shortAnnotations(a);
  const more = /** @type {HTMLDetailsElement} */ (el('more-metadata'));
  const facts = [
    ['Collection', a.collection && a.collection + (a.releaseOrder ? ' · release ' + a.releaseOrder : '')],
    ['Year', a.year],
    ['Episodes', a.episodes],
    ['Words', a.wordCount?.toLocaleString()],
    ['Chapters', a.chapterCount],
    ['Status', a.completion],
    ['Platforms', a.platforms?.join(' · ')],
    ['Modes', a.modes?.join(' · ')],
    ['Developers', a.developers?.join(' · ')],
    ['Publishers', a.publishers?.join(' · ')],
    ['Authors', (a.authors ?? (a.author ? [a.author] : [])).join(' · ')],
    ['Studios', a.studios?.join(' · ')],
    ['Directors', a.directors?.join(' · ')],
    [catalog.domain === 'anime' ? 'Voice cast' : 'Cast', a.cast?.join(' · ')],
    ['Creators', a.creators?.join(' · ')], ['Illustrators', a.illustrators?.join(' · ')],
    ['Translators', a.translators?.join(' · ')], ['Editors', a.editors?.join(' · ')],
    ['Tags', a.tags?.join(' · ')],
    ['Production budget', a.budget > 0 && '$' + a.budget.toLocaleString('en-US')],
    ['Reported box office', a.revenue > 0 && '$' + a.revenue.toLocaleString('en-US')],
    [
      catalog.activityCountLabel ?? 'Ratings',
      Number.isSafeInteger(a.ratingCount) &&
        a.ratingCount.toLocaleString() +
          (domain === 'expanded' ? ' · MovieLens 25M' : domain === 'destinations' ? ' · Stravl' : ''),
    ],
    ['Coast', a.coast],
    ['Annual temperature', a.temperature != null && a.temperature + ' °C'],
    ['Annual precipitation', a.precipitation != null && a.precipitation + ' mm'],
    ['Population', a.population && a.population.toLocaleString() + ' · GeoNames'],
    ['GDP per capita', a.gdp && '$' + a.gdp.toLocaleString() + ' · country, 2023'],
  ].filter(([, v]) => v);
  more.hidden = !facts.length;
  more.querySelector('dl').replaceChildren(
    ...facts.map(([k, v]) => {
      const row = node('div');
      row.append(node('dt', k), node('dd', v));
      return row;
    }),
  );
  const link = /** @type {HTMLAnchorElement} */ (el('external'));
  const imdb = evidence?.imdb?.[p.itemId];
  const primary =
    domain === 'destinations'
      ? (targets?.openStreetMap ?? targets?.sourceUrl)
      : (targets?.sourceUrl ?? targets?.imdb ?? (imdb ? 'https://www.imdb.com/title/tt' + imdb + '/' : null));
  link.hidden = !primary;
  if (primary) {
    link.href = primary;
    link.textContent =
      (domain === 'destinations' && targets?.openStreetMap ? 'OpenStreetMap' : (targets?.label ?? 'IMDb')) +
      ' ↗';
  } else link.removeAttribute('href');
  const links = el('item-links');
  links.replaceChildren(link);
  for (const [key, label] of [
    ['rottenTomatoes', 'Rotten Tomatoes'],
    ['wikipedia', 'Wikipedia'],
    ['googleMaps', 'Google Maps'],
    ['appleMaps', 'Apple Maps'],
  ]) {
    if (!targets?.[key]) continue;
    const a = node('a', label + ' ↗');
    a.href = targets[key];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    links.append(a);
  }
  if (linkError) links.append(node('small', 'Article and map links unavailable.'));
  distribution(
    catalog.scale,
    label,
    prior.probabilities,
    p.probabilities,
    evidence?.counts[evidence.ids.indexOf(p.itemId)],
    domain === 'expanded'
      ? 'Observed · MovieLens small'
      : 'Observed' + (catalog.sourceLabel ? ' · ' + catalog.sourceLabel : ''),
  );
  const metrics = el('metrics');
  metrics.className = 'metrics';
  metrics.replaceChildren();
  for (const [name, value] of catalog.responsePrompt && catalog.scale.join(',') === '0,1'
    ? [
        ['Catalog probability', percent(p.prior)],
        ['With your answers', percent(p.expected)],
        ['Probability change', signed(p.shift * 100) + ' percentage points'],
      ]
    : [
        ['Catalog expectation', numeric(p.prior)],
        ['With your ratings', numeric(p.expected)],
        ['Rating change', signed(p.shift)],
        ['Chance of ≥ ' + label(threshold), percent(p.chance)],
        ['Predicted SD', numeric(p.sd)],
      ]) {
    const row = node('div');
    const amount = node('dd', value);
    if (['Rating change', 'Probability change'].includes(name) && p.shift)
      amount.className = 'shift-delta ' + (p.shift > 0 ? 'rise' : 'fall');
    row.append(node('dt', name), amount);
    metrics.append(row);
  }
  const conditioning = {
    'logit-point': 'Your ratings condition the joint model on the logit scale.',
    'ordinal-probit': 'Your rating intervals update the latent scores and component weights.',
    'latent-class': 'Your ratings update the taste-class weights used to mix the class distributions.',
    'class-similarity':
      domain === 'expanded'
        ? 'Ratings above or below expectation shift the forecast for similar films.'
        : 'Ratings above or below expectation shift the forecast for similar entries.',
  };
  el('formula').textContent = catalog.activityNote
    ? 'Your answers update the probabilities of the learned activity classes. The forecast averages the chance of the recorded action across those classes.'
    : (Object.keys(ratings).length ? conditioning[kind] + ' ' : '') +
      (model.titleChoice ? 'Films you picked help identify your taste class. ' : '') +
      (model.ratingYear ? 'Both means use the same forecast year. ' : '') +
      'Each mean weights the possible ratings by their probabilities.';
  const gaussian =
    kind === 'latent-class' || kind === 'class-similarity'
      ? (catalog.models.reference ??
        catalog.models[catalog.selection?.ordinalModel] ??
        Object.values(catalog.models).find((m) => m.kind === 'ordinal-probit'))
      : model;
  coRatings(
    evidence,
    p,
    ratings,
    titles,
    label,
    message,
    previous,
    gaussian,
    domain === 'expanded'
      ? 'MovieLens small'
      : domain === 'destinations'
        ? 'Stravl'
        : (catalog.sourceLabel ?? 'Observed ratings'),
  );
}
