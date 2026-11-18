import { pnorm, pnormInterval, qnorm } from '../intuitions/lib/normal.js';
import { mulberry32 } from '../shared/rng.js';

// Within recorded rating bins, draw approximate bivariate Gaussian liabilities.
// Integrate the first coordinate by stratified importance sampling. Its weights
// include the mass of both recorded categories under each mixture component.
export function latentPairs(model, scale, xIndex, yIndex, rows, seed = 773) {
  const rand = mulberry32(seed),
    cuts = [-Infinity, ...model.cuts, Infinity];
  const total = rows.flat().reduce((a, b) => a + b, 0),
    limit = Math.min(350, total);
  if (!total) return [];
  const stratum = (mu, sd, a, b, u) => {
    const lo = (a - mu) / sd,
      hi = (b - mu) / sd,
      mass = pnormInterval(a, b, mu, sd);
    return mu + sd * (lo > 0 ? -qnorm(pnorm(-hi) + u * mass) : qnorm(pnorm(lo) + u * mass));
  };
  const back = (z) => {
    if (model.kind === 'logit-point') return scale.at(-1) / (1 + Math.exp(-z));
    // Map category boundaries to the displayed rating midpoints.
    const bounds = [scale[0], ...scale.slice(1).map((v, i) => (v + scale[i]) / 2), scale.at(-1)];
    const ps = [0, ...model.cuts.map((v) => pnorm(v)), 1],
      u = pnorm(z);
    let i = 0;
    while (i + 2 < ps.length && u > ps[i + 1]) i++;
    return bounds[i] + ((bounds[i + 1] - bounds[i]) * (u - ps[i])) / (ps[i + 1] - ps[i]);
  };
  const result = [];
  // Systematic sampling preserves the empirical frequencies and never exceeds
  // the number of co-raters. Within each occupied bin use fresh jitter draws.
  let cumulative = 0,
    next = (rand() * total) / limit;
  rows.forEach((row, y) =>
    row.forEach((count, x) => {
      cumulative += count;
      if (next >= cumulative) return;
      const pool = [];
      let mass = 0;
      for (const c of model.components) {
        const sx = Math.sqrt(c.covariance[xIndex][xIndex]),
          slope = c.covariance[xIndex][yIndex] / (sx * sx);
        const sy = Math.sqrt(c.covariance[yIndex][yIndex] - slope * c.covariance[xIndex][yIndex]);
        const px = pnormInterval(cuts[x], cuts[x + 1], c.mean[xIndex], sx);
        if (!px) continue;
        for (let j = 0; j < 64; j++) {
          const zx = stratum(c.mean[xIndex], sx, cuts[x], cuts[x + 1], (j + rand()) / 64);
          const mu = c.mean[yIndex] + slope * (zx - c.mean[xIndex]);
          const w = c.weight * px * pnormInterval(cuts[y], cuts[y + 1], mu, sy);
          if (w > 0) {
            mass += w;
            pool.push({ zx, mu, sy, mass });
          }
        }
      }
      if (!mass) throw new Error('Latent sampling has insufficient probability in an observed cell.');
      while (next < cumulative && result.length < limit) {
        const v = rand() * mass,
          s = pool.find((d) => d.mass >= v);
        result.push([back(s.zx), back(stratum(s.mu, s.sy, cuts[y], cuts[y + 1], rand()))]);
        next += total / limit;
      }
    }),
  );
  return result;
}
