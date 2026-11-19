function shape(tag, attrs, text = '') {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.textContent = text;
  return n;
}
function figure(label, w, h) {
  return shape('svg', {
    viewBox: '0 0 ' + w + ' ' + h,
    role: 'img',
    'aria-label': label,
    class: 'rating-chart',
  });
}
export function pairPlot(points, lo, hi) {
  const svg = figure(
    'Sampled latent scores on the rating scale. Horizontal axis recommendation, vertical axis comparison.',
    300,
    178,
  );
  const x = (v) => 28 + (259 * (v - lo)) / (hi - lo),
    y = (v) => 153 - (140 * (v - lo)) / (hi - lo);
  for (let k = 0; k <= 4; k++) {
    const v = lo + (k * (hi - lo)) / 4,
      label = String(+v.toFixed(2));
    svg.append(
      shape('line', { x1: x(v), x2: x(v), y1: 13, y2: 153, class: 'gridline' }),
      shape('line', { x1: 28, x2: 287, y1: y(v), y2: y(v), class: 'gridline' }),
    );
    svg.append(
      shape('text', { x: x(v), y: 169, 'text-anchor': 'middle' }, label),
      shape('text', { x: 24, y: y(v) + 3, 'text-anchor': 'end' }, label),
    );
  }
  for (const [a, b] of points)
    svg.append(shape('circle', { cx: x(a), cy: y(b), r: 2.2, fill: 'var(--accent)', opacity: 0.48 }));
  return svg;
}
const colors = ['#467777', '#916243', '#6b6ca4', '#9b5069', '#557c49', '#516f9e', '#947323', '#845a88'];
function html(tag, text = '') {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
function signedValue(value, digits = 2) {
  return (value > 0 ? '+' : '') + value.toFixed(digits);
}
function varianceShare(fraction) {
  const pct = 100 * fraction;
  return (pct > 0 && pct < 0.1 ? Number(pct.toPrecision(2)) : pct.toFixed(1)) + '%';
}
function membershipPanel(fp, bind) {
  document.getElementById('profile-count').textContent = fp.ratedCount
    ? fp.ratedCount + (fp.ratedCount === 1 ? ' applied rating' : ' applied ratings')
    : 'Catalog baseline';
  const membership = document.getElementById('memberships');
  membership.replaceChildren(html('h3', fp.ratedCount ? 'Class probabilities' : 'Catalog classes'));
  for (const { index, label, probability, prior } of fp.classes) {
    const row = html('button');
    row.className = 'class-weight';
    bind(row, index);
    row.style.setProperty('--class-color', colors[index % colors.length]);
    const id = html('span', String(index + 1));
    id.className = 'component-id';
    const name = html('span', label),
      rail = html('span'),
      bar = html('i');
    name.className = 'component-name';
    rail.className = 'weight-rail';
    bar.style.width = 100 * probability + '%';
    rail.append(bar);
    row.title = 'Class ' + (index + 1) + ' · ' + (100 * prior).toFixed(1) + '% of the fitted population';
    row.append(id, name, html('b', (100 * probability).toFixed(1) + '%'), rail);
    membership.append(row);
  }
}
function classDetails(fp, catalog, inspected, pinned, ratings, baseline) {
  const signature = document.getElementById('class-signature');
  if (!inspected) {
    signature.replaceChildren(html('h3', 'How you rate'));
    const supplied = Object.entries(ratings);
    if (!supplied.length) {
      signature.append(
        html('p', 'Your answers will appear here alongside the catalog’s scores for the same titles.'),
      );
      return;
    }
    const average = (sum) => (sum / supplied.length).toFixed(2);
    const stats = html('div');
    stats.className = 'class-stats';
    for (const [label, value] of [
      ['Your average', average(supplied.reduce((sum, [, v]) => sum + v, 0))],
      ['Same titles, catalog', average(supplied.reduce((sum, [id]) => sum + baseline.get(id).prior, 0))],
    ]) {
      const tile = html('div');
      tile.append(html('span', label), html('b', value));
      stats.append(tile);
    }
    signature.append(stats);
    const counts = catalog.scale.map((v) => supplied.filter(([, score]) => score === v).length);
    const chart = html('div');
    chart.className = 'answer-distribution';
    chart.setAttribute('role', 'img');
    const labels = counts.map(
      (n, i) =>
        (catalog.scaleLabels?.[i] ?? catalog.scale[i]) + ' · ' + n + (n === 1 ? ' rating' : ' ratings'),
    );
    chart.setAttribute('aria-label', labels.join(', '));
    const max = Math.max(...counts);
    counts.forEach((n, i) => {
      const col = html('span');
      col.title = labels[i];
      const bar = html('i');
      bar.style.height = (n / max) * 100 + '%';
      col.append(bar);
      chart.append(col);
    });
    signature.append(chart);
    const ends = html('div');
    ends.className = 'scale-ends';
    ends.append(
      html('span', String(catalog.scaleLabels?.[0] ?? catalog.scale[0])),
      html('span', String(catalog.scaleLabels?.at(-1) ?? catalog.scale.at(-1))),
    );
    signature.append(ends);
    return;
  }
  signature.replaceChildren(html('h3', pinned ? 'Pinned class' : 'Class details'));
  const heading = html('strong', inspected.label);
  heading.className = 'match-name';
  signature.append(
    heading,
    html(
      'p',
      'Class ' +
        (inspected.index + 1) +
        ' · ' +
        (100 * inspected.prior).toFixed(1) +
        '% in catalog' +
        (fp.ratedCount ? ' → ' + (100 * inspected.probability).toFixed(1) + '% for you' : ''),
    ),
  );
  if (inspected.signal) {
    const { title, value, ratio } = inspected.signal;
    const answer = catalog.scaleLabels?.[catalog.scale.indexOf(value)] ?? value;
    signature.append(
      html('h4', 'Most distinctive answer'),
      html(
        'p',
        title +
          ' · ' +
          answer +
          '. This answer is ' +
          Number(ratio.toPrecision(2)) +
          '× as likely in this class as in the catalog.',
      ),
    );
  }
}

// Compare the same unrated items on both sides, centering out a person's general rating level.
function tastePatterns(catalog, predictions, count) {
  const host = document.getElementById('taste-patterns');
  const films = catalog.items.some((it) => it.annotations?.genres?.length);
  const regions = catalog.items.some((it) => it.annotations?.region);
  host.replaceChildren(
    html(
      'h3',
      films
        ? ({
            fanfiction: 'Fandom preferences',
            recipes: 'Course preferences',
            cocktails: 'Base spirit preferences',
            boardgames: 'Game type preferences',
            podcasts: 'Topic preferences',
          }[catalog.domain] ?? 'Genre preferences')
        : regions
          ? 'Regional preferences'
          : 'Forecast changes',
    ),
  );
  if (!count || !predictions.length) {
    host.append(
      html(
        'p',
        count ? 'All entries have been rated.' : 'Rate a few entries to see which preferences emerge.',
      ),
    );
    return;
  }
  const byId = new Map(predictions.map((p) => [p.itemId, p]));
  const overall = predictions.reduce((sum, p) => sum + p.shift, 0) / predictions.length;
  const groups = new Map();
  for (const it of catalog.items) {
    const p = byId.get(it.itemId);
    if (!p) continue;
    const labels = it.annotations?.genres ?? (it.annotations?.region ? [it.annotations.region] : []);
    for (const k of new Set(labels)) {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
  }
  const summaries = [];
  for (const [label, rows] of groups) {
    if (rows.length < (catalog.items.length >= 100 ? 10 : 2) || rows.length === predictions.length) continue;
    const shift = rows.reduce((sum, p) => sum + p.shift, 0) / rows.length;
    const example = rows.reduce((a, b) => (Math.abs(a.shift - shift) <= Math.abs(b.shift - shift) ? a : b));
    summaries.push({ label, change: shift - overall, example: example.title });
  }
  const grouped = summaries.length > 1;
  if (!grouped) {
    host.firstElementChild.textContent = 'Forecast changes';
    summaries.length = 0;
    for (const p of predictions) summaries.push({ label: p.title, change: p.shift, example: '' });
  }
  summaries.sort((a, b) => b.change - a.change);
  const extremes = [summaries[0], summaries.at(-1)].filter(
    (v, i) => v && (i === 0 ? v.change >= 0.005 : v.change <= -0.005),
  );
  if (!extremes.length) {
    host.append(html('p', 'Your forecasts are close to the catalog pattern.'));
    return;
  }
  for (const row of extremes) {
    const line = html('div');
    line.className = 'taste-example';
    const delta = html('b', signedValue(row.change));
    delta.className = 'shift-delta ' + (row.change > 0 ? 'rise' : 'fall');
    line.append(html('strong', row.label), delta);
    if (row.example) line.append(html('small', 'e.g. ' + row.example));
    host.append(line);
  }
  host.append(
    html(
      'p',
      grouped
        ? 'Average change on the rating scale, relative to your overall shift.'
        : 'Change from the catalog mean on the rating scale.',
    ),
  );
}
export function renderTaste(
  profile,
  catalog,
  fp,
  domain,
  prefs,
  onAxesChange,
  ratings,
  baseline,
  predictions,
) {
  const host = document.getElementById('taste'),
    plot = document.getElementById('taste-plot'),
    legend = document.getElementById('axes');
  host.hidden = !profile;
  if (!profile) return;
  const { projection: axes, weights } = profile,
    continuous = Boolean(profile.covariance);
  const domainTitle =
    {
      movies: 'Movie preference',
      cities: 'City preference',
      books: 'Book preference',
      music: 'Music preference',
      anime: 'Anime preference',
      games: 'Video game preference',
      boardgames: 'Tabletop preference',
      albums: 'Album preference',
      podcasts: 'Podcast preference',
      recipes: 'Recipe preference',
      tv: 'TV preference',
      cocktails: 'Cocktail preference',
      fanfiction: 'Fanfiction kudos',
      webfiction: 'Web fiction kudos',
      subreddits: 'Community activity',
    }[domain] ?? 'Preference';
  document.getElementById('projection-title').textContent = domainTitle + ' fingerprint';
  const members = new Map(fp.classes.map((c) => [c.index, c]));
  function inspect(index) {
    classDetails(
      fp,
      catalog,
      members.get(index),
      index !== null && index === prefs.pinned,
      ratings,
      baseline,
    );
    for (const control of host.querySelectorAll('[data-class-index]')) {
      const k = Number(control.getAttribute('data-class-index'));
      control.classList.toggle('inspected', index === k);
      control.setAttribute('aria-pressed', String(prefs.pinned === k));
    }
  }
  function bind(control, index) {
    control.dataset.classIndex = index;
    control.onpointerenter = (e) => {
      if (e.pointerType !== 'touch') inspect(index);
    };
    control.onpointerleave = () => inspect(prefs.pinned);
    control.onfocus = () => inspect(index);
    control.onblur = () => inspect(prefs.pinned);
    const toggle = () => {
      prefs.pinned = prefs.pinned === index ? null : index;
      inspect(prefs.pinned);
    };
    control.onclick = toggle;
    control.onkeydown = (e) => {
      if (e.key === 'Escape') {
        prefs.pinned = null;
        inspect(null);
      }
      if (control instanceof SVGElement && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggle();
      }
    };
  }
  membershipPanel(fp, bind);
  tastePatterns(catalog, predictions, fp.ratedCount);
  const selectors = document.getElementById('map-axes');
  selectors.replaceChildren();
  const numbers = axes.map((a) => a.index);
  if (profile.spectrum.length > 1) {
    numbers.forEach((selected, slot) => {
      const label = html('label', slot === 0 ? 'X' : 'Y');
      const select = /** @type {HTMLSelectElement} */ (html('select'));
      select.ariaLabel = (slot === 0 ? 'Horizontal' : 'Vertical') + ' principal component';
      profile.spectrum.forEach((fraction, i) => {
        select.add(new Option('PC' + (i + 1) + ' · ' + varianceShare(fraction), String(i)));
      });
      select.value = String(selected);
      select.onchange = () => {
        const chosen = Number(select.value),
          other = 1 - slot;
        prefs.axes = [...numbers];
        if (chosen === numbers[other]) prefs.axes[other] = selected;
        prefs.axes[slot] = chosen;
        onAxesChange();
        const replacement = selectors.querySelector('select[aria-label="' + select.ariaLabel + '"]');
        if (replacement instanceof HTMLSelectElement) replacement.focus({ preventScroll: true });
      };
      label.append(select);
      selectors.append(label);
    });
  }
  if (!continuous) {
    const center = /** @type {HTMLInputElement} */ (html('input'));
    center.type = 'checkbox';
    center.checked = prefs.centerClassMeans;
    center.onchange = () => {
      prefs.centerClassMeans = center.checked;
      prefs.axes = undefined;
      onAxesChange();
      selectors.querySelector('input')?.focus({ preventScroll: true });
    };
    const label = html('label');
    label.className = 'center-classes';
    label.title =
      'Subtract each class’s average across all titles before PCA. Class probabilities and forecasts stay the same.';
    label.append(center, 'Remove overall rating level');
    selectors.append(label);
  }
  inspect(prefs.pinned);
  legend.replaceChildren();
  plot.replaceChildren();
  document.getElementById('profile-help').textContent =
    'Hover or focus a class to inspect it. Click to pin it. Class probabilities describe similarities in how respondents scored titles. The category comparisons use personalized forecasts across unrated titles. ' +
    (fp.usesHalfStars ? 'A half-step class uses half stars on at least one in five ratings. ' : '') +
    (continuous
      ? 'The map uses Gaussian liabilities. Each contour shows one projected standard deviation.'
      : (prefs.centerClassMeans
          ? 'Each class profile is centered on its own average before projection. '
          : 'The map projects the class mean ratings. ') +
        'The diamond averages class positions using your probabilities.');
  if (!axes.length) {
    plot.append(
      html(
        'p',
        prefs.centerClassMeans
          ? 'The classes have no measurable differences after centering.'
          : 'The class centers have no measurable spread.',
      ),
    );
    return;
  }
  const xs = axes[0].scores,
    ys = axes[1]?.scores ?? weights.map(() => 0);
  const yourX = fp.axes[0].score,
    yourY = fp.axes[1]?.score ?? 0;
  const radii = (cov) => [Math.sqrt(Math.max(0, cov[0][0])), Math.sqrt(Math.max(0, cov[1]?.[1] ?? 0))];
  function axisLimit(scores, mean, coord) {
    const extents = [Math.abs(mean), ...scores.map(Math.abs)];
    if (continuous) {
      extents.push(Math.abs(mean) + radii(profile.covariance)[coord]);
      profile.classCovariance.forEach((cov, k) => extents.push(Math.abs(scores[k]) + radii(cov)[coord]));
    }
    const extent = Math.max(...extents);
    if (!extent) return 1;
    const step = 10 ** Math.floor(Math.log10(extent)) / 2;
    return Math.ceil(extent / step) * step;
  }
  const limitX = axisLimit(xs, yourX, 0),
    limitY = axisLimit(ys, yourY, 1);
  const x = (v) => 167 + (v * 123) / limitX,
    y = (v) => 91 - (v * 62) / limitY;
  const svg = figure(
    'Class centers on ' +
      numbers.map((i) => 'PC' + (i + 1)).join(' and ') +
      '. Diamond marks the projected mean.',
    324,
    188,
  );
  svg.setAttribute('role', 'group');
  for (const i of [-1, -0.5, 0, 0.5, 1]) {
    const tx = i * limitX,
      ty = i * limitY,
      style = i === 0 ? 'axis-line' : 'gridline';
    svg.append(
      shape('line', { x1: x(tx), x2: x(tx), y1: 21, y2: 159, class: style }),
      shape('text', { x: x(tx), y: 174, 'text-anchor': 'middle' }, String(+tx.toPrecision(2))),
    );
    if (axes.length > 1)
      svg.append(
        shape('line', { x1: 38, x2: 299, y1: y(ty), y2: y(ty), class: style }),
        shape('text', { x: 33, y: y(ty) + 4, 'text-anchor': 'end' }, String(+ty.toPrecision(2))),
      );
  }
  svg.append(
    shape('text', { x: 291, y: 187, 'text-anchor': 'middle' }, 'PC' + (numbers[0] + 1)),
    shape('text', { x: 28, y: 15 }, axes.length > 1 ? 'PC' + (numbers[1] + 1) : ''),
  );
  function contour(cx, cy, cov, color) {
    const [a, b] = radii(cov),
      off = a ? (cov[0][1] ?? 0) / a : 0,
      residual = Math.sqrt(Math.max(0, b * b - off * off));
    const points = Array.from({ length: 65 }, (_, i) => {
      const angle = (2 * Math.PI * i) / 64;
      return [x(cx + a * Math.cos(angle)), y(cy + off * Math.cos(angle) + residual * Math.sin(angle))].join(
        ',',
      );
    });
    svg.append(
      shape('polyline', { points: points.join(' '), stroke: color, fill: 'none', 'stroke-width': 1.6 }),
    );
  }
  if (continuous) {
    profile.classCovariance.forEach((cov, k) => contour(xs[k], ys[k], cov, colors[k % colors.length]));
    contour(yourX, yourY, profile.covariance, 'var(--accent)');
  }
  // Nearby projected centers can overlap. Place their numbers in separate
  // positions and lead each displaced label back to the actual center.
  const placed = [];
  const markers = xs.map((v, k) => [x(v), y(ys[k])]).concat([[x(yourX), y(yourY)]]);
  weights.forEach((w, k) => {
    const cx = x(xs[k]),
      cy = y(ys[k]),
      color = colors[k % colors.length];
    const circle = shape('circle', {
      cx,
      cy,
      r: 5.2,
      fill: color,
      stroke: 'var(--surface)',
      'stroke-width': 1.4,
    });
    const cls = members.get(k);
    const description =
      'Class ' +
      (k + 1) +
      ' · ' +
      cls.label +
      ' · ' +
      (100 * cls.prior).toFixed(1) +
      '% in catalog → ' +
      (100 * w).toFixed(1) +
      '% for you';
    const mark = shape('g', { role: 'button', tabindex: 0, 'aria-label': description });
    bind(mark, k);
    mark.append(
      shape('title', {}, description),
      shape('circle', { cx, cy, r: 10, fill: 'transparent' }),
      circle,
    );
    svg.append(mark);
    const offsets = [
      [10, -9],
      [11, 15],
      [-14, -9],
      [-14, 14],
      [15, -23],
      [-20, 23],
      [27, 4],
      [-26, -5],
    ];
    const [dx, dy] =
      offsets.find(
        ([a, b]) =>
          placed.every(([px, py]) => Math.hypot(cx + a - px, cy + b - py) > 15) &&
          markers.every(([mx, my]) => Math.hypot(cx + a - mx, cy + b - 4 - my) > 10),
      ) ?? offsets[0];
    placed.push([cx + dx, cy + dy]);
    mark.append(
      shape('line', {
        x1: cx,
        y1: cy,
        x2: cx + dx * 0.7,
        y2: cy + dy * 0.7,
        stroke: color,
        'stroke-width': 0.8,
      }),
      shape(
        'text',
        { x: cx + dx, y: cy + dy, class: 'class-number', 'text-anchor': 'middle' },
        String(k + 1),
      ),
    );
  });
  const px = x(yourX),
    py = y(yourY);
  const diamond = shape('path', {
    d: 'M' + px + ' ' + (py - 7) + 'l7 7 -7 7 -7 -7z',
    fill: 'var(--surface)',
    stroke: 'var(--accent)',
    'stroke-width': 2.5,
  });
  const position =
    (fp.ratedCount ? 'Your position' : 'Catalog center') +
    ' · ' +
    fp.axes.map((a, i) => 'PC' + (numbers[i] + 1) + ' ' + signedValue(a.score)).join(', ');
  diamond.append(shape('title', {}, position));
  svg.append(diamond);
  const key = html('button', fp.ratedCount ? '◇ Your position' : '◇ Catalog center');
  key.title = position + '. Return to your fingerprint.';
  key.className = 'projection-key';
  key.onclick = () => {
    prefs.pinned = null;
    inspect(null);
  };
  const variance = html(
    'span',
    varianceShare(axes.reduce((sum, a) => sum + a.fraction, 0)) +
      ' of ' +
      (continuous ? 'latent' : 'between-class') +
      ' variance shown',
  );
  const caption = html('div');
  caption.className = 'map-caption';
  caption.append(key, variance);
  plot.append(svg, caption);
  inspect(prefs.pinned);
  for (const [i, a] of fp.axes.entries()) {
    const card = html('section'),
      top = html('div');
    top.className = 'axis-summary';
    top.append(
      html('h3', 'PC' + (numbers[i] + 1) + ' · ' + a.label),
      html(
        'small',
        varianceShare(a.fraction) + ' of ' + (continuous ? 'latent variance' : 'between-class variance'),
      ),
    );
    const rail = html('div');
    rail.className = 'axis-track';
    const mark = html('i');
    mark.style.left = 50 + (50 * a.score) / (i === 0 ? limitX : limitY) + '%';
    rail.append(mark);
    rail.title = (fp.ratedCount ? 'Your score ' : 'Catalog center ') + signedValue(a.score);
    const ends = html('div');
    ends.className = 'axis-ends';
    ends.append(html('span', a.low), html('span', a.high));
    const axis = axes[i];
    const loadings = axis.loadings
      .map((value, j) => ({ value, title: catalog.items[j].title }))
      .sort((a, b) => a.value - b.value);
    const details = html('details');
    const summary = html('summary', 'Title loadings');
    summary.title = 'Lowest: ' + loadings[0].title + ' · highest: ' + loadings.at(-1).title;
    details.append(summary);
    for (const [label, entries] of [
      ['Lowest', loadings.slice(0, 3)],
      ['Highest', loadings.slice(-3).reverse()],
    ]) {
      details.append(html('b', label));
      const list = html('ul');
      for (const entry of entries)
        list.append(html('li', entry.title + ' (' + signedValue(entry.value, 3) + ')'));
      details.append(list);
    }
    card.append(top, rail, ends, details);
    legend.append(card);
  }
}
