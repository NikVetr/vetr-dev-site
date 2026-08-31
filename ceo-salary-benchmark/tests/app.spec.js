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
  await page.goto("/ceo-salary-benchmark/");

  await expect(page.getByRole("heading", { name: "CEO salary benchmark" })).toBeVisible();
  await expect(page.locator("base[data-runtime-app-base]")).toHaveCount(1);
  await expect(page.locator("base[data-runtime-app-base]")).toHaveAttribute(
    "href",
    "http://127.0.0.1:4173/ceo-salary-benchmark/",
  );
  await expect(page.locator("#position-select")).toHaveValue("ceo");
  await expect(page.locator(".settings-panel #position-select")).toHaveCount(0);
  await expect(page.locator("#app-title .title-position-select #position-select")).toHaveCount(1);
  await expect(page.locator("#position-selected-label")).toHaveCSS("color", "rgb(62, 69, 74)");
  await page.locator(".title-position-select").hover();
  await expect(page.locator("#position-selected-label")).toHaveCSS("color", "rgb(45, 104, 133)");
  await page.locator("#position-select").focus();
  await expect(page.locator("#position-selected-label")).toHaveCSS("color", "rgb(45, 104, 133)");
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
  await expect(page.locator(".table-panel")).toHaveAttribute("aria-label", "Organization pay table");
  const tableHeaders = await page.locator("#organization-table thead th").evaluateAll((headers) => headers.map((header) => {
    const explicitLabel = header.querySelector("button[data-sort], :scope > .sr-only");
    if (explicitLabel) return explicitLabel.textContent.trim();
    return [...header.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent.trim()).join(" ").trim();
  }));
  expect(tableHeaders).toEqual(["Selected", "Organization", "Title", "2026 Adj. Salary", "Expenses", "Staff", "Weight", "Score", "Peer Group", "Focus Area", "Location", "Effective Altruism", "Organization Type", "Year", "Pay Source", "Reported Salary", "Source"]);
  await expect(page.locator('thead button[data-sort="adjustedSalary"] > span > span')).toHaveCount(2);
  await expect(page.locator('thead button[data-sort="reportedSalary"] > span > span')).toHaveCount(2);
  expect(await page.locator("#organization-table .title-column").evaluate((header) => header.getBoundingClientRect().width)).toBeLessThan(140);
  const longTitleCell = page.locator('tr[data-id]:has-text("New Jersey League of Conservation Voters") .title-cell');
  await expect(longTitleCell).toHaveText("Executive Director and Chief Executive Officer");
  const titleWrapping = await longTitleCell.evaluate((cell) => {
    const style = getComputedStyle(cell);
    return {
      whiteSpace: style.whiteSpace,
      fitsWidth: cell.scrollWidth <= cell.clientWidth + 1,
      usesMultipleLines: cell.scrollHeight > Number.parseFloat(style.lineHeight) * 1.5,
    };
  });
  expect(titleWrapping).toEqual({ whiteSpace: "normal", fitsWidth: true, usesMultipleLines: true });
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "assets/rethink-priorities-favicon.png");
  await expect(page.locator("#stream-select")).toHaveValue("combined");
  await expect(page.locator("#measure-field")).toBeHidden();
  await expect(page.locator('input[name="dollar-basis"][value="adjusted"]')).toBeChecked();
  await expect(page.locator("#price-basis-status")).toHaveText("July 2026 USD");
  await page.getByRole("button", { name: "About inflation adjustment" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("Bureau of Labor Statistics CPI-U");
  await expect(page.locator("#help-tooltip")).toContainText("CUUR0000SA0");
  await expect(page.locator("#help-tooltip")).toContainText("333.918");
  await expect(page.locator("#stat-n")).toHaveText("129");
  await expect(page.locator(".bar-block")).toHaveCount(129);
  const screenedRosterIntegration = await page.evaluate(() => {
    const incumbents = window.CEO_BENCHMARK_DATA.incumbents;
    const byOrganization = (organization) => incumbents.filter((row) => row.organization === organization);
    return {
      projectHealthyChildren: byOrganization("Project Healthy Children").map((row) => ({
        executive: row.executive, title: row.title, nominalSalary: row.nominalSalary,
        expenses: row.expenses, staff: row.staff, defaultIncluded: row.defaultIncluded,
        cachedSource: row.cachedSource,
      })),
      giveWell: byOrganization("GiveWell").map((row) => ({
        nominalSalary: row.nominalSalary, defaultIncluded: row.defaultIncluded,
      })),
      copenhagen: byOrganization("Copenhagen Consensus Center").map((row) => ({
        nominalSalary: row.nominalSalary, defaultIncluded: row.defaultIncluded,
      })),
      livingPromotions: incumbents
        .filter((row) => row.livingPeerReview && !row.legacyDefaultIncluded && row.defaultIncluded)
        .map((row) => row.organization)
        .sort(),
    };
  });
  expect(screenedRosterIntegration).toEqual({
    projectHealthyChildren: [{
      executive: "FELIX BROOKS-CHURCH", title: "CEO",
      nominalSalary: { base: 97072, cash: 97072, total: 213840 },
      expenses: 5867621, staff: 3, defaultIncluded: true,
      cachedSource: "evidence/original/src-990-ext-project-healthy-children.pdf",
    }],
    giveWell: [{
      nominalSalary: { base: 423600, cash: 424805, total: 463395 },
      defaultIncluded: true,
    }],
    copenhagen: [{
      nominalSalary: { base: 435166, cash: 497770, total: 497770 },
      defaultIncluded: true,
    }],
    livingPromotions: [
      "Center for Election Science",
      "Copenhagen Consensus Center",
      "Foresight Institute",
      "GiveWell",
      "Leverage Research",
      "Magnify Mentoring",
    ],
  });
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
    definitions: 283,
    rows: 186,
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
    organizations: 182,
    mapped: 100,
    knownUnsafeMappings: ["", "", "", ""],
  });
  const methodologyResponse = await page.request.get("/ceo-salary-benchmark/benchmark/deliverables/category_explainers/methodology_notes.md");
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
  await expect(page.locator(".rug-line")).toHaveCount(129);
  await expect(page.locator(".rp-reference-guide")).toHaveCount(1);
  await expect(page.locator(".rp-chart-marker")).toHaveCount(1);
  await expect(page.locator(".rp-chart-marker image")).toHaveAttribute("href", "assets/rethink-priorities-favicon.png");
  await expect(page.locator(".rp-chart-marker-logo")).toHaveCSS("filter", /drop-shadow/);
  await expect(page.locator(".rp-chart-marker rect")).toHaveCount(0);
  await expect(page.locator("#chart-legend")).not.toContainText("RP reference");
  const rpHistogramPlacement = await page.locator("#salary-chart").evaluate((svg) => {
    const guide = svg.querySelector(".rp-reference-guide");
    const marker = svg.querySelector(".rp-chart-marker");
    const block = svg.querySelector(".bar-block");
    return {
      guideX: Number(guide.getAttribute("x1")),
      markerX: marker.transform.baseVal.consolidate().matrix.e,
      guideBehindBlocks: Boolean(guide.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(Math.abs(rpHistogramPlacement.markerX - rpHistogramPlacement.guideX)).toBeLessThan(0.001);
  expect(rpHistogramPlacement.guideBehindBlocks).toBe(true);
  const rpPercentilesByDistribution = {};
  for (const distribution of ["lognormal", "gamma", "empirical"]) {
    await page.locator(`input[name="distribution"][value="${distribution}"]`).check();
    await page.locator(".rp-chart-marker").hover();
    rpPercentilesByDistribution[distribution] = await page
      .locator('#chart-tooltip dl div:has(dt:text-is("Salary percentile")) dd')
      .textContent();
    expect(rpPercentilesByDistribution[distribution]).toMatch(/^\d+(?:\.\d)? \(#\d+(?:\.5)? \/ \d+\)$/);
  }
  expect(new Set(Object.values(rpPercentilesByDistribution)).size).toBeGreaterThan(1);
  await page.locator('input[name="distribution"][value="lognormal"]').check();
  await expect(page.locator("#salary-chart")).toContainText("Weighted records per bar");
  await expect(page.locator("#quantile-basis")).toHaveText("Estimated from the fitted lognormal curve for Salary");
  await expect(page.getByRole("heading", { name: /^Quantiles/ })).toBeVisible();
  await page.getByRole("button", { name: "About quantiles" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("50th percentile is the median");
  await expect(page.locator('#quantile-granularity option[value="quintiles"]')).toHaveText("Quintiles");
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
  await expect(page.locator(".curve-quantile-label").first()).toHaveCSS("fill", "rgb(45, 104, 133)");
  await expect(page.locator(".curve-quantile-label.amount").first()).toHaveCSS("fill", "rgb(62, 69, 74)");
  const curveLabelSpacingMatches = await page.locator(".curve-quantile-mark").evaluateAll((marks) => marks.every((mark) => {
    const [percentile, amount] = mark.querySelectorAll("text");
    const percentileBox = percentile.getBBox();
    const amountBox = amount.getBBox();
    const matrix = mark.getScreenCTM();
    const scale = Math.hypot(matrix.c, matrix.d);
    const lineInset = (percentileBox.y + percentileBox.height - amountBox.y) * scale;
    const renderedLineHeight = Math.min(percentileBox.height, amountBox.height) * scale;
    const separation = Number(mark.dataset.lineSeparationPx);
    return lineInset >= 0.5 && lineInset <= 3.25
      && Math.abs(lineInset - Number(mark.dataset.lineInsetPx)) <= 0.35
      && Math.abs(separation - renderedLineHeight * 0.25) <= 0.35;
  }));
  expect(curveLabelSpacingMatches).toBe(true);
  await expect(page.locator("#show-rug")).toHaveCount(0);
  await expect(page.locator(".reference-band")).toHaveCount(0);
  await expect(page.locator(".density-line")).toHaveAttribute("d", /L/);
  await expect(page.locator("#bin-count")).toHaveAttribute("min", "2");
  await expect(page.locator("#bin-count")).toHaveAttribute("max", "200");
  await expect(page.locator('thead button[data-sort="tier"]').locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator("tbody tr[data-id] .tier-cell").first()).toHaveText("Form 990 · closest peers");
  await expect(page.locator("tbody tr[data-id] .tier-cell").nth(1)).toHaveText("Form 990 · closest peers");
  const rpReferenceRow = page.locator("tbody .rp-reference-row");
  await expect(rpReferenceRow).toHaveCount(1);
  await expect(rpReferenceRow).toContainText("Rethink Priorities");
  await expect(rpReferenceRow).toContainText("CEO");
  await expect(rpReferenceRow).toContainText("Form 990");
  await expect(rpReferenceRow).toContainText("$155K");
  await expect(rpReferenceRow).toContainText("$20M");
  await expect(rpReferenceRow).toContainText("2024");
  await expect(rpReferenceRow.locator("td").nth(1)).toHaveText("Rethink Priorities");
  await expect(rpReferenceRow.locator("td").nth(5)).toHaveText("43");
  await expect(rpReferenceRow.locator("td").nth(5)).toHaveAttribute("title", /2023 Form 990 reports 43 individuals employed/);
  for (const cellIndex of [3, 4, 5, 7, 13, 15]) {
    const [referenceAlignment, peerAlignment] = await Promise.all([
      rpReferenceRow.locator("td").nth(cellIndex).evaluate((cell) => getComputedStyle(cell).textAlign),
      page.locator("tbody tr[data-id]").first().locator("td").nth(cellIndex).evaluate((cell) => getComputedStyle(cell).textAlign),
    ]);
    expect(referenceAlignment).toBe(peerAlignment);
  }
  await expect(rpReferenceRow.locator("td")).toHaveCount(17);
  await expect(rpReferenceRow.locator(".source-cell").getByRole("button", { name: "View" })).toHaveCount(1);
  await expect(rpReferenceRow.locator(".source-cell").getByRole("link", { name: /source 1/i })).toHaveText("1 ↗");
  await expect(rpReferenceRow.locator(".source-cell").getByRole("link", { name: /source 2/i })).toHaveText("2 ↗");
  await expect(rpReferenceRow.locator("input")).toHaveCount(0);
  await expect(rpReferenceRow.locator("td").first()).toHaveCSS("color", "rgb(255, 255, 255)");
  await rpReferenceRow.getByRole("button", { name: "View" }).click();
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
  await expect(excludedPostingToggle).toHaveAttribute("title", /not in the recommended peer group.*Select to include it/);
  const excludedPostingRow = page.locator('tr[data-id="SRC-AD-MOST-2025"]');
  await expect(excludedPostingRow.locator("td").nth(11)).toHaveText("Similar work; no documented connection");
  await expect(excludedPostingRow.locator("td").nth(12)).toHaveText("independent nonprofit");
  const postingEnrichmentCoverage = await page.evaluate(() => {
    const rows = window.CEO_BENCHMARK_DATA.jobAds;
    const definitions = window.CEO_BENCHMARK_DATA.categoryExplainers.definitions;
    const missing = rows.filter((row) => [row.eaAffinity, row.structure, row.topic]
      .some((value) => !value || /^(not coded|not extracted|uncoded)$/i.test(value)));
    const missingDefinitions = rows.flatMap((row) => [
      ["ea_relationship", row.eaAffinity],
      ["expected_structure", row.structure],
      ["topic_cluster", row.topic],
    ]).filter(([field, value]) => !definitions[field]?.[value]);
    return {
      rows: rows.length,
      missing: missing.map((row) => row.id),
      missingDefinitions,
      eaValues: [...new Set(rows.map((row) => row.eaAffinity))].sort(),
      topicCount: new Set(rows.map((row) => row.topic)).size,
      enriched: rows.filter((row) => row.categoryEnrichment && row.historicalCategoryProvenance).length,
    };
  });
  expect(postingEnrichmentCoverage).toEqual({
    rows: 33,
    missing: [],
    missingDefinitions: [],
    eaValues: ["functional-only"],
    topicCount: 8,
    enriched: 33,
  });
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
  expect(await page.locator("#bin-field").evaluate((element) => element.previousElementSibling?.classList.contains("axis-settings"))).toBe(true);
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
  await expect(page.locator("#chart-tooltip dt")).toContainText(["Histogram bar", "Salary percentile", "Peer group", "Pay source", "Similarity score", "Weight in results"]);
  const salaryPercentileDetail = page.locator('#chart-tooltip dl div:has(dt:text-is("Salary percentile")) dd');
  await expect(salaryPercentileDetail).toHaveText(/^\d+(?:\.\d)? \(#\d+(?:\.5)? \/ 129\)$/);
  const lognormalPercentile = await salaryPercentileDetail.textContent();
  await page.locator('input[name="distribution"][value="empirical"]').check();
  await page.locator(".bar-block").first().hover();
  const empiricalPercentile = await salaryPercentileDetail.textContent();
  expect(empiricalPercentile).not.toBe(lognormalPercentile);
  await page.locator('input[name="distribution"][value="lognormal"]').check();
  await expect(page.locator("#chart-tooltip .chart-tooltip-hint")).toContainText("highlight its row");
  await page.locator("#chart-title").hover();
  await expect(page.locator(".rug-line.is-highlighted")).toHaveCount(0);
  await page.locator(".rp-chart-marker").hover();
  await expect(page.locator("#chart-tooltip")).toContainText("Rethink Priorities");
  await expect(page.locator("#chart-tooltip")).toContainText("$155,230");
  await expect(page.locator("#chart-tooltip dt")).toContainText(["Salary percentile", "How this record is used", "Pay source"]);
  await expect(salaryPercentileDetail).toHaveText(/^\d+(?:\.\d)? \(#\d+(?:\.5)? \/ 129\)$/);
  await expect(page.locator("#chart-tooltip")).toContainText("shown for context, not included in results");
  await expect(page.locator("#chart-tooltip")).not.toContainText("Weight in results");
  await expect(page.locator("#chart-tooltip .chart-tooltip-hint")).toContainText("RP reference row");
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-rp-histogram-reference.png" });
  await page.locator("#chart-title").hover();
  const histogramTickLines = await page.locator("#salary-chart").evaluate((svg) => {
    const rug = svg.querySelector(".rug-line");
    const baseline = Number(rug.getAttribute("y1")) - 2;
    return [...svg.querySelectorAll("line:not(.rug-line)")].filter((line) =>
      Number(line.getAttribute("y1")) === baseline && Number(line.getAttribute("y2")) === baseline + 4).length;
  });
  expect(histogramTickLines).toBe(0);
  await expect(page.locator("aside.settings-panel").locator('input[name="chart-view"]')).toHaveCount(2);
  await page.locator("#chart-color").selectOption("eaAffinity");
  await expect(page.locator("#color-description")).toContainText("effective altruism");
  expect(new Set(await page.locator(".bar-block").evaluateAll((blocks) => blocks.map((block) => block.getAttribute("fill")))).size).toBeGreaterThan(1);

  await page.locator('input[name="distribution"][value="gamma"]').check();
  await expect(page.locator("#chart-legend")).toContainText("Gamma density");
  await expect(page.locator("#quantile-basis")).toHaveText("Estimated from the fitted gamma curve for Salary");
  await page.locator('input[name="distribution"][value="empirical"]').check();
  await expect(page.locator(".density-line-outline")).toHaveCount(0);
  await expect(page.locator(".density-line")).toHaveCount(0);
  const empiricalMarkCount = await page.locator(".empirical-quantile-mark").count();
  expect(empiricalMarkCount).toBeGreaterThan(0);
  expect(empiricalMarkCount).toBeLessThanOrEqual(4);
  await expect(page.locator(".empirical-quantile-guide")).toHaveCount(empiricalMarkCount);
  await expect(page.locator(".empirical-quantile-label.amount").first()).toHaveText(/^\$\d+K$/);
  await expect(page.locator(".empirical-quantile-label").first()).toHaveCSS("fill", "rgb(45, 104, 133)");
  await expect(page.locator(".empirical-quantile-label.amount").first()).toHaveCSS("fill", "rgb(62, 69, 74)");
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
    return rectangles.every((rectangle, index) => index === 0 || rectangle.left >= rectangles[index - 1].right + 6);
  })).toBe(true);
  expect(await page.locator(".empirical-quantile-mark").evaluateAll((marks) => marks.every((mark) => {
    const percentile = mark.querySelector(".percentile").getBoundingClientRect();
    const amount = mark.querySelector(".amount").getBoundingClientRect();
    const inset = percentile.bottom - amount.top;
    return inset >= 3.8 && inset <= 6.2;
  }))).toBe(true);
  expect(await page.locator(".empirical-quantile-guide").evaluateAll((guides) => guides.every((guide, index) => {
    const amount = document.querySelectorAll(".empirical-quantile-mark .amount")[index].getBoundingClientRect();
    const overlap = guide.getBoundingClientRect().top - amount.bottom;
    return overlap >= -6 && overlap <= 0;
  }))).toBe(true);
  await expect(page.locator("#quantile-basis")).toHaveText("Based on weighted percentiles of the selected records for Salary");
  await page.locator('input[name="distribution"][value="lognormal"]').check();

  await page.getByLabel("Include American Immigration Council").uncheck();
  await expect(page.locator("#stat-n")).toHaveText("128");
  await expect(page.locator(".bar-block")).toHaveCount(128);
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
  await expect(caisInflationRow.locator(".adjusted-salary-cell")).toHaveText("$335K");
  await expect(caisInflationRow.locator(".reported-salary-cell")).toHaveText("$315K");
  await caisInflationRow.getByRole("button", { name: "View" }).click();
  await expect(page.locator("#dialog-value")).toHaveText("$334,818");
  await expect(page.locator("#dialog-evidence")).toContainText("Schedule J base: $314,534");
  await expect(page.locator("#dialog-secondary-cached")).toBeHidden();
  await expect(page.locator("#dialog-secondary-external")).toBeHidden();
  await page.locator(".dialog-close").click();
  await page.locator('input[name="dollar-basis"][value="nominal"]').check();
  await expect(page.locator("#price-basis-status")).toHaveText("Source-year USD");
  await expect(page.locator("#salary-chart")).toContainText("Annual pay (Source-year USD)");
  await expect(rpReferenceRow).toContainText("$146K");
  await expect(page.locator(".rp-chart-marker")).toHaveAttribute("aria-label", /\$145,826/);
  await expect(caisInflationRow.locator(".adjusted-salary-cell")).toHaveText("$335K");
  await expect(caisInflationRow.locator(".reported-salary-cell")).toHaveText("$315K");
  await caisInflationRow.getByRole("button", { name: "View" }).click();
  await expect(page.locator("#dialog-value")).toHaveText("$314,534");
  await expect(page.locator("#dialog-meta")).toContainText("Original reported dollars · no inflation adjustment");
  await page.locator(".dialog-close").click();
  await page.locator("#reset-settings").click();

  await expect(page.locator("#show-unavailable")).toHaveCount(0);
  await expect(page.locator(".unavailable-toggle")).toHaveCount(0);
  await expect(page.locator("tbody .row-toggle:disabled")).toHaveCount(0);

  await page.locator('[data-filter-menu="tier"] summary').click();
  const tierOptionCount = await page.locator('[data-filter-menu="tier"] .filter-options input').count();
  await page.locator('[data-filter-menu="tier"] .filter-options label').filter({ hasText: /^Form 990 · broadest peers$/ }).locator("input").uncheck();
  await expect(page.locator('[data-filter-menu="tier"] summary')).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-filter-menu="tier"] .filter-status')).toHaveText(`${tierOptionCount - 1} of ${tierOptionCount} selected`);
  await expect(page.locator("#stat-n")).not.toHaveText("129");
  const filteredN = Number(await page.locator("#stat-n").textContent());
  await expect(page.locator(".bar-block")).toHaveCount(filteredN);

  await page.locator("#reset-settings").click();
  await expect(page.locator("#sample-select")).toContainText("Recommended peers");
  await expect(page.locator("#sample-select")).toContainText("Recommended + broader");
  await expect(page.locator('#sample-select option[value="tierA"]')).toHaveText("Closest peers only");
  await expect(page.locator("#sample-description")).toContainText("Reviewed full-year CEO pay records");
  await page.locator("#sample-select").selectOption("sensitivity");
  await expect(page.locator("#sample-description")).toContainText("broader comparisons");
  await expect(page.locator("#stat-n")).toHaveText("133");
  await page.locator("#stream-select").selectOption("incumbents");
  await page.locator("#measure-select").selectOption("cash");
  await expect(page.locator("#stat-n")).toHaveText("126");
  for (const organization of ["Animal Equality", "Compassion in World Farming USA"]) {
    await expect(page.locator(`tbody tr[data-id]:has(.organization-name:text-is("${organization}")) .row-toggle`)).toBeChecked();
  }
  await page.locator("#sample-select").selectOption("clean");
  await expect(page.locator("#sample-description")).toContainText("organization types most similar to RP");
  await page.locator("#reset-settings").click();
  const titleFilterSummary = page.locator('[data-filter-menu="title"] summary');
  const titleFilterDetails = page.locator('[data-filter-menu="title"] details');
  await titleFilterSummary.click();
  const firstTitleOption = page.locator('[data-filter-menu="title"] .filter-options input').first();
  await firstTitleOption.click();
  await expect(titleFilterDetails).toHaveAttribute("open", "");
  await firstTitleOption.click();
  await expect(titleFilterDetails).toHaveAttribute("open", "");
  await page.locator("#chart-title").click();
  await expect(titleFilterDetails).not.toHaveAttribute("open", "");
  await titleFilterSummary.click();
  await page.keyboard.press("Escape");
  await expect(titleFilterDetails).not.toHaveAttribute("open", "");
  await expect(titleFilterSummary).toBeFocused();
  await titleFilterSummary.click();
  await page.locator("#salary-filter-summary").click();
  await expect(page.locator('.header-filter-menu details[open]')).toHaveCount(1);
  await expect(titleFilterDetails).not.toHaveAttribute("open", "");
  await expect(page.locator('[data-numeric-filter="salary"] details')).toHaveAttribute("open", "");
  await page.locator(".table-scroll").evaluate((element) => { element.scrollLeft = 0; });
  await page.locator('[data-filter-menu="title"] summary').click();
  await page.locator(".table-scroll").evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect(page.locator('[data-filter-menu="title"] details')).not.toHaveAttribute("open", "");
  await page.locator(".table-scroll").evaluate((element) => { element.scrollLeft = 0; });
  await page.locator('[data-filter-menu="title"] summary').click();
  const titleOptions = page.locator('[data-filter-menu="title"] .filter-options input');
  expect(await titleOptions.evaluateAll((options) => options.every((option) => option.checked))).toBe(true);
  const ceoGroup = page.locator('[data-filter-menu="title"] .filter-group').filter({ has: page.locator(".filter-group-heading", { hasText: /^CEO/ }) });
  await expect(ceoGroup).toHaveCount(1);
  const ceoGroupCheckbox = ceoGroup.locator(".filter-group-heading input");
  const ceoTitleCheckboxes = ceoGroup.locator(':scope > label:not(.filter-group-heading) input[type="checkbox"]');
  expect(await ceoTitleCheckboxes.count()).toBeGreaterThan(1);
  await ceoTitleCheckboxes.first().uncheck();
  await expect(ceoGroupCheckbox).not.toBeChecked();
  expect(await ceoGroupCheckbox.evaluate((checkbox) => checkbox.indeterminate)).toBe(true);
  await expect(ceoTitleCheckboxes.nth(1)).toBeChecked();
  await ceoTitleCheckboxes.first().check();
  await expect(ceoGroupCheckbox).toBeChecked();
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

  await page.locator(".table-scroll").evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await page.locator('[data-filter-menu="topic"] summary').click();
  const areaGroups = page.locator('[data-filter-menu="topic"] .filter-group');
  await expect(areaGroups).toHaveCount(11);
  await page.locator(".table-panel").screenshot({ path: "tmp/app-area-filter-groups.png" });
  const areaValues = await page.locator('[data-filter-menu="topic"] .filter-group > label:not(.filter-group-heading) span').allTextContents();
  expect(areaValues.some((value) => /\$|\bbudget\b|\bstaff\b/i.test(value))).toBe(false);
  const climateGroup = areaGroups.filter({ has: page.locator(".filter-group-heading", { hasText: /^Climate & environment/ }) });
  const climateGroupCheckbox = climateGroup.locator(".filter-group-heading input");
  const climateAreaCheckboxes = climateGroup.locator(':scope > label:not(.filter-group-heading) input[type="checkbox"]');
  expect(await climateAreaCheckboxes.count()).toBeGreaterThan(1);
  await climateAreaCheckboxes.first().uncheck();
  await expect(climateGroupCheckbox).not.toBeChecked();
  expect(await climateGroupCheckbox.evaluate((checkbox) => checkbox.indeterminate)).toBe(true);
  await expect(climateAreaCheckboxes.nth(1)).toBeChecked();
  await climateGroupCheckbox.check();
  expect(await climateAreaCheckboxes.evaluateAll((checkboxes) => checkboxes.every((checkbox) => checkbox.checked))).toBe(true);
  await climateGroupCheckbox.uncheck();
  expect(await climateAreaCheckboxes.evaluateAll((checkboxes) => checkboxes.every((checkbox) => !checkbox.checked))).toBe(true);
  await climateGroupCheckbox.check();
  expect(await climateAreaCheckboxes.evaluateAll((checkboxes) => checkboxes.every((checkbox) => checkbox.checked))).toBe(true);
  await page.locator(".table-scroll").evaluate((element) => { element.scrollLeft = 0; });

  await expect(page.locator("#salary-range-min")).not.toBeVisible();
  await page.locator("#salary-filter-summary").click();
  await expect(page.locator("#salary-range-min")).toBeVisible();
  await page.locator("#salary-range-min").fill("300000");
  await expect(page.locator("#salary-range-value")).not.toHaveText("All");
  await expect(page.locator("#salary-filter-summary")).toHaveAttribute("data-active", "true");
  await expect(page.locator("#salary-filter-status")).toContainText("Salary filter");
  await expect(page.locator("#stat-n")).not.toHaveText("129");
  await page.locator("#reset-settings").click();
  await expect(page.locator("#expense-range-min")).not.toBeVisible();
  await page.locator("#expense-filter-summary").click();
  await page.locator("#expense-range-min").fill("500");
  await expect(page.locator("#expense-range-value")).not.toHaveText("All");
  await expect(page.locator("#expense-filter-summary")).toHaveAttribute("data-active", "true");
  await expect(page.locator("#expense-filter-status")).toContainText("Expense filter");
  await expect(page.locator("#stat-n")).not.toHaveText("129");
  await page.locator("#reset-settings").click();
  const matchScoreUnfilteredN = Number(await page.locator("#stat-n").textContent());
  await expect(page.locator("#match-score-range-min")).not.toBeVisible();
  await page.locator("#match-score-filter-summary").click();
  await expect(page.locator("#match-score-range-min")).toBeVisible();
  await page.locator("#match-score-range-min").fill("90");
  await expect(page.locator("#match-score-range-value")).toHaveText("90–100");
  await expect(page.locator("#match-score-filter-summary")).toHaveAttribute("data-active", "true");
  await expect(page.locator("#match-score-filter-status")).toContainText("Similarity-score filter");
  await expect.poll(async () => Number(await page.locator("#stat-n").textContent())).toBeLessThan(matchScoreUnfilteredN);
  expect(await page.locator('[data-numeric-filter="matchScore"] .filter-popover').evaluate((popover) => {
    const rectangle = popover.getBoundingClientRect();
    const bounds = popover.closest(".table-scroll").getBoundingClientRect();
    return rectangle.left >= bounds.left && rectangle.right <= bounds.right;
  })).toBe(true);
  await page.locator(".table-panel").screenshot({ path: "tmp/app-match-score-filter.png" });
  const matchScoreRangeBeforeBasisChange = await page.locator("#match-score-range-value").textContent();
  await page.locator("#expense-filter-summary").locator("xpath=..").evaluate((details) => { details.open = true; });
  await page.locator("#expense-range-min").fill("500");
  const expenseRangeBeforeBasisChange = await page.locator("#expense-range-value").textContent();
  await page.locator("#salary-filter-summary").locator("xpath=..").evaluate((details) => { details.open = true; });
  await page.locator("#salary-range-min").fill("300000");
  await page.locator('input[name="dollar-basis"][value="nominal"]').check();
  await expect(page.locator("#salary-range-value")).toHaveText("All");
  await expect(page.locator("#expense-range-value")).toHaveText(expenseRangeBeforeBasisChange);
  await expect(page.locator("#expense-filter-summary")).toHaveAttribute("data-active", "true");
  await expect(page.locator("#match-score-range-value")).toHaveText(matchScoreRangeBeforeBasisChange);
  await expect(page.locator("#match-score-filter-summary")).toHaveAttribute("data-active", "true");

  await page.locator("#reset-settings").click();
  const salaryHeader = page.locator('thead button[data-sort="adjustedSalary"]');
  const reportedSalaryHeader = page.locator('thead button[data-sort="reportedSalary"]');
  const titleHeader = page.locator('thead button[data-sort="title"]');
  await expect(salaryHeader.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "none");
  await salaryHeader.click();
  await expect(salaryHeader.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
  await salaryHeader.click();
  await expect(salaryHeader.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "descending");
  await reportedSalaryHeader.click();
  await expect(reportedSalaryHeader.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
  await titleHeader.click();
  await expect(titleHeader.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
  const tierHeaderWidth = await page.locator("thead .tier-column").first().evaluate((cell) => cell.getBoundingClientRect().width);
  expect(tierHeaderWidth).toBeLessThanOrEqual(80);
  await expect(page.locator("thead tr")).toHaveCount(1);
  await expect(page.locator("#table-rp-reference-layer")).toHaveCount(0);
  const filterPlacements = await page.locator("thead th.filterable-column").evaluateAll((headers) => headers.map((header) => {
    const controls = header.querySelector(".header-controls").getBoundingClientRect();
    const sortButton = header.querySelector("button[data-sort]");
    const sort = sortButton.getBoundingClientRect();
    const filter = header.querySelector(".header-filter-menu").getBoundingClientRect();
    const bounds = header.getBoundingClientRect();
    const sortIcon = getComputedStyle(sortButton, "::after");
    const sortIconTop = controls.top + Number.parseFloat(sortIcon.top);
    const sortIconRight = controls.right - Number.parseFloat(sortIcon.right);
    return {
      width: filter.width,
      height: filter.height,
      verticalGap: filter.top - sortIconTop - Number.parseFloat(sortIcon.height),
      rightOffset: Math.abs(filter.right - sortIconRight),
      contained: controls.left >= bounds.left && controls.right <= bounds.right
        && filter.left >= controls.left && filter.right <= controls.right,
      sortTargetHeight: sort.height,
      controlHeight: controls.height,
    };
  }));
  expect(
    filterPlacements.every(({ width, height, verticalGap, rightOffset, contained, sortTargetHeight, controlHeight }) => (
      width >= 24 && width <= 24.5 && height >= 24 && height <= 24.5
      && verticalGap >= 1.5 && verticalGap <= 2.5
      && rightOffset <= 0.5 && contained && sortTargetHeight >= 48 && controlHeight >= 48
    )),
    JSON.stringify(filterPlacements),
  ).toBe(true);
  await page.locator(".table-panel").screenshot({ path: "tmp/app-dual-salary-columns.png" });

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
  await expect(page.locator(".component-group-label")).toHaveText("Optional adjustments");
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
  await expect(page.locator("#help-tooltip")).toContainText("Automatic weights never use salary");
  await expect(page.locator("#help-tooltip")).toContainText("reported expenses and employee counts are closer to RP");
  await expect(page.locator("#help-tooltip")).toContainText("similarity score based only on non-pay information");
  await expect(page.locator("#help-tooltip")).toContainText("target effective sample size");
  await expect(page.locator("#help-tooltip")).toContainText("Missing organization-size information reduces");
  await expect(page.locator("#auto-weight-note")).toHaveText("Form 990s: similarity to RP's size · postings: non-pay similarity");
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
  await expect(page.locator("#rp-scale-reference")).toContainText("57 full-time-equivalent staff");
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
  await expect(page.locator("#weight-profile-size")).toContainText("Annual expenses (USD)");
  await expect(page.locator("#weight-profile-size")).not.toContainText("log scale");
  await expect(page.locator("#weight-profile-size")).toContainText("Weight multiplier");
  const expenseCurveBefore = await page.locator("#weight-profile-size .weight-profile-curve").getAttribute("d");
  await page.locator("#expense-bandwidth").fill("1.2");
  await expect(page.locator("#weight-profile-size .weight-profile-figure")).toContainText("matching range 1.20");
  expect(await page.locator("#weight-profile-size .weight-profile-curve").getAttribute("d")).not.toBe(expenseCurveBefore);
  const rpExpenseX = await page.locator("#weight-profile-size .weight-profile-rp-reference").getAttribute("x1");
  await page.locator("#target-expense").fill("10");
  await page.locator("#target-expense").press("Tab");
  await expect(page.locator("#weight-profile-size .weight-profile-figure")).toContainText("Reference $10M");
  await expect(page.locator("#weight-profile-size .weight-profile-target")).toHaveCount(1);
  await expect(page.locator("#weight-profile-size .weight-profile-rp-reference")).toHaveAttribute("x1", rpExpenseX);
  const componentOrder = await page.locator("#size-controls").evaluate((element) => [...element.children].map((child) => child.id));
  expect(componentOrder.slice(0, 2)).toEqual(["expense-target-field", "staff-target-field"]);
  expect(await page.locator("#expense-target-field").evaluate((element) => element.querySelector("#expense-bandwidth").compareDocumentPosition(element.querySelector("#weight-profile-size")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  expect(await page.locator("#staff-target-field").evaluate((element) => element.querySelector("#staff-bandwidth").compareDocumentPosition(element.querySelector("#weight-profile-staff")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await expect(page.locator("#weighting-description")).toContainText("Expenses × Staff");
  await page.locator('#weighting-components input[value="tier"]').check();
  await expect(page.locator("#discrete-weight-editors")).toBeVisible();
  await expect(page.locator("#discrete-weight-editors .discrete-weight-note")).toContainText("closest peer groups");
  const tierWeightEditor = page.locator("#discrete-weight-editors details").filter({ hasText: "Peer group category weights" });
  expect(await tierWeightEditor.locator(".info-tooltip").count()).toBe(await tierWeightEditor.locator('input[type="number"]').count());
  const tierAHelp = page.getByRole("button", { name: "About Peer group category Form 990 · closest peers" });
  await tierAHelp.scrollIntoViewIfNeeded();
  await tierAHelp.hover();
  await expect(page.locator("#help-tooltip")).toBeVisible();
  await expect(page.locator("#help-tooltip")).toContainText("closest Form 990 peers");
  await expect(page.locator("#help-tooltip")).toContainText("You can edit this value");
  await page.screenshot({ path: "tmp/app-weight-category-explainer.png" });
  const tierAWeight = page.getByLabel("Peer group multiplier for Form 990 · closest peers");
  await expect(tierAWeight).toHaveValue("1");
  await expect(page.getByLabel("Peer group multiplier for Form 990 · broader peers")).toHaveValue("0.7");
  await expect(page.getByLabel("Peer group multiplier for Form 990 · broadest peers")).toHaveValue("0.35");
  await tierAWeight.fill("0.8");
  await tierAWeight.blur();
  await expect(tierAWeight).toHaveValue("0.8");
  await page.locator('#weighting-components input[value="tier"]').uncheck();
  await page.locator('#weighting-components input[value="tier"]').check();
  await expect(page.getByLabel("Peer group multiplier for Form 990 · closest peers")).toHaveValue("0.8");

  await page.locator('#weighting-components input[value="eaAffinity"]').check();
  const eaWeightEditor = page.locator("#discrete-weight-editors details").filter({ hasText: "Effective Altruism category weights" });
  await eaWeightEditor.locator("summary").click();
  expect(await eaWeightEditor.locator(".discrete-weight-grid").evaluate((grid) =>
    grid.querySelectorAll(".info-tooltip").length === grid.querySelectorAll('input[type="number"]').length)).toBe(true);
  await page.getByRole("button", { name: "About Effective Altruism category Connected to effective altruism" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("publicly linked to effective altruism");
  await expect(page.getByLabel("Effective Altruism multiplier for Effective-altruism organization")).toHaveValue("1");
  await expect(page.getByLabel("Effective Altruism multiplier for Connected to effective altruism")).toHaveValue("0.85");
  await expect(page.getByLabel("Effective Altruism multiplier for Similar work; no documented connection")).toHaveValue("0.65");
  await page.locator('#weighting-components input[value="titleGroup"]').check();
  await expect(page.getByLabel("Title multiplier for CEO")).toHaveValue("1");
  await expect(page.getByLabel("Title multiplier for Executive Director")).toHaveValue("0.85");
  await expect(page.getByLabel("Title multiplier for President")).toHaveValue("0.75");
  await expect(page.getByLabel("Title multiplier for Not reported")).toHaveValue("0.35");
  await page.locator('#weighting-components input[value="topic"]').check();
  await expect(page.getByLabel("Area multiplier for AI, catastrophic risk, biosecurity, and technology policy")).toHaveValue("1");
  await expect(page.getByLabel("Area multiplier for Research, evaluation, philanthropy infrastructure, and policy")).toHaveValue("0.9");
  await page.locator('#weighting-components input[value="structure"]').check();
  const structureWeightEditor = page.locator("#discrete-weight-editors details").filter({ hasText: "Organization type category weights" });
  await structureWeightEditor.locator("summary").click();
  expect(await structureWeightEditor.locator(".discrete-weight-grid").evaluate((grid) =>
    grid.querySelectorAll(".info-tooltip").length === grid.querySelectorAll('input[type="number"]').length)).toBe(true);
  await page.getByRole("button", { name: "About Organization type category independent nonprofit" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("separate nonprofit legal organization");
  await expect(page.getByLabel("Organization type multiplier for independent nonprofit")).toHaveValue("1");
  await expect(page.getByLabel("Organization type multiplier for membership nonprofit")).toHaveValue("0.75");

  const cais = page.locator("tbody tr").filter({ hasText: "Center for AI Safety" });
  await expect(cais).toHaveCount(1);
  await cais.getByRole("button", { name: "View" }).click();
  await expect(page.locator("#source-dialog")).toBeVisible();
  await expect(page.locator("#dialog-evidence")).toContainText("$314,534");
  await page.locator("#dialog-category-provenance summary").click();
  await expect(page.locator("#dialog-provenance-records section")).toHaveCount(6);
  await expect(page.locator("#dialog-provenance-records")).toContainText("comparability score 94.0");
  await expect(page.locator("#dialog-provenance-intro")).toContainText("assigned without using pay");
  await expect(page.getByRole("link", { name: "How categories were assigned ↗" })).toHaveAttribute("href", "benchmark/deliverables/category_explainers/methodology_notes.md");
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
  await expect(page.locator("#chart-legend")).toContainText("Closest peers");
  await expect(page.locator("#chart-legend")).toContainText("Broader peers");
  await expect(page.locator("#chart-legend")).toContainText("Broadest peers");
  await expect(page.locator("#chart-legend")).not.toContainText("strict_primary");
  await expect(page.locator("#chart-legend .swatch")).toHaveCount(3);
  await expect(page.locator("tbody tr[data-id] .tier-cell").first()).toHaveText("Job posting · closest peers");
  await expect(page.getByLabel("Peer group multiplier for Job posting · closest peers")).toHaveValue("1");
  await expect(page.getByLabel("Peer group multiplier for Broadest case · job title differs")).toHaveValue("0.85");
  await expect(page.getByLabel("Peer group multiplier for Outside recommended group", { exact: true })).toHaveValue("0.1");
  await expect(page.locator("tbody tr").filter({ hasText: "Chief Executive Officer" }).first()).toBeVisible();
  await page.locator(".bar-block").first().hover();
  await expect(page.locator("#chart-tooltip")).toContainText("Job-posting midpoint, July 2026 USD");
  await expect(page.locator("#chart-tooltip")).toContainText("Advertised range");
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-recruitment-tooltip.png" });
  const seattle = page.locator('tbody tr[data-id="SRC-AD-SEATTLEBG"]');
  await expect(seattle.locator(".row-toggle")).not.toBeChecked();
  await expect(seattle.locator(".tier-cell")).toHaveText("Broadest case · mission or work differs");
  await expect(seattle.locator(".adjusted-salary-cell")).toHaveText("$280K");
  await expect(seattle.locator(".reported-salary-cell")).toHaveText("$250K–290K");
  await page.locator("#sample-select").selectOption("sensitivity");
  await expect(page.locator("#stat-n")).toHaveText("19");
  await expect(seattle.locator(".row-toggle")).toBeChecked();
  await page.locator("#sample-select").selectOption("primary");
  await expect(page.locator("#stat-n")).toHaveText("15");
  await expect(seattle.locator(".row-toggle")).not.toBeChecked();
  await seattle.getByRole("button", { name: "View" }).click();
  await expect(page.locator("#dialog-evidence")).toContainText("$250,000–$290,000");
  await expect(page.locator("#dialog-meta")).toContainText("Verified from saved job posting");
  await expect(page.locator("#dialog-cached")).toHaveAttribute("href", "evidence/original/src-ad-seattlebg.html");
  await expect(page.locator("#dialog-category-provenance")).toContainText("expanded_broad_functional");
  await page.locator("#dialog-category-provenance summary").click();
  await expect(page.getByRole("link", { name: "Job-posting source update ↗" })).toHaveAttribute("href", "benchmark/enrichment/job_ad_evidence_updates.csv");
  await page.locator(".dialog-close").click();
  const hcap = page.locator("tbody tr").filter({ hasText: "Healthcare Career Advancement Program" });
  await expect(hcap).toHaveCount(1);
  await hcap.getByRole("button", { name: "View" }).click();
  await expect(page.locator("#dialog-evidence")).toContainText("$150,000–$170,000");
  await expect(page.locator("#dialog-meta")).toContainText("Health, workforce, and biomedical research");
  await expect(page.locator("#dialog-meta")).toContainText("affiliated nonprofit group");
  await expect(page.locator("#dialog-meta")).toContainText("Boards of H-CAP and H-CAP Education Association");
  await page.locator("#dialog-category-provenance summary").click();
  await expect(page.locator("#dialog-provenance-confidence")).toHaveText("High confidence in this classification");
  await expect(page.locator("#dialog-provenance-records")).toContainText("expanded_secondary_structural");
  await expect(page.locator("#dialog-provenance-records")).toContainText("Earlier category record");
  await expect(page.getByRole("link", { name: "How job-posting categories were assigned ↗" })).toHaveAttribute("href", "benchmark/enrichment/job_ad_category_methodology.md");
  await page.locator(".dialog-close").click();
  const cscce = page.locator('tbody tr[data-id="SRC-AD-CSCCE"]');
  await expect(cscce.locator(".row-toggle")).not.toBeChecked();
  await expect(cscce.locator(".reported-salary-cell")).toHaveText("$84K–164K");
  await cscce.getByRole("button", { name: "View" }).click();
  await expect(page.locator("#dialog-source-type")).toContainText("Salary differs from the source or could not be confirmed");
  await expect(page.locator("#dialog-meta")).toContainText("fiscally sponsored project");
  await expect(page.locator("#dialog-secondary-cached")).toHaveAttribute("href", "evidence/original/src-ad-cscce-about.pdf");
  await expect(page.locator("#dialog-secondary-cached")).toHaveText("Open cached About page");
  await expect(page.locator("#dialog-secondary-external")).toHaveAttribute("href", "https://www.cscce.org/about/");
  await expect(page.locator("#dialog-secondary-external")).toHaveText("Open official About page ↗");
  await page.locator("#dialog-category-provenance summary").click();
  await expect(page.locator("#dialog-provenance-records")).toContainText("Community Initiatives");
  await expect(page.locator('#dialog-provenance-records a[href="https://www.cscce.org/about/"]').first()).toHaveText("www.cscce.org");
  const cscceAboutCitation = page.locator('#dialog-provenance-records a[href="benchmark/sources/native/job_ads/src-ad-cscce-about.pdf"]').first();
  await expect(cscceAboutCitation).toBeVisible();
  await expect(cscceAboutCitation).toContainText("page=1");
  await page.locator(".dialog-close").click();

  await page.locator("#stream-select").selectOption("combined");
  await expect(page.locator("#measure-field")).toBeHidden();
  await expect(page.locator(".method-note")).toHaveCount(0);
  await expect(page.locator("#stat-n")).toHaveText("129");
  await page.locator('[data-filter-menu="sourceType"] summary').click();
  await expect(page.locator('[data-filter-menu="sourceType"] .filter-options input')).toHaveCount(3);
  await page.locator('#weighting-components input[value="sourceType"]').check();
  await expect(page.getByLabel("Pay source multiplier for Form 990", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Pay source multiplier for Form 990-EZ")).toHaveValue("1");
  await expect(page.getByLabel("Pay source multiplier for Job posting")).toHaveValue("0.8");
  await expect(page.locator('.stream-balance-rule input[value="streamBalanced"]')).toBeEnabled();
  expect(await page.locator('.stream-balance-rule input[value="streamBalanced"]').evaluate((input) => input.closest("#weighting-components"))).toBeNull();
  await page.getByRole("button", { name: "About equal influence by pay source" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("each receive half of the total influence");
  await page.locator('.stream-balance-rule input[value="streamBalanced"]').check();
  await expect(page.locator("#weighting-description")).toContainText("receive equal total influence");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await expect(page.locator("#scatter-controls")).toBeVisible();
  await expect(page.locator(".scatter-point")).not.toHaveCount(0);
  await expect(page.locator(".rp-reference-guide")).toHaveCount(0);
  await expect(page.locator(".rp-chart-marker")).toHaveCount(1);
  await expect(page.locator("#chart-legend")).not.toContainText("RP reference");
  await expect(page.locator("#stat-n")).toHaveText(String(await page.locator(".scatter-point").count()));
  await expect(page.locator(".correlation-annotation")).toHaveCount(0);
  await expect(page.locator("#scatter-correlations")).toHaveText(/Weighted r = -?\d\.\d{3}, ρ = -?\d\.\d{3}/);
  await expect(page.locator("#scatter-correlations")).toHaveAttribute("aria-label", /weighted Spearman rho/i);
  await page.getByRole("button", { name: "About correlation statistics" }).hover();
  await expect(page.locator("#help-tooltip")).toContainText("Pearson r measures linear association");
  await expect(page.locator("#help-tooltip")).toContainText("association does not imply causation");
  await expect(page.locator(".axis-variable-control")).toHaveCount(2);
  await expect(page.locator(".point-size-legend")).toContainText("Larger mark = more influence");
  await expect(page.locator(".point-size-legend")).toContainText("0.5×1.0×2.0×");
  await expect(page.locator(".point-size-swatch")).toHaveCount(3);
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-weighted-scatter.png" });
  const maximumPointAreaMultiple = await page.locator(".scatter-point").evaluateAll((points) => Math.max(...points.map((point) => (Number(point.getAttribute("r")) / 4.5) ** 2)));
  expect(maximumPointAreaMultiple).toBeLessThanOrEqual(10.001);
  await expect(page.locator(".covariance-contour")).toHaveCount(3);
  await page.locator(".scatter-point").first().hover();
  await expect(page.locator("#chart-tooltip dt")).toContainText(["Salary percentile", "Expenses percentile"]);
  await page.locator(".rp-chart-marker").hover();
  await expect(page.locator("#chart-tooltip")).toContainText("Rethink Priorities");
  await expect(page.locator("#chart-tooltip dt")).toContainText(["Annual expenses", "Salary percentile", "Expenses percentile", "How this record is used"]);
  await expect(page.locator('#chart-tooltip dl div:has(dt:text-is("Salary percentile")) dd')).toHaveText(/^\d+(?:\.\d)? \(#\d+(?:\.5)? \/ \d+\)$/);
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-rp-scatter-reference.png" });
  await page.locator("#chart-color").selectOption("sourceType");
  await expect(page.locator("#chart-legend")).toContainText("Form 990");
  await expect(page.locator("#chart-legend")).toContainText("Job posting");
  await page.locator('.axis-variable-control[aria-label^="Change horizontal"]').click();
  await page.locator("#axis-numerator").selectOption("staff");
  await expect(page.locator("#salary-chart")).toContainText("Staff count");
  await expect(page.locator("#salary-chart")).not.toContainText("log scale");
  await expect(page.locator(".rp-chart-marker")).toHaveCount(1);
  await page.locator('.axis-variable-control[aria-label^="Change horizontal"]').click();
  await page.locator("#axis-numerator").selectOption("comparabilityScore");
  await expect(page.locator(".rp-chart-marker")).toHaveCount(0);
  await expect(page.locator("#chart-legend")).not.toContainText("RP reference");
  await page.locator("#show-contours").uncheck();
  await expect(page.locator(".covariance-contour")).toHaveCount(0);
  await expect(page.locator("#table-search")).toHaveCount(0);
  await expect(page.locator('thead button[data-sort="remoteStatus"]')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("table headers stack compact sort and filter controls at desktop and constrained widths", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const { width, height, screenshot } of [
    { width: 1440, height: 900, screenshot: "tmp/app-table-header-controls-desktop.png" },
    { width: 900, height: 720, screenshot: "tmp/app-table-header-controls-constrained.png" },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/ceo-salary-benchmark/");
    await page.locator(".table-panel").scrollIntoViewIfNeeded();

    const placements = await page.locator("thead th.filterable-column").evaluateAll((headers) => headers.map((header) => {
      const bounds = header.getBoundingClientRect();
      const controls = header.querySelector(".header-controls").getBoundingClientRect();
      const sortButton = header.querySelector("button[data-sort]");
      const sort = sortButton.getBoundingClientRect();
      const sortIcon = getComputedStyle(sortButton, "::after");
      const filter = header.querySelector(".header-filter-menu").getBoundingClientRect();
      const sortIconTop = controls.top + Number.parseFloat(sortIcon.top);
      const sortIconRight = controls.right - Number.parseFloat(sortIcon.right);
      return {
        filterWidth: filter.width,
        filterHeight: filter.height,
        verticalGap: filter.top - sortIconTop - Number.parseFloat(sortIcon.height),
        rightOffset: Math.abs(filter.right - sortIconRight),
        contained: controls.left >= bounds.left && controls.right <= bounds.right
          && filter.left >= controls.left && filter.right <= controls.right,
        sortTargetHeight: sort.height,
        controlHeight: controls.height,
      };
    }));
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.every((placement) => (
      placement.filterWidth >= 24 && placement.filterWidth <= 24.5
      && placement.filterHeight >= 24 && placement.filterHeight <= 24.5
      && placement.verticalGap >= 1.5 && placement.verticalGap <= 2.5
      && placement.rightOffset <= 0.5 && placement.contained
      && placement.sortTargetHeight >= 48 && placement.controlHeight >= 48
    )), JSON.stringify(placements)).toBe(true);

    const titleSort = page.locator('thead button[data-sort="title"]');
    await titleSort.focus();
    await page.keyboard.press("Enter");
    await expect(titleSort.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");

    const titleFilter = page.locator('[data-filter-menu="title"] summary');
    await titleFilter.focus();
    await expect(titleFilter).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(titleFilter.locator("xpath=..")).toHaveAttribute("open", "");
    const firstOption = page.locator('[data-filter-menu="title"] .filter-options input').first();
    await firstOption.focus();
    await page.keyboard.press("Space");
    await expect(titleFilter).toHaveAttribute("data-active", "true");
    await page.keyboard.press("Escape");
    await expect(titleFilter.locator("xpath=..")).not.toHaveAttribute("open", "");
    await expect(titleFilter).toBeFocused();

    await page.locator(".table-panel").screenshot({ path: screenshot });
  }
  expect(errors).toEqual([]);
});

test("desktop and narrow layouts render", async ({ page }) => {
  await page.goto("/ceo-salary-benchmark/");
  const scrollingPanel = page.locator(".settings-panel");
  const overflowPanel = await scrollingPanel.evaluate((element) => ({
    width: element.clientWidth, scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
    gutter: getComputedStyle(element).scrollbarGutter,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(overflowPanel.scrollHeight).toBeGreaterThan(overflowPanel.clientHeight);
  expect(overflowPanel.gutter).toContain("stable");
  expect(overflowPanel.overflowX).toBe("hidden");
  expect(overflowPanel.scrollWidth).toBeLessThanOrEqual(overflowPanel.width + 1);
  const hiddenScrollbarWidth = await scrollingPanel.evaluate((element) => {
    element.style.overflowY = "hidden";
    const width = element.clientWidth;
    element.style.overflowY = "";
    return width;
  });
  expect(hiddenScrollbarWidth).toBe(overflowPanel.width);
  await page.getByRole("button", { name: "About pay sources" }).hover();
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
  expect(await scrollingPanel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
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

test("panel dividers resize, persist, and make charts reflow to their containers", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("/ceo-salary-benchmark/");
  const initialUrl = page.url();

  const settings = page.locator("#settings-panel");
  const table = page.locator("#evidence-table-panel");
  const chart = page.locator("#chart-panel");
  const settingsDivider = page.locator('#settings-panel-resizer[role="separator"]');
  const tableDivider = page.locator('#table-panel-resizer[role="separator"]');
  const resultsDivider = page.locator('#results-panel-resizer[role="separator"]');
  const chartChildrenAreContained = () => chart.evaluate((panel) => {
    const panelBox = panel.getBoundingClientRect();
    const children = [
      panel.querySelector(".chart-heading"),
      panel.querySelector(".scatter-controls:not([hidden])"),
      panel.querySelector("#chart-wrap"),
      panel.querySelector("#chart-legend"),
    ].filter(Boolean);
    const legend = panel.querySelector("#chart-legend");
    const wrap = panel.querySelector("#chart-wrap");
    return panel.scrollHeight <= panel.clientHeight + 1
      && children.every((child) => {
        const box = child.getBoundingClientRect();
        return box.top >= panelBox.top - 1 && box.bottom <= panelBox.bottom + 1;
      })
      && legend.offsetHeight >= 14
      && wrap.offsetHeight >= 80;
  });
  await expect(settingsDivider).toBeVisible();
  await expect(tableDivider).toBeVisible();
  await expect(resultsDivider).toBeVisible();
  expect((await page.locator("#results-panel").boundingBox()).height).toBeLessThan(200);

  const settingsBefore = await settings.boundingBox();
  const settingsHandle = await settingsDivider.boundingBox();
  await page.mouse.move(settingsHandle.x + settingsHandle.width / 2, settingsHandle.y + settingsHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(settingsHandle.x + settingsHandle.width / 2 + 72, settingsHandle.y + settingsHandle.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await settings.boundingBox()).width).toBeGreaterThan(settingsBefore.width + 55);

  const tableBefore = await table.boundingBox();
  const tableHandle = await tableDivider.boundingBox();
  await page.mouse.move(tableHandle.x + tableHandle.width / 2, tableHandle.y + tableHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(tableHandle.x + tableHandle.width / 2 - 64, tableHandle.y + tableHandle.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await table.boundingBox()).width).toBeGreaterThan(tableBefore.width + 48);

  const chartBefore = await chart.boundingBox();
  const resultsHandle = await resultsDivider.boundingBox();
  await page.mouse.move(resultsHandle.x + resultsHandle.width / 2, resultsHandle.y + resultsHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(resultsHandle.x + resultsHandle.width / 2, resultsHandle.y + resultsHandle.height / 2 + 70, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await chart.boundingBox()).height).toBeGreaterThan(chartBefore.height + 52);

  const chartGeometry = await page.locator("#salary-chart").evaluate((svg) => {
    const wrap = document.querySelector("#chart-wrap").getBoundingClientRect();
    const values = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    return { wrapWidth: wrap.width, wrapHeight: wrap.height, viewWidth: values[2], viewHeight: values[3] };
  });
  expect(Math.abs(chartGeometry.wrapWidth - chartGeometry.viewWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(chartGeometry.wrapHeight - chartGeometry.viewHeight)).toBeLessThanOrEqual(2);
  expect(page.url()).toBe(initialUrl);

  const storedLayout = await page.evaluate(() => JSON.parse(localStorage.getItem("rp-salary-benchmark.layout.v1")));
  expect(storedLayout.version).toBe(1);
  const persistedWidth = (await settings.boundingBox()).width;
  const persistedTableWidth = (await table.boundingBox()).width;
  const persistedChartHeight = (await chart.boundingBox()).height;
  await page.reload();
  await expect.poll(async () => Math.abs((await settings.boundingBox()).width - persistedWidth)).toBeLessThanOrEqual(3);
  expect(Math.abs((await table.boundingBox()).width - persistedTableWidth)).toBeLessThanOrEqual(3);
  expect(Math.abs((await chart.boundingBox()).height - persistedChartHeight)).toBeLessThanOrEqual(3);
  expect(page.url()).toBe(initialUrl);

  for (const divider of [settingsDivider, tableDivider, resultsDivider]) {
    const aria = await divider.evaluate((element) => ({
      minimum: Number(element.getAttribute("aria-valuemin")),
      current: Number(element.getAttribute("aria-valuenow")),
      maximum: Number(element.getAttribute("aria-valuemax")),
    }));
    expect(aria.current).toBeGreaterThanOrEqual(aria.minimum);
    expect(aria.current).toBeLessThanOrEqual(aria.maximum);
  }

  const keyboardWidth = (await settings.boundingBox()).width;
  await settingsDivider.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await settings.boundingBox()).width).toBeGreaterThan(keyboardWidth + 10);
  await page.keyboard.press("Home");
  await expect.poll(async () => (await settings.boundingBox()).width).toBeLessThan(keyboardWidth - 20);

  await page.evaluate(() => {
    document.body.style.zoom = "1.5";
    window.dispatchEvent(new Event("resize"));
  });
  const zoomedSettingsBefore = await settings.boundingBox();
  const zoomedHandle = await settingsDivider.boundingBox();
  await page.mouse.move(zoomedHandle.x + zoomedHandle.width / 2, zoomedHandle.y + zoomedHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(zoomedHandle.x + zoomedHandle.width / 2 + 60, zoomedHandle.y + zoomedHandle.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await settings.boundingBox()).width).toBeGreaterThan(zoomedSettingsBefore.width + 45);
  await page.evaluate(() => {
    document.body.style.zoom = "1";
    window.dispatchEvent(new Event("resize"));
  });

  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await page.locator("#chart-color").selectOption("topic");
  const desktopSettingsHandle = await settingsDivider.boundingBox();
  await page.mouse.move(desktopSettingsHandle.x + desktopSettingsHandle.width / 2, desktopSettingsHandle.y + desktopSettingsHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(1799, desktopSettingsHandle.y + desktopSettingsHandle.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await chart.boundingBox()).width).toBeLessThanOrEqual(365);
  const compactDesktopAnalysis = await page.locator("#analysis-column").boundingBox();
  const desktopResultsHandle = await resultsDivider.boundingBox();
  await page.mouse.move(desktopResultsHandle.x + desktopResultsHandle.width / 2, desktopResultsHandle.y + desktopResultsHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(desktopResultsHandle.x + desktopResultsHandle.width / 2, compactDesktopAnalysis.y + 1, { steps: 6 });
  await page.mouse.up();
  await expect.poll(chartChildrenAreContained).toBe(true);
  expect((await page.locator("#results-panel").boundingBox()).height).toBeGreaterThan(300);
  await settingsDivider.focus();
  await page.keyboard.press("Home");
  await resultsDivider.focus();
  await page.keyboard.press("Home");
  await page.locator('input[name="chart-view"][value="histogram"]').check();

  await page.setViewportSize({ width: 1024, height: 486 });
  await expect(settingsDivider).toBeVisible();
  await expect(resultsDivider).toBeVisible();
  await expect(tableDivider).toBeHidden();
  await resultsDivider.focus();
  await page.keyboard.press("Home");
  const compactChartHeight = (await chart.boundingBox()).height;
  const compactResultsHandle = await resultsDivider.boundingBox();
  await page.mouse.move(compactResultsHandle.x + compactResultsHandle.width / 2, compactResultsHandle.y + compactResultsHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(compactResultsHandle.x + compactResultsHandle.width / 2, compactResultsHandle.y + compactResultsHandle.height / 2 + 1);
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await chart.boundingBox()).height - compactChartHeight)).toBeLessThan(10);
  await expect.poll(async () => page.locator("#salary-chart").evaluate((svg) => {
    const wrap = document.querySelector("#chart-wrap").getBoundingClientRect();
    const values = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    return Math.abs(wrap.width - values[2]) <= 2 && Math.abs(wrap.height - values[3]) <= 2;
  })).toBe(true);

  const compactAnalysis = await page.locator("#analysis-column").boundingBox();
  const dragResultsDividerTo = async (clientY) => {
    const handle = await resultsDivider.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, clientY, { steps: 5 });
    await page.mouse.up();
  };
  await dragResultsDividerTo(compactAnalysis.y + 1);
  await expect.poll(chartChildrenAreContained).toBe(true);
  const expandedResultsHeight = (await page.locator("#results-panel").boundingBox()).height;
  await dragResultsDividerTo(compactAnalysis.y + compactAnalysis.height - 1);
  const compactResultsHeight = (await page.locator("#results-panel").boundingBox()).height;
  expect(expandedResultsHeight - compactResultsHeight).toBeGreaterThan(30);
  await dragResultsDividerTo(compactAnalysis.y + 1);
  await expect.poll(chartChildrenAreContained).toBe(true);

  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await page.locator("#chart-color").selectOption("topic");
  await expect.poll(async () => page.locator("#salary-chart").evaluate((svg) => {
    const wrap = document.querySelector("#chart-wrap").getBoundingClientRect();
    const values = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    return Math.abs(wrap.width - values[2]) <= 2 && Math.abs(wrap.height - values[3]) <= 2;
  })).toBe(true);
  await expect.poll(chartChildrenAreContained).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(settingsDivider).toBeHidden();
  await expect(resultsDivider).toBeHidden();
  await expect(tableDivider).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("clickable value and ratio axes drive plots, fits, quantiles, and correlations", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");

  const horizontalAxis = () => page.locator('.axis-variable-control[aria-label^="Change horizontal"]');
  const verticalAxis = () => page.locator('.axis-variable-control[aria-label^="Change vertical"]');
  await expect(horizontalAxis()).toHaveCount(1);
  await expect(page.locator('input[name="histogram-axis-mode"][value="value"]')).toBeChecked();
  await expect(page.locator('input[name="histogram-axis-scale"][value="linear"]')).toBeChecked();
  await expect(page.locator("#histogram-axis-settings")).not.toContainText("Horizontal axis");
  await expect(page.locator("#axis-settings-context")).toHaveCount(0);
  await expect(page.locator("#histogram-axis-settings")).toContainText("Axis Value");
  await expect(page.locator("#histogram-axis-settings")).toContainText("Axis Scale");
  await expect(page.locator("#histogram-axis-settings")).not.toContainText("Type");
  expect((await page.locator("#histogram-axis-settings label").allTextContents()).map((value) => value.trim()))
    .toEqual(["Measure", "Ratio", "Linear", "Log"]);
  await expect(horizontalAxis()).not.toContainText("log scale");
  const horizontalControlAlignment = await horizontalAxis().evaluate((control) => {
    const label = control.querySelector(".axis-variable-label");
    const triangle = control.querySelector(".axis-variable-triangle");
    const labelBox = label.getBBox();
    const triangleBox = triangle.getBBox();
    return {
      decoration: getComputedStyle(label).textDecorationLine,
      centerDifference: Math.abs((labelBox.y + labelBox.height / 2) - (triangleBox.y + triangleBox.height / 2)),
    };
  });
  expect(horizontalControlAlignment.decoration).toBe("none");
  expect(horizontalControlAlignment.centerDifference).toBeLessThan(2);
  await horizontalAxis().click();
  await expect(page.locator("#axis-selector-popover")).toBeVisible();
  await expect(page.locator("#axis-selector-title")).toHaveText("Histogram axis");
  await expect(page.locator("#axis-numerator-label")).toHaveText("Measure");
  await expect(page.locator("#axis-denominator-field")).toBeHidden();
  const positionOptionCount = await page.evaluate(() => window.CEO_BENCHMARK_DATA.positionCatalog.length);
  const currentMeasureOptions = page.locator('#axis-numerator optgroup[label="This organization or role"] option');
  const sameFilingPositionOptions = page.locator('#axis-numerator optgroup[label="One matching role in the same filing"] option');
  const currentMeasureOptionCount = await currentMeasureOptions.count();
  expect(currentMeasureOptionCount).toBeGreaterThan(0);
  await expect(sameFilingPositionOptions).toHaveCount(positionOptionCount);
  await expect(page.locator("#axis-numerator option")).toHaveCount(currentMeasureOptionCount + positionOptionCount);
  const expectedCeoCooBasePairs = await page.evaluate(() => {
    const data = window.CEO_BENCHMARK_DATA;
    const filingSourceId = (row) => row.sourceId || String(row.id || "").split("::", 1)[0];
    const coosBySource = new Map();
    (data.positionObservations.coo || [])
      .filter((row) => row.defaultIncluded && row.salary?.base > 0)
      .forEach((row) => {
        const sourceId = filingSourceId(row);
        coosBySource.set(sourceId, [...(coosBySource.get(sourceId) || []), row]);
      });
    return data.incumbents.filter((row) => (
      row.defaultIncluded
      && row.salary?.base > 0
      && (coosBySource.get(filingSourceId(row)) || []).length === 1
    )).length;
  });
  expect(expectedCeoCooBasePairs).toBe(23);
  await expect(page.locator('#axis-numerator option[value="position:coo"]'))
    .toHaveText(`COO pay · matching records: ${expectedCeoCooBasePairs}`);
  await page.locator("#axis-selector-close").click();
  await expect(page.locator('tbody tr[data-id][data-plot-eligible="false"]')).toHaveCount(0);
  await page.locator('input[name="histogram-axis-mode"][value="ratio"]').check();
  await horizontalAxis().click();
  await page.locator("#axis-denominator").selectOption("position:coo");
  await expect(page.locator("#stat-n")).toHaveText(String(expectedCeoCooBasePairs));
  await expect(page.locator("#salary-chart")).toContainText("Salary / COO salary");
  const checkedCeoCooEligible = page.locator('tbody tr[data-id][data-plot-eligible="true"] .row-toggle:checked');
  await expect(checkedCeoCooEligible).toHaveCount(expectedCeoCooBasePairs);
  const checkedCeoCooIneligible = page.locator('tbody tr[data-id][data-plot-eligible="false"] .row-toggle:checked');
  await expect(checkedCeoCooIneligible).not.toHaveCount(0);
  await expect(checkedCeoCooEligible.first()).toHaveCSS("accent-color", "rgb(45, 104, 133)");
  await expect(checkedCeoCooIneligible.first()).toHaveCSS("accent-color", "rgb(123, 137, 143)");
  await expect(page.locator('thead button[data-sort="plotEligibility"]')).toHaveCount(0);
  const inclusionSort = page.locator('thead button[data-sort="inclusion"]');
  await expect(inclusionSort).toHaveCount(1);
  const eligibleUncheckedId = await checkedCeoCooEligible.first().locator("xpath=../..").getAttribute("data-id");
  const ineligibleUncheckedId = await checkedCeoCooIneligible.first().locator("xpath=../..").getAttribute("data-id");
  await page.locator(`tbody tr[data-id="${eligibleUncheckedId}"] .row-toggle`).uncheck();
  await page.locator(`tbody tr[data-id="${ineligibleUncheckedId}"] .row-toggle`).uncheck();
  await inclusionSort.click();
  await expect(inclusionSort.locator("xpath=..")).toHaveAttribute("aria-sort", "ascending");
  const inclusionRanks = async () => page.locator("tbody tr[data-id]").evaluateAll((tableRows) => tableRows.map((row) => {
    const checked = row.querySelector(".row-toggle").checked;
    const eligible = row.dataset.plotEligible === "true";
    return checked ? (eligible ? 0 : 1) : eligible ? 2 : 3;
  }));
  const ascendingInclusionRanks = await inclusionRanks();
  expect([...new Set(ascendingInclusionRanks)]).toEqual([0, 1, 2, 3]);
  expect(ascendingInclusionRanks).toEqual([...ascendingInclusionRanks].sort((a, b) => a - b));
  await expect(page.locator("#organization-table tbody tr").first()).toHaveClass(/rp-reference-row/);
  await inclusionSort.click();
  await expect(inclusionSort.locator("xpath=..")).toHaveAttribute("aria-sort", "descending");
  const descendingInclusionRanks = await inclusionRanks();
  expect(descendingInclusionRanks).toEqual([...descendingInclusionRanks].sort((a, b) => b - a));
  await page.locator(`tbody tr[data-id="${eligibleUncheckedId}"] .row-toggle`).check();
  await page.locator(`tbody tr[data-id="${ineligibleUncheckedId}"] .row-toggle`).check();
  await expect(page.locator(".plot-status-cell, .plot-status")).toHaveCount(0);
  await expect(page.locator('tbody tr[data-id][data-plot-eligible="false"] .organization-name').first()).toHaveCSS("color", "rgb(123, 137, 143)");
  await expect(page.locator('tbody tr[data-id][data-plot-eligible="false"] .weight-input').first()).toHaveValue("");
  expect(await page.locator("thead th").count()).toBe(await page.locator("tbody tr[data-id]").first().locator("td").count());
  expect(await page.locator("thead th").count()).toBe(await page.locator("tbody .rp-reference-row").first().locator("td").count());
  await page.locator(".table-panel").screenshot({ path: "tmp/app-plot-eligibility-table.png" });
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-ceo-coo-ratio.png" });
  await horizontalAxis().click();
  await page.locator("#axis-denominator").selectOption("expenses");
  const leadersTrustRow = page.locator('tbody tr[data-id]:has(.organization-name:text-is("The LeadersTrust"))');
  await expect(leadersTrustRow.locator(".row-toggle")).toBeChecked();
  await expect(leadersTrustRow).toHaveAttribute("data-plot-eligible", "false");
  await expect(leadersTrustRow).toHaveAttribute("aria-label", /expenses are not reported/i);
  await page.locator('input[name="histogram-axis-mode"][value="value"]').check();
  await expect(leadersTrustRow).toHaveAttribute("data-plot-eligible", "true");
  await expect(leadersTrustRow.locator(".row-toggle")).toBeChecked();
  await horizontalAxis().click();
  await page.locator("#axis-numerator").selectOption("expenses");
  await expect(page.locator("#salary-chart")).toContainText("Annual expenses");
  await expect(horizontalAxis()).not.toContainText("log scale");
  await expect(page.locator('input[name="histogram-axis-scale"][value="log"]')).toBeChecked();
  await expect(page.locator("#quantile-basis")).toContainText("for Expenses");
  await expect(page.locator(".bar-block")).toHaveCount(Number(await page.locator("#stat-n").textContent()));

  await page.locator('input[name="histogram-axis-mode"][value="ratio"]').check();
  await horizontalAxis().click();
  await expect(page.locator("#axis-numerator-label")).toHaveText("Numerator");
  await expect(page.locator("#axis-denominator-field")).toBeVisible();
  await page.locator("#axis-numerator").selectOption("salary");
  await expect(page.locator("#salary-chart")).toContainText("Salary / Expenses");
  await expect(horizontalAxis()).not.toContainText("log scale");
  await expect(page.locator('input[name="histogram-axis-scale"][value="log"]')).toBeChecked();
  await expect(page.locator("#quantile-basis")).toContainText("for Salary / Expenses");
  await expect(page.locator(".density-line")).toHaveCount(1);
  await expect(page.locator(".quantile-cell strong").first()).not.toContainText("$");
  await expect(page.locator(".curve-quantile-tick")).toHaveCount(4);
  await expect(page.locator(".curve-quantile-label.amount").first()).not.toContainText("$");
  await page.locator('input[name="distribution"][value="gamma"]').check();
  await expect(page.locator(".density-line")).toHaveCount(1);
  expect(Number(await page.locator("#stat-n").textContent())).toBeGreaterThan(0);
  await page.locator('input[name="histogram-axis-scale"][value="linear"]').check();
  await expect(page.locator('input[name="histogram-axis-scale"][value="linear"]')).toBeChecked();
  await expect(horizontalAxis()).not.toContainText("log scale");
  await page.locator('input[name="histogram-axis-scale"][value="log"]').check();
  await expect(page.locator('input[name="histogram-axis-scale"][value="log"]')).toBeChecked();
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-ratio-histogram-log.png" });

  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await expect(page.locator("#axis-settings-context")).toHaveCount(0);
  await expect(horizontalAxis()).toHaveCount(1);
  await expect(verticalAxis()).toHaveCount(1);
  await expect(page.locator("#contour-field")).toBeVisible();
  await expect(page.locator("#histogram-axis-settings")).toBeHidden();
  await expect(page.locator("#scatter-axis-settings")).toBeVisible();
  await expect(page.locator('input[name="scatter-x-axis-mode"][value="value"]')).toBeChecked();
  await expect(page.locator('input[name="scatter-y-axis-mode"][value="value"]')).toBeChecked();
  await expect(page.locator('input[name="scatter-x-axis-scale"][value="log"]')).toBeChecked();
  await expect(page.locator('input[name="scatter-y-axis-scale"][value="linear"]')).toBeChecked();
  await expect(horizontalAxis()).toContainText("Annual expenses");
  await expect(horizontalAxis()).not.toContainText("log scale");
  await expect(verticalAxis()).toContainText("Annual pay");
  await expect(verticalAxis()).not.toContainText("log scale");
  await expect(page.locator(".covariance-contour")).toHaveCount(3);
  await expect(page.locator("#scatter-correlations")).toHaveText(/Weighted r = -?\d\.\d{3}, ρ = -?\d\.\d{3}/);
  await page.locator('input[name="scatter-x-axis-mode"][value="ratio"]').check();
  await expect(horizontalAxis()).toContainText("Expenses / Staff");
  await expect(horizontalAxis()).not.toContainText("log scale");
  await expect(page.locator('input[name="scatter-x-axis-scale"][value="log"]')).toBeChecked();
  await verticalAxis().click();
  await expect(page.locator("#axis-selector-title")).toHaveText("Vertical axis");
  await expect(page.locator("#axis-numerator")).toHaveValue("salary");
  await expect(page.locator("#axis-denominator-field")).toBeHidden();
  await page.locator("#axis-selector-close").click();
  await page.locator('input[name="scatter-y-axis-mode"][value="ratio"]').check();
  await verticalAxis().click();
  await expect(page.locator("#axis-denominator-field")).toBeVisible();
  await expect(page.locator("#axis-denominator")).toHaveValue("expenses");
  await page.locator("#axis-denominator").selectOption("revenue");
  await expect(verticalAxis()).toContainText("Salary / Revenue");
  await expect(verticalAxis()).not.toContainText("log scale");
  await expect(page.locator('input[name="scatter-y-axis-scale"][value="log"]')).toBeChecked();
  await page.locator('input[name="scatter-y-axis-scale"][value="linear"]').check();
  await expect(page.locator('input[name="scatter-y-axis-scale"][value="linear"]')).toBeChecked();
  await page.locator('input[name="scatter-y-axis-scale"][value="log"]').check();
  await horizontalAxis().click();
  await expect(page.locator("#axis-selector-title")).toHaveText("Horizontal axis");
  await expect(page.locator("#axis-numerator")).toHaveValue("expenses");
  await expect(page.locator("#axis-denominator")).toHaveValue("staff");
  await page.locator("#axis-selector-close").click();
  await page.locator(".chart-panel").screenshot({ path: "tmp/app-ratio-scatter.png" });

  await page.locator('input[name="chart-view"][value="histogram"]').check();
  await horizontalAxis().click();
  await page.locator("#axis-denominator").selectOption("staff");
  await expect(horizontalAxis()).toContainText("Salary / Staff");

  await expect.poll(() => page.url()).toContain("?s=");
  const sharedUrl = page.url();
  expect(sharedUrl.length).toBeLessThan(500);
  await page.reload();
  await expect(page.locator('input[name="histogram-axis-mode"][value="ratio"]')).toBeChecked();
  await expect(page.locator('input[name="histogram-axis-scale"][value="log"]')).toBeChecked();
  await expect(horizontalAxis()).toContainText("Salary / Staff");
  await expect(horizontalAxis()).not.toContainText("log scale");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await expect(page.locator('input[name="scatter-x-axis-mode"][value="value"]')).toBeChecked();
  await expect(page.locator('input[name="scatter-y-axis-mode"][value="value"]')).toBeChecked();
  await expect(page.locator('input[name="scatter-x-axis-scale"][value="log"]')).toBeChecked();
  await expect(page.locator('input[name="scatter-y-axis-scale"][value="linear"]')).toBeChecked();
  await expect(horizontalAxis()).toContainText("Annual expenses");
  await expect(verticalAxis()).toContainText("Annual pay");

  await page.locator('input[name="scatter-y-axis-mode"][value="ratio"]').check();
  await verticalAxis().click();
  await page.locator("#axis-denominator").selectOption("revenue");
  await expect.poll(() => page.url()).toContain("?s=");
  await page.waitForTimeout(100);
  const scatterShareUrl = page.url();
  await page.reload();
  expect(page.url()).toBe(scatterShareUrl);
  await expect(page.locator('input[name="chart-view"][value="scatter"]')).toBeChecked();
  await expect(page.locator('input[name="scatter-y-axis-mode"][value="ratio"]')).toBeChecked();
  await expect(page.locator('input[name="scatter-y-axis-scale"][value="log"]')).toBeChecked();
  await expect(verticalAxis()).toContainText("Salary / Revenue");
  await expect(verticalAxis()).not.toContainText("log scale");
  await expect(page.locator('input[name="scatter-x-axis-mode"][value="value"]')).toBeChecked();
  expect(errors).toEqual([]);
});

test("LEEP sensitivity rows preserve co-leader balance and same-filing ambiguity", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.locator("#stream-select").selectOption("incumbents");
  await page.locator("#measure-select").selectOption("cash");
  await page.locator("#sample-select").selectOption("sensitivity");

  const leepRows = page.locator('tbody tr[data-id]:has(.organization-name:text-is("Lead Exposure Elimination Project"))');
  await expect(leepRows).toHaveCount(2);
  await expect(leepRows.locator(".row-toggle:checked")).toHaveCount(2);
  const comparisonRow = page.locator('tbody tr[data-id]:has(.organization-name:text-is("Center for AI Safety"))');
  const numericWeight = async (row) => Number(await row.locator(".weight-input").inputValue());
  const leepWeights = await leepRows.locator(".weight-input").evaluateAll((inputs) => inputs.map((input) => Number(input.value)));
  expect(Math.abs(leepWeights.reduce((sum, value) => sum + value, 0) - await numericWeight(comparisonRow))).toBeLessThanOrEqual(0.02);

  await leepRows.first().locator(".row-toggle").uncheck();
  expect(Math.abs(await numericWeight(leepRows.nth(1)) - await numericWeight(comparisonRow))).toBeLessThanOrEqual(0.02);
  await leepRows.first().locator(".row-toggle").check();

  const horizontalAxis = () => page.locator('.axis-variable-control[aria-label^="Change horizontal"]');
  await page.locator('input[name="histogram-axis-mode"][value="ratio"]').check();
  await horizontalAxis().click();
  await page.locator("#axis-denominator").selectOption("position:coo");
  expect(await leepRows.evaluateAll((tableRows) => tableRows.every((row) => row.dataset.plotEligible === "true"))).toBe(true);
  const expectedSensitivityPairs = await page.evaluate(() => {
    const data = window.CEO_BENCHMARK_DATA;
    const selected = (row) => row.defaultIncluded
      || ["sensitivity_only", "structural_sensitivity"].includes(row.analysisStatus);
    const sourceId = (row) => row.sourceId || String(row.id || "").split("::", 1)[0];
    const coos = new Map();
    (data.positionObservations.coo || []).filter((row) => selected(row) && row.salary?.cash > 0).forEach((row) => {
      const key = sourceId(row);
      coos.set(key, [...(coos.get(key) || []), row]);
    });
    return data.incumbents.filter((row) => (
      selected(row) && row.salary?.cash > 0 && (coos.get(sourceId(row)) || []).length === 1
    )).length;
  });
  await expect(page.locator("#stat-n")).toHaveText(String(expectedSensitivityPairs));

  await page.goto("/coo-salary-benchmark/");
  await page.locator("#sample-select").selectOption("sensitivity");
  await page.locator('input[name="histogram-axis-mode"][value="ratio"]').check();
  await horizontalAxis().click();
  await page.locator("#axis-denominator").selectOption("position:ceo");
  const tomos = page.locator('tbody tr[data-id="SRC-990-RECOVERY-LEEP::tomos-davies"]');
  await expect(tomos).toHaveAttribute("data-plot-eligible", "false");
  await expect(tomos).toHaveAttribute("aria-label", /more than one CEO compensation row/i);
  expect(errors).toEqual([]);
});

test("weights and compact shared URLs round-trip", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await page.locator("#chart-color").selectOption("structure");
  await page.locator("#mark-curve").uncheck();
  await page.waitForTimeout(100);
  expect(new URL(page.url()).searchParams.has("s")).toBe(false);
  await page.locator("#reset-settings").click();
  await page.locator("#sample-select").selectOption("sensitivity");
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
  await page.locator("#match-score-filter-summary").click();
  await page.locator("#match-score-range-min").fill("50");
  await expect.poll(() => page.url()).toContain("?s=");
  await page.waitForTimeout(100);
  const sharedUrl = page.url();
  expect(sharedUrl.length).toBeLessThan(500);

  await page.reload();
  await expect(page.locator('input[name="distribution"][value="gamma"]')).toBeChecked();
  await expect(page.locator('input[name="chart-view"][value="histogram"]')).toBeChecked();
  await expect(page.locator("#chart-color")).toHaveValue("tier");
  await expect(page.locator('#weighting-components input[value="size"]')).toBeChecked();
  await expect(page.locator("#sample-select")).toHaveValue("sensitivity");
  await expect(page.locator('input[name="dollar-basis"][value="nominal"]')).toBeChecked();
  await expect(page.locator("#price-basis-status")).toHaveText("Source-year USD");
  await expect(page.locator("#quantile-granularity")).toHaveValue("custom");
  await expect(page.locator("#custom-quantiles")).toHaveValue("10, 50, 90");
  await expect(page.locator("#match-score-range-min")).toHaveValue("50");
  await expect(page.locator("#match-score-filter-summary")).toHaveAttribute("data-active", "true");
  await expect(page.locator("#mark-curve")).toBeChecked();
  const restoredRow = page.locator(`tbody tr[data-id="${rowId}"]`);
  await expect(restoredRow.locator(".row-toggle")).not.toBeChecked();
  await expect(restoredRow.locator(".weight-input")).toHaveValue("2");
  await expect(restoredRow.locator(".weight-input")).toHaveClass(/is-user-modified/);
  await page.locator("#reset-settings").click();
  await expect(page.locator('input[name="dollar-basis"][value="adjusted"]')).toBeChecked();
  expect(new URL(page.url()).searchParams.has("s")).toBe(false);

  await page.locator('.auto-weight-rule input[value="comparability"]').check();
  await page.locator("#auto-target-ess").fill("45");
  await expect.poll(() => {
    const encoded = new URL(page.url()).searchParams.get("s");
    return encoded ? JSON.parse(Buffer.from(encoded, "base64url").toString()).x?.a : null;
  }).toBe(45);
  await page.reload();
  await expect(page.locator('.auto-weight-rule input[value="comparability"]')).toBeChecked();
  await expect(page.locator("#auto-target-ess")).toHaveValue("45");
  await expect(page.locator('.stream-balance-rule input[value="streamBalanced"]')).not.toBeChecked();
  await page.locator("#reset-settings").click();

  const conflictingAutoV7 = Buffer.from(JSON.stringify({ v: 7, w: "ceb" })).toString("base64url");
  await page.goto(`/ceo-salary-benchmark/?s=${conflictingAutoV7}`);
  await expect(page.locator('.auto-weight-rule input[value="comparability"]')).toBeChecked();
  await expect(page.locator('#weighting-components input[value="size"]')).not.toBeChecked();
  await expect(page.locator('.stream-balance-rule input[value="streamBalanced"]')).toBeChecked();
  const postingAutoV7 = Buffer.from(JSON.stringify({ v: 7, e: "j", w: "c" })).toString("base64url");
  await page.goto(`/ceo-salary-benchmark/?s=${postingAutoV7}`);
  await expect(page.locator("#stream-select")).toHaveValue("jobAds");
  await expect(page.locator('.auto-weight-rule input[value="comparability"]')).toBeChecked();
  await expect(page.locator('.auto-weight-rule input[value="comparability"]')).toBeEnabled();
  await expect(page.locator("#weight-profile-comparability")).toContainText("average similarity score");
  await expect(page.locator("#auto-target-ess-field")).toBeHidden();

  const legacyV2 = Buffer.from(JSON.stringify({ v: 2 })).toString("base64url");
  await page.goto(`/ceo-salary-benchmark/?s=${legacyV2}`);
  await expect(page.locator("#stream-select")).toHaveValue("incumbents");
  await expect(page.locator("#stat-n")).toHaveText("114");
  const legacyV3 = Buffer.from(JSON.stringify({ v: 3 })).toString("base64url");
  await page.goto(`/ceo-salary-benchmark/?s=${legacyV3}`);
  await expect(page.locator("#position-select")).toHaveValue("ceo");
  await expect(page.locator("#stream-select")).toHaveValue("combined");
  await expect(page.locator("#stat-n")).toHaveText("129");
  const legacyV4 = Buffer.from(JSON.stringify({ v: 4, a: 1 })).toString("base64url");
  await page.goto(`/ceo-salary-benchmark/?s=${legacyV4}`);
  await expect(page.locator('input[name="histogram-axis-mode"][value="ratio"]')).toBeChecked();
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await expect(page.locator('input[name="scatter-x-axis-mode"][value="ratio"]')).toBeChecked();
  await expect(page.locator('input[name="scatter-y-axis-mode"][value="ratio"]')).toBeChecked();
  const legacyV5 = Buffer.from(JSON.stringify({ v: 5 })).toString("base64url");
  await page.goto(`/ceo-salary-benchmark/?s=${legacyV5}`);
  await expect(page.locator("#position-select")).toHaveValue("ceo");
  await expect(page.locator("#stream-select")).toHaveValue("combined");
  const legacyV1 = Buffer.from(JSON.stringify({ v: 1, a: {} })).toString("base64url");
  await page.goto(`/ceo-salary-benchmark/?s=${legacyV1}`);
  await expect(page.locator("#position-select")).toHaveValue("ceo");
  await expect(page.locator("#stream-select")).toHaveValue("incumbents");
  await expect(page.locator("#stat-n")).toHaveText("114");

  await page.goto("/ceo-salary-benchmark/?s=not-valid-state");
  await expect(page.locator("#url-state-error")).toBeVisible();
  await expect(page.locator("#url-state-error")).toContainText("default settings");
  await expect(page.locator("#stat-n")).toHaveText("129");
  expect(errors).toEqual([]);
});

test("Auto-weights remain explicit and stable for small filing samples and stream changes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  const auto = page.locator('.auto-weight-rule input[value="comparability"]');
  const balance = page.locator('.stream-balance-rule input[value="streamBalanced"]');

  await auto.check();
  await expect(balance).not.toBeChecked();
  await expect(page.locator("#weight-profile-comparability")).toContainText("Form 990 records");
  await expect(page.locator("#weight-profile-comparability")).toContainText("job postings · effective sample size");
  await expect(page.locator("#weight-profile-comparability")).toContainText("Similarity weight (0–1)");
  const automaticWeights = await page.locator("tbody tr:not(.is-excluded) .weight-input:not(.is-user-modified)")
    .evaluateAll((inputs) => inputs.map((input) => Number(input.value)));
  expect(automaticWeights.reduce((sum, value) => sum + value, 0) / automaticWeights.length).toBeCloseTo(1, 1);
  expect(Math.max(...automaticWeights)).toBeLessThanOrEqual(6.01);
  const postingAutomaticWeights = await page.locator("tbody tr[data-id]:not(.is-excluded)").evaluateAll((tableRows) => (
    tableRows
      .filter((row) => row.querySelector(".evidence-cell")?.textContent.trim() === "Job posting")
      .map((row) => ({
        score: window.CEO_BENCHMARK_DATA.jobAds.find((item) => item.id === row.dataset.id).comparabilityScore,
        weight: Number(row.querySelector(".weight-input").value),
      }))
  ));
  expect(postingAutomaticWeights.length).toBeGreaterThan(1);
  const weightsByScore = Map.groupBy(postingAutomaticWeights, (item) => item.score);
  expect([...weightsByScore.keys()].sort((a, b) => b - a)).toEqual([100, 70]);
  const weight100 = weightsByScore.get(100)[0].weight;
  const weight70 = weightsByScore.get(70)[0].weight;
  expect(weight100).toBeGreaterThan(weight70);
  expect(weight100).toBeCloseTo(1.32, 2);
  expect(weight70).toBeCloseTo(0.92, 2);
  expect(weightsByScore.get(100).every((item) => item.weight === weight100)).toBe(true);
  expect(weightsByScore.get(70).every((item) => item.weight === weight70)).toBe(true);
  expect(postingAutomaticWeights.reduce((sum, item) => sum + item.weight, 0) / postingAutomaticWeights.length).toBeCloseTo(1, 2);
  expect(weight100).toBeLessThanOrEqual(1.5);
  expect(weight70).toBeGreaterThanOrEqual(0.5);

  await page.locator("#stream-select").selectOption("incumbents");
  const narrowSample = await page.evaluate(() => {
    const salaries = window.CEO_BENCHMARK_DATA.incumbents
      .filter((row) => row.defaultIncluded && row.salary?.base > 0)
      .map((row) => row.salary.base)
      .sort((a, b) => b - a);
    const cutoff = Math.floor(salaries[Math.min(4, salaries.length - 1)] / 5_000) * 5_000;
    return { cutoff, expected: salaries.filter((value) => value >= cutoff).length };
  });
  expect(narrowSample.expected).toBeGreaterThan(0);
  expect(narrowSample.expected).toBeLessThan(20);
  await page.locator("#salary-filter-summary").click();
  await page.locator("#salary-range-min").fill(String(narrowSample.cutoff));
  await expect(page.locator("#stat-n")).toHaveText(String(narrowSample.expected));
  await expect(page.locator("#weight-profile-comparability")).toContainText("equal weights");

  await page.locator("#stream-select").selectOption("combined");
  await balance.check();
  await page.locator("#stream-select").selectOption("incumbents");
  await expect(balance).toBeChecked();
  await expect(balance).toBeDisabled();
  await page.locator("#stream-select").selectOption("combined");
  await expect(balance).toBeChecked();
  await expect(balance).toBeEnabled();
  await page.locator("#stream-select").selectOption("jobAds");
  await expect(auto).toBeChecked();
  await expect(auto).toBeEnabled();
  await expect(balance).toBeChecked();
  await expect(balance).toBeDisabled();
  await expect(page.locator("#weight-profile-comparability")).toContainText("Job postings");
  await expect(page.locator("#weight-profile-comparability")).toContainText("Reviewed similarity score (0–100)");
  await expect(page.locator("#weight-profile-comparability")).toContainText("Automatic weight");
  await expect(page.locator("#auto-target-ess-field")).toBeHidden();
  const postingOnlyWeights = await page.locator("tbody tr[data-id]:not(.is-excluded) .weight-input:not(.is-user-modified)")
    .evaluateAll((inputs) => inputs.map((input) => Number(input.value)));
  expect(postingOnlyWeights.reduce((sum, value) => sum + value, 0) / postingOnlyWeights.length).toBeCloseTo(1, 2);
  await page.reload();
  await expect(page.locator("#stream-select")).toHaveValue("jobAds");
  await expect(auto).toBeChecked();
  await expect(auto).toBeEnabled();
  expect(errors).toEqual([]);
});

test("plot eligibility isolates weights while preserving row intent", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");

  const horizontalAxis = () => page.locator('.axis-variable-control[aria-label^="Change horizontal"]');
  await page.locator('input[name="histogram-axis-mode"][value="ratio"]').check();
  await horizontalAxis().click();
  await page.locator("#axis-denominator").selectOption("position:coo");

  const auto = page.locator('.auto-weight-rule input[value="comparability"]');
  await auto.check();
  const eligibleWeights = async () => page.locator('tbody tr[data-id][data-plot-eligible="true"]')
    .evaluateAll((tableRows) => Object.fromEntries(tableRows.map((row) => [
      row.dataset.id,
      row.querySelector(".weight-input").value,
    ])));
  const baseline = await eligibleWeights();
  expect(Object.keys(baseline).length).toBe(23);

  const ineligibleRow = page.locator('tbody tr[data-id][data-plot-eligible="false"]:has(.row-toggle:checked)').first();
  const ineligibleId = await ineligibleRow.getAttribute("data-id");
  const pinnedIneligibleRow = page.locator(`tbody tr[data-id="${ineligibleId}"]`);
  await pinnedIneligibleRow.locator(".row-toggle").uncheck();
  expect(await eligibleWeights()).toEqual(baseline);
  await pinnedIneligibleRow.locator(".row-toggle").check();
  expect(await eligibleWeights()).toEqual(baseline);

  const savedMultiplier = page.locator(`tbody tr[data-id="${ineligibleId}"] .weight-input`);
  await savedMultiplier.fill("2");
  await savedMultiplier.blur();
  await expect(savedMultiplier).toHaveValue("2");
  await expect(savedMultiplier).toHaveClass(/is-user-modified/);
  expect(await eligibleWeights()).toEqual(baseline);

  await page.locator('input[name="histogram-axis-mode"][value="value"]').check();
  const restoredRow = page.locator(`tbody tr[data-id="${ineligibleId}"]`);
  await expect(restoredRow).toHaveAttribute("data-plot-eligible", "true");
  await expect(restoredRow.locator(".row-toggle")).toBeChecked();
  await expect(restoredRow.locator(".weight-input")).toHaveValue("2");
  await expect(restoredRow.locator(".weight-input")).toHaveClass(/is-user-modified/);

  await page.locator('input[name="chart-view"][value="scatter"]').check();
  const checkedEligible = await page.locator('tbody tr[data-id][data-plot-eligible="true"] .row-toggle:checked').count();
  await expect(page.locator(".scatter-point")).toHaveCount(checkedEligible);
  await expect(page.locator('tbody tr[data-id][data-plot-eligible="false"] .row-toggle:checked')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test("standardized positions switch evidence, labels, controls, and semantic shared state", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");

  const catalog = await page.evaluate(() => window.CEO_BENCHMARK_DATA.positionCatalog || []);
  const positions = new Map(catalog.map((position) => [position.key, position]));
  expect([...positions.keys()]).toEqual([
    "ceo", "vice_president", "program_director", "managing_director", "coo",
    "senior_vice_president", "development_director", "policy_director",
    "communications_director", "senior_researcher", "cfo", "general_counsel",
    "chief_of_staff", "research_director", "finance_director",
  ]);
  expect(catalog.filter((position) => position.key !== "ceo")
    .every((position) => position.supportLevel === "primary")).toBe(true);
  expect(catalog.filter((position) => position.key !== "ceo")
    .every((position) => position.counts.defaultIncluded >= 15 && position.counts.organizations >= 12)).toBe(true);
  for (const staleFamilyKey of ["finance", "operations", "programs", "research"]) {
    expect([...positions.keys()]).not.toContain(staleFamilyKey);
  }
  for (const withheldKey of [
    "deputy_director", "executive_vice_president",
    "chief_development_officer", "chief_people_officer", "chief_economist",
  ]) expect([...positions.keys()]).not.toContain(withheldKey);
  const correctedPublicTitles = await page.evaluate(() => {
    const ids = [
      "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::elenamuehlenbeckcfo",
      "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::liselloyevpcoo",
      "SRC-990-EXT-CENTER-FOR-AI-SAFETY::oliverzhangmanagingdirector",
      "SRC-990-EXT-NEW-ROOTS-INSTITUTE::jessetandlermanaging",
      "SRC-990-EXT-RESEARCH-AMERICA::jenniferluraysrvp",
      "SRC-990-EXT-CENTER-FOR-DEMOCRACY-TECHNOLOGY::georgeslovergencounsel",
      "SRC-990-EXT-PROJECT-DRAWDOWN::reshmapattni",
      "SRC-990-EXT-PROJECT-DRAWDOWN::toodreubold",
    ];
    const rows = Object.entries(window.CEO_BENCHMARK_DATA.positionObservations)
      .flatMap(([position, observations]) => observations.map((row) => ({ ...row, position })));
    return ids.map((id) => {
      const row = rows.find((candidate) => candidate.id === id);
      return {
        id, position: row?.position, executive: row?.executive,
        rawExecutive: row?.rawExecutive, title: row?.title, rawTitle: row?.rawTitle,
        effectiveSource: row?.positionTaxonomy?.effectiveTitleSource,
        classificationSource: row?.positionTaxonomy?.classificationSource?.id || "",
      };
    });
  });
  expect(correctedPublicTitles).toEqual([
    { id: "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::elenamuehlenbeckcfo", position: "cfo", executive: "ELENA MUEHLENBECK", rawExecutive: "ELENA MUEHLENBECK CFO", title: "CFO", rawTitle: "SECRETARY & TREASURER", effectiveSource: "part_vii_person_name_reviewed_spillover", classificationSource: "" },
    { id: "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::liselloyevpcoo", position: "coo", executive: "LISEL LOY", rawExecutive: "LISEL LOY EVP COO", title: "EVP COO", rawTitle: "TREASURER", effectiveSource: "part_vii_person_name_reviewed_spillover", classificationSource: "" },
    { id: "SRC-990-EXT-CENTER-FOR-AI-SAFETY::oliverzhangmanagingdirector", position: "managing_director", executive: "Oliver Zhang", rawExecutive: "Oliver Zhang Managing Director", title: "Managing Director", rawTitle: "Director", effectiveSource: "part_vii_person_name_reviewed_spillover", classificationSource: "" },
    { id: "SRC-990-EXT-NEW-ROOTS-INSTITUTE::jessetandlermanaging", position: "managing_director", executive: "Jesse Tandler", rawExecutive: "Jesse Tandler Managing", title: "Managing Director", rawTitle: "Director", effectiveSource: "part_vii_person_name_reviewed_spillover", classificationSource: "SRC-POSITION-NEW-ROOTS-JESSE-TANDLER" },
    { id: "SRC-990-EXT-RESEARCH-AMERICA::jenniferluraysrvp", position: "senior_vice_president", executive: "JENNIFER LURAY", rawExecutive: "JENNIFER LURAY SR VP", title: "SR VP", rawTitle: "STRATEGY & PUBLIC ENGAGEMENT", effectiveSource: "part_vii_person_name_reviewed_spillover", classificationSource: "" },
    { id: "SRC-990-EXT-CENTER-FOR-DEMOCRACY-TECHNOLOGY::georgeslovergencounsel", position: "general_counsel", executive: "GEORGE SLOVER", rawExecutive: "GEORGE SLOVER - GEN COUNSEL", title: "GEN COUNSEL", rawTitle: "SR. COUNSEL COMP POL. & SECRETARY", effectiveSource: "part_vii_person_name_reviewed_spillover", classificationSource: "" },
    { id: "SRC-990-EXT-PROJECT-DRAWDOWN::reshmapattni", position: "finance_director", executive: "RESHMA PATTNI", rawExecutive: "RESHMA PATTNI", title: "FINANCE DIRECTOR", rawTitle: "FINANCE DIRE", effectiveSource: "schedule_j_reviewed_expansion", classificationSource: "" },
    { id: "SRC-990-EXT-PROJECT-DRAWDOWN::toodreubold", position: "communications_director", executive: "TOOD REUBOLD", rawExecutive: "TOOD REUBOLD", title: "MARKETING DIRECTOR", rawTitle: "MARKETING DI", effectiveSource: "schedule_j_reviewed_expansion", classificationSource: "" },
  ]);
  await expect(page.locator("#position-select option")).toHaveCount(catalog.length);
  await expect(page.locator("#position-selected-label")).toHaveText("CEO");
  const selectedPositionOverlay = await page.locator(".title-position-select").evaluate((shell) => {
    const select = shell.querySelector("select").getBoundingClientRect();
    const label = shell.querySelector("#position-selected-label").getBoundingClientRect();
    return {
      selectCoversLabel: select.left <= label.left && select.right >= label.right
        && select.top <= label.top && select.bottom >= label.bottom,
      selectOpacity: getComputedStyle(shell.querySelector("select")).opacity,
      cursor: getComputedStyle(shell.querySelector("select")).cursor,
    };
  });
  expect(selectedPositionOverlay).toEqual({
    selectCoversLabel: true, selectOpacity: "0", cursor: "pointer",
  });
  for (const position of catalog) {
    await expect(page.locator(`#position-select option[value="${position.key}"]`))
      .toHaveText(`${position.label} (n = ${position.counts.defaultAvailable})`);
  }

  for (const key of ["coo", "program_director", "finance_director"]) {
    const position = positions.get(key);
    let customizedRowId = "";
    const expected = await page.evaluate((positionKey) => {
      const data = window.CEO_BENCHMARK_DATA;
      const observations = data.positionObservations[positionKey];
      return {
        observedCash: observations.filter((row) => row.salary.cash > 0).length,
        defaultCash: observations.filter((row) => row.defaultIncluded && row.salary.cash != null).length,
        defaultBase: observations.filter((row) => row.defaultIncluded && row.salary.base != null).length,
        rpReferences: (data.rpReferencesByPosition[positionKey] || []).length,
      };
    }, key);
    await page.locator("#position-select").selectOption(key);
    await expect(page.locator("#position-select")).toHaveValue(key);
    await expect(page.locator("#position-selected-label")).toHaveText(position.pageLabel);
    await expect(page.locator("#app-title")).toHaveAttribute("aria-label", `${position.pageLabel} salary benchmark`);
    await expect(page).toHaveTitle(`${position.pageLabel} Salary Benchmark · vetr.dev`);
    await expect(page.locator("#position-description")).toContainText(position.description);
    await expect(page.locator("#position-description")).toContainText("equal total influence");
    await expect(page.locator("#evidence-table-panel")).toHaveAttribute(
      "aria-label", `${position.pageLabel} pay table`,
    );
    await expect(page.locator("#stream-select")).toHaveValue("incumbents");
    await expect(page.locator("#stream-select")).toBeDisabled();
    await expect(page.locator('#stream-select option[value="combined"]')).toHaveAttribute("disabled", "");
    await expect(page.locator('#stream-select option[value="jobAds"]')).toHaveAttribute("disabled", "");
    await expect(page.locator("#stream-description")).toContainText("CEO job postings are not mixed");
    await expect(page.locator("#measure-select")).toHaveValue(position.defaultMeasure);
    await expect(page.locator("#adjusted-compensation-term")).toHaveText("Reported pay");
    await expect(page.locator("#reported-compensation-term")).toHaveText("Reported pay");
    await expect(page.locator("#chart-title")).toContainText("Reported pay");
    await expect(page.locator("#stat-n-unit")).toHaveText("records");
    await expect(page.locator("#stat-n")).toHaveText(String(expected.defaultCash));
    await expect(page.locator("tbody tr[data-id]")).toHaveCount(expected.observedCash);
    await expect(page.locator("tbody .rp-reference-row")).toHaveCount(expected.rpReferences);
    await expect(page.locator("tbody tr[data-id] .role-holder").first()).not.toHaveText("");
    await expect(page.locator('.auto-weight-rule input[value="comparability"]')).toBeDisabled();
    await expect(page.locator("#auto-weight-note")).toContainText("Automatic CEO weighting only");
    const sourceTypeWeight = page.locator("#weighting-components input[value='sourceType']");
    await expect(sourceTypeWeight).toBeDisabled();
    await expect(sourceTypeWeight.locator("xpath=..")).toHaveAttribute(
      "title", /only Form 990 records/,
    );
    await expect(page.locator('.stream-balance-rule input[value="streamBalanced"]')).toBeDisabled();
    await expect(page.locator("#weighting-description")).toContainText("equal total influence");
    await expect(page.locator("#weighting-description")).toContainText("Automatic CEO weighting has not yet been extended");
    await expect(page.locator('[data-filter-menu="title"] .filter-group')).not.toHaveCount(0);
    expect(await page.evaluate((positionKey) => {
      const data = window.CEO_BENCHMARK_DATA;
      return data.positionObservations[positionKey].every((row) => row.sourceType !== "Job posting");
    }, key)).toBe(true);
    if (expected.rpReferences) {
      await expect(page.locator(".rp-chart-marker")).toHaveCount(expected.rpReferences);
      await expect(page.locator("tbody .rp-reference-row input")).toHaveCount(0);
      await page.locator(".rp-chart-marker").first().focus();
      await expect(page.locator("#chart-tooltip")).toContainText("RP reference only");
    }

    if (key === "program_director") {
      const firstEvidenceRow = page.locator("tbody tr[data-id]").first();
      const firstEvidenceId = await firstEvidenceRow.getAttribute("data-id");
      const firstEvidence = await page.evaluate(({ positionKey, rowId }) => {
        const row = window.CEO_BENCHMARK_DATA.positionObservations[positionKey].find((item) => item.id === rowId);
        return { cachedSource: row.cachedSource, executive: row.executive, title: row.title };
      }, { positionKey: key, rowId: firstEvidenceId });
      await firstEvidenceRow.getByRole("button", { name: "View" }).click();
      await expect(page.locator("#dialog-meta")).toContainText(firstEvidence.executive);
      await expect(page.locator("#dialog-meta")).toContainText(firstEvidence.title);
      await expect(page.locator("#dialog-cached")).toHaveAttribute("href", firstEvidence.cachedSource);
      await expect(page.locator("#dialog-category-provenance")).toBeVisible();
      await page.locator(".dialog-close").click();

      const automaticOrganizationTotals = async () => page.locator("tbody tr[data-id]:not(.is-excluded)").evaluateAll((tableRows) => {
        const totals = {};
        tableRows.forEach((row) => {
          const organization = row.querySelector(".organization-name").textContent.trim();
          const title = row.querySelector(".weight-input").title;
          const weight = Number(title.match(/(?:Automatic weight|final weight in results): ([\d.]+)/i)?.[1]);
          totals[organization] = (totals[organization] || 0) + weight;
        });
        return totals;
      });
      const unweightedTotals = Object.values(await automaticOrganizationTotals());
      expect(unweightedTotals.length).toBeLessThan(expected.defaultCash);
      expect(Math.max(...unweightedTotals) - Math.min(...unweightedTotals)).toBeLessThanOrEqual(0.04);
      await page.locator('#weighting-components input[value="staff"]').check();
      const staffWeightedTotals = Object.values(await automaticOrganizationTotals());
      expect(Math.max(...staffWeightedTotals) - Math.min(...staffWeightedTotals)).toBeLessThanOrEqual(0.04);
      await page.locator('#weighting-components input[value="staff"]').uncheck();
      await page.locator(".settings-panel").evaluate((panel) => { panel.scrollTop = 0; });
      await page.locator(".table-scroll").evaluate((panel) => { panel.scrollLeft = 0; });
      await page.screenshot({ path: "tmp/app-position-program-director.png", fullPage: true });

      const customTarget = await page.evaluate(() => {
        const rows = window.CEO_BENCHMARK_DATA.positionObservations.program_director
          .filter((row) => row.defaultIncluded && row.salary.cash > 0);
        const counts = rows.reduce((result, row) => ({ ...result, [row.organization]: (result[row.organization] || 0) + 1 }), {});
        const row = rows.find((candidate) => counts[candidate.organization] > 1);
        return { id: row.id, organization: row.organization };
      });
      customizedRowId = customTarget.id;
      const customWeight = page.locator(`tr[data-id="${customTarget.id}"] .weight-input`);
      await customWeight.fill("2");
      await customWeight.blur();
      await expect(page.locator(`tr[data-id="${customTarget.id}"] .weight-input`)).toHaveClass(/is-user-modified/);
      const customizedTotals = await automaticOrganizationTotals();
      const comparisonTotals = Object.entries(customizedTotals)
        .filter(([organization]) => organization !== customTarget.organization)
        .map(([, total]) => total);
      expect(customizedTotals[customTarget.organization]).toBeGreaterThan(Math.max(...comparisonTotals));
      expect(Math.max(...comparisonTotals) - Math.min(...comparisonTotals)).toBeLessThanOrEqual(0.04);
    }

    await page.locator("#measure-select").selectOption("base");
    await expect(page.locator("#stat-n")).toHaveText(String(expected.defaultBase));
    await expect(page.locator("#adjusted-compensation-term")).toHaveText("Base pay");
    await expect(page.locator("#reported-compensation-term")).toHaveText("Base pay");
    await page.locator("#measure-select").selectOption(position.defaultMeasure);
    await expect(page.locator("#stat-n")).toHaveText(String(expected.defaultCash));

    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${key.replaceAll("_", "-")}-salary-benchmark/`);
    expect(new URL(page.url()).searchParams.has("position")).toBe(false);
    if (customizedRowId) await expect.poll(() => new URL(page.url()).searchParams.get("s")).not.toBeNull();
    else await expect.poll(() => new URL(page.url()).searchParams.has("s")).toBe(false);
    const sharedUrl = page.url();
    expect(sharedUrl.length).toBeLessThan(500);
    await page.reload();
    await expect(page.locator("#position-select")).toHaveValue(key);
    await expect(page.locator("#measure-select")).toHaveValue(position.defaultMeasure);
    await expect(page.locator("#app-title")).toHaveAttribute("aria-label", `${position.pageLabel} salary benchmark`);
    if (customizedRowId) {
      await expect(page.locator(`tr[data-id="${customizedRowId}"] .weight-input`)).toHaveValue("2");
      await expect(page.locator(`tr[data-id="${customizedRowId}"] .weight-input`)).toHaveClass(/is-user-modified/);
    }
  }

  await page.locator("#position-select").selectOption("policy_director");
  const supportedClassification = await page.evaluate(() => {
    const row = window.CEO_BENCHMARK_DATA.positionObservations.policy_director
      .find((item) => item.positionTaxonomy?.classificationSource);
    return {
      id: row.id,
      cachedSource: row.positionTaxonomy.classificationSource.cachedSource,
      sourceUrl: row.positionTaxonomy.classificationSource.url,
    };
  });
  const supportedRow = page.locator(`tr[data-id="${supportedClassification.id}"]`);
  await supportedRow.getByRole("button", { name: "View" }).click();
  await page.locator("#dialog-category-provenance").click();
  const titleProvenance = page.locator("#dialog-provenance-records section")
    .filter({ hasText: "Title" });
  await expect(titleProvenance.locator(`a[href="${supportedClassification.cachedSource}"]`)).toBeVisible();
  await expect(titleProvenance.locator(`a[href="${supportedClassification.sourceUrl}"]`)).toBeVisible();
  await page.locator(".dialog-close").click();

  await page.locator("#reset-settings").click();
  await expect(page.locator("#position-select")).toHaveValue("ceo");
  await expect(page.locator("#stream-select")).toHaveValue("combined");
  await expect(page.locator("#stream-select")).toBeEnabled();
  await expect(page.locator("#measure-select")).toHaveValue("base");
  await expect(page.locator("#app-title")).toHaveAttribute("aria-label", "CEO salary benchmark");
  expect(new URL(page.url()).searchParams.has("s")).toBe(false);
  expect(new URL(page.url()).searchParams.has("position")).toBe(false);
  expect(new URL(page.url()).pathname).toBe("/ceo-salary-benchmark/");

  await page.goto("/ceo-salary-benchmark/?position=coo");
  await expect(page.locator("#position-select")).toHaveValue("coo");
  await expect(page.locator("#measure-select")).toHaveValue("cash");
  await expect(page.locator("#stat-n")).toHaveText(String(positions.get("coo").counts.defaultAvailable));
  expect(new URL(page.url()).pathname).toBe("/coo-salary-benchmark/");
  expect(new URL(page.url()).searchParams.has("position")).toBe(false);
  expect(new URL(page.url()).searchParams.has("s")).toBe(false);
  expect(errors).toEqual([]);
});

test("empirical percentile labels remain separated at common browser zooms", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.evaluate(() => document.fonts?.ready);
  await page.locator('input[name="distribution"][value="empirical"]').check();
  await page.locator("#quantile-granularity").selectOption("deciles");

  for (const zoom of [1, 1.25, 1.5, 1]) {
    await page.evaluate((value) => {
      document.body.style.zoom = String(value);
      window.dispatchEvent(new Event("resize"));
    }, zoom);
    await page.waitForTimeout(180);
    if (zoom === 1.5) {
      await page.locator(".chart-panel").screenshot({ path: "tmp/app-empirical-quantiles-zoom-150.png" });
    }
    const geometry = await page.locator("#salary-chart").evaluate((svg) => {
      const svgBox = svg.getBoundingClientRect();
      const guides = [...svg.querySelectorAll(".empirical-quantile-guide")]
        .map((guide) => guide.getBoundingClientRect());
      const labels = [...svg.querySelectorAll(".empirical-quantile-mark")]
        .map((mark) => {
          const box = mark.getBoundingClientRect();
          const percentile = mark.querySelector(".percentile").getBoundingClientRect();
          const amount = mark.querySelector(".amount").getBoundingClientRect();
          const center = box.left + box.width / 2;
          const guide = guides.reduce((nearest, candidate) => (
            !nearest || Math.abs(candidate.left - center) < Math.abs(nearest.left - center)
              ? candidate : nearest
          ), null);
          return {
            left: box.left,
            right: box.right,
            targetLineInset: Number(mark.dataset.lineInsetPx),
            percentileBottom: percentile.bottom,
            amountTop: amount.top,
            amountBottom: amount.bottom,
            guideTop: guide?.top ?? Number.NEGATIVE_INFINITY,
          };
        })
        .sort((first, second) => first.left - second.left);
      return { svgLeft: svgBox.left, svgRight: svgBox.right, labels };
    });
    expect(geometry.labels.length).toBeGreaterThan(1);
    geometry.labels.forEach((label, index) => {
      expect(label.left).toBeGreaterThanOrEqual(geometry.svgLeft + 1);
      expect(label.right).toBeLessThanOrEqual(geometry.svgRight - 1);
      const lineInset = label.percentileBottom - label.amountTop;
      expect(lineInset).toBeGreaterThanOrEqual(3.75);
      expect(lineInset).toBeLessThanOrEqual(6.25);
      expect(Math.abs(lineInset - label.targetLineInset)).toBeLessThanOrEqual(0.35);
      expect(label.guideTop - label.amountBottom).toBeGreaterThanOrEqual(-6);
      expect(label.guideTop - label.amountBottom).toBeLessThanOrEqual(0);
      if (index) {
        expect(label.left).toBeGreaterThanOrEqual(geometry.labels[index - 1].right + 5);
      }
    });
  }
  expect(errors).toEqual([]);
});

test("fitted percentile labels retain compact line spacing at common browser zooms", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.evaluate(() => document.fonts?.ready);

  for (const distribution of ["lognormal", "gamma"]) {
    await page.locator(`input[name="distribution"][value="${distribution}"]`).check();
    for (const zoom of [1, 1.25, 1.5, 1]) {
      await page.evaluate((value) => {
        document.body.style.zoom = String(value);
        window.dispatchEvent(new Event("resize"));
      }, zoom);
      await page.waitForTimeout(180);
      const spacing = await page.locator(".curve-quantile-mark").evaluateAll((marks) => marks.map((mark) => {
        const percentile = mark.querySelector(".percentile");
        const amount = mark.querySelector(".amount");
        const percentileBox = percentile.getBBox();
        const amountBox = amount.getBBox();
        const matrix = mark.getScreenCTM();
        const scale = Math.hypot(matrix.c, matrix.d);
        return {
          actual: (percentileBox.y + percentileBox.height - amountBox.y) * scale,
          target: Number(mark.dataset.lineInsetPx),
          separation: Number(mark.dataset.lineSeparationPx),
          renderedLineHeight: Math.min(percentileBox.height, amountBox.height) * scale,
          transform: mark.getAttribute("transform"),
        };
      }));
      expect(spacing.length).toBeGreaterThan(1);
      spacing.forEach((label) => {
        expect(label.actual).toBeGreaterThanOrEqual(0.5);
        expect(label.actual).toBeLessThanOrEqual(3.25);
        expect(Math.abs(label.actual - label.target)).toBeLessThanOrEqual(0.35);
        expect(Math.abs(label.separation - label.renderedLineHeight * 0.25)).toBeLessThanOrEqual(0.35);
        expect(label.transform).toMatch(/translate\(.+\) rotate\(-?\d/);
      });
      if (distribution === "gamma" && zoom === 1.5) {
        await page.locator(".chart-panel").screenshot({ path: "tmp/app-gamma-quantiles-zoom-150.png" });
      }
    }
  }
  expect(errors).toEqual([]);
});

test("named scenarios preserve analytical snapshots and compare side by side", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.evaluate(() => localStorage.removeItem("rp-salary-benchmark.scenarios.v1"));
  await page.reload();

  const quantilesTab = page.getByRole("tab", { name: "Quantiles" });
  await quantilesTab.focus();
  await quantilesTab.press("End");
  await expect(page.getByRole("tab", { name: "Robustness" })).toBeFocused();
  await page.getByRole("tab", { name: "Robustness" }).press("Home");
  await expect(quantilesTab).toBeFocused();

  await page.getByRole("tab", { name: /Compare/ }).click();
  await page.locator("#scenario-name").fill("Recommended model");
  await page.getByRole("button", { name: "Save current" }).click();
  await expect(page.locator("#scenario-count")).toHaveText("1 / 4 saved");

  await page.locator("#sample-select").selectOption("sensitivity");
  await page.locator('input[name="distribution"][value="empirical"]').check();
  await page.locator('.weighting-field input[value="comparability"]').check();
  await page.getByRole("tab", { name: /Compare/ }).click();
  await page.locator("#scenario-name").fill("Broader empirical");
  await page.getByRole("button", { name: "Save current" }).click();

  await expect(page.locator(".scenario-name-input")).toHaveCount(2);
  await expect(page.locator("#scenario-count")).toHaveText("2 / 4 saved");
  const medianRow = page.locator(".scenario-table tbody tr").filter({ has: page.getByRole("rowheader", { name: "Median" }) });
  const medianValues = await medianRow.locator(".scenario-metric-value").allTextContents();
  expect(medianValues).toHaveLength(2);
  expect(medianValues[0]).not.toBe(medianValues[1]);
  await expect(medianRow.locator("td").first().locator(".scenario-delta")).toHaveCount(0);
  await expect(medianRow.locator("td").nth(1)).toHaveAttribute("headers", /scenario-metric-\d+ scenario-column-1/);
  await expect(page.getByRole("button", { name: "Apply Recommended model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update with current Broader empirical" })).toBeDisabled();
  await expect(page.locator(".scenario-table thead th").nth(2)).toContainText("Current analysis");
  await page.locator(".results-panel").screenshot({ path: "tmp/app-scenario-comparison.png" });

  await page.locator("#bin-count").fill("47");
  await page.locator("#chart-color").selectOption("topic");
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await expect(page.locator(".scenario-table thead th").nth(2)).toContainText("Current analysis");

  await page.getByRole("button", { name: "Apply Recommended model" }).click();
  await expect(page.locator("#sample-select")).toHaveValue("primary");
  await expect(page.locator('input[name="distribution"][value="lognormal"]')).toBeChecked();
  await expect(page.locator('.weighting-field input[value="comparability"]')).not.toBeChecked();
  await expect(page.locator('input[name="chart-view"][value="scatter"]')).toBeChecked();
  await expect(page.locator("#bin-count")).toHaveValue("47");
  await expect(page.locator("#chart-color")).toHaveValue("topic");

  await page.reload();
  await page.getByRole("tab", { name: /Compare/ }).click();
  await expect(page.locator(".scenario-name-input")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("scenario deltas do not compare different pay definitions", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.evaluate(() => localStorage.removeItem("rp-salary-benchmark.scenarios.v1"));
  await page.reload();
  await page.locator("#stream-select").selectOption("incumbents");
  await page.getByRole("tab", { name: /Compare/ }).click();
  await page.locator("#scenario-name").fill("Base pay");
  await page.getByRole("button", { name: "Save current" }).click();
  await page.locator("#measure-select").selectOption("cash");
  await page.getByRole("tab", { name: /Compare/ }).click();
  await page.locator("#scenario-name").fill("Reported cash");
  await page.getByRole("button", { name: "Save current" }).click();
  const medianRow = page.locator(".scenario-table tbody tr").filter({ has: page.getByRole("rowheader", { name: "Median" }) });
  await expect(medianRow.locator("td").nth(1)).toContainText("Different quantity or pay definition");
  expect(errors).toEqual([]);
});

test("invalid saved scenarios are skipped without changing the analysis", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  const median = await page.locator("#stat-center").textContent();
  await page.evaluate(() => localStorage.setItem("rp-salary-benchmark.scenarios.v1", JSON.stringify({
    version: 1,
    scenarios: [{
      id: "broken", name: "Broken", position: "ceo", encodedState: "not-valid-base64",
      summary: { p25: 1, p50: 2, p75: 3, effectiveN: 4, formatted: {} },
    }],
  })));
  await page.reload();
  await expect(page.locator("#stat-center")).toHaveText(median || "");
  await page.getByRole("tab", { name: /Compare/ }).click();
  await expect(page.locator("#scenario-status")).toContainText("invalid saved scenario was skipped");
  await expect(page.locator(".scenario-name-input")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("robustness dashboard evaluates comparable and separate sensitivity families", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  const before = {
    url: page.url(),
    median: await page.locator("#stat-center").textContent(),
    records: await page.locator("#stat-n").textContent(),
  };

  await page.getByRole("tab", { name: "Robustness" }).click();
  await expect(page.locator("#results-panel-robustness")).toContainText("not confidence intervals");
  await page.getByRole("button", { name: "Run check" }).click();
  await expect(page.locator("#robustness-status")).toContainText(/specifications produced usable results/);

  const rows = page.locator(".robustness-table tbody tr");
  await expect(rows).toHaveCount(36);
  await expect(rows.filter({ hasText: /^Core/ })).toHaveCount(24);
  await expect(rows.filter({ hasText: /^Pay source/ })).toHaveCount(4);
  await expect(rows.filter({ hasText: /^Pay measure/ })).toHaveCount(3);
  await expect(rows.filter({ hasText: /^Ad range/ })).toHaveCount(3);
  await expect(rows.filter({ hasText: /^Dollar basis/ })).toHaveCount(2);
  await expect(page.locator(".robustness-summary")).toContainText("Median range");
  const robustnessSvg = page.locator(".robustness-figure svg");
  await expect(robustnessSvg).toBeVisible();
  await expect(robustnessSvg).toHaveAttribute("aria-describedby", "robustness-chart-description");
  await expect(page.locator("#robustness-chart-description")).toContainText("current salary specification");
  await expect(page.locator("#robustness-results")).not.toHaveAttribute("aria-live", /.+/);
  await page.locator(".results-panel").screenshot({ path: "tmp/app-robustness-dashboard.png" });

  expect(page.url()).toBe(before.url);
  expect(await page.locator("#stat-center").textContent()).toBe(before.median);
  expect(await page.locator("#stat-n").textContent()).toBe(before.records);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tab", { name: "Robustness" })).toBeVisible();
  await expect.poll(async () => page.locator(".robustness-label").first().evaluate((label) => {
    const transform = label.getScreenCTM();
    return Number.parseFloat(getComputedStyle(label).fontSize) * Math.abs(transform?.a || 0);
  })).toBeGreaterThanOrEqual(10.5);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.locator(".results-panel").screenshot({ path: "tmp/app-robustness-mobile.png" });
  expect(errors).toEqual([]);
});

test("each completed robustness check expands results once without overriding later manual resizing", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/ceo-salary-benchmark/");

  const results = page.locator("#results-panel");
  const divider = page.locator("#results-panel-resizer");
  await page.getByRole("tab", { name: "Robustness" }).click();
  await page.getByRole("button", { name: "Run check" }).click();
  await expect(page.locator("#robustness-status")).toContainText(/specifications produced usable results/);
  await expect.poll(async () => (await results.boundingBox()).height).toBeGreaterThanOrEqual(495);
  expect((await results.boundingBox()).height).toBeLessThanOrEqual(505);
  await page.locator("#analysis-column").screenshot({ path: "tmp/app-robustness-auto-expanded.png" });

  const storedAfterRun = await page.evaluate(() => JSON.parse(localStorage.getItem("rp-salary-benchmark.layout.v1")));
  expect(storedAfterRun.results).toBeGreaterThan(0.5);
  await divider.focus();
  await page.keyboard.press("ArrowDown");
  const manuallyResizedHeight = (await results.boundingBox()).height;
  expect(manuallyResizedHeight).toBeLessThan(490);

  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect.poll(async () => Math.abs((await results.boundingBox()).height - manuallyResizedHeight)).toBeLessThanOrEqual(2);

  const robustnessPoint = page.locator(
    '.robustness-spec-point[data-spec-id="core-clean-gamma-automatic"][data-quantile="q50"]',
  );
  await robustnessPoint.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#robustness-status")).toContainText(/^Applied /);
  await expect.poll(async () => Math.abs((await results.boundingBox()).height - manuallyResizedHeight)).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Run check" }).click();
  await expect.poll(async () => (await results.boundingBox()).height).toBeGreaterThanOrEqual(495);
  expect((await results.boundingBox()).height).toBeLessThanOrEqual(505);
  expect(errors).toEqual([]);
});

test("robustness points explain and apply their salary specifications", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.locator('input[name="histogram-axis-mode"][value="ratio"]').check();
  await expect(page.locator("#chart-title")).toContainText("Salary / Expenses");

  await page.getByRole("tab", { name: "Robustness" }).click();
  await page.getByRole("button", { name: "Run check" }).click();
  await expect(page.locator("#robustness-status")).toContainText(/specifications produced usable results/);

  const audit = page.locator(".robustness-audit");
  const auditSummary = audit.locator("summary");
  const auditTableWrap = audit.locator(".robustness-table-wrap");
  await expect(audit).not.toHaveAttribute("open", "");
  await auditSummary.focus();
  await page.keyboard.press("Enter");
  await expect(audit).toHaveAttribute("open", "");
  await expect(auditSummary).toHaveAttribute("aria-expanded", "true");
  await expect(auditSummary).toContainText(/^Hide all \d+ specifications$/);
  await expect(auditTableWrap).toBeVisible();
  await expect(audit.locator("tbody tr")).toHaveCount(36);
  await expect.poll(() => auditTableWrap.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return Math.max(0, Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, 0));
  })).toBeGreaterThan(100);
  await page.locator(".results-panel").screenshot({ path: "tmp/app-robustness-audit-open.png" });
  await expect(auditSummary).toBeFocused();
  await page.setViewportSize({ width: 1320, height: 860 });
  await expect(audit).toHaveAttribute("open", "");
  await expect(auditSummary).toBeFocused();
  await auditTableWrap.focus();
  await expect(auditTableWrap).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect.poll(() => auditTableWrap.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await auditTableWrap.evaluate((node) => { node.scrollLeft = 120; });
  await expect.poll(() => auditTableWrap.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  const auditScroll = await auditTableWrap.evaluate((node) => ({ top: node.scrollTop, left: node.scrollLeft }));
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(audit).toHaveAttribute("open", "");
  await expect(auditSummary).toHaveAttribute("aria-expanded", "true");
  await expect(auditTableWrap).toBeFocused();
  const resizedAuditMaximums = await auditTableWrap.evaluate((node) => ({
    top: node.scrollHeight - node.clientHeight,
    left: node.scrollWidth - node.clientWidth,
  }));
  await expect.poll(() => auditTableWrap.evaluate((node) => node.scrollTop))
    .toBeGreaterThanOrEqual(Math.min(auditScroll.top, resizedAuditMaximums.top));
  await expect.poll(() => auditTableWrap.evaluate((node) => node.scrollLeft))
    .toBeGreaterThanOrEqual(Math.min(auditScroll.left, resizedAuditMaximums.left));
  await auditSummary.click();
  await expect(audit).not.toHaveAttribute("open", "");
  await expect(auditSummary).toHaveAttribute("aria-expanded", "false");
  await expect(auditSummary).toContainText(/^View all \d+ specifications$/);
  await expect(auditTableWrap).not.toBeVisible();

  const target = page.locator(
    '.robustness-spec-point[data-spec-id="core-clean-gamma-automatic"][data-quantile="q50"]',
  );
  const expectedMedian = await page.locator(".robustness-table tbody tr")
    .filter({ hasText: "Similar organization types · Gamma · Automatic" })
    .locator("td").nth(2).textContent();
  await expect(target).toHaveAttribute("role", "button");
  await expect(target).toHaveAttribute("aria-label", /Median \$[\d,]+.*records from .*organizations.*Select to apply/);
  await expect(page.locator('.robustness-spec-point[tabindex="0"], .robustness-current-point[tabindex="0"]')).toHaveCount(3);
  const nearbyPointCount = await page.locator('.robustness-spec-point[data-quantile="q50"]').evaluateAll((groups, id) => {
    const points = groups.map((group) => {
      const circle = group.querySelector(".robustness-point");
      return { id: group.dataset.specId, x: Number(circle?.getAttribute("cx")), y: Number(circle?.getAttribute("cy")) };
    });
    const selected = points.find((point) => point.id === id);
    return points.filter((point) => point !== selected && Math.hypot(point.x - selected.x, point.y - selected.y) < 18).length;
  }, "core-clean-gamma-automatic");
  expect(nearbyPointCount).toBeGreaterThan(0);

  const overlay = page.locator(".robustness-pointer-overlay");
  const pointBox = await target.locator(".robustness-point").boundingBox();
  const overlayBox = await overlay.boundingBox();
  expect(pointBox).not.toBeNull();
  expect(overlayBox).not.toBeNull();
  const targetPosition = {
    x: pointBox.x + pointBox.width / 2 - overlayBox.x,
    y: pointBox.y + pointBox.height / 2 - overlayBox.y,
  };
  await overlay.hover({ position: targetPosition });
  const tooltip = page.locator("#robustness-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Similar organization types");
  await expect(tooltip).toContainText("Gamma");
  await expect(tooltip).toContainText("Automatic");
  await expect(tooltip).toContainText(/\d+ records · \d+ organizations · effective n/);
  await expect(tooltip.locator('[data-setting="sample"]')).toHaveAttribute("data-changed", "true");
  await expect(tooltip.locator('[data-setting="distribution"]')).toHaveAttribute("data-changed", "true");
  await expect(tooltip.locator('[data-setting="weighting"]')).toHaveAttribute("data-changed", "true");
  await expect(tooltip.locator('[data-setting="source"]')).toHaveAttribute("data-changed", "false");
  await expect(tooltip.locator('[data-setting="measure"]')).toHaveAttribute("data-changed", "false");
  await expect(tooltip.locator('[data-setting="basis"]')).toHaveAttribute("data-changed", "false");
  await expect(tooltip.locator('[data-setting="filters"]')).toHaveAttribute("data-changed", "false");
  await expect(tooltip.locator(".robustness-change-tag")).toHaveCount(3);
  await expect(tooltip.locator(".robustness-change-tag")).toHaveText(["Δ", "Δ", "Δ"]);
  await expect(tooltip.locator(".robustness-change-tag").first()).toHaveAttribute(
    "aria-label", "Changed from the current view",
  );
  await expect(tooltip.locator('[data-setting="sample"] dt')).toHaveText("Sample Δ");
  await expect(tooltip.locator('[data-setting="sample"] dd del')).toHaveText("Recommended peers");
  await expect(tooltip.locator('[data-setting="sample"] dd strong')).toHaveText("Similar organization types");
  await expect(tooltip.locator('[data-setting="sample"] .robustness-diff-arrow')).toHaveText("→");
  await expect(tooltip.locator('[data-setting="sample"] .robustness-diff-arrow')).toHaveAttribute("aria-hidden", "true");
  await expect(tooltip.locator('[data-setting="sample"] dd')).toHaveAttribute(
    "aria-label", "Current: Recommended peers. Selected: Similar organization types.",
  );
  await expect(tooltip.locator('[data-setting="source"] dd del')).toHaveCount(0);
  await expect(tooltip).toContainText("Δ marks settings that differ");
  await page.screenshot({ path: "tmp/app-robustness-tooltip.png" });
  await page.locator(".robustness-current-point").nth(1).focus();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("This is the current analysis");
  await expect(tooltip.locator('[data-changed="true"]')).toHaveCount(0);
  await target.focus();
  await page.keyboard.press("ArrowRight");
  await expect(target).not.toBeFocused();
  await target.focus();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();

  await overlay.click({ position: targetPosition });
  await expect(page.locator("#sample-select")).toHaveValue("clean");
  await expect(page.locator('input[name="distribution"][value="gamma"]')).toBeChecked();
  await expect(page.locator('.weighting-field input[value="comparability"]')).toBeChecked();
  await expect(page.locator('input[name="histogram-axis-mode"][value="value"]')).toBeChecked();
  await expect(page.locator("#chart-title")).toContainText("Distribution of Salary");
  await expect(page.locator("#stat-center")).toHaveText(expectedMedian || "");
  await expect(page.locator("#robustness-status")).toContainText("Applied Similar organization types");

  const keyboardTarget = page.locator(
    '.robustness-spec-point[data-spec-id="core-primary-empirical-equal"][data-quantile="q50"]',
  );
  await keyboardTarget.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sample-select")).toHaveValue("primary");
  await expect(page.locator('input[name="distribution"][value="empirical"]')).toBeChecked();
  await expect(page.locator('.weighting-field input[value="comparability"]')).not.toBeChecked();
  await expect(keyboardTarget).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(page.locator("#sample-select")).toHaveValue("clean");
  await expect(page.locator('input[name="distribution"][value="gamma"]')).toBeChecked();
  await expect(page.locator('.weighting-field input[value="comparability"]')).toBeChecked();
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("#sample-select")).toHaveValue("primary");
  await expect(page.locator('input[name="distribution"][value="empirical"]')).toBeChecked();
  await expect(page.locator('.weighting-field input[value="comparability"]')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("robustness change markers follow live filters and row choices", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");

  const tierSummary = page.locator('[data-filter-menu="tier"] summary');
  const tierOptions = page.locator('[data-filter-menu="tier"] .filter-options input');
  expect(await tierOptions.count()).toBeGreaterThan(1);
  await tierSummary.click();
  await tierOptions.nth(0).uncheck();
  await tierSummary.click();

  await page.getByRole("tab", { name: "Robustness" }).click();
  await page.getByRole("button", { name: "Run check" }).click();
  const tooltip = page.locator("#robustness-tooltip");
  const matchingTarget = page.locator(
    '.robustness-spec-point[data-spec-id="core-primary-lognormal-equal"][data-quantile="q50"]',
  );
  await matchingTarget.focus();
  await expect(tooltip.locator('[data-setting="sample"]')).toHaveAttribute("data-changed", "false");
  await expect(tooltip.locator('[data-setting="filters"]')).toHaveAttribute("data-changed", "false");
  const initialCurrentLabel = await page.locator(".robustness-current-point").nth(1).getAttribute("aria-label");
  await page.locator('input[name="distribution"][value="gamma"]').check();
  await expect(page.locator(".robustness-current-point").nth(1))
    .not.toHaveAttribute("aria-label", initialCurrentLabel || "");
  await page.locator('input[name="distribution"][value="lognormal"]').check();
  await expect(page.locator(".robustness-current-point").nth(1))
    .toHaveAttribute("aria-label", initialCurrentLabel || "");
  await expect(page.locator("#robustness-status")).toContainText(/specifications produced usable results/);

  await tierSummary.click();
  await tierOptions.nth(0).check();
  await tierOptions.nth(1).uncheck();
  await tierSummary.click();
  await matchingTarget.focus();
  await expect(tooltip.locator('[data-setting="filters"]')).toHaveAttribute("data-changed", "true");
  await expect(tooltip.locator('[data-setting="sample"]')).toHaveAttribute("data-changed", "false");
  const filterDiff = tooltip.locator('[data-setting="filters"] dd');
  await expect(filterDiff.locator("del")).toBeVisible();
  await expect(filterDiff.locator("strong")).toBeVisible();
  const filterValues = await filterDiff.locator("del, strong").allTextContents();
  expect(filterValues[0]).not.toBe(filterValues[1]);

  await page.locator('.weighting-field input[value="comparability"]').check();
  await page.locator("#auto-target-ess").fill("45");
  const automaticTarget = page.locator(
    '.robustness-spec-point[data-spec-id="core-primary-lognormal-automatic"][data-quantile="q50"]',
  );
  await automaticTarget.focus();
  await expect(tooltip.locator('[data-setting="weighting"] dd del')).toContainText("target eff. n 45");
  await expect(tooltip.locator('[data-setting="weighting"] dd strong')).toContainText("target eff. n 35");
  await page.locator('.weighting-field input[value="comparability"]').uncheck();

  const selectedRow = page.locator('tbody tr[data-id][data-plot-eligible="true"] .row-toggle:checked').first();
  const selectedRowId = await selectedRow.locator("xpath=ancestor::tr").getAttribute("data-id");
  await page.locator(`tbody tr[data-id="${selectedRowId}"] .row-toggle`).uncheck();
  await matchingTarget.focus();
  await expect(tooltip.locator('[data-setting="sample"]')).toHaveAttribute("data-changed", "true");
  await expect(tooltip.locator('[data-setting="sample"] dd del')).toContainText("row choice");
  await expect(tooltip.locator('[data-setting="sample"] dd strong')).toHaveText("Recommended peers");

  const currentMedianPoint = page.locator(".robustness-current-point").nth(1);
  const lognormalCurrentLabel = await currentMedianPoint.getAttribute("aria-label");
  await page.locator('input[name="distribution"][value="gamma"]').check();
  const liveGammaTarget = page.locator(
    '.robustness-spec-point[data-spec-id="core-primary-gamma-equal"][data-quantile="q50"]',
  );
  await liveGammaTarget.focus();
  await expect(tooltip.locator('[data-setting="distribution"]')).toHaveAttribute("data-changed", "false");
  await expect(currentMedianPoint).toHaveAttribute("aria-label", /current salary specification/i);
  await expect(currentMedianPoint).not.toHaveAttribute("aria-label", lognormalCurrentLabel || "");
  await currentMedianPoint.focus();
  await expect(tooltip).toContainText("This is the current analysis");
  await expect(tooltip.locator('[data-changed="true"]')).toHaveCount(0);
  await page.locator("#position-select").selectOption("coo");
  await expect(page.locator("#robustness-results")).toBeEmpty();
  await expect(page.locator("#robustness-status")).toHaveText(
    "Run the check to compare the selected alternatives for the current position.",
  );
  expect(errors).toEqual([]);
});

test("robustness current marker honors row choices and pay-source checks ignore the pay-source filter", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  const eligibleRows = page.locator('tbody tr[data-id][data-plot-eligible="true"] .row-toggle:checked');
  await expect(eligibleRows).not.toHaveCount(0);
  const selectedRowId = await eligibleRows.first().locator("xpath=../..").getAttribute("data-id");
  await page.locator(`tbody tr[data-id="${selectedRowId}"] .row-toggle`).uncheck();

  await page.locator('[data-filter-menu="sourceType"] summary').click();
  await page.locator('[data-filter-menu="sourceType"] .filter-options label').filter({ hasText: /^Job posting$/ }).locator("input").uncheck();
  const currentRecordCount = Number(await page.locator("#stat-n").textContent());
  await page.getByRole("tab", { name: "Robustness" }).click();
  await page.getByRole("button", { name: "Run check" }).click();
  await expect(page.locator("#robustness-status")).toContainText(/specifications produced usable results/);
  await expect(page.locator("#robustness-chart-description")).toContainText("based on " + currentRecordCount + " records");
  const postingSourceRow = page.locator(".robustness-table tbody tr").filter({ hasText: "Job-posting midpoint" });
  await expect(postingSourceRow.locator("td").nth(2)).not.toHaveText("—");
  await expect(page.locator(".robustness-table tbody")).toContainText("Automatic (target eff. n 35)");
  expect(errors).toEqual([]);
});

test("benchmark changes can be undone and redone without replacing native field undo", async ({ page }) => {
  await page.goto("/ceo-salary-benchmark/");
  const undo = () => page.keyboard.press("Control+z");
  const redo = () => page.keyboard.press("Control+Shift+z");

  const selectedRow = page.locator('tbody tr[data-id][data-plot-eligible="true"] .row-toggle:checked').first();
  const selectedRowId = await selectedRow.locator("xpath=ancestor::tr").getAttribute("data-id");
  const selectedRowToggle = () => page.locator(`tbody tr[data-id="${selectedRowId}"] .row-toggle`);

  await page.locator('input[name="distribution"][value="gamma"]').check();
  await page.locator('input[name="chart-view"][value="scatter"]').check();
  await page.locator('thead button[data-sort="expenses"]').click();
  await selectedRowToggle().uncheck();
  await expect(selectedRowToggle()).not.toBeChecked();

  await undo();
  await expect(selectedRowToggle()).toBeChecked();
  await undo();
  await expect(page.locator('thead button[data-sort="tier"]').locator("xpath=ancestor::th"))
    .toHaveAttribute("aria-sort", "ascending");
  await undo();
  await expect(page.locator('input[name="chart-view"][value="histogram"]')).toBeChecked();
  await undo();
  await expect(page.locator('input[name="distribution"][value="lognormal"]')).toBeChecked();

  await redo();
  await expect(page.locator('input[name="distribution"][value="gamma"]')).toBeChecked();
  await redo();
  await expect(page.locator('input[name="chart-view"][value="scatter"]')).toBeChecked();
  await redo();
  await expect(page.locator('thead button[data-sort="expenses"]').locator("xpath=ancestor::th"))
    .toHaveAttribute("aria-sort", "ascending");
  await redo();
  await expect(selectedRowToggle()).not.toBeChecked();

  await undo();
  await expect(selectedRowToggle()).toBeChecked();
  await page.locator("#sample-select").selectOption("clean");
  await redo();
  await expect(page.locator("#sample-select")).toHaveValue("clean");
  await expect(selectedRowToggle()).toBeChecked();

  await page.locator('input[name="chart-view"][value="histogram"]').check();
  const originalBins = await page.locator("#bin-count").inputValue();
  await page.locator("#bin-count").evaluate((input) => {
    [41, 42, 43].forEach((value) => {
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#bin-count")).toHaveValue("43");
  await undo();
  await expect(page.locator("#bin-count")).toHaveValue(originalBins);
  await undo();
  await expect(page.locator('input[name="chart-view"][value="scatter"]')).toBeChecked();

  const editableWeight = page.locator("tbody .weight-input:not(:disabled)").first();
  const weightBefore = await editableWeight.inputValue();
  await editableWeight.fill("2");
  await page.keyboard.press("Control+z");
  await expect(editableWeight).toHaveValue(weightBefore);
  await expect(page.locator("#sample-select")).toHaveValue("clean");

  await page.locator("#sample-select").focus();
  await page.keyboard.press("Control+y");
  await expect(page.locator('input[name="chart-view"][value="histogram"]')).toBeChecked();
  await page.keyboard.press("Meta+z");
  await expect(page.locator('input[name="chart-view"][value="scatter"]')).toBeChecked();
  await page.keyboard.press("Meta+Shift+z");
  await expect(page.locator('input[name="chart-view"][value="histogram"]')).toBeChecked();

  await page.goto("/ceo-salary-benchmark/");
  await page.locator("#quantile-granularity").selectOption("custom");
  const customQuantiles = page.locator("#custom-quantiles");
  const originalCustomQuantiles = await customQuantiles.inputValue();
  await customQuantiles.focus();
  await page.keyboard.press("End");
  await page.keyboard.type(", 90");
  await expect(customQuantiles).not.toHaveValue(originalCustomQuantiles);
  for (let attempt = 0; attempt < 8 && await customQuantiles.inputValue() !== originalCustomQuantiles; attempt += 1) {
    await page.keyboard.press("Control+z");
  }
  await expect(customQuantiles).toHaveValue(originalCustomQuantiles);
  await customQuantiles.focus();
  await page.keyboard.press("End");
  await page.keyboard.type(", 80");
  await expect(customQuantiles).not.toHaveValue(originalCustomQuantiles);
  await page.locator("#quantile-granularity").focus();
  await page.keyboard.press("Control+z");
  await expect(customQuantiles).toHaveValue(originalCustomQuantiles);
  await expect(page.locator("#quantile-granularity")).toHaveValue("custom");
  await page.locator("#quantile-granularity").focus();
  await page.keyboard.press("Control+z");
  await expect(page.locator("#quantile-granularity")).toHaveValue("quintiles");
});

test("non-CEO robustness omits unsupported source and automatic-weight alternatives", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/coo-salary-benchmark/");
  await page.getByRole("tab", { name: "Robustness" }).click();
  await expect(page.locator('#robustness-weighting-option input')).toBeDisabled();
  await expect(page.locator('#robustness-source-option input')).toBeDisabled();
  await expect(page.locator('#robustness-posting-option input')).toBeDisabled();
  await page.getByRole("button", { name: "Run check" }).click();
  await expect(page.locator("#robustness-status")).toContainText(/specifications produced usable results/);
  const rows = page.locator(".robustness-table tbody tr");
  await expect(rows).toHaveCount(17);
  await expect(rows.filter({ hasText: /^Core/ })).toHaveCount(12);
  await expect(rows.filter({ hasText: /^Pay measure/ })).toHaveCount(3);
  await expect(rows.filter({ hasText: /^Dollar basis/ })).toHaveCount(2);
  await expect(rows.filter({ hasText: /^Pay source|^Ad range/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
