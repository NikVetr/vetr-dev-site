function bestResult(simplex, values, reason, trace) {
  const index = values.reduce((best, v, i) => v < values[best] ? i : best, 0);
  return { x: simplex[index].slice(), fx: values[index], reason, trace };
}

function simplexConverged(simplex, values, tolerance, xTolerance) {
  if (!values.every(Number.isFinite)) return false;
  const spread = Math.max(...values) - Math.min(...values);
  return spread <= tolerance && simplex.every((p) =>
    p.every((v, j) => Math.abs(v - simplex[0][j]) <= xTolerance));
}

export function nelderMead(fn, start, opts = {}) {
  const alpha = 1;
  const gamma = 2;
  const rho = 0.5;
  const sigma = 0.5;
  const maxIterations = opts.maxIterations || 200;
  const tolerance = opts.tolerance || 1e-5;
  const step = opts.step || 1;
  const trace = opts.trace ? [] : null;

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
    if (trace) trace.push(best.slice());

    if (simplexConverged(simplex, values, tolerance, opts.xTolerance ?? 1e-5)) {
      return bestResult(simplex, values, "converged (spread and simplex)", trace);
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
    if (fr < values[n] ? fc <= fr : fc < values[n]) {
      simplex[n] = contract;
      values[n] = fc;
      continue;
    }

    for (let i = 1; i < simplex.length; i++) {
      simplex[i] = simplex[0].map((b, j) => b + sigma * (simplex[i][j] - b));
      values[i] = fn(simplex[i]);
    }
  }

  return bestResult(simplex, values, "max iterations", trace);
}

function defaultYield() {
  return new Promise((resolve) => {
    // Animation frames can stop entirely when the tab is hidden.
    setTimeout(resolve, 0);
  });
}

export async function nelderMeadAsync(fn, start, opts = {}) {
  const alpha = 1;
  // Gao–Han coefficients retain more simplex volume as dimension increases.
  const dimension = start.length;
  const adaptive = opts.adaptive && dimension > 1;
  const gamma = adaptive ? 1 + 2 / dimension : 2;
  const rho = adaptive ? 0.75 - 0.5 / dimension : 0.5;
  const sigma = adaptive ? 1 - 1 / dimension : 0.5;
  const maxIterations = opts.maxIterations || 200;
  const tolerance = opts.tolerance || 1e-5;
  const step = opts.step || 1;
  const trace = opts.trace ? [] : null;
  const shouldStop = typeof opts.shouldStop === "function" ? opts.shouldStop : () => false;
  const yieldEvery = opts.yieldEvery == null ? Infinity : Math.max(1, Math.floor(opts.yieldEvery));
  const yieldBudgetMs = opts.yieldBudgetMs ?? 10;
  if (!(yieldBudgetMs > 0)) throw new Error("yieldBudgetMs must be positive.");
  const now = opts.now || (() => performance.now());
  const yieldFn = typeof opts.yieldFn === "function" ? opts.yieldFn : defaultYield;
  let lastYield = now();

  const n = start.length;
  const maxEvaluations = opts.maxEvaluations ?? Infinity;
  if (maxEvaluations !== Infinity && (!Number.isInteger(maxEvaluations) || maxEvaluations < n + 1)) {
    throw new Error("maxEvaluations must cover the initial simplex (dimension + 1).");
  }
  let evaluations = 0, iterations = 0;
  let bestSeen = { x: start.slice(), fx: Infinity };
  const evaluate = (point) => {
    if (evaluations >= maxEvaluations) return Infinity;
    evaluations++;
    const value = fn(point);
    if (value < bestSeen.fx) bestSeen = { x: point.slice(), fx: value };
    return value;
  };
  const finish = (reason) => ({ ...bestSeen, reason, trace, evaluations, iterations });
  let simplex = Array.from({ length: n + 1 }, (_, i) => {
    if (i === 0) return start.slice();
    const point = start.slice();
    point[i - 1] += step;
    return point;
  });
  let values = simplex.map((p) => evaluate(p));

  for (let iter = 0; iter < maxIterations; iter++) {
    if (evaluations >= maxEvaluations) return finish("max evaluations");
    iterations = iter + 1;
    if (shouldStop()) {
      return { ...finish("cancelled"), cancelled: true };
    }
    if (now() - lastYield >= yieldBudgetMs || (iter > 0 && iter % yieldEvery === 0)) {
      await yieldFn();
      lastYield = now();
      if (shouldStop()) {
        return { ...finish("cancelled"), cancelled: true };
      }
    }

    const order = simplex
      .map((p, idx) => ({ p, v: values[idx], idx }))
      .sort((a, b) => a.v - b.v);
    simplex = order.map((o) => o.p);
    values = order.map((o) => o.v);

    const best = simplex[0];
    const worst = simplex[n];
    if (trace) trace.push(best.slice());

    if (simplexConverged(simplex, values, tolerance, opts.xTolerance ?? 1e-5)) {
      return finish("converged (spread and simplex)");
    }

    const centroid = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const reflect = centroid.map((c, j) => c + alpha * (c - worst[j]));
    const fr = evaluate(reflect);

    if (fr < values[0]) {
      const expand = centroid.map((c, j) => c + gamma * (reflect[j] - c));
      const fe = evaluate(expand);
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
    if (fr < values[n]) contract = centroid.map((c, j) => c + rho * (reflect[j] - c));
    else contract = centroid.map((c, j) => c + rho * (worst[j] - c));
    const fc = evaluate(contract);
    if (fr < values[n] ? fc <= fr : fc < values[n]) {
      simplex[n] = contract;
      values[n] = fc;
      continue;
    }

    for (let i = 1; i < simplex.length; i++) {
      simplex[i] = simplex[0].map((b, j) => b + sigma * (simplex[i][j] - b));
      values[i] = evaluate(simplex[i]);
    }
  }

  return finish(evaluations >= maxEvaluations ? "max evaluations" : "max iterations");
}
