const { test, expect } = require("@playwright/test");

test("expectation target separates log-location uncertainty from predictive spread", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.locator("#chart-tab-model").click();
  await page.locator("#quantile-granularity").selectOption("custom");
  await page.locator("#custom-quantiles").fill("25, 50, 75");
  await page.locator("#custom-quantiles").blur();
  const values = () => page.locator("#quantile-grid .quantile-cell").evaluateAll((cells) => cells.map((cell) => Number(cell.dataset.value)));
  const predictive = await values();
  const expected = await page.evaluate(() => {
    const a = window.CEO_BENCHMARK_DATA.predictiveModel;
    const row = a.comparison.find((r) => r.method === "bayesian" && r.includeHighestOtherPay && !r.includeAdvertisedRanges);
    const m = a.models[row.modelKey], d = m.draws, p = a.rpProfile;
    const z = m.preprocessing.map((f) => (Math.log(p[f.key]) - f.center) / f.scale);
    const categories = [["focus_area", "focus"], ["organization_type", "organizationType"], ["title_group", "title"], ["location_scope", "location"], ["remote_category", "remote"], ["fiscal_sponsor_category", "fiscalSponsor"]];
    const mu = d.alpha.map((alpha, i) => alpha + z.reduce((sum, v, j) => sum + v * d.beta[i][j], 0)
      + categories.reduce((sum, [feature, term]) => sum + d[term][i][a.categoricalFeatures.find((f) => f.key === feature).levels.indexOf(p[feature])], 0)
      + d.ea[i][a.eaLevels.indexOf(p.ea_relationship)]).sort((a, b) => a - b);
    const q = (p) => { const at = p * (mu.length - 1); return Math.exp(mu[Math.floor(at)] + at % 1 * (mu[Math.ceil(at)] - mu[Math.floor(at)])); };
    return { id: row.key, quantiles: [.25, .5, .75].map(q), interval: [.055, .945].map(q) };
  });
  await page.locator("#model-target").selectOption("expectation");
  await expect(page.locator("#quantile-basis")).toContainText("Estimation percentiles of exp(μ)");
  await expect(page.locator("#quantile-grid .quantile-uncertainty")).toHaveCount(0);
  const location = await values();
  location.forEach((value, i) => expect(value).toBeCloseTo(expected.quantiles[i], 6));
  expect(location[2] - location[0]).toBeLessThan(predictive[2] - predictive[0]);
  await page.locator("#results-tab-robustness").click();
  await page.locator("#model-robustness-intervals").check();
  await expect(page.locator(".robustness-percentile-interval")).toHaveCount(19);
  const interval = page.locator(`.robustness-spec-point[data-spec-id="${expected.id}"] .robustness-percentile-interval`);
  expect(Number(await interval.getAttribute("data-low"))).toBeCloseTo(expected.interval[0], 6);
  expect(Number(await interval.getAttribute("data-high"))).toBeCloseTo(expected.interval[1], 6);
  await page.locator("#model-title").selectOption("__average__");
  const title = await page.locator("#model-title").inputValue();
  const shared = page.url(); await page.goto(shared);
  await expect(page.locator("#model-target")).toHaveValue("expectation");
  await expect(page.locator("#model-title")).toHaveValue(title);
  for (const method of ["gp", "linear", "gam", "svr", "intercept", "bayesianGam", "bayesianExact"]) {
    await page.locator("#model-method").selectOption(method);
    await expect(page.locator("#quantile-basis")).toContainText("Estimation percentiles of exp(μ)");
    const draws = await values(); expect(draws).toHaveLength(3);
    expect(draws.every(Number.isFinite)).toBe(true);
    expect(draws[0]).toBeLessThan(draws[1]); expect(draws[1]).toBeLessThan(draws[2]);
    if (method === "svr") await expect(page.locator("#quantile-basis")).toContainText("SVR uses fitted log-location");
  }
  await page.screenshot({ path: "tmp/model-expectation-target.png" });
  await page.locator("#model-target").selectOption("predictive");
  await expect(page.locator("#quantile-grid .quantile-uncertainty")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("model robustness optionally shows estimation intervals for peer percentiles", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.locator("#chart-tab-model").click();
  await expect(page.locator("#quantile-basis")).toContainText("Predictive salary percentiles:");
  await expect(page.locator("#quantile-basis")).toContainText("peer variation + model uncertainty");
  await page.locator("#results-tab-robustness").click();
  const toggle = page.locator("#model-robustness-intervals");
  await expect(toggle).not.toBeChecked();
  await expect(page.locator(".robustness-percentile-interval")).toHaveCount(0);
  await toggle.check();
  await expect(page.locator(".robustness-percentile-interval")).toHaveCount(57);
  const expected = await page.evaluate(() => {
    const a = window.CEO_BENCHMARK_DATA.predictiveModel;
    const row = a.comparison.find((r) => r.method === "bayesian" && r.includeHighestOtherPay && !r.includeAdvertisedRanges);
    const m = a.models[row.modelKey], d = m.draws, p = a.rpProfile;
    const z = m.preprocessing.map((f) => (Math.log(p[f.key]) - f.center) / f.scale);
    const categories = [["focus_area", "focus"], ["organization_type", "organizationType"], ["title_group", "title"], ["location_scope", "location"], ["remote_category", "remote"], ["fiscal_sponsor_category", "fiscalSponsor"]];
    const values = d.alpha.map((alpha, i) => Math.exp(alpha + z.reduce((sum, v, j) => sum + v * d.beta[i][j], 0)
      + categories.reduce((sum, [feature, term]) => sum + d[term][i][a.categoricalFeatures.find((f) => f.key === feature).levels.indexOf(p[feature])], 0)
      + d.ea[i][a.eaLevels.indexOf(p.ea_relationship)])).sort((a, b) => a - b);
    const q = (p) => { const at = p * (values.length - 1); return values[Math.floor(at)] + at % 1 * (values[Math.ceil(at)] - values[Math.floor(at)]); };
    return { id: row.key, interval: [q(.055), q(.945)] };
  });
  const interval = page.locator(`.robustness-spec-point[data-spec-id="${expected.id}"][data-quantile="q50"] .robustness-percentile-interval`);
  const actual = [Number(await interval.getAttribute("data-low")), Number(await interval.getAttribute("data-high"))];
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected.interval[i], 5));
  await expect(interval).toHaveAttribute("data-level", "89");
  await page.locator(".robustness-figure").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "tmp/model-robustness-intervals.png" });
  await page.locator("#model-compatibility-level").fill("50");
  await page.locator("#model-compatibility-level").blur();
  await expect(interval).toHaveAttribute("data-level", "50");
  expect(Number(await interval.getAttribute("data-low"))).toBeGreaterThan(actual[0]);
  expect(Number(await interval.getAttribute("data-high"))).toBeLessThan(actual[1]);
  await toggle.uncheck();
  await expect(page.locator(".robustness-percentile-interval")).toHaveCount(0);
  await page.locator("#model-method").selectOption("svr");
  await page.locator("#results-tab-quantiles").click();
  await expect(page.locator("#quantile-basis")).toContainText("residual peer variation at the fitted prediction");
  expect(errors).toEqual([]);
});
