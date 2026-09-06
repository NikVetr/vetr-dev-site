/* Numerical pieces shared by profile predictions and their explanations. */
((root) => {
  "use strict";
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  function curvature(x, definition) {
    const k = definition.knots;
    const last = Math.max(0, x - k[3]) ** 3;
    const reference = (Math.max(0, x - k[2]) ** 3 - last) / (k[3] - k[2]);
    return [0, 1].map((j) => {
      const a = definition.adjustment[j];
      return ((Math.max(0, x - k[j]) ** 3 - last) / (k[3] - k[j]) - reference - a[0] - a[1] * x) / a[2];
    });
  }
  function normalQuantile(p) {
    if (!(p > 0 && p < 1)) throw new Error("Normal quantile requires 0 < p < 1");
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-.00778489400243029, -.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [.00778469570904146, .32246712907004, 2.445134137143, 3.75440866190742];
    const poly = (coefficients, x) => coefficients.reduce((v, coefficient) => v * x + coefficient, 0);
    if (p < .02425) { const q = Math.sqrt(-2 * Math.log(p)); return poly(c, q) / (poly(d, q) * q + 1); }
    if (p > .97575) { const q = Math.sqrt(-2 * Math.log1p(-p)); return -poly(c, q) / (poly(d, q) * q + 1); }
    const q = p - .5; const r = q * q;
    return poly(a, r) * q / (poly(b, r) * r + 1);
  }
  function kernelRow(kernel, x, family) {
    return kernel.trainingX.map((row) => {
      const distance = row.reduce((sum, value, j) => sum + (value - x[j]) ** 2, 0);
      return family === "gp" ? kernel.priorInterceptVariance + kernel.amplitude ** 2 * Math.exp(-distance / (2 * kernel.lengthScale ** 2))
        : Math.exp(-kernel.gamma * distance);
    });
  }
  function forwardSolve(lower, values) {
    const solution = [];
    values.forEach((value, i) => {
      const previous = lower[i].slice(0, i).reduce((sum, item, j) => sum + item * solution[j], 0);
      if (!(lower[i][i] > 0)) throw new Error("Invalid GP Cholesky diagonal");
      solution.push((value - previous) / lower[i][i]);
    });
    return solution;
  }
  function kernelPrediction(kernel, x, family, draw = kernel) {
    const row = kernelRow(kernel, x, family);
    if (family === "svr") return { mean: draw.intercept + dot(row, draw.weights) };
    const projected = forwardSolve(kernel.cholesky, row);
    const variance = kernel.priorInterceptVariance + kernel.amplitude ** 2 - dot(projected, projected);
    if (variance < -1e-5) throw new Error("Negative GP predictive variance");
    return { mean: kernel.priorMean + dot(row, kernel.alpha), variance: Math.max(0, variance), projected };
  }
  function coalitions(x, count) {
    return Array.from({ length: 2 ** count }, (_, mask) => x.map((value, j) => j < count && (mask & (1 << j)) ? value : 0));
  }
  function shapleyWeights(count, driver) {
    const factorial = (n) => n < 2 ? 1 : n * factorial(n - 1);
    const weights = Array(2 ** count).fill(0);
    for (let mask = 0; mask < weights.length; mask += 1) {
      if (mask & (1 << driver)) continue;
      const size = mask.toString(2).replaceAll("0", "").length;
      const weight = factorial(size) * factorial(count - size - 1) / factorial(count);
      weights[mask] -= weight; weights[mask | (1 << driver)] += weight;
    }
    return weights;
  }
  function kernelContributions(kernel, x, family, draws = []) {
    const count = x.length / 2;
    const profiles = coalitions(x, count);
    const predictions = profiles.map((profile) => kernelPrediction(kernel, profile, family));
    const allocations = Array.from({ length: count }, (_, driver) => shapleyWeights(count, driver));
    const covariance = family === "gp" ? profiles.map((profile, i) => profiles.map((other, j) => {
      const distance = profile.reduce((sum, value, k) => sum + (value - other[k]) ** 2, 0);
      return kernel.priorInterceptVariance + kernel.amplitude ** 2 * Math.exp(-distance / (2 * kernel.lengthScale ** 2))
        - dot(predictions[i].projected, predictions[j].projected);
    })) : null;
    const joint = covariance && allocations.map((a) => allocations.map((b) => dot(a, covariance.map((row) => dot(row, b)))));
    if (joint) for (let i = 0; i < count; i++) for (let j = 0; j < i; j++) joint[i][j] = joint[j][i] = (joint[i][j] + joint[j][i]) / 2;
    return Array.from({ length: count }, (_, driver) => {
      const weights = allocations[driver];
      const mean = dot(weights, predictions.map((item) => item.mean));
      if (family === "svr") {
        return { value: mean, draws: draws.map((draw) => dot(weights, profiles.map((profile) => kernelPrediction(kernel, profile, family, draw).mean))) };
      }
      const variance = joint[driver][driver];
      if (variance < -1e-5) throw new Error("Negative GP contrast variance");
      return { value: mean, normal: { mean, sd: Math.sqrt(Math.max(0, variance)) }, covariance: joint[driver] };
    });
  }
  function jointNormalDraws(means, covariance, count = 1000) {
    const n = means.length;
    if (covariance.length !== n || covariance.some((row) => row.length !== n || row.some((v) => !Number.isFinite(v)))) throw new Error("Invalid joint covariance");
    const lower = Array.from({ length: n }, () => Array(n).fill(0));
    const tolerance = 1e-9 * Math.max(1, ...covariance.map((row, i) => Math.abs(row[i])));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      const residual = covariance[i][j] - dot(lower[i].slice(0, j), lower[j].slice(0, j));
      if (i === j) {
        if (residual < -tolerance) throw new Error("Joint covariance is not positive semidefinite");
        lower[i][j] = Math.sqrt(Math.max(0, residual));
      } else if (lower[j][j] > 0) lower[i][j] = residual / lower[j][j];
      else if (Math.abs(residual) > tolerance) throw new Error("Inconsistent singular joint covariance");
    }
    let seed = 71943;
    const uniform = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + .5) / 4294967296; };
    return Array.from({ length: count }, () => {
      const z = means.map(() => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform()));
      return means.map((mean, i) => mean + dot(lower[i], z));
    });
  }
  function interpolateBasis(effect, x) {
    const grid = effect.z;
    let i = 0;
    if (x <= grid[0]) return effect.basis[0];
    if (x >= grid.at(-1)) return effect.basis.at(-1);
    while (grid[i + 1] < x) i += 1;
    const fraction = (x - grid[i]) / (grid[i + 1] - grid[i]);
    return effect.basis[i].map((value, j) => value + fraction * (effect.basis[i + 1][j] - value));
  }
  const api = { dot, curvature, normalQuantile, kernelPrediction, kernelContributions, shapleyWeights, interpolateBasis, jointNormalDraws };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SalaryModelMath = Object.freeze(api);
})(globalThis);
