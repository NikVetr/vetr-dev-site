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
    return Number(element.getAttribute("width")) / Number(element.getAttribute("height"));
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
  await page.locator(".bar-block").first().hover();
  await expect(page.locator(".rug-line.is-highlighted")).toHaveCount(1);
  await page.locator("#chart-title").hover();
  await expect(page.locator(".rug-line.is-highlighted")).toHaveCount(0);
  const histogramTickLines = await page.locator("#salary-chart").evaluate((svg) => {
    const rug = svg.querySelector(".rug-line");
    const baseline = Number(rug.getAttribute("y1")) - 2;
    return [...svg.querySelectorAll("line:not(.rug-line)")].filter((line) =>
      Number(line.getAttribute("y1")) === baseline && Number(line.getAttribute("y2")) === baseline + 4).length;
  });
  expect(histogramTickLines).toBe(0);
  await expect(page.locator("aside.settings-panel").locator('input[name="chart-view"]')).toHaveCount(2);
  await page.locator("#chart-color").selectOption("eaAffinity");
  await expect(page.locator("#color-description")).toContainText("effective-altruist");
  expect(new Set(await page.locator(".bar-block").evaluateAll((blocks) => blocks.map((block) => block.getAttribute("fill")))).size).toBeGreaterThan(1);

  await page.locator('input[name="distribution"][value="gamma"]').check();
  await expect(page.locator("#chart-legend")).toContainText("Gamma density");
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
  await expect(page.locator("#sample-description")).toContainText("source validation");
  await page.locator("#sample-select").selectOption("clean");
  await expect(page.locator("#sample-description")).toContainText("structural");
  await page.locator("#reset-settings").click();
  await page.locator('[data-filter-menu="title"] summary').click();
  const titleOptions = page.locator('[data-filter-menu="title"] .filter-options input');
  expect(await titleOptions.evaluateAll((options) => options.every((option) => option.checked))).toBe(true);
  const ceoGroup = page.locator('[data-filter-menu="title"] .filter-group').filter({ has: page.locator(".filter-group-heading", { hasText: /^CEO/ }) });
  await expect(ceoGroup).toHaveCount(1);
  await ceoGroup.locator(".filter-group-heading").click();
  expect(await ceoGroup.locator('input[type="checkbox"]').evaluateAll((options) => options.every((option) => !option.checked))).toBe(true);
  await ceoGroup.locator(".filter-group-heading").click();
  expect(await ceoGroup.locator('input[type="checkbox"]').evaluateAll((options) => options.every((option) => option.checked))).toBe(true);
  await expect(page.locator('[data-filter-menu="title"] .filter-actions button')).toHaveText("Deselect all");
  await page.locator('[data-filter-menu="title"] .filter-actions button').click();
  expect(await page.locator('[data-filter-menu="title"] .filter-options input').evaluateAll((options) => options.every((option) => !option.checked))).toBe(true);
  await expect(page.locator("#stat-n")).toHaveText("0");
  await expect(page.locator('[data-filter-menu="title"] .filter-actions button')).toHaveText("Select all");
  await page.locator('[data-filter-menu="title"] .filter-actions button').click();
  expect(await page.locator('[data-filter-menu="title"] .filter-options input').evaluateAll((options) => options.every((option) => option.checked))).toBe(true);

  await expect(page.locator("#salary-range-min")).not.toBeVisible();
  await page.locator("#salary-filter-summary").click();
  await expect(page.locator("#salary-range-min")).toBeVisible();
  await page.locator("#salary-range-min").fill("300000");
  await expect(page.locator("#salary-range-value")).not.toHaveText("All");
  await expect(page.locator("#salary-filter-summary")).not.toHaveText("All");
  await expect(page.locator("#stat-n")).not.toHaveText("110");
  await page.locator("#reset-settings").click();
  await expect(page.locator("#expense-range-min")).not.toBeVisible();
  await page.locator("#expense-filter-summary").click();
  await page.locator("#expense-range-min").fill("500");
  await expect(page.locator("#expense-range-value")).not.toHaveText("All");
  await expect(page.locator("#expense-filter-summary")).not.toHaveText("All");
  await expect(page.locator("#stat-n")).not.toHaveText("110");

  await page.locator("#reset-settings").click();
  const salaryHeader = page.locator('thead button[data-sort="salary"]');
  const titleHeader = page.locator('thead button[data-sort="title"]');
  await expect(salaryHeader.locator("xpath=..")).toHaveAttribute("aria-sort", "none");
  await salaryHeader.click();
  await expect(salaryHeader.locator("xpath=..")).toHaveAttribute("aria-sort", "ascending");
  await salaryHeader.click();
  await expect(salaryHeader.locator("xpath=..")).toHaveAttribute("aria-sort", "descending");
  await titleHeader.click();
  await expect(titleHeader.locator("xpath=..")).toHaveAttribute("aria-sort", "ascending");
  const tierHeaderWidth = await page.locator("thead .tier-column").first().evaluate((cell) => cell.getBoundingClientRect().width);
  expect(tierHeaderWidth).toBeLessThanOrEqual(80);

  await page.locator("#reset-settings").click();
  await page.locator("#quantile-granularity").selectOption("percentiles");
  await expect(page.locator(".quantile-cell")).toHaveCount(99);
  await page.locator("#quantile-granularity").selectOption("custom");
  await page.locator("#custom-quantiles").fill("5, 50, 95");
  await expect(page.locator(".quantile-cell")).toHaveCount(3);

  await page.locator("#reset-settings").click();
  await page.locator('#weighting-components input[value="size"]').check();
  await expect(page.locator("#size-controls")).toBeVisible();
  await expect(page.locator("#expense-target-field")).toBeVisible();
  await expect(page.locator("#weight-profile")).toBeVisible();
  await expect(page.locator(".weight-profile-curve")).toHaveCount(1);
  await page.locator('#weighting-components input[value="staff"]').check();
  await expect(page.locator("#staff-target-field")).toBeVisible();
  await expect(page.locator("#expense-target-field")).toBeVisible();
  await expect(page.locator(".weight-profile-curve")).toHaveCount(2);
  await expect(page.locator("#weighting-description")).toContainText("Expense similarity × Staff similarity");
  await page.locator('#weighting-components input[value="tier"]').check();
  await expect(page.locator("#discrete-weight-editors")).toBeVisible();
  const tierAWeight = page.getByLabel("Tier multiplier for A");
  await expect(tierAWeight).toHaveValue("1");
  await tierAWeight.fill("0.8");
  await tierAWeight.blur();
  await expect(tierAWeight).toHaveValue("0.8");

  const cais = page.locator("tbody tr").filter({ hasText: "Center for AI Safety" });
  await expect(cais).toHaveCount(1);
  await cais.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#source-dialog")).toBeVisible();
  await expect(page.locator("#dialog-evidence")).toContainText("$314,534");
  await page.locator(".dialog-close").click();

  const immigrationCouncil = page.locator("tbody tr").filter({ hasText: "American Immigration Council" });
  await expect(immigrationCouncil.locator(".organization-name")).toHaveAttribute("href", /americanimmigrationcouncil\.org/i);
  const orgCellBox = await immigrationCouncil.locator(".org-cell").boundingBox();
  await page.mouse.move(orgCellBox.x + orgCellBox.width - 2, orgCellBox.y + orgCellBox.height / 2);
  await expect(page.locator("#organization-preview")).toBeHidden();
  await immigrationCouncil.locator(".organization-name").hover();
  await expect(page.locator("#organization-preview")).toBeVisible();
  await expect(page.locator("#organization-preview-wikipedia")).toContainText("nonprofit immigration advocacy");

  await page.locator("#stream-select").selectOption("jobAds");
  await expect(page.locator("#stat-n")).toHaveText("15");
  await expect(page.locator("tbody tr").filter({ hasText: "Chief Executive Officer" }).first()).toBeVisible();
  const hcap = page.locator("tbody tr").filter({ hasText: "Healthcare Career Advancement Program" });
  await expect(hcap).toHaveCount(1);
  await hcap.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#dialog-evidence")).toContainText("$150,000–$170,000");
  await page.locator(".dialog-close").click();

  await page.locator("#stream-select").selectOption("combined");
  await expect(page.locator("#measure-field")).toBeHidden();
  await expect(page.locator("#method-note-text")).toContainText("realized pay");
  await expect(page.locator("#stat-n")).toHaveText("125");
  await page.locator('[data-filter-menu="sourceType"] summary').click();
  await expect(page.locator('[data-filter-menu="sourceType"] .filter-options input')).toHaveCount(2);
  await page.locator('#weighting-components input[value="streamBalanced"]').check();
  await expect(page.locator("#weighting-description")).toContainText("Balanced evidence streams");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await expect(page.locator("#scatter-controls")).toBeVisible();
  await expect(page.locator(".scatter-point")).not.toHaveCount(0);
  await expect(page.locator(".covariance-contour")).toHaveCount(3);
  await page.locator("#chart-color").selectOption("sourceType");
  await expect(page.locator("#chart-legend")).toContainText("Form 990");
  await expect(page.locator("#chart-legend")).toContainText("Job posting");
  await page.locator("#scatter-x").selectOption("staff");
  await expect(page.locator("#salary-chart")).toContainText("Staff count (log scale)");
  await page.locator("#show-contours").uncheck();
  await expect(page.locator(".covariance-contour")).toHaveCount(0);
  await expect(page.locator("#table-search")).toHaveCount(0);
  await expect(page.locator('thead button[data-sort="remoteStatus"]')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("desktop and narrow layouts render", async ({ page }) => {
  await page.goto("/");
  await page.locator(".info-tooltip:visible").last().hover();
  const desktopTooltip = await page.locator("#help-tooltip").boundingBox();
  expect(desktopTooltip.x + desktopTooltip.width).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: "tmp/app-desktop.png", fullPage: true });
  await page.locator('[data-filter-menu="title"] summary').click();
  await page.screenshot({ path: "tmp/app-title-filter.png", fullPage: true });
  await page.locator('[data-filter-menu="title"] summary').click();
  await page.locator('#weighting-components input[value="size"]').check();
  await page.locator('#weighting-components input[value="staff"]').check();
  await page.screenshot({ path: "tmp/app-weighting.png", fullPage: true });
  await page.locator("#reset-settings").click();
  await page.locator("#stream-select").selectOption("combined");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await page.locator("#chart-color").selectOption("sourceType");
  await page.screenshot({ path: "tmp/app-scatter.png", fullPage: true });
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
