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
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "assets/rethink-priorities-favicon.png");
  await expect(page.locator("#stat-n")).toHaveText("110");
  await expect(page.locator(".bar-block")).toHaveCount(110);
  const explainerCoverage = await page.evaluate(() => ({
    definitions: Object.values(window.CEO_BENCHMARK_DATA.categoryExplainers.definitions)
      .reduce((total, field) => total + Object.keys(field).length, 0),
    rows: [...window.CEO_BENCHMARK_DATA.incumbents, ...window.CEO_BENCHMARK_DATA.jobAds]
      .filter((row) => row.categoryProvenance).length,
    filingReviews: window.CEO_BENCHMARK_DATA.incumbents
      .filter((row) => row.observationCategoryProvenance).length,
    packageCounts: window.CEO_BENCHMARK_DATA.categoryExplainers.rationaleCounts,
  }));
  expect(explainerCoverage).toEqual({
    definitions: 270,
    rows: 177,
    filingReviews: 122,
    packageCounts: { reference_selection: 144, form990: 135, job_ad: 33 },
  });
  const methodologyResponse = await page.request.get("/benchmark/deliverables/category_explainers/methodology_notes.md");
  expect(methodologyResponse.ok()).toBe(true);
  expect(await methodologyResponse.text()).toContain("Classification layers");
  const ssrcClassifications = await page.evaluate(() => {
    const row = window.CEO_BENCHMARK_DATA.incumbents.find((item) => item.organization === "Social Science Research Council");
    return [row.tier, row.categoryProvenance.tier.value, row.observationCategoryProvenance.tier.value];
  });
  expect(ssrcClassifications).toEqual(["A", "A", "B"]);
  await expect(page.locator('input[name="distribution"][value="lognormal"]')).toBeChecked();
  await expect(page.locator(".density-line")).toHaveCount(1);
  await expect(page.locator(".rug-line")).toHaveCount(110);
  await expect(page.locator("#salary-chart")).toContainText("Weighted organizations per bin");
  await expect(page.locator("#quantile-basis")).toHaveText("Derived from the fitted lognormal distribution");
  await expect(page.locator("#mark-curve")).toBeChecked();
  await expect(page.locator(".curve-quantile-tick")).toHaveCount(4);
  await expect(page.locator(".curve-quantile-label")).toHaveCount(4);
  await expect(page.locator(".curve-quantile-label .amount").first()).toHaveText(/^\$\d+K$/);
  await expect(page.locator("#show-rug")).toHaveCount(0);
  await expect(page.locator(".reference-band")).toHaveCount(0);
  await expect(page.locator(".density-line")).toHaveAttribute("d", /L/);
  await expect(page.locator("#bin-count")).toHaveAttribute("min", "2");
  await expect(page.locator("#bin-count")).toHaveAttribute("max", "200");
  await expect(page.locator('thead button[data-sort="tier"]').locator("xpath=..")).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator("tbody .tier-cell").first()).toHaveAttribute("title", "A");
  await expect(page.locator("#rp-expense-table-reference")).toHaveText("RP = $7.5M");
  await expect(page.locator("#rp-staff-table-reference")).toHaveText("RP = 57 FTE");
  await expect(page.locator("#table-rp-reference-layer")).toHaveAttribute("aria-label", "Rethink Priorities comparison references");
  expect(await page.locator("#rp-expense-table-reference").evaluate((element) => Boolean(element.closest("th")))).toBe(false);
  expect(await page.locator("#rp-staff-table-reference").evaluate((element) => Boolean(element.closest("th")))).toBe(false);
  for (const [column, reference, screenshot] of [
    ["expenses", "#rp-expense-table-reference", "tmp/app-floating-rp-expenses.png"],
    ["staff", "#rp-staff-table-reference", "tmp/app-floating-rp-staff.png"],
  ]) {
    const header = page.locator(`thead button[data-sort="${column}"]`).locator("xpath=..");
    await header.evaluate((element) => element.scrollIntoView({ block: "nearest", inline: "center" }));
    await expect(page.locator(reference)).toBeVisible();
    const centerDifference = await page.locator(reference).evaluate((marker, sortColumn) => {
      const target = document.querySelector(`thead button[data-sort="${sortColumn}"]`).closest("th");
      const markerRect = marker.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      return (markerRect.left + markerRect.width / 2) - (targetRect.left + targetRect.width / 2);
    }, column);
    expect(Math.abs(centerDifference)).toBeLessThan(2);
    await page.locator(".table-panel").screenshot({ path: screenshot });
  }
  expect(await page.locator("#bin-field").evaluate((element) => element.previousElementSibling?.classList.contains("view-setting"))).toBe(true);
  await expect(page.locator(".method-note")).toHaveCount(0);
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
  await expect(page.locator("#chart-tooltip")).toBeVisible();
  await expect(page.locator("#chart-tooltip .chart-tooltip-value strong")).toContainText("$");
  await expect(page.locator("#chart-tooltip dt")).toContainText(["Histogram bin", "Peer tier", "Evidence", "Match score", "Effective weight"]);
  await expect(page.locator("#chart-tooltip .chart-tooltip-hint")).toContainText("focus its row");
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
  await expect(page.locator(".curve-quantile-tick")).toHaveCount(0);
  await expect(page.locator(".quantile-cell sup")).toHaveCount(99);
  await expect(page.locator(".quantile-cell").first().locator("sup")).toHaveText("st");
  await expect(page.locator(".quantile-cell").nth(10).locator("sup")).toHaveText("th");
  await page.locator(".quantile-panel").screenshot({ path: "tmp/app-percentiles.png" });
  await page.locator("#quantile-granularity").selectOption("custom");
  await page.locator("#custom-quantiles").fill("5, 50, 95");
  await expect(page.locator(".quantile-cell")).toHaveCount(3);
  await expect(page.locator(".curve-quantile-tick")).toHaveCount(3);

  await page.locator("#reset-settings").click();
  await page.locator('#weighting-components input[value="size"]').check();
  await expect(page.locator("#size-controls")).toBeVisible();
  await expect(page.locator("#expense-target-field")).toBeVisible();
  await expect(page.locator("#weight-profile-size")).toBeVisible();
  await expect(page.locator("#weight-profile-size .weight-profile-rp-reference")).toHaveCount(1);
  await expect(page.locator("#weight-profile-size .weight-profile-rp-label")).toHaveText("RP");
  await expect(page.locator("#weight-profile-size svg")).toHaveAttribute("aria-label", /RP reference \$7\.5M/);
  await expect(page.locator(".settings-panel #weight-profile-size")).toHaveCount(1);
  await expect(page.locator(".chart-panel .weight-profile-slot")).toHaveCount(0);
  await expect(page.locator(".weight-profile-curve")).toHaveCount(1);
  await expect(page.locator("#rp-scale-reference")).toBeVisible();
  await expect(page.locator("#rp-scale-reference")).toContainText("$20.38M consolidated expenses");
  await page.locator('#weighting-components input[value="staff"]').check();
  await expect(page.locator("#staff-target-field")).toBeVisible();
  await expect(page.locator("#target-staff")).toHaveValue("57");
  await expect(page.locator("#expense-target-field")).toBeVisible();
  await expect(page.locator(".weight-profile-curve")).toHaveCount(2);
  await expect(page.locator(".weight-profile-rp-reference")).toHaveCount(2);
  await expect(page.locator(".weight-profile-rp-label")).toHaveCount(2);
  await expect(page.locator(".weight-profile-axis-title")).toHaveCount(4);
  await expect(page.locator(".weight-profile-x-tick")).toHaveCount(8);
  await expect(page.locator(".weight-profile-y-tick")).toHaveCount(8);
  await expect(page.locator("#weight-profile-size")).toContainText("Annual expenses (USD, log scale)");
  await expect(page.locator("#weight-profile-size")).toContainText("Relative multiplier");
  const expenseCurveBefore = await page.locator("#weight-profile-size .weight-profile-curve").getAttribute("d");
  await page.locator("#expense-bandwidth").fill("1.2");
  await expect(page.locator("#weight-profile-size .weight-profile-figure")).toContainText("bandwidth 1.20");
  expect(await page.locator("#weight-profile-size .weight-profile-curve").getAttribute("d")).not.toBe(expenseCurveBefore);
  const rpExpenseX = await page.locator("#weight-profile-size .weight-profile-rp-reference").getAttribute("x1");
  await page.locator("#target-expense").fill("10");
  await page.locator("#target-expense").press("Tab");
  await expect(page.locator("#weight-profile-size .weight-profile-figure")).toContainText("Target $10M");
  await expect(page.locator("#weight-profile-size .weight-profile-target")).toHaveCount(1);
  await expect(page.locator("#weight-profile-size .weight-profile-rp-reference")).toHaveAttribute("x1", rpExpenseX);
  const componentOrder = await page.locator("#size-controls").evaluate((element) => [...element.children].map((child) => child.id));
  expect(componentOrder.slice(0, 2)).toEqual(["expense-target-field", "staff-target-field"]);
  expect(await page.locator("#expense-target-field").evaluate((element) => element.querySelector("#expense-bandwidth").compareDocumentPosition(element.querySelector("#weight-profile-size")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  expect(await page.locator("#staff-target-field").evaluate((element) => element.querySelector("#staff-bandwidth").compareDocumentPosition(element.querySelector("#weight-profile-staff")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await expect(page.locator("#weighting-description")).toContainText("Expense similarity × Staff similarity");
  await page.locator('#weighting-components input[value="tier"]').check();
  await expect(page.locator("#discrete-weight-editors")).toBeVisible();
  await expect(page.locator("#discrete-weight-editors .discrete-weight-note")).toContainText("peer hierarchy");
  const tierWeightEditor = page.locator("#discrete-weight-editors details").filter({ hasText: "Tier category multipliers" });
  await expect(tierWeightEditor.locator(".info-tooltip")).toHaveCount(3);
  const tierAHelp = page.getByRole("button", { name: "About Tier category A" });
  await tierAHelp.scrollIntoViewIfNeeded();
  await tierAHelp.hover();
  await expect(page.locator("#help-tooltip")).toBeVisible();
  await expect(page.locator("#help-tooltip")).toContainText("Highest-comparability selected peer");
  await expect(page.locator("#help-tooltip")).toContainText("editable analyst judgment, not a source rule");
  await page.screenshot({ path: "tmp/app-weight-category-explainer.png" });
  const tierAWeight = page.getByLabel("Tier multiplier for A");
  await expect(tierAWeight).toHaveValue("1");
  await expect(page.getByLabel("Tier multiplier for B")).toHaveValue("0.7");
  await expect(page.getByLabel("Tier multiplier for C")).toHaveValue("0.35");
  await tierAWeight.fill("0.8");
  await tierAWeight.blur();
  await expect(tierAWeight).toHaveValue("0.8");
  await page.locator('#weighting-components input[value="tier"]').uncheck();
  await page.locator('#weighting-components input[value="tier"]').check();
  await expect(page.getByLabel("Tier multiplier for A")).toHaveValue("0.8");

  await page.locator('#weighting-components input[value="eaAffinity"]').check();
  const eaWeightEditor = page.locator("#discrete-weight-editors details").filter({ hasText: "EA relation category multipliers" });
  await eaWeightEditor.locator("summary").click();
  expect(await eaWeightEditor.locator(".discrete-weight-grid").evaluate((grid) =>
    grid.querySelectorAll(".info-tooltip").length === grid.querySelectorAll('input[type="number"]').length)).toBe(true);
  await page.getByRole("button", { name: "About EA relation category EA-adjacent" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("recommended/evaluated in EA-related cause");
  await expect(page.getByLabel("EA relation multiplier for EA-core")).toHaveValue("1");
  await expect(page.getByLabel("EA relation multiplier for EA-adjacent")).toHaveValue("0.85");
  await expect(page.getByLabel("EA relation multiplier for functional-only")).toHaveValue("0.65");
  await page.locator('#weighting-components input[value="titleGroup"]').check();
  await expect(page.getByLabel("Job-title group multiplier for CEO")).toHaveValue("1");
  await expect(page.getByLabel("Job-title group multiplier for Executive Director")).toHaveValue("0.85");
  await expect(page.getByLabel("Job-title group multiplier for President")).toHaveValue("0.75");
  await expect(page.getByLabel("Job-title group multiplier for Not reported")).toHaveValue("0.35");
  await page.locator('#weighting-components input[value="topic"]').check();
  await expect(page.getByLabel("Topic / model multiplier for AI, catastrophic risk, biosecurity, and technology policy")).toHaveValue("1");
  await expect(page.getByLabel("Topic / model multiplier for Research, evaluation, philanthropy infrastructure, and policy")).toHaveValue("0.9");
  await page.locator('#weighting-components input[value="structure"]').check();
  const structureWeightEditor = page.locator("#discrete-weight-editors details").filter({ hasText: "Structure category multipliers" });
  await structureWeightEditor.locator("summary").click();
  expect(await structureWeightEditor.locator(".discrete-weight-grid").evaluate((grid) =>
    grid.querySelectorAll(".info-tooltip").length === grid.querySelectorAll('input[type="number"]').length)).toBe(true);
  await page.getByRole("button", { name: "About Structure category independent nonprofit" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("standalone nonprofit legal organization");
  await expect(page.getByLabel("Structure multiplier for independent nonprofit")).toHaveValue("1");
  await expect(page.getByLabel("Structure multiplier for membership nonprofit")).toHaveValue("0.75");

  const cais = page.locator("tbody tr").filter({ hasText: "Center for AI Safety" });
  await expect(cais).toHaveCount(1);
  await cais.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#source-dialog")).toBeVisible();
  await expect(page.locator("#dialog-evidence")).toContainText("$314,534");
  await page.locator("#dialog-category-provenance summary").click();
  await expect(page.locator("#dialog-provenance-records section")).toHaveCount(6);
  await expect(page.locator("#dialog-provenance-records")).toContainText("comparability score 94.0");
  await expect(page.locator("#dialog-provenance-intro")).toContainText("precomp normalized metadata");
  await expect(page.getByRole("link", { name: "Methodology notes ↗" })).toHaveAttribute("href", "benchmark/deliverables/category_explainers/methodology_notes.md");
  await page.locator("#source-dialog").screenshot({ path: "tmp/app-category-provenance.png" });
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
  await expect(page.locator("#chart-legend")).toContainText("Tier A · Primary");
  await expect(page.locator("#chart-legend")).toContainText("Tier B · Secondary");
  await expect(page.locator("#chart-legend")).toContainText("Tier C · Expanded");
  await expect(page.locator("#chart-legend")).not.toContainText("strict_primary");
  await expect(page.locator("#chart-legend .swatch")).toHaveCount(3);
  await expect(page.locator("tbody .tier-cell").first()).toHaveAttribute("title", "strict_primary");
  await expect(page.getByLabel("Tier multiplier for strict_primary")).toHaveValue("1");
  await expect(page.getByLabel("Tier multiplier for expanded_primary_title")).toHaveValue("0.85");
  await expect(page.getByLabel("Tier multiplier for excluded", { exact: true })).toHaveValue("0.1");
  await expect(page.locator("tbody tr").filter({ hasText: "Chief Executive Officer" }).first()).toBeVisible();
  await page.locator(".bar-block").first().hover();
  await expect(page.locator("#chart-tooltip")).toContainText("Posting midpoint, July 2026 USD");
  await expect(page.locator("#chart-tooltip")).toContainText("Advertised range");
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-recruitment-tooltip.png" });
  const hcap = page.locator("tbody tr").filter({ hasText: "Healthcare Career Advancement Program" });
  await expect(hcap).toHaveCount(1);
  await hcap.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#dialog-evidence")).toContainText("$150,000–$170,000");
  await page.locator("#dialog-category-provenance summary").click();
  await expect(page.locator("#dialog-provenance-confidence")).toHaveText("medium confidence");
  await expect(page.locator("#dialog-provenance-records")).toContainText("expanded_secondary_structural");
  await page.locator(".dialog-close").click();

  await page.locator("#stream-select").selectOption("combined");
  await expect(page.locator("#measure-field")).toBeHidden();
  await expect(page.locator(".method-note")).toHaveCount(0);
  await expect(page.locator("#stat-n")).toHaveText("125");
  await page.locator('[data-filter-menu="sourceType"] summary').click();
  await expect(page.locator('[data-filter-menu="sourceType"] .filter-options input')).toHaveCount(2);
  await page.locator('#weighting-components input[value="sourceType"]').check();
  await expect(page.getByLabel("Evidence stream multiplier for Form 990")).toHaveValue("1");
  await expect(page.getByLabel("Evidence stream multiplier for Job posting")).toHaveValue("0.8");
  await page.locator('#weighting-components input[value="streamBalanced"]').check();
  await expect(page.locator("#weighting-description")).toContainText("Balanced evidence streams");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await expect(page.locator("#scatter-controls")).toBeVisible();
  await expect(page.locator(".scatter-point")).not.toHaveCount(0);
  await expect(page.locator(".correlation-annotation")).toContainText(/Weighted r = -?\d\.\d{3} · ρ = -?\d\.\d{3}/);
  const maximumPointAreaMultiple = await page.locator(".scatter-point").evaluateAll((points) => Math.max(...points.map((point) => (Number(point.getAttribute("r")) / 4.5) ** 2)));
  expect(maximumPointAreaMultiple).toBeLessThanOrEqual(10.001);
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
  const scrollingPanel = page.locator(".settings-panel");
  const overflowPanel = await scrollingPanel.evaluate((element) => ({
    width: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
    gutter: getComputedStyle(element).scrollbarGutter,
  }));
  expect(overflowPanel.scrollHeight).toBeGreaterThan(overflowPanel.clientHeight);
  expect(overflowPanel.gutter).toContain("stable");
  const hiddenScrollbarWidth = await scrollingPanel.evaluate((element) => {
    element.style.overflowY = "hidden";
    const width = element.clientWidth;
    element.style.overflowY = "";
    return width;
  });
  expect(hiddenScrollbarWidth).toBe(overflowPanel.width);
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
  await page.locator("#size-controls").screenshot({ path: "tmp/app-weighting-curves.png" });
  await page.locator('#weighting-components input[value="tier"]').check();
  await page.locator("#discrete-weight-editors").screenshot({ path: "tmp/app-discrete-weights.png" });
  await page.locator('#weighting-components input[value="eaAffinity"]').check();
  await page.locator('#weighting-components input[value="structure"]').check();
  await expect(page.locator(".weighting-field")).toHaveCSS("position", "sticky");
  await scrollingPanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const settingsBounds = await scrollingPanel.boundingBox();
  const stickyWeightBounds = await page.locator(".weighting-field").boundingBox();
  expect(stickyWeightBounds.y).toBeGreaterThanOrEqual(settingsBounds.y);
  expect(stickyWeightBounds.y).toBeLessThanOrEqual(settingsBounds.y + 3);
  await expect(page.locator(".weighting-field")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(stickyWeightBounds.y + stickyWeightBounds.height).toBeLessThan(settingsBounds.y + settingsBounds.height);
  await scrollingPanel.screenshot({ path: "tmp/app-sticky-weight-components.png" });
  await page.locator("#reset-settings").click();
  await page.locator("#stream-select").selectOption("combined");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await page.locator("#chart-color").selectOption("sourceType");
  await page.screenshot({ path: "tmp/app-scatter.png", fullPage: true });
  await page.locator("#reset-settings").click();
  await page.setViewportSize({ width: 1024, height: 486 });
  const compactChartBounds = await page.locator(".chart-panel").boundingBox();
  expect(compactChartBounds.y + compactChartBounds.height).toBeLessThanOrEqual(486);
  const overflowingDistributionChoice = await page.locator('.choice-group').first().evaluate((group) =>
    [...group.querySelectorAll("label")].some((label) => label.scrollWidth > label.clientWidth));
  expect(overflowingDistributionChoice).toBe(false);
  await page.setViewportSize({ width: 1440, height: 900 });
  const restoredChartBounds = await page.locator(".chart-panel").boundingBox();
  expect(restoredChartBounds.height).toBeLessThan(700);
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
  await page.locator(".bar-block").first().hover();
  const chartTooltipBox = await page.locator("#chart-tooltip").boundingBox();
  expect(chartTooltipBox.x).toBeGreaterThanOrEqual(0);
  expect(chartTooltipBox.y).toBeGreaterThanOrEqual(0);
  expect(chartTooltipBox.x + chartTooltipBox.width).toBeLessThanOrEqual(390);
  expect(chartTooltipBox.y + chartTooltipBox.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "tmp/app-mobile.png", fullPage: true });
});

test("weights and compact shared URLs round-trip", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const automaticWeightsBefore = await page.locator("tbody .weight-input:not(.is-user-modified)").evaluateAll((inputs) => inputs.map((input) => input.value));
  await page.locator('#weighting-components input[value="size"]').check();
  const automaticWeightsAfter = await page.locator("tbody tr:not(.is-excluded) .weight-input:not(.is-user-modified)").evaluateAll((inputs) => inputs.map((input) => Number(input.value)));
  expect(automaticWeightsAfter.some((value, index) => value !== Number(automaticWeightsBefore[index]))).toBe(true);
  expect(automaticWeightsAfter.reduce((sum, value) => sum + value, 0) / automaticWeightsAfter.length).toBeCloseTo(1, 1);

  const firstRow = page.locator("tbody tr").first();
  const rowId = await firstRow.getAttribute("data-id");
  const rowWeight = firstRow.locator(".weight-input");
  await rowWeight.fill("2");
  await rowWeight.blur();
  await expect(rowWeight).toHaveClass(/is-user-modified/);
  await firstRow.locator(".row-toggle").uncheck();
  await page.locator('input[name="distribution"][value="gamma"]').check();
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await page.locator("#quantile-granularity").selectOption("custom");
  await page.locator("#custom-quantiles").fill("10, 50, 90");
  await page.locator("#mark-curve").uncheck();
  await expect.poll(() => page.url()).toContain("?s=");
  await page.waitForTimeout(100);
  const sharedUrl = page.url();
  expect(sharedUrl.length).toBeLessThan(2000);

  await page.reload();
  await expect(page.locator('input[name="distribution"][value="gamma"]')).toBeChecked();
  await expect(page.locator('input[name="chart-view"][value="scatter"]')).toBeChecked();
  await expect(page.locator('#weighting-components input[value="size"]')).toBeChecked();
  await expect(page.locator("#quantile-granularity")).toHaveValue("custom");
  await expect(page.locator("#custom-quantiles")).toHaveValue("10, 50, 90");
  await expect(page.locator("#mark-curve")).not.toBeChecked();
  const restoredRow = page.locator(`tbody tr[data-id="${rowId}"]`);
  await expect(restoredRow.locator(".row-toggle")).not.toBeChecked();
  await expect(restoredRow.locator(".weight-input")).toHaveValue("2");
  await expect(restoredRow.locator(".weight-input")).toHaveClass(/is-user-modified/);
  await page.locator("#reset-settings").click();
  expect(new URL(page.url()).searchParams.has("s")).toBe(false);

  await page.goto("/?s=not-valid-state");
  await expect(page.locator("#url-state-error")).toBeVisible();
  await expect(page.locator("#url-state-error")).toContainText("default settings");
  await expect(page.locator("#stat-n")).toHaveText("110");
  expect(errors).toEqual([]);
});
