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
    ? 'Principal components of the fitted population liabilities. Purple contours show one standard deviation for each Gaussian component. The green contour and diamond show your conditional spread and mean. Component sizes reflect posterior membership.'
    : 'Principal components of the categorical classes’ mean rating profiles. Circle sizes show membership probabilities. The diamond is your posterior-weighted class center.';
  plot.replaceChildren();
  legend.replaceChildren();
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
  const x = (v) => 177 + (v * 126) / extent,
    y = (v) => 139 - (v * 112) / extent;
  const svg = figure(
    'Population principal components with component centers and your conditional position.',
    354,
    273,
  );
  svg.append(
    shape('line', { x1: 18, x2: 340, y1: y(0), y2: y(0), class: 'gridline' }),
    shape('line', { x1: x(0), x2: x(0), y1: 10, y2: 255, class: 'gridline' }),
    shape('text', { x: 322, y: y(0) + 14 }, 'PC1'),
  );
  if (axes.length > 1) svg.append(shape('text', { x: x(0) + 6, y: 14 }, 'PC2'));
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
    profile.classCovariance.forEach((cov, k) => contour(xs[k], ys[k], cov, 'var(--taste-ink)'));
    contour(yourX, yourY, profile.covariance, 'var(--accent)');
  }
  weights.forEach((w, k) => {
    const circle = shape('circle', {
      cx: x(xs[k]),
      cy: y(ys[k]),
      r: 5 + 8 * Math.sqrt(w),
      fill: 'var(--taste-ink)',
      opacity: 0.7,
    });
    circle.append(shape('title', {}, 'Class ' + (k + 1) + ' · ' + (100 * w).toFixed(1) + '%'));
    svg.append(circle, shape('text', { x: x(xs[k]) + 7, y: y(ys[k]) - 8 }, String(k + 1)));
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
  plot.append(svg);
  for (const [i, a] of axes.entries()) {
    const p = document.createElement('p');
    p.textContent =
      'PC' +
      (i + 1) +
      ' · ' +
      (a.fraction * 100).toFixed(1) +
      (continuous
        ? '% of latent variance. Smallest loading: '
        : '% of between-class variance. Smallest loading: ') +
      catalog.items[a.low].title +
      ' (' +
      a.loadings[a.low].toFixed(2) +
      '). Largest: ' +
      catalog.items[a.high].title +
      ' (' +
      a.loadings[a.high].toFixed(2) +
      ').';
    legend.append(p);
  }
  const classes = document.createElement('p');
  classes.textContent =
    'Class membership given your ratings: ' +
    weights.map((w, i) => i + 1 + ' (' + (100 * w).toFixed(1) + '%)').join(' · ');
  legend.append(classes);
}
