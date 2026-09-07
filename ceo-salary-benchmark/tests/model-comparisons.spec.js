const { test, expect } = require("@playwright/test");

test("model robustness preserves the profile, applies variants and refreshes predictions", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.locator("#chart-tab-model").click();
  const profile = await page.locator("#model-settings input[type=number]").evaluateAll((inputs) => inputs.map((input) => input.value));
  await page.locator("#results-tab-robustness").click();
  await expect(page.locator("#robustness-status")).toContainText("21 / 21 models");
  await expect(page.locator("#empirical-robustness-options")).toBeHidden();
  await expect(page.locator(".robustness-spec-point")).toHaveCount(63);
  const target = page.locator('.robustness-spec-point[data-spec-id="bayesian_exact"][data-quantile="q50"]');
  const original = await target.getAttribute("aria-label");
  await target.focus();
  await expect(page.locator("#robustness-tooltip")).toContainText("Bayesian multilevel · base only");
  await target.press("Enter");
  await expect(page.locator("#model-method")).toHaveValue("bayesian");
  await expect(page.locator("#model-use-ad-ranges")).toBeDisabled();
  await expect(page.locator("#model-training-count")).toHaveText("112");
  expect(await page.locator("#model-settings input[type=number]").evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual(profile);
  await expect(target).toBeFocused();
  await page.locator("#model-staff").fill("100");
  await page.locator("#model-staff").blur();
  await expect(target).not.toHaveAttribute("aria-label", original);
  const refreshed = await target.getAttribute("aria-label");
  await page.locator(".robustness-audit summary").click();
  await expect(page.locator(".robustness-table tbody tr")).toHaveCount(21);
  await page.screenshot({ path: "tmp/model-robustness-desktop.png" });
  await page.waitForTimeout(150);
  await page.reload();
  await expect(page.locator("#model-method")).toHaveValue("bayesian");
  await page.locator("#results-tab-robustness").click();
  await expect(target).toHaveAttribute("aria-label", refreshed);
  await page.locator("#model-highest-other").fill("");
  await expect(page.locator("#robustness-status")).toContainText("11 / 21 models");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".robustness-figure svg")).toBeVisible();
  await page.locator(".robustness-figure").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "tmp/model-robustness-mobile.png" });
  await page.locator("#chart-tab-histogram").click();
  await expect(page.locator("#empirical-robustness-options")).toBeVisible();
  await expect(page.locator("#robustness-results")).toBeEmpty();
  expect(errors).toEqual([]);
});

test("CV sorting uses numeric values and driver comparisons retain the focused model", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.locator("#chart-tab-model").click();
  await page.locator("#results-tab-model-details").click();
  const registry = await page.evaluate(() => window.CEO_BENCHMARK_DATA.predictiveModel.comparison);
  const headerStyles = await page.locator("[data-model-sort]").evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).textDecorationLine));
  expect(headerStyles.every((style) => style === "none")).toBe(true);
  expect(await page.locator(".model-comparison-table thead th").first().evaluate((cell) => cell.getBoundingClientRect().width)).toBeLessThanOrEqual(125);
  const keys = () => page.locator("#model-comparison-body tr").evaluateAll((rows) => rows.map((row) => row.dataset.methodKey));
  for (const metric of ["logRmse", "meanAbsPercentError", "coverage90", "meanLogPredictiveDensity", "logCrps", "baseOnly", "includeCategories", "includeHighestOtherPay", "includeAdvertisedRanges"]) {
    const button = page.locator(`[data-model-sort="${metric}"]`);
    await button.click();
    await expect(button.locator("..")).toHaveAttribute("aria-sort", "ascending");
    const values = (await keys()).map((key) => Number(registry.find((row) => row.key === key)[metric]));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    await button.click();
    const reversed = (await keys()).map((key) => Number(registry.find((row) => row.key === key)[metric]));
    expect(reversed).toEqual([...values].sort((a, b) => b - a));
  }
  await page.locator('[data-model-sort="method"]').click();
  const labels = await page.locator(".model-method-button").allTextContents();
  expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  expect(labels.every((label) => !/other pay|ad ranges/.test(label))).toBe(true);
  await expect(page.locator('#model-comparison-body tr[data-method-key="bayesian_ranges"] td').nth(0)).toHaveText("No");
  await expect(page.locator('#model-comparison-body tr[data-method-key="bayesian_ranges"] td').nth(1)).toHaveText("Yes");
  const sizes = await page.locator('#model-settings select, #model-settings input[type="number"]').evaluateAll((inputs) => inputs.map((input) => getComputedStyle(input).fontSize));
  expect(new Set(sizes).size).toBe(1);
  const buffers = await page.locator(".model-contribution").evaluateAll((rows) => rows.map((row) => {
    const bar = row.querySelector(".model-contribution-bar").getBoundingClientRect();
    const value = row.querySelector("output").getBoundingClientRect();
    return value.left - bar.right;
  }));
  expect(buffers.every((gap) => Math.abs(gap - 5) < 1)).toBe(true);
  await page.screenshot({ path: "tmp/model-details-refined.png" });
  await page.getByRole("button", { name: "Inspect Expenses uncertainty", exact: true }).click();
  const dialog = page.locator("#model-explanation-dialog");
  await dialog.getByLabel("Compare all models").check();
  await expect(dialog.getByLabel("Compare all models")).toBeFocused();
  await expect(dialog).toContainText("Not included");
  await expect(dialog.locator("svg circle")).toHaveCount(20);
  await expect(page.locator("#model-method")).toHaveValue("bayesian");
  await page.screenshot({ path: "tmp/model-driver-comparison.png" });
  await dialog.getByLabel("Compare all models").uncheck();
  await expect(dialog.locator("svg circle")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close model explanation" }).click();
  await page.getByRole("button", { name: "Inspect Focus area uncertainty", exact: true }).click();
  await dialog.getByLabel("Compare all models").check();
  const levels = await page.evaluate(() => window.CEO_BENCHMARK_DATA.predictiveModel.categoricalFeatures.find((feature) => feature.key === "focus_area").levels);
  await expect(dialog.locator("svg circle")).toHaveCount(12 * (levels.length + 1));
  await expect(dialog.locator(".model-effect-name")).toHaveText(["Selected profile contrast", ...levels]);
  for (const effect of levels) {
    const rows = dialog.locator(".model-effect-row").filter({ has: page.locator("circle") });
    expect(await rows.evaluateAll((rows, effect) => rows.filter((row) => row.dataset.effect === effect).map((row) => row.dataset.modelKey), effect))
      .toEqual(registry.filter((row) => (row.method.startsWith("bayesian") || row.method === "gamCategorical")).map((row) => row.key));
  }
  const colors = await dialog.locator('.model-effect-row[data-model-key="bayesian"]').evaluateAll((rows) => rows.map((row) => row.querySelector("circle").getAttribute("fill")));
  expect(new Set(colors).size).toBe(1);
  const families = await dialog.locator('.model-effect-row[data-effect="Selected profile contrast"] circle').evaluateAll((dots) => dots.map((dot) => dot.getAttribute("fill")));
  expect(new Set(families).size).toBe(3);
  const expectedEffects = await page.evaluate(() => {
    const artifact = window.CEO_BENCHMARK_DATA.predictiveModel;
    const levels = artifact.categoricalFeatures.find((feature) => feature.key === "focus_area").levels;
    const format = (value) => `${value >= 0 ? "+" : ""}${(100 * Math.expm1(value)).toFixed(1)}%`;
    return levels.flatMap((effect, j) => artifact.comparison.filter((row) => (row.method.startsWith("bayesian") || row.method === "gamCategorical")).map((row) => {
      const model = artifact.models[row.modelKey];
      const draws = (model.draws ? model.draws.focus.map((draw) => draw[j])
        : model.uncertainty.coefficientDraws.map((draw) => draw.reduce((sum, value, k) => sum + value * model.categoryEffects.focus_area.basis[j][k], 0))).sort((a, b) => a - b);
      const quantile = (p) => { const x = p * (draws.length - 1); return draws[Math.floor(x)] + (x % 1) * (draws[Math.ceil(x)] - draws[Math.floor(x)]); };
      return { effect, model: row.key, value: `${format(quantile(.5))} [${format(quantile(.055))}, ${format(quantile(.945))}]` };
    }));
  });
  expect(await dialog.locator(".model-effect-row").evaluateAll((rows) => rows.filter((row) => row.dataset.effect !== "Selected profile contrast")
    .map((row) => ({ effect: row.dataset.effect, model: row.dataset.modelKey, value: row.querySelector(".model-effect-estimate").textContent })))).toEqual(expectedEffects);
  await dialog.locator(".model-effect-name").nth(2).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "tmp/model-driver-all-effects.png" });
  const overlappingLabels = await dialog.locator(".model-effect-row").evaluateAll((rows) => rows.some((row) => {
    const model = row.querySelector(".model-effect-model")?.getBoundingClientRect();
    const value = row.querySelector(".model-effect-estimate")?.getBoundingClientRect();
    return model && value && model.right >= value.left;
  }));
  expect(overlappingLabels).toBe(false);
  await dialog.getByLabel("Compare all models").scrollIntoViewIfNeeded();
  await dialog.getByLabel("Compare all models").uncheck();
  await expect(dialog.locator("svg circle")).toHaveCount(levels.length + 1);
  expect(errors).toEqual([]);
});
