const { test, expect } = require("@playwright/test");

/** @param {import('@playwright/test').Page} page */
async function geometry(page) {
  return page.evaluate(() => {
    /** @param {string} selector */
    const box = (selector) => {
      const element = /** @type {HTMLElement} */ (document.querySelector(selector));
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, height: bounds.height, scrollHeight: element.scrollHeight };
    };
    return {
      settings: box("#settings-panel"), chart: box("#chart-wrap"), legend: box("#chart-legend"),
      results: box("#results-panel"), table: box("#evidence-table-panel"),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

for (const profile of ["generic", "RP"]) {
  const url = `/ceo-salary-benchmark/${profile === "RP" ? "?profile=RP" : ""}`;

  test(`${profile}: phone settings stay reachable with a nearby chart and keyboard jump`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    await expect(page.locator(".bar-block").first()).toBeVisible();
    const layout = await geometry(page);
    expect(layout.overflow).toBe(0);
    expect(layout.settings.scrollHeight).toBeGreaterThan(layout.settings.height);
    expect(layout.chart.top).toBeLessThan(844);
    await expect(page.locator(".settings-scroll-note")).toBeVisible();

    const beforeJump = page.url();
    await page.getByRole("button", { name: "Chart ↓" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#analysis-column")).toBeFocused();
    await expect(page.locator("#salary-chart")).toBeInViewport();
    expect(page.url()).toBe(beforeJump);
    await page.keyboard.press("Tab");
    await expect(page.locator("#chart-tab-histogram")).toBeFocused();

    // Tab to a control below the initial panel view; native focus must scroll it into view.
    await page.getByRole("button", { name: "Reset", exact: true }).focus();
    for (let i = 0; i < 80 && !await page.locator("#chart-color").evaluate(element => element === document.activeElement); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(page.locator("#chart-color")).toBeFocused();
    await page.locator("#chart-color").selectOption("sourceType");
    await expect(page.locator("#chart-color")).toHaveValue("sourceType");
    expect(await page.locator("#settings-panel").evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator("html")).toHaveAttribute("data-benchmark-profile", profile);
  });

  test(`${profile}: short landscape separates chart, legend, results and table`, async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(url);
    await expect(page.locator(".bar-block").first()).toBeVisible();
    const histogram = await geometry(page);
    expect(histogram.overflow).toBe(0);
    expect(histogram.chart.height).toBeGreaterThanOrEqual(220);
    expect(histogram.chart.bottom).toBeLessThanOrEqual(histogram.legend.top + 1);
    expect(histogram.legend.bottom).toBeLessThan(histogram.results.top);
    expect(histogram.results.bottom).toBeLessThanOrEqual(histogram.table.top);

    await page.locator("#chart-tab-scatter").click();
    await expect(page.locator("#chart-tab-scatter")).toHaveAttribute("aria-selected", "true");
    const scatter = await geometry(page);
    expect(scatter.chart.height).toBeGreaterThanOrEqual(220);
    expect(scatter.legend.bottom).toBeLessThan(scatter.results.top);
    expect(scatter.results.bottom).toBeLessThanOrEqual(scatter.table.top);

    // Narrow the chart, then try to drag its divider past the readable minimum.
    await page.locator("#settings-panel-resizer").focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await page.locator("#results-panel-resizer").focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowUp");
    const resized = await geometry(page);
    expect(resized.chart.height).toBeGreaterThanOrEqual(220);
    expect(resized.legend.bottom).toBeLessThan(resized.results.top);
    expect(resized.results.bottom).toBeLessThanOrEqual(resized.table.top);
  });
}

test("a generated role route keeps its role and query when jumping to the chart", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/operations-leadership-salary-benchmark/?profile=RP");
  const beforeJump = page.url();
  await page.getByRole("button", { name: "Chart ↓" }).click();
  expect(page.url()).toBe(beforeJump);
  await expect(page.locator("#position-select")).toHaveValue("operations_leadership");
  await expect(page.locator("html")).toHaveAttribute("data-benchmark-profile", "RP");
  await expect(page.locator("#salary-chart")).toBeInViewport();
});
