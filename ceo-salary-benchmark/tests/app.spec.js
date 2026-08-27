const { test, expect } = require("@playwright/test");

test("benchmark interactions and validated sources", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://en.wikipedia.org/**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ query: { pages: { 1: {
      title: "American Immigration Council", extract: "A nonprofit immigration advocacy organization.",
      fullurl: "https://en.wikipedia.org/wiki/American_Immigration_Council",
    } } } }),
  }));
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "CEO salary benchmark" })).toBeVisible();
  await expect(page.locator("#stat-n")).toHaveText("110");
  await expect(page.locator(".bar-block")).toHaveCount(110);
  await expect(page.locator('input[name="distribution"][value="lognormal"]')).toBeChecked();
  await expect(page.locator(".density-line")).toHaveCount(1);
  await expect(page.locator(".rug-line")).toHaveCount(110);
  await expect(page.locator("#salary-chart")).toContainText("Weighted organizations per bin");
  await expect(page.locator("#quantile-basis")).toHaveText("Derived from the fitted lognormal distribution");
  await expect(page.locator("#show-rug")).toHaveCount(0);
  await expect(page.locator(".reference-band")).toHaveCount(0);
  await expect(page.locator(".density-line")).toHaveAttribute("d", /L/);
  await expect(page.locator("#bin-count")).toHaveAttribute("min", "2");
  await expect(page.locator("#bin-count")).toHaveAttribute("max", "200");
  const blockAspect = await page.locator(".bar-block").first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.width / box.height;
  });
  expect(blockAspect).toBeGreaterThan(0.5);
  expect(blockAspect).toBeLessThan(2);
  const highestBlock = await page.locator(".bar-block").evaluateAll((blocks) => Math.min(...blocks.map((block) => Number(block.getAttribute("y")))));
  expect(highestBlock).toBeGreaterThan(14);
  const densityIsOverlay = await page.locator("#salary-chart").evaluate((svg) => {
    const children = [...svg.children];
    const lastBar = Math.max(...[...svg.querySelectorAll(".bar-block")].map((bar) => children.indexOf(bar)));
    return children.indexOf(svg.querySelector(".density-line")) > lastBar;
  });
  expect(densityIsOverlay).toBe(true);

  await page.locator('input[name="distribution"][value="gamma"]').check();
  await expect(page.locator("#density-legend-label")).toHaveText("Gamma density");
  await expect(page.locator("#quantile-basis")).toHaveText("Derived from the fitted gamma distribution");
  await page.locator('input[name="distribution"][value="empirical"]').check();
  await expect(page.locator(".density-line")).toHaveCount(0);
  await expect(page.locator("#quantile-basis")).toHaveText("Derived from weighted empirical ranks");
  await page.locator('input[name="distribution"][value="lognormal"]').check();

  await page.getByLabel("Include American Immigration Council").uncheck();
  await expect(page.locator("#stat-n")).toHaveText("109");
  await expect(page.locator(".bar-block")).toHaveCount(109);
  await page.locator("#reset-settings").click();

  await expect(page.locator("tbody tr")).toHaveCount(112);
  await page.locator("#show-unavailable").check();
  await expect(page.locator("tbody tr")).toHaveCount(144);
  await expect(page.locator("tbody .row-toggle:disabled")).toHaveCount(32);
  await page.locator("#show-unavailable").uncheck();

  await page.locator('[data-filter-menu="tier"] summary').click();
  await page.locator('[data-filter-menu="tier"] .filter-options label').filter({ hasText: /^C$/ }).locator("input").uncheck();
  await expect(page.locator('[data-filter-menu="tier"] summary')).toHaveText("2 selected");
  await expect(page.locator("#stat-n")).not.toHaveText("110");
  const filteredN = Number(await page.locator("#stat-n").textContent());
  await expect(page.locator(".bar-block")).toHaveCount(filteredN);

  await page.locator("#reset-settings").click();
  await page.locator('[data-filter-menu="title"] summary').click();
  const titleOptions = page.locator('[data-filter-menu="title"] .filter-options input');
  await expect(titleOptions).toHaveCount(await titleOptions.count());
  expect(await titleOptions.evaluateAll((options) => options.every((option) => option.checked))).toBe(true);
  await titleOptions.last().uncheck();
  await page.locator('[data-filter-menu="title"] .filter-actions button').click();
  await page.locator('[data-filter-menu="title"] summary').click();
  expect(await page.locator('[data-filter-menu="title"] .filter-options input').evaluateAll((options) => options.every((option) => option.checked))).toBe(true);

  await page.locator("#salary-range-min").fill("300000");
  await expect(page.locator("#salary-range-value")).not.toHaveText("All");
  await expect(page.locator("#stat-n")).not.toHaveText("110");
  await page.locator("#reset-settings").click();
  await page.locator("#expense-range-min").fill("500");
  await expect(page.locator("#expense-range-value")).not.toHaveText("All");
  await expect(page.locator("#stat-n")).not.toHaveText("110");

  await page.locator("#reset-settings").click();
  await page.locator("#quantile-granularity").selectOption("percentiles");
  await expect(page.locator(".quantile-cell")).toHaveCount(99);
  await page.locator("#quantile-granularity").selectOption("custom");
  await page.locator("#custom-quantiles").fill("5, 50, 95");
  await expect(page.locator(".quantile-cell")).toHaveCount(3);

  await page.locator("#reset-settings").click();
  await page.locator("#weighting-select").selectOption("size");
  await expect(page.locator("#size-controls")).toBeVisible();

  await page.locator("#table-search").fill("Center for AI Safety");
  await expect(page.locator("#stat-n")).toHaveText("1");
  const cais = page.locator("tbody tr").filter({ hasText: "Center for AI Safety" });
  await expect(cais).toHaveCount(1);
  await cais.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#source-dialog")).toBeVisible();
  await expect(page.locator("#dialog-evidence")).toContainText("$314,534");
  await page.locator(".dialog-close").click();

  await page.locator("#table-search").fill("");
  const immigrationCouncil = page.locator("tbody tr").filter({ hasText: "American Immigration Council" });
  await expect(immigrationCouncil.locator(".organization-name")).toHaveAttribute("href", /americanimmigrationcouncil\.org/i);
  await immigrationCouncil.locator(".organization-name").hover();
  await expect(page.locator("#organization-preview")).toBeVisible();
  await expect(page.locator("#organization-preview-wikipedia")).toContainText("nonprofit immigration advocacy");

  await page.locator("#stream-select").selectOption("jobAds");
  await expect(page.locator("#stat-n")).toHaveText("15");
  await expect(page.locator("tbody tr").filter({ hasText: "Chief Executive Officer" })).toHaveCount(0);
  await expect(page.locator("tbody tr").filter({ hasText: "CEO" }).first()).toBeVisible();
  await page.locator("#table-search").fill("Healthcare Career Advancement Program");
  const hcap = page.locator("tbody tr").filter({ hasText: "Healthcare Career Advancement Program" });
  await expect(hcap).toHaveCount(1);
  await hcap.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#dialog-evidence")).toContainText("$150,000–$170,000");
  await page.locator(".dialog-close").click();

  expect(errors).toEqual([]);
});

test("desktop and narrow layouts render", async ({ page }) => {
  await page.goto("/");
  await page.locator(".info-tooltip").last().hover();
  const desktopTooltip = await page.locator("#help-tooltip").boundingBox();
  expect(desktopTooltip.x + desktopTooltip.width).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: "tmp/app-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator(".info-tooltip").first().hover();
  const tooltipBox = await page.locator("#help-tooltip").boundingBox();
  expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBox.y).toBeGreaterThanOrEqual(0);
  expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(390);
  expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(844);
  await expect(page.locator("#salary-chart")).toBeVisible();
  await expect(page.locator("#organization-table")).toBeVisible();
  await page.screenshot({ path: "tmp/app-mobile.png", fullPage: true });
});
