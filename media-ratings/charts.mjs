import { dot } from '../intuitions/lib/linalg.js';

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
function descriptors(axis, items) {
  const groups = new Map();
  items.forEach((it, i) => {
    const a = it.annotations;
    const labels = a?.genres ?? (a?.region ? [a.region] : []);
    for (const label of labels) {
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(axis.loadings[i]);
    }
  });
  const sorted = [...groups]
    .filter(([, v]) => v.length >= (items.length > 100 ? 10 : 2))
    .map(([name, v]) => ({ name, n: v.length, mean: v.reduce((sum, x) => sum + x, 0) / v.length }))
    .sort((a, b) => a.mean - b.mean);
  if (sorted.length < 2) return '';
  const low = sorted[0],
    high = sorted.at(-1);
  return (
    'Mean loading by group: ' +
    low.name +
    ' (' +
    low.mean.toFixed(3) +
    ', n=' +
    low.n +
    ') to ' +
    high.name +
    ' (' +
    high.mean.toFixed(3) +
    ', n=' +
    high.n +
    ').'
  );
}
export function renderTaste(profile, catalog) {
  const host = document.getElementById('taste'),
    plot = document.getElementById('taste-plot'),
    legend = document.getElementById('axes');
  host.hidden = !profile;
  if (!profile) return;
  const { projection: axes, weights } = profile;
  const continuous = Boolean(profile.covariance);
  document.getElementById('projection-title').textContent = continuous
    ? 'Gaussian latent space'
    : 'Taste-class projection';
  document.getElementById('projection-help').textContent = continuous
    ? 'Contours enclose one standard deviation of projected liabilities. The diamond marks your conditional mean.'
    : 'Each number represents a class of rating profiles. The diamond locates the average profile implied by your ratings.';
  plot.replaceChildren();
  legend.replaceChildren();
  const membership = document.getElementById('memberships');
  membership.replaceChildren(html('h3', 'Class probability'));
  const sortedWeights = weights.map((weight, i) => ({ weight, i })).sort((a, b) => b.weight - a.weight);
  for (const { weight, i } of sortedWeights) {
    const row = html('div');
    row.className = 'class-weight';
    row.style.setProperty('--class-color', colors[i % colors.length]);
    const label = html('span', 'Class ' + (i + 1)),
      rail = html('span'),
      bar = html('i');
    rail.className = 'weight-rail';
    bar.style.width = weight * 100 + '%';
    rail.append(bar);
    row.append(label, rail, html('b', (100 * weight).toFixed(1) + '%'));
    membership.append(row);
  }
  if (!axes.length) {
    legend.textContent = 'The fitted class means have no between-class spread.';
    return;
  }
  const xs = axes[0].scores,
    ys = axes[1]?.scores ?? weights.map(() => 0);
  const yourX = profile.mean?.[0] ?? dot(xs, weights),
    yourY = profile.mean?.[1] ?? dot(ys, weights);
  const radii = (cov) => [Math.sqrt(Math.max(0, cov[0][0])), Math.sqrt(Math.max(0, cov[1]?.[1] ?? 0))];
  const sizes = continuous
    ? [...profile.classCovariance, profile.covariance].flatMap((cov, k) => {
        const [a, b] = radii(cov);
        return [Math.abs(xs[k] ?? yourX) + a, Math.abs(ys[k] ?? yourY) + b];
      })
    : [];
  const extent = Math.max(1e-8, ...xs.map(Math.abs), ...ys.map(Math.abs), ...sizes);
  const step = 10 ** Math.floor(Math.log10(extent));
  const limit = (Math.ceil((extent / step) * 2) * step) / 2;
  const x = (v) => 235 + (v * 178) / limit,
    y = (v) => 127 - (v * 96) / limit;
  const svg = figure(
    'Projected class centers and your conditional position. PC1 horizontal, PC2 vertical.',
    460,
    264,
  );
  for (const i of [-1, -0.5, 0, 0.5, 1]) {
    const t = i * limit,
      label = String(+t.toPrecision(2));
    const style = i === 0 ? 'axis-line' : 'gridline';
    svg.append(
      shape('line', { x1: x(t), x2: x(t), y1: 24, y2: 226, class: style }),
      shape('text', { x: x(t), y: 242, 'text-anchor': 'middle' }, label),
    );
    if (axes.length > 1)
      svg.append(
        shape('line', { x1: 49, x2: 422, y1: y(t), y2: y(t), class: style }),
        shape('text', { x: 41, y: y(t) + 4, 'text-anchor': 'end' }, label),
      );
  }
  svg.append(
    shape('text', { x: 235, y: 260, 'text-anchor': 'middle' }, 'PC1'),
    shape('text', { x: 40, y: 15 }, axes.length > 1 ? 'PC2' : ''),
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
      offsets.find(([a, b]) => placed.every(([px, py]) => Math.hypot(cx + a - px, cy + b - py) > 15)) ??
      offsets[0];
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
  const key = html('p', '◇  Your projected mean');
  key.className = 'projection-key';
  plot.append(svg, key);
  for (const [i, a] of axes.entries()) {
    const section = html('section');
    section.append(
      html(
        'h3',
        'PC' +
          (i + 1) +
          ' · ' +
          (100 * a.fraction).toFixed(1) +
          '% of ' +
          (continuous ? 'latent variance' : 'between-class variance'),
      ),
    );
    for (const [name, j] of [
      ['Low', a.low],
      ['High', a.high],
    ]) {
      const line = html('p');
      line.append(
        html('b', name + '  '),
        document.createTextNode(catalog.items[j].title + ' (' + a.loadings[j].toFixed(2) + ')'),
      );
      section.append(line);
    }
    const groups = descriptors(a, catalog.items);
    if (groups) section.append(html('small', groups));
    legend.append(section);
  }
}
