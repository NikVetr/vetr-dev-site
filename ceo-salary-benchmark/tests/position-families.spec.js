const { test, expect } = require("@playwright/test");

test("pooled role menu uses table title filters", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.stack));
  await page.goto("/ceo-salary-benchmark/");
  const trigger = page.locator("#position-menu-trigger");
  const menu = page.locator("#position-menu");
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(menu.locator("details")).toHaveCount(0);
  await expect(menu.locator('[data-position-key="operations_director"]')).toHaveCount(0);
  const topKeys = await menu.locator(":scope > button").evaluateAll(buttons => buttons.slice(0, 5).map(b => b.dataset.positionKey));
  expect(topKeys).toEqual(["ceo", "operations_leadership", "finance_leadership", "legal_leadership", "chief_of_staff"]);
  const counts = await menu.locator(":scope > button .position-choice-count").evaluateAll(nodes => nodes.map(n => ({
    right: n.getBoundingClientRect().right, color: getComputedStyle(n).color, align: getComputedStyle(n).textAlign,
  })));
  expect(Math.max(...counts.map(c => c.right)) - Math.min(...counts.map(c => c.right))).toBeLessThan(1);
  expect(counts.every(c => c.color === "rgb(82, 135, 158)" && c.align === "right")).toBe(true);
  await page.screenshot({ path: "tmp/role-families/menu-desktop.png" });
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator('[data-position-key="operations_leadership"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/\/operations-leadership-salary-benchmark\//);
  await expect(page.locator("#position-selected-label")).toHaveText("COO / Operations leadership");
  const families = await page.evaluate(() => window.CEO_BENCHMARK_DATA.positionCatalog.filter(p => p.pooled));
  for (const family of families) {
    await page.locator("#position-select").selectOption(family.key);
    await page.locator('[data-chart-view="histogram"]').click();
    await expect(page.locator("#stat-n")).toHaveText(String(family.counts.defaultAvailable));
    const ids = await page.locator("#organization-table tbody tr[data-id]").evaluateAll(rows => rows.map(r => r.dataset.id));
    expect(ids.length).toBe(new Set(ids).size);
    await page.locator('[data-chart-view="scatter"]').click();
    await expect(page.locator("#salary-chart")).toBeVisible();
  }
  await page.locator("#position-select").selectOption("operations_leadership");
  await page.reload();
  await expect(page.locator("#position-select")).toHaveValue("operations_leadership");
  await page.locator("#sample-select").selectOption("sensitivity");
  await expect(page.locator('tr[data-id="SRC-990-EXT-CODE-FOR-SCIENCE-SOCIETY::kenamayberry"] .row-toggle')).not.toBeChecked();
  await expect(page.locator('tr[data-id="SRC-990-EXT-THE-HUMANE-LEAGUE::andreacoron"] .row-toggle')).not.toBeChecked();
  await page.locator('[data-chart-view="histogram"]').click();
  await page.locator("#sample-select").selectOption("primary");
  const titleFilter = page.locator('[data-filter-menu="title"]');
  await titleFilter.locator("summary").click();
  await titleFilter.getByRole("button", { name: "Deselect all", exact: true }).click();
  await titleFilter.getByRole("checkbox", { name: "Select all Operations Director titles", exact: true }).check();
  await expect(page.locator("#stat-n")).toHaveText("6");
  await titleFilter.locator("summary").click();
  await page.reload();
  await expect(page.locator("#position-selected-label")).toHaveText("COO / Operations leadership");
  await expect(page.locator("#stat-n")).toHaveText("6");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(menu).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  const bounds = await menu.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "tmp/role-families/menu-mobile.png" });
  expect(errors).toEqual([]);
});

test("pooled roles propagate to ratio axes and matrix features; saved title ratios retain their meaning", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.stack));
  await page.goto("/ceo-salary-benchmark/");
  await page.locator('input[name="histogram-axis-mode"][value="ratio"]').check();
  await page.locator('.axis-variable-control[aria-label^="Change horizontal"]').click();
  const expected = await page.locator("#position-menu [data-position-key]").evaluateAll(buttons => buttons.map(b => `position:${b.dataset.positionKey}`));
  for (const selector of ["#axis-numerator", "#axis-denominator"]) {
    expect(await page.locator(`${selector} option[value^="position:"]`).evaluateAll(options => options.map(o => o.value))).toEqual(expected);
  }
  await page.locator("#axis-denominator").selectOption("position:operations_leadership");
  await expect(page.locator("#stat-n")).toHaveText("29");
  await expect(page.locator("#salary-chart")).toContainText("CEO Salary / Operations leadership salary");
  await page.reload();
  await expect(page.locator("#stat-n")).toHaveText("29");
  await page.locator('[data-chart-view="scatter"]').click();
  await page.locator("#scatter-plot-mode").selectOption("matrix");
  const features = page.locator('#scatter-matrix .relationship-features input[value^="position:"]');
  expect(await features.evaluateAll(inputs => inputs.map(i => i.value))).toEqual(expected);
  await page.locator('#scatter-matrix input[value="position:operations_leadership"]').check();
  await page.screenshot({ path: "tmp/role-families/pooled-matrix.png" });
  const saved = Buffer.from(JSON.stringify({ v: 9, a: 1, h: ["s", "p:coo"] })).toString("base64url");
  await page.goto(`/ceo-salary-benchmark/?s=${saved}`);
  await expect(page.locator("#stat-n")).toHaveText("24");
  await page.locator('.axis-variable-control[aria-label^="Change horizontal"]').click();
  await expect(page.locator("#axis-denominator")).toHaveValue("position:coo");
  await expect(page.locator('#axis-denominator option[value="position:coo"]')).toContainText("title-specific selection");
  await page.goto("/coo-salary-benchmark/");
  await page.locator("#position-menu-trigger").click();
  await expect(page.locator('#position-menu [data-position-key="operations_leadership"]')).toBeFocused();
  expect(errors).toEqual([]);
});
