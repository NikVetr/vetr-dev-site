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
function fingerprintPanels(fp, catalog) {
  document.getElementById('profile-count').textContent = fp.ratedCount
    ? fp.ratedCount + (fp.ratedCount === 1 ? ' applied rating' : ' applied ratings')
    : 'Catalog baseline';
  const membership = document.getElementById('memberships');
  membership.replaceChildren(html('h3', fp.ratedCount ? 'Class probabilities' : 'Catalog classes'));
  for (const { index, label, probability, prior } of fp.classes) {
    const row = html('div');
    row.className = 'class-weight';
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
  const signature = document.getElementById('class-signature');
  signature.replaceChildren(html('h3', fp.match ? 'Closest class' : 'Class match'));
  if (fp.match) {
    const heading = html('strong', fp.match.label);
    heading.className = 'match-name';
    const p = html(
      'p',
      'Class ' + (fp.match.index + 1) + ' · ' + (fp.match.probability * 100).toFixed(1) + '% probability',
    );
    signature.append(heading, p);
  } else {
    const text =
      fp.classes.length === 1
        ? 'Single-component model'
        : fp.ratedCount
          ? 'Tied class probabilities'
          : 'Rate an entry to find your class.';
    signature.append(html('p', text));
  }
  const dist = html('div');
  dist.className = 'class-stats';
  const metric = (label, value) => {
    const tile = html('div');
    tile.append(html('span', label), html('b', value));
    dist.append(tile);
  };
  metric('Class-weighted mean', fp.mean.toFixed(2));
  if (fp.usesHalfStars)
    metric(
      'Half-star use',
      Math.round(100 * fp.mass.reduce((sum, v, i) => sum + (Number.isInteger(catalog.scale[i]) ? 0 : v), 0)) +
        '%',
    );
  else
    metric(
      'Chance of ' + (catalog.scaleLabels?.at(-1) ?? catalog.scale.at(-1)),
      Math.round(100 * fp.mass.at(-1)) + '%',
    );
  signature.append(dist);
  if (
    fp.ratedCount &&
    fp.affinities.length > 1 &&
    fp.affinities[0].shift - fp.affinities.at(-1).shift >= 0.01
  ) {
    const group = html('div');
    group.className = 'class-affinities';
    group.append(html('h4', 'Relative affinities'));
    for (const a of [fp.affinities[0], fp.affinities.at(-1)]) {
      const row = html('div');
      row.append(html('span', a.label), html('b', signedValue(a.shift)));
      row.title = 'Average shift for ' + a.count + ' entries, centered on the catalog-wide shift';
      group.append(row);
    }
    signature.append(group);
  }
}
export function renderTaste(profile, catalog, fp, domain) {
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
      games: 'Game preference',
    }[domain] ?? 'Preference';
  document.getElementById('projection-title').textContent = domainTitle + ' fingerprint';
  fingerprintPanels(fp, catalog);
  const details = document.getElementById('axis-loadings');
  details.replaceChildren();
  legend.replaceChildren();
  plot.replaceChildren();
  document.getElementById('profile-help').textContent =
    'The closest class has the highest probability given your applied ratings. Each entry counts equally in the class-weighted mean and response frequencies. Relative affinities compare group shifts after removing the overall shift. ' +
    (fp.usesHalfStars ? 'A half-step class uses half stars on at least one in five ratings. ' : '') +
    (continuous
      ? 'The map uses Gaussian liabilities. Each contour shows one projected standard deviation.'
      : 'The map projects the class mean ratings. The diamond averages their positions using your class probabilities.');
  if (!axes.length) {
    plot.append(html('p', 'The class centers have no measurable spread.'));
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
    'Class centers on ' + (axes.length > 1 ? 'PC1 and PC2' : 'PC1') + '. Diamond marks the projected mean.',
    324,
    188,
  );
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
    shape('text', { x: 313, y: 174, 'text-anchor': 'middle' }, 'PC1'),
    shape('text', { x: 28, y: 15 }, axes.length > 1 ? 'PC2' : ''),
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
    circle.append(shape('title', {}, 'Class ' + (k + 1) + ' · ' + (100 * w).toFixed(1) + '%'));
    svg.append(circle);
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
    svg.append(
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
  svg.append(
    shape('path', {
      d: 'M' + px + ' ' + (py - 7) + 'l7 7 -7 7 -7 -7z',
      fill: 'var(--surface)',
      stroke: 'var(--accent)',
      'stroke-width': 2.5,
    }),
  );
  const key = html('p', fp.ratedCount ? '◇ Your position' : '◇ Catalog center');
  key.className = 'projection-key';
  plot.append(svg, key);
  for (const [i, a] of fp.axes.entries()) {
    const card = html('section'),
      top = html('div');
    top.className = 'axis-summary';
    top.append(
      html('h3', 'PC' + (i + 1) + ' · ' + a.label),
      html(
        'small',
        (100 * a.fraction).toFixed(1) + '% of ' + (continuous ? 'latent variance' : 'between-class variance'),
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
    card.append(top, rail, ends);
    legend.append(card);
    const axis = axes[i];
    details.append(
      html(
        'p',
        'PC' +
          (i + 1) +
          ' · projected score ' +
          signedValue(a.score) +
          '. Lowest loading: ' +
          catalog.items[axis.low].title +
          ' (' +
          axis.loadings[axis.low].toFixed(3) +
          '). Highest: ' +
          catalog.items[axis.high].title +
          ' (' +
          axis.loadings[axis.high].toFixed(3) +
          ').',
      ),
    );
  }
}
