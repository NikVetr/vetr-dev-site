const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = readFileSync(path.join(root, "app.js"), "utf8");
const scope = vm.createContext({ state: { fit: "gamma" }, clamp: (x, low, high) => Math.max(low, Math.min(high, x)) });
// Exercise production functions without exposing test hooks in the browser.
vm.runInContext(source.slice(source.indexOf("  function weightedMean("), source.indexOf("  function svgElement(")), scope);

test("gamma CDF, density and quantiles agree with R across concentration levels", () => {
  const references = JSON.parse(execFileSync("Rscript", ["-e", `
    rows <- expand.grid(shape = c(.01, .1, 1, 10, 100, 10000, 99999, 100000, 1e6, 1e9),
                        p = c(.01, .1, .5, .9, .99))
    rows$x <- qgamma(rows$p, rows$shape)
    cat(jsonlite::toJSON(rows, dataframe = "rows", digits = 16))
  `], { encoding: "utf8" }));
  for (const { shape, p, x } of references) {
    assert.ok(Math.abs(scope.gammaP(shape, x) - p) < 2e-7, `shape=${shape}, p=${p}`);
  }
  for (const spread of [100, 1000, 10000]) {
    const fitted = scope.fitModel([100000 - spread, 100000 + spread].map((value) => ({ value, weight: 1 })));
    for (const p of [.01, .1, .5, .9, .99]) {
      assert.ok(Math.abs(fitted.cdf(fitted.quantile(p)) - p) < 2e-7);
    }
    const lo = fitted.quantile(.01), hi = fitted.quantile(.99), n = 10000, step = (hi - lo) / n;
    let mass = 0;
    for (let i = 0; i < n; i++) mass += fitted.density(lo + (i + .5) * step) * step;
    assert.ok(Math.abs(mass - .98) < 2e-6, `gamma integrated mass=${mass}`);
  }
  assert.equal(scope.fitModel([{ value: 100000, weight: 1 }, { value: 100000, weight: 1 }]), null);
});

test("predictive intervals contain their labeled density mass", () => {
  const artifact = JSON.parse(readFileSync(path.join(root, "benchmark/analysis/predictive_salary_models/model_artifact.json"), "utf8"));
  const models = [scope.logNormalMixture([11, 12.5, 14], [.15, .5, .8])];
  const known = scope.logNormalMixture([12], [.4]);
  assert.ok(Math.abs(known.quantile(.5) / Math.exp(12) - 1) < 1e-7);
  assert.ok(Math.abs(known.expected / Math.exp(12 + .4 ** 2 / 2) - 1) < 1e-12);
  for (const key of ["intercept", "linear", "gam"]) {
    const residuals = artifact.models[key].residuals;
    const mean = residuals.reduce((sum, value) => sum + value, 0) / residuals.length;
    const sd = Math.sqrt(residuals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (residuals.length - 1));
    const bandwidth = Math.max(.04, 1.06 * sd * residuals.length ** -.2);
    models.push(scope.logNormalMixture(residuals.map((r) => 12 + r), residuals.map(() => bandwidth)));
  }
  for (const model of models) {
    for (const level of [.5, .8, .95]) {
      const lo = model.quantile((1 - level) / 2), hi = model.quantile((1 + level) / 2);
      assert.ok(Math.abs(model.cdf(hi) - model.cdf(lo) - level) < 1e-8);
      const logLo = Math.log(lo), n = 10000, step = (Math.log(hi) - logLo) / n;
      let mass = 0;
      for (let i = 0; i < n; i++) {
        const x = Math.exp(logLo + (i + .5) * step);
        mass += model.density(x) * x * step;
      }
      assert.ok(Math.abs(mass - level) < 2e-6, `integrated predictive mass=${mass}, expected=${level}`);
    }
  }
});

test("non-CEO organization weights survive normalization without rewarding repeated rows", () => {
  const rows = [{ id: "a1", organization: "A" }, { id: "a2", organization: "A" }, { id: "b1", organization: "B" }];
  const scope = vm.createContext({
    rows: () => rows, passesFilters: () => true, salary: () => 100000,
    rowInclusion: () => new Map(rows.map((row) => [row.id, true])),
    rowCustomWeights: () => new Map(), isCeoPosition: () => false,
    state: { weightings: new Set(), stream: "incumbents" }, baseWeight: () => 1,
  });
  vm.runInContext(source.slice(source.indexOf("  function weightedSelection("), source.indexOf("  function selectedRows(")), scope);
  const totals = () => {
    const selected = scope.weightedSelection();
    return selected.filter((item) => item.row.organization === "A").reduce((sum, item) => sum + item.weight, 0)
      / selected.find((item) => item.row.organization === "B").weight;
  };
  assert.equal(totals(), 1);
  scope.baseWeight = (row) => row.organization === "A" ? 2 : 1;
  assert.equal(totals(), 2);
});
