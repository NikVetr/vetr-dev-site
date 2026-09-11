const { test, expect } = require("@playwright/test");

test("role menu pools functional leadership and retains title subgroups", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.stack));
  await page.goto("/ceo-salary-benchmark/");
  const trigger = page.locator("#position-menu-trigger");
  const menu = page.locator("#position-menu");
  await trigger.click();
  await expect(menu).toBeVisible();
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
  await trigger.click();
  const subgroups = menu.locator('.position-subgroups').first();
  await subgroups.locator("summary").click();
  await subgroups.locator('[data-position-key="operations_director"]').click();
  await expect(page).toHaveURL(/\/operations-director-salary-benchmark\//);
  await expect(page.locator("#position-selected-label")).toHaveText("Operations Director");
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
