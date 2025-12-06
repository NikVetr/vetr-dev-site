export function nelderMead(fn, start, opts = {}) {
  const alpha = 1;
  const gamma = 2;
  const rho = 0.5;
  const sigma = 0.5;
  const maxIterations = opts.maxIterations || 200;
  const tolerance = opts.tolerance || 1e-5;
  const step = opts.step || 1;

  const n = start.length;
  let simplex = Array.from({ length: n + 1 }, (_, i) => {
    if (i === 0) return start.slice();
    const point = start.slice();
    point[i - 1] += step;
    return point;
  });
  let values = simplex.map((p) => fn(p));

  for (let iter = 0; iter < maxIterations; iter++) {
    const order = simplex
      .map((p, idx) => ({ p, v: values[idx], idx }))
      .sort((a, b) => a.v - b.v);
    simplex = order.map((o) => o.p);
    values = order.map((o) => o.v);

    const best = simplex[0];
    const worst = simplex[n];

    const spread = Math.max(...values) - Math.min(...values);
    if (spread < tolerance) {
      return { x: simplex[0], fx: values[0], reason: "converged (spread)" };
    }

    const centroid = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        centroid[j] += simplex[i][j];
      }
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const reflect = centroid.map((c, j) => c + alpha * (c - worst[j]));
    const fr = fn(reflect);

    if (fr < values[0]) {
      const expand = centroid.map((c, j) => c + gamma * (reflect[j] - c));
      const fe = fn(expand);
      if (fe < fr) {
        simplex[n] = expand;
        values[n] = fe;
      } else {
        simplex[n] = reflect;
        values[n] = fr;
      }
      continue;
    }

    if (fr < values[n - 1]) {
      simplex[n] = reflect;
      values[n] = fr;
      continue;
    }

    let contract;
    if (fr < values[n]) {
      contract = centroid.map((c, j) => c + rho * (reflect[j] - c));
    } else {
      contract = centroid.map((c, j) => c + rho * (worst[j] - c));
    }
    const fc = fn(contract);
    if (fc < values[n]) {
      simplex[n] = contract;
      values[n] = fc;
      continue;
    }

    for (let i = 1; i < simplex.length; i++) {
      simplex[i] = simplex[0].map((b, j) => b + sigma * (simplex[i][j] - b));
      values[i] = fn(simplex[i]);
    }
  }

  return { x: simplex[0], fx: values[0], reason: "max iterations" };
}
