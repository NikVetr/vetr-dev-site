const { test, expect } = require("@playwright/test");

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
