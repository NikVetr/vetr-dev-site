const { test, expect } = require("@playwright/test");

test("benchmark interactions and validated sources", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  const wikipediaRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://en.wikipedia.org/**", (route) => {
    wikipediaRequests.push(route.request().url());
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ query: { pages: { 1: {
        title: "Center for AI Safety", extract: "A nonprofit organization focused on artificial intelligence safety.",
        fullurl: "https://en.wikipedia.org/wiki/Center_for_AI_Safety",
      } } } }),
    });
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "CEO salary benchmark" })).toBeVisible();
  await expect(page.locator(".app-header .eyebrow")).toHaveText("Rethink Priorities");
  await expect(page.locator(".app-header .subtitle")).toHaveCount(0);
  await expect(page.locator("#archive-status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "About source and observation counts" })).toHaveCount(0);
  await expect(page.locator(".app-header .header-meta > span")).toHaveCount(1);
  for (const removedLabel of ["Analysis", "Incumbent compensation", "Row-level evidence", "Current weighted distribution"]) {
    await expect(page.getByText(removedLabel, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator(".table-footnote")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Organizations" })).toHaveCount(0);
  await expect(page.locator("#included-count")).toHaveCount(0);
  await expect(page.locator(".table-panel")).toHaveAttribute("aria-label", "Organization-level evidence table");
  const tableHeaders = await page.locator("#organization-table thead th").evaluateAll((headers) => headers.map((header) => {
    const explicitLabel = header.querySelector(":scope > button[data-sort], :scope > .sr-only");
    if (explicitLabel) return explicitLabel.textContent.trim();
    return [...header.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent.trim()).join(" ").trim();
  }));
  expect(tableHeaders).toEqual(["Included", "Organization", "Job title", "Salary", "Expenses", "Staff", "Weight", "Match score", "Tier", "Topic / model", "Location", "EA relation", "Structure", "Year", "Evidence", "Source"]);
  expect(await page.locator("#organization-table .title-column").evaluate((header) => header.getBoundingClientRect().width)).toBeLessThan(140);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "assets/rethink-priorities-favicon.png");
  await expect(page.locator("#stream-select")).toHaveValue("combined");
  await expect(page.locator("#measure-field")).toBeHidden();
  await expect(page.locator('input[name="dollar-basis"][value="adjusted"]')).toBeChecked();
  await expect(page.locator("#price-basis-status")).toHaveText("July 2026 USD");
  await page.getByRole("button", { name: "About inflation adjustment" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("Bureau of Labor Statistics CPI-U");
  await expect(page.locator("#help-tooltip")).toContainText("CUUR0000SA0");
  await expect(page.locator("#help-tooltip")).toContainText("333.918");
  await expect(page.locator("#stat-n")).toHaveText("125");
  await expect(page.locator(".bar-block")).toHaveCount(125);
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
  const wikipediaCoverage = await page.evaluate(() => {
    const rows = [...window.CEO_BENCHMARK_DATA.incumbents, ...window.CEO_BENCHMARK_DATA.jobAds];
    const profiles = new Map(rows.map((row) => [row.organization, {
      title: row.wikipediaTitle,
      url: row.wikipediaUrl,
    }]));
    return {
      organizations: profiles.size,
      mapped: [...profiles.values()].filter((profile) => profile.title && profile.url).length,
      knownUnsafeMappings: ["NumFOCUS", "Sightline Institute", "ideas42", "American Immigration Council"]
        .map((organization) => profiles.get(organization)?.title || ""),
    };
  });
  expect(wikipediaCoverage).toEqual({
    organizations: 174,
    mapped: 98,
    knownUnsafeMappings: ["", "", "", ""],
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
  await expect(page.locator(".density-line-outline")).toHaveCount(1);
  await expect(page.locator(".density-line")).toHaveCount(1);
  await expect(page.locator(".density-line-outline")).toHaveAttribute("d", await page.locator(".density-line").getAttribute("d"));
  await expect(page.locator(".density-line-outline")).toHaveCSS("stroke", "rgba(255, 255, 255, 0.96)");
  await expect(page.locator(".rug-line")).toHaveCount(125);
  await expect(page.locator("#salary-chart")).toContainText("Weighted observations per bin");
  await expect(page.locator("#quantile-basis")).toHaveText("Derived from the fitted lognormal distribution");
  await expect(page.locator("#mark-curve")).toBeChecked();
  await expect(page.locator("label:has(#mark-curve)")).toContainText("Mark graph");
  await expect(page.locator(".curve-quantile-tick")).toHaveCount(4);
  await expect(page.locator(".curve-quantile-tick-outline")).toHaveCount(4);
  await expect(page.locator(".curve-quantile-tick-outline").first()).toHaveCSS("stroke", "rgba(255, 255, 255, 0.96)");
  expect(await page.locator(".curve-quantile-tick").evaluateAll((ticks) => ticks.every((tick) => (tick.getAttribute("d").match(/M/g) || []).length === 1))).toBe(true);
  expect(await page.locator(".curve-quantile-tick-outline").evaluateAll((ticks) => ticks.every((tick) => (tick.getAttribute("d").match(/M/g) || []).length === 2))).toBe(true);
  await expect(page.locator(".curve-quantile-mark")).toHaveCount(4);
  await expect(page.locator(".curve-quantile-label.amount").first()).toHaveText(/^\$\d+K$/);
  await expect(page.locator(".curve-quantile-mark").first().locator("text").first()).toHaveCSS("font-size", "10px");
  const curveLabelLinesOverlap = await page.locator(".curve-quantile-mark").evaluateAll((marks) => marks.some((mark) => {
    const [percentile, amount] = mark.querySelectorAll("text");
    const percentileBox = percentile.getBBox();
    const amountBox = amount.getBBox();
    return percentileBox.y + percentileBox.height > amountBox.y;
  }));
  expect(curveLabelLinesOverlap).toBe(false);
  await expect(page.locator("#show-rug")).toHaveCount(0);
  await expect(page.locator(".reference-band")).toHaveCount(0);
  await expect(page.locator(".density-line")).toHaveAttribute("d", /L/);
  await expect(page.locator("#bin-count")).toHaveAttribute("min", "2");
  await expect(page.locator("#bin-count")).toHaveAttribute("max", "200");
  await expect(page.locator('thead button[data-sort="tier"]').locator("xpath=..")).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator("tbody .tier-cell").first()).toHaveAttribute("title", "A");
  await expect(page.locator("tbody .tier-cell").nth(1)).toHaveAttribute("title", "A");
  const rpReferenceRow = page.locator("tbody .rp-reference-row");
  await expect(rpReferenceRow).toHaveCount(1);
  await expect(rpReferenceRow).toContainText("Rethink Priorities");
  await expect(rpReferenceRow).toContainText("CEO");
  await expect(rpReferenceRow).toContainText("Form 990");
  await expect(rpReferenceRow).toContainText("$155K");
  await expect(rpReferenceRow).toContainText("$20M");
  await expect(rpReferenceRow).toContainText("2024");
  await expect(rpReferenceRow.locator("td").nth(5)).toHaveText("43");
  await expect(rpReferenceRow.locator("td").nth(5)).toHaveAttribute("title", /2023 Form 990 reports 43 individuals employed/);
  await expect(rpReferenceRow.locator("td")).toHaveCount(16);
  await expect(rpReferenceRow.locator(".source-cell").getByRole("button", { name: "Preview" })).toHaveCount(1);
  await expect(rpReferenceRow.locator(".source-cell").getByRole("link", { name: /ProPublica/ })).toHaveCount(1);
  await expect(rpReferenceRow.locator("input")).toHaveCount(0);
  await expect(rpReferenceRow.locator("td").first()).toHaveCSS("color", "rgb(255, 255, 255)");
  await rpReferenceRow.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#dialog-value")).toHaveText("$155,230");
  await expect(page.locator("#dialog-evidence")).toContainText("Schedule J base: $145,826");
  await expect(page.locator("#dialog-evidence")).toContainText("$20,378,936 total functional expenses");
  await expect(page.locator("#dialog-evidence")).toContainText("43 individuals employed");
  await expect(page.locator("#dialog-meta")).toContainText("0 on Part I, line 5");
  await expect(page.locator("#dialog-cached")).toHaveAttribute("href", "evidence/original/src-990-rp-reference.xml");
  await expect(page.locator("#dialog-external")).toHaveAttribute("href", "https://projects.propublica.org/nonprofits/organizations/843896318");
  await expect(page.locator("#dialog-secondary-cached")).toHaveAttribute("href", "evidence/original/src-990-rp-staff-2023.pdf");
  await expect(page.locator("#dialog-secondary-external")).toHaveAttribute("href", "https://rethinkpriorities.org/wp-content/uploads/2024/11/RP-2023-990-No-Schedule-B.pdf");
  await expect(page.locator("#dialog-category-provenance")).toBeHidden();
  await page.locator("#source-dialog").screenshot({ path: "tmp/app-rp-source-preview.png" });
  await page.locator(".dialog-close").click();
  const excludedPostingToggle = page.locator('tr[data-id="SRC-AD-MOST-2025"] .row-toggle');
  await expect(excludedPostingToggle).not.toBeChecked();
  await expect(excludedPostingToggle).toHaveAttribute("title", /excluded by default: Local and far below scale.*Check to include it manually/);
  const excludedPostingRow = page.locator('tr[data-id="SRC-AD-MOST-2025"]');
  await expect(excludedPostingRow.locator("td").nth(11)).toHaveAttribute("title", /no EA field.*no EA relationship is inferred/i);
  await expect(excludedPostingRow.locator("td").nth(12)).toHaveAttribute("title", /no new normalized structure is inferred/i);
  for (const [column, cellIndex] of [["expenses", 4], ["staff", 5]]) {
    const centerDifference = await rpReferenceRow.locator("td").nth(cellIndex).evaluate((cell, sortColumn) => {
      const header = document.querySelector(`thead button[data-sort="${sortColumn}"]`).closest("th");
      const cellRect = cell.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      return (cellRect.left + cellRect.width / 2) - (headerRect.left + headerRect.width / 2);
    }, column);
    expect(Math.abs(centerDifference)).toBeLessThan(1);
  }
  await page.locator(".table-scroll").evaluate((element) => { element.scrollTop = 400; });
  const stickyReferenceGap = await rpReferenceRow.locator("td").first().evaluate((cell) => {
    const header = document.querySelector("#organization-table thead").getBoundingClientRect();
    return cell.getBoundingClientRect().top - header.bottom;
  });
  expect(Math.abs(stickyReferenceGap)).toBeLessThan(2);
  await page.locator('thead button[data-sort="expenses"]').evaluate((element) => element.scrollIntoView({ block: "nearest", inline: "center" }));
  await page.locator(".table-panel").screenshot({ path: "tmp/app-sticky-rp-reference.png" });
  await page.locator(".table-scroll").evaluate((element) => { element.scrollTop = 0; element.scrollLeft = 0; });
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
  await expect(page.locator(".density-line-outline")).toHaveCount(0);
  await expect(page.locator(".density-line")).toHaveCount(0);
  const empiricalMarkCount = await page.locator(".empirical-quantile-mark").count();
  expect(empiricalMarkCount).toBeGreaterThan(0);
  expect(empiricalMarkCount).toBeLessThanOrEqual(4);
  await expect(page.locator(".empirical-quantile-guide")).toHaveCount(empiricalMarkCount);
  await expect(page.locator(".empirical-quantile-label.amount").first()).toHaveText(/^\$\d+K$/);
  await expect(page.locator(".empirical-quantile-guide").first()).toHaveCSS("stroke-dasharray", "5px, 4px");
  expect(await page.locator(".empirical-quantile-guide").evaluateAll((guides) => guides.every((guide) =>
    Number(guide.getAttribute("y1")) < Number(guide.getAttribute("y2"))))).toBe(true);
  expect(await page.locator("#salary-chart").evaluate((svg) => {
    const guide = svg.querySelector(".empirical-quantile-guide");
    const block = svg.querySelector(".bar-block");
    return Boolean(guide.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  expect(await page.locator(".empirical-quantile-mark").evaluateAll((marks) => {
    const rectangles = marks.map((mark) => mark.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    return rectangles.every((rectangle, index) => index === 0 || rectangle.left >= rectangles[index - 1].right + 2);
  })).toBe(true);
  await expect(page.locator("#quantile-basis")).toHaveText("Derived from weighted empirical ranks");
  await page.locator('input[name="distribution"][value="lognormal"]').check();

  await page.getByLabel("Include American Immigration Council").uncheck();
  await expect(page.locator("#stat-n")).toHaveText("124");
  await expect(page.locator(".bar-block")).toHaveCount(124);
  await page.locator("#reset-settings").click();

  const cpiContract = await page.evaluate(() => {
    const posting = window.CEO_BENCHMARK_DATA.jobAds.find((row) => row.organization === "Technical Assistance Collaborative");
    return {
      series: window.CEO_BENCHMARK_DATA.cpi.seriesId,
      target: window.CEO_BENCHMARK_DATA.cpi.targetIndex,
      midpoint: posting.nominalSalary.base,
      range: [posting.nominalRange.low, posting.nominalRange.high],
    };
  });
  expect(cpiContract).toEqual({ series: "CUUR0000SA0", target: 333.918, midpoint: 270000, range: [240000, 300000] });
  await page.locator("#stream-select").selectOption("incumbents");
  const caisInflationRow = page.locator('tbody tr[data-id="SRC-990-EXT-CENTER-FOR-AI-SAFETY"]');
  await expect(caisInflationRow.locator(".money-cell").first()).toHaveText("$335K");
  await caisInflationRow.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#dialog-value")).toHaveText("$334,818");
  await expect(page.locator("#dialog-evidence")).toContainText("Schedule J base: $314,534");
  await expect(page.locator("#dialog-secondary-cached")).toBeHidden();
  await expect(page.locator("#dialog-secondary-external")).toBeHidden();
  await page.locator(".dialog-close").click();
  await page.locator('input[name="dollar-basis"][value="nominal"]').check();
  await expect(page.locator("#price-basis-status")).toHaveText("Source-year USD");
  await expect(page.locator("#salary-chart")).toContainText("Annual compensation (Source-year USD)");
  await expect(rpReferenceRow).toContainText("$146K");
  await expect(caisInflationRow.locator(".money-cell").first()).toHaveText("$315K");
  await caisInflationRow.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#dialog-value")).toHaveText("$314,534");
  await expect(page.locator("#dialog-meta")).toContainText("Nominal source-year dollars · no CPI adjustment");
  await page.locator(".dialog-close").click();
  await page.locator("#reset-settings").click();

  await expect(page.locator("#show-unavailable")).toHaveCount(0);
  await expect(page.locator(".unavailable-toggle")).toHaveCount(0);
  await expect(page.locator("tbody .row-toggle:disabled")).toHaveCount(0);

  await page.locator('[data-filter-menu="tier"] summary').click();
  const tierOptionCount = await page.locator('[data-filter-menu="tier"] .filter-options input').count();
  await page.locator('[data-filter-menu="tier"] .filter-options label').filter({ hasText: /^C$/ }).locator("input").uncheck();
  await expect(page.locator('[data-filter-menu="tier"] summary')).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-filter-menu="tier"] .filter-status')).toHaveText(`${tierOptionCount - 1} of ${tierOptionCount} selected`);
  await expect(page.locator("#stat-n")).not.toHaveText("125");
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
  await expect(page.locator("#salary-filter-summary")).toHaveAttribute("data-active", "true");
  await expect(page.locator("#salary-filter-status")).toContainText("Salary filter");
  await expect(page.locator("#stat-n")).not.toHaveText("125");
  await page.locator("#reset-settings").click();
  await expect(page.locator("#expense-range-min")).not.toBeVisible();
  await page.locator("#expense-filter-summary").click();
  await page.locator("#expense-range-min").fill("500");
  await expect(page.locator("#expense-range-value")).not.toHaveText("All");
  await expect(page.locator("#expense-filter-summary")).toHaveAttribute("data-active", "true");
  await expect(page.locator("#expense-filter-status")).toContainText("Expense filter");
  await expect(page.locator("#stat-n")).not.toHaveText("125");
  const expenseRangeBeforeBasisChange = await page.locator("#expense-range-value").textContent();
  await page.locator("#salary-filter-summary").locator("xpath=..").evaluate((details) => { details.open = true; });
  await page.locator("#salary-range-min").fill("300000");
  await page.locator('input[name="dollar-basis"][value="nominal"]').check();
  await expect(page.locator("#salary-range-value")).toHaveText("All");
  await expect(page.locator("#expense-range-value")).toHaveText(expenseRangeBeforeBasisChange);
  await expect(page.locator("#expense-filter-summary")).toHaveAttribute("data-active", "true");

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
  await expect(page.locator("thead tr")).toHaveCount(1);
  await expect(page.locator("#table-rp-reference-layer")).toHaveCount(0);
  const titleHeaderCell = page.locator('thead th:has(button[data-sort="title"])');
  expect(await titleHeaderCell.locator(".header-filter-menu").evaluate((menu) => menu.getBoundingClientRect().width)).toBeLessThanOrEqual(18);
  expect(await titleHeaderCell.evaluate((header) => {
    const sort = header.querySelector('[data-sort="title"]').getBoundingClientRect();
    const filter = header.querySelector(".header-filter-menu").getBoundingClientRect();
    return filter.left >= sort.right;
  })).toBe(true);

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
  await page.locator("#custom-quantiles").fill("40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50");
  await expect(page.locator(".quantile-cell")).toHaveCount(11);
  const declutteredMarkCount = await page.locator(".curve-quantile-mark").count();
  expect(declutteredMarkCount).toBeGreaterThan(0);
  expect(declutteredMarkCount).toBeLessThan(11);
  const adjacentCurveLabelsOverlap = await page.locator(".curve-quantile-mark").evaluateAll((marks) => {
    const rectangles = marks.map((mark) => mark.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    return rectangles.some((rectangle, index) => index > 0
      && rectangle.left < rectangles[index - 1].right + 2
      && rectangle.top < rectangles[index - 1].bottom + 2
      && rectangle.bottom + 2 > rectangles[index - 1].top);
  });
  expect(adjacentCurveLabelsOverlap).toBe(false);
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-decluttered-curve-quantiles.png" });

  await page.locator("#reset-settings").click();
  await expect(page.getByRole("button", { name: "About auto-weights" })).toHaveCount(0);
  expect(await page.locator('.auto-weight-rule input[value="comparability"]').evaluate((input) => input.closest("#weighting-components"))).toBeNull();
  await expect(page.locator(".component-group-label")).toHaveText("Individual components");
  await page.locator('.stream-balance-rule input[value="streamBalanced"]').check();
  await page.locator('#weighting-components input[value="size"]').check();
  await page.locator('.auto-weight-rule input[value="comparability"]').check();
  await expect(page.locator('.auto-weight-rule input[value="comparability"]')).toBeChecked();
  await expect(page.locator('#weighting-components input[value="size"]')).not.toBeChecked();
  await expect(page.locator('.stream-balance-rule input[value="streamBalanced"]')).toBeChecked();
  await expect(page.locator("#comparability-profile-field")).toBeVisible();
  await expect(page.locator("#comparability-profile-field")).toHaveCSS("padding-left", "0px");
  await expect(page.locator("#comparability-profile-field")).toHaveCSS("border-left-width", "0px");
  await page.getByRole("button", { name: "About auto-weights" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("functional/operating-model similarity (30 points)");
  await expect(page.locator("#help-tooltip")).toContainText("assigned without using compensation");
  await expect(page.locator("#help-tooltip")).toContainText("score ÷ 75");
  await expect(page.locator("#help-tooltip")).toContainText("avoid double-counting");
  await page.locator('#weighting-components input[value="size"]').check();
  await expect(page.locator('.auto-weight-rule input[value="comparability"]')).not.toBeChecked();
  await expect(page.locator('.stream-balance-rule input[value="streamBalanced"]')).toBeChecked();
  await expect(page.locator("#comparability-profile-field")).toBeHidden();
  await expect(page.locator("#size-controls")).toBeVisible();
  await expect(page.locator("#expense-target-field")).toBeVisible();
  await expect(page.locator("#weight-profile-size")).toBeVisible();
  await expect(page.locator("#weight-profile-size .weight-profile-rp-reference")).toHaveCount(1);
  await expect(page.locator("#weight-profile-size .weight-profile-rp-label")).toHaveText("RP");
  await expect(page.locator("#weight-profile-size svg")).toHaveAttribute("aria-label", /RP operating target \$7\.5M/);
  await expect(page.locator(".settings-panel #weight-profile-size")).toHaveCount(1);
  await expect(page.locator(".chart-panel .weight-profile-slot")).toHaveCount(0);
  await expect(page.locator(".weight-profile-curve")).toHaveCount(1);
  await expect(page.locator("#rp-scale-reference")).toBeVisible();
  await expect(page.locator("#rp-scale-reference")).toContainText("57 FTE weighting target");
  await page.locator('#weighting-components input[value="staff"]').check();
  await expect(page.locator("#staff-target-field")).toBeVisible();
  await expect(page.locator("#target-staff")).toHaveValue("57");
  await expect(page.locator("#expense-target-field")).toBeVisible();
  await expect(page.locator(".weight-profile-curve")).toHaveCount(2);
  await expect(page.locator("#weight-profile-staff svg")).toHaveAttribute("aria-label", /RP operating target 57/);
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
  expect(await tierWeightEditor.locator(".info-tooltip").count()).toBe(await tierWeightEditor.locator('input[type="number"]').count());
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

  const centerForAiSafety = page.locator("tbody tr").filter({ hasText: "Center for AI Safety" });
  await expect(centerForAiSafety.locator(".organization-name")).toHaveAttribute("href", /safe\.ai/i);
  const orgCellBox = await centerForAiSafety.locator(".org-cell").boundingBox();
  await page.mouse.move(orgCellBox.x + orgCellBox.width - 2, orgCellBox.y + orgCellBox.height / 2);
  await expect(page.locator("#organization-preview")).toBeHidden();
  await centerForAiSafety.locator(".organization-name").hover();
  await expect(page.locator("#organization-preview")).toBeVisible();
  await expect(page.locator("#organization-preview-local")).toHaveCount(0);
  await expect(page.locator("#organization-preview-wikipedia")).toContainText("nonprofit organization focused on artificial intelligence safety");
  expect(wikipediaRequests).toHaveLength(1);
  expect(wikipediaRequests[0]).toContain("titles=Center+for+AI+Safety");
  expect(wikipediaRequests[0]).not.toContain("generator=search");

  const numfocus = page.locator("tbody tr").filter({ hasText: "NumFOCUS" });
  await numfocus.locator(".organization-name").hover();
  await expect(page.locator("#organization-preview-wikipedia")).toHaveText("No verified Wikipedia article is available for this organization.");
  await expect(page.locator("#organization-preview-wiki")).toHaveText("Search Wikipedia ↗");
  expect(wikipediaRequests).toHaveLength(1);

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
  await expect(page.locator('.stream-balance-rule input[value="streamBalanced"]')).toBeEnabled();
  expect(await page.locator('.stream-balance-rule input[value="streamBalanced"]').evaluate((input) => input.closest("#weighting-components"))).toBeNull();
  await page.getByRole("button", { name: "About equalizing evidence streams" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("exactly half of the total analytical weight");
  await page.locator('.stream-balance-rule input[value="streamBalanced"]').check();
  await expect(page.locator("#weighting-description")).toContainText("rescaled to 50/50 total influence");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await expect(page.locator("#scatter-controls")).toBeVisible();
  await expect(page.locator(".scatter-point")).not.toHaveCount(0);
  await expect(page.locator(".correlation-annotation")).toHaveCount(0);
  await expect(page.locator("#scatter-correlations")).toHaveText(/Weighted r = -?\d\.\d{3}, ρ = -?\d\.\d{3}/);
  await expect(page.locator("#scatter-correlations")).toHaveAttribute("aria-label", /weighted Spearman rho/i);
  expect(await page.locator("#scatter-correlations").evaluate((output) => output.compareDocumentPosition(document.querySelector("#scatter-x")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await expect(page.locator(".point-size-legend")).toContainText("Point area = weight");
  await expect(page.locator(".point-size-legend")).toContainText("0.5×1.0×2.0×");
  await expect(page.locator(".point-size-swatch")).toHaveCount(3);
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-weighted-scatter.png" });
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
  await page.getByRole("button", { name: "About evidence streams" }).hover();
  await expect(page.locator("#help-tooltip")).toBeVisible();
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
  const stickyLegendBounds = await page.locator(".weighting-title").boundingBox();
  expect(stickyWeightBounds.y).toBeGreaterThanOrEqual(settingsBounds.y);
  expect(stickyWeightBounds.y).toBeLessThanOrEqual(settingsBounds.y + 3);
  expect(stickyLegendBounds.y - stickyWeightBounds.y).toBeGreaterThanOrEqual(10);
  await expect(page.locator(".weighting-field")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(await page.locator("#weighting-description").evaluate((description) => description.closest(".weighting-field"))).toBeNull();
  expect(stickyWeightBounds.y + stickyWeightBounds.height).toBeLessThan(settingsBounds.y + settingsBounds.height);
  await scrollingPanel.screenshot({ path: "tmp/app-sticky-weight-components.png" });
  await page.locator("#reset-settings").click();
  await page.locator("#stream-select").selectOption("combined");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await expect(page.locator(".point-size-legend")).toHaveCount(0);
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
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await page.locator("#chart-color").selectOption("structure");
  await page.locator("#mark-curve").uncheck();
  await page.waitForTimeout(100);
  expect(new URL(page.url()).searchParams.has("s")).toBe(false);
  await page.locator("#reset-settings").click();
  await page.locator('input[name="dollar-basis"][value="nominal"]').check();
  const automaticWeightsBefore = await page.locator("tbody .weight-input:not(.is-user-modified)").evaluateAll((inputs) => inputs.map((input) => input.value));
  await page.locator('#weighting-components input[value="size"]').check();
  const automaticWeightsAfter = await page.locator("tbody tr:not(.is-excluded) .weight-input:not(.is-user-modified)").evaluateAll((inputs) => inputs.map((input) => Number(input.value)));
  expect(automaticWeightsAfter.some((value, index) => value !== Number(automaticWeightsBefore[index]))).toBe(true);
  expect(automaticWeightsAfter.reduce((sum, value) => sum + value, 0) / automaticWeightsAfter.length).toBeCloseTo(1, 1);

  const firstRow = page.locator("tbody tr[data-id]").first();
  const rowId = await firstRow.getAttribute("data-id");
  const rowWeight = firstRow.locator(".weight-input");
  expect(await rowWeight.evaluate((input) => input.scrollWidth <= input.clientWidth)).toBe(true);
  await rowWeight.fill("2");
  await rowWeight.blur();
  await expect(rowWeight).toHaveClass(/is-user-modified/);
  await firstRow.locator(".row-toggle").uncheck();
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await page.locator("#chart-color").selectOption("structure");
  await page.locator("#mark-curve").uncheck();
  await page.waitForTimeout(100);
  expect(new URL(page.url()).searchParams.has("s")).toBe(true);
  await page.locator('input[name="distribution"][value="gamma"]').check();
  await page.locator("#quantile-granularity").selectOption("custom");
  await page.locator("#custom-quantiles").fill("10, 50, 90");
  await expect.poll(() => page.url()).toContain("?s=");
  await page.waitForTimeout(100);
  const sharedUrl = page.url();
  expect(sharedUrl.length).toBeLessThan(500);

  await page.reload();
  await expect(page.locator('input[name="distribution"][value="gamma"]')).toBeChecked();
  await expect(page.locator('input[name="chart-view"][value="histogram"]')).toBeChecked();
  await expect(page.locator("#chart-color")).toHaveValue("tier");
  await expect(page.locator('#weighting-components input[value="size"]')).toBeChecked();
  await expect(page.locator('input[name="dollar-basis"][value="nominal"]')).toBeChecked();
  await expect(page.locator("#price-basis-status")).toHaveText("Source-year USD");
  await expect(page.locator("#quantile-granularity")).toHaveValue("custom");
  await expect(page.locator("#custom-quantiles")).toHaveValue("10, 50, 90");
  await expect(page.locator("#mark-curve")).toBeChecked();
  const restoredRow = page.locator(`tbody tr[data-id="${rowId}"]`);
  await expect(restoredRow.locator(".row-toggle")).not.toBeChecked();
  await expect(restoredRow.locator(".weight-input")).toHaveValue("2");
  await expect(restoredRow.locator(".weight-input")).toHaveClass(/is-user-modified/);
  await page.locator("#reset-settings").click();
  await expect(page.locator('input[name="dollar-basis"][value="adjusted"]')).toBeChecked();
  expect(new URL(page.url()).searchParams.has("s")).toBe(false);

  const legacyV2 = Buffer.from(JSON.stringify({ v: 2 })).toString("base64url");
  await page.goto(`/?s=${legacyV2}`);
  await expect(page.locator("#stream-select")).toHaveValue("incumbents");
  await expect(page.locator("#stat-n")).toHaveText("110");
  const legacyV1 = Buffer.from(JSON.stringify({ v: 1, a: {} })).toString("base64url");
  await page.goto(`/?s=${legacyV1}`);
  await expect(page.locator("#stream-select")).toHaveValue("incumbents");
  await expect(page.locator("#stat-n")).toHaveText("110");

  await page.goto("/?s=not-valid-state");
  await expect(page.locator("#url-state-error")).toBeVisible();
  await expect(page.locator("#url-state-error")).toContainText("default settings");
  await expect(page.locator("#stat-n")).toHaveText("125");
  expect(errors).toEqual([]);
});
