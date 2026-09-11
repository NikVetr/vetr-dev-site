const { test, expect } = require("@playwright/test");

test("expanded roles expose evidence, routes, and salary axes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack));
  await page.goto("/ceo-salary-benchmark/");
  const additions = await page.evaluate(() => window.CEO_BENCHMARK_DATA.positionCatalog.filter((p) => p.expansion));
  expect(additions.map((p) => p.key)).toEqual([
    "chief_economist", "communications_executive", "controller", "development_executive",
    "executive_vice_president", "finance_executive", "finance_manager", "legal_director",
    "operations_director", "operations_executive", "operations_manager", "operations_staff", "people_director",
    "people_executive", "policy_executive", "program_executive", "program_officer",
    "program_project_manager", "research_executive", "research_manager", "research_program_manager", "researcher",
  ]);
  for (const position of additions) {
    await page.locator("#position-select").selectOption(position.key);
    await expect(page.locator("#position-selected-label")).toHaveText(position.pageLabel);
    await expect(page).toHaveURL(new RegExp(`/${position.key.replaceAll("_", "-")}-salary-benchmark/`));
    await expect(page.locator("#stat-n")).not.toHaveText("0");
    await page.locator('.axis-variable-control[aria-label^="Change horizontal"]').click();
    const parent = await page.evaluate(key => window.CEO_BENCHMARK_DATA.positionCatalog.find(p => p.memberPositionKeys?.includes(key))?.key, position.key);
    await expect(page.locator(`#axis-numerator option[value="position:${parent || position.key}"]`)).toHaveCount(1);
    if (parent) await expect(page.locator(`#axis-numerator option[value="position:${position.key}"]`)).toHaveCount(0);
    await page.locator("#axis-selector-close").click();
  }
  await page.locator("#position-select").selectOption("people_director");
  await expect(page.locator('input[name="dollar-basis"][value="adjusted"]')).toBeChecked();
  await page.screenshot({ path: "tmp/round12-review/people-director-desktop.png", fullPage: true });
  await page.reload();
  await expect(page.locator("#position-select")).toHaveValue("people_director");
  await expect(page.locator("#stat-n")).not.toHaveText("0");
  const eli = page.locator('tbody tr[data-id="SRC-990-EXT-ENVIRONMENTAL-LAW-INSTITUTE::stefaniegarcia"]');
  await eli.locator(".preview-button").click();
  await expect(page.locator("#source-dialog")).toBeVisible();
  await expect(page.locator("#dialog-meta")).toContainText("37.5 at filing organization");
  await expect(page.locator("#dialog-meta")).toContainText("reported hours alone do not establish FTE");
  await expect(page.locator("#dialog-meta")).toContainText("not FTE or point-in-time headcount");
  await page.locator("#dialog-category-provenance summary").click();
  await expect(page.locator("#dialog-provenance-records")).toContainText("Role classification");
  await expect(page.locator("#dialog-provenance-records")).toContainText("Source verification");
  await page.locator("#source-dialog").screenshot({ path: "tmp/existing-refinement/source-dialog.png" });
  await page.keyboard.press("Escape");
  await page.goto("/finance-manager-salary-benchmark/");
  await expect(page.locator("#sample-select")).toHaveValue("primary");
  await expect(page.locator('input[name="dollar-basis"][value="adjusted"]')).toBeChecked();
  await expect(page.locator("#stat-n")).not.toHaveText("0");
  await page.locator('input[name="dollar-basis"][value="nominal"]').check();
  await page.locator("#sample-select").selectOption("observed");
  const historical = page.locator('tbody tr[data-id="AD::r12:ISRG:finance-manager-2021"]');
  await expect(historical.locator(".row-toggle")).toBeChecked();
  await page.locator("#position-select").selectOption("operations_executive");
  await expect(page.locator("#stat-n")).not.toHaveText("0");
  const shared = await page.evaluate(() => {
    const d = window.CEO_BENCHMARK_DATA;
    return { direct: d.positionObservations.operations_executive.length,
      members: d.positionMemberships.operations_executive.length };
  });
  expect(shared).toEqual({ direct: 0, members: 6 });
  await page.locator("#position-select").selectOption("program_executive");
  const crossListedRow = page.locator('tbody tr[data-id="SRC-990-EXT-BRENNAN-CENTER-FOR-JUSTICE::johnkowal"]');
  await expect(crossListedRow.locator(".row-toggle")).not.toBeChecked();
  await page.locator("#sample-select").selectOption("sensitivity");
  await expect(crossListedRow.locator(".row-toggle")).toBeChecked();
  await page.locator("#position-select").selectOption("senior_researcher");
  const givewell = page.locator('tbody tr[data-id="SRC-AD-GIVEWELL-SENIOR-RESEARCHER-2026"]');
  await givewell.locator(".preview-button").click();
  await expect(page.locator("#dialog-secondary-external")).toHaveAttribute("href", /web\.archive\.org\/web\/20260511112328/);
  await expect(page.locator("#dialog-secondary-cached")).toBeVisible();
  expect(errors).toEqual([]);
});

test("CEO ratios match the same filing and compensation year", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ceo-salary-benchmark/");
  await page.locator("#sample-select").selectOption("sensitivity");
  await page.locator('input[name="histogram-axis-mode"][value="ratio"]').check();
  await page.locator('.axis-variable-control[aria-label^="Change horizontal"]').click();
  await page.locator("#axis-denominator").selectOption("position:operations_leadership");
  const pairs = await page.evaluate(() => {
    const d = window.CEO_BENCHMARK_DATA;
    return d.incumbents.filter((r) => r.expansionReview).flatMap((ceo) =>
      d.positionObservations.coo.filter((coo) => coo.sourceId === ceo.sourceId && coo.compensationYear === ceo.compensationYear)
        .map((coo) => ({ org: ceo.organization, ratio: ceo.salary.base / coo.salary.base })));
  });
  expect(pairs.map((p) => p.org)).toContain("Woodwell Climate Research Center");
  expect(pairs.map((p) => p.org)).toContain("Urban Institute");
  await expect(page.locator("#salary-chart")).toContainText("Operations leadership");
  await page.locator('[data-chart-view="scatter"]').click();
  await page.locator('.axis-variable-control[aria-label^="Change horizontal"]').click();
  await expect(page.locator('#axis-numerator option[value="position:people_leadership"]')).toHaveCount(1);
  await expect(page.locator('#axis-numerator option[value="position:people_director"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
