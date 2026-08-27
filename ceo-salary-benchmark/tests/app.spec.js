const { test, expect } = require("@playwright/test");

test("benchmark interactions and validated sources", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "CEO salary benchmark" })).toBeVisible();
  await expect(page.locator("#stat-n")).toHaveText("110");
  await expect(page.locator(".bar-block")).toHaveCount(110);
  await expect(page.locator('input[name="distribution"][value="lognormal"]')).toBeChecked();
  await expect(page.locator(".density-line")).toHaveCount(1);
  await expect(page.locator(".density-line")).toHaveAttribute("d", /L/);
  await expect(page.locator("#bin-count")).toHaveAttribute("min", "2");
  await expect(page.locator("#bin-count")).toHaveAttribute("max", "200");
  const blockAspect = await page.locator(".bar-block").first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.width / box.height;
  });
  expect(blockAspect).toBeGreaterThan(0.5);
  expect(blockAspect).toBeLessThan(2);
  const densityIsOverlay = await page.locator("#salary-chart").evaluate((svg) => {
    const children = [...svg.children];
    const lastBar = Math.max(...[...svg.querySelectorAll(".bar-block")].map((bar) => children.indexOf(bar)));
    return children.indexOf(svg.querySelector(".density-line")) > lastBar;
  });
  expect(densityIsOverlay).toBe(true);

  await page.locator('input[name="distribution"][value="gamma"]').check();
  await expect(page.locator("#density-legend-label")).toHaveText("Gamma density");
  await page.locator('input[name="distribution"][value="empirical"]').check();
  await expect(page.locator(".density-line")).toHaveCount(0);
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

  await page.locator("#quantile-granularity").selectOption("percentiles");
  await expect(page.locator(".quantile-cell")).toHaveCount(99);
  await page.locator("#quantile-granularity").selectOption("custom");
  await page.locator("#custom-quantiles").fill("5, 50, 95");
  await expect(page.locator(".quantile-cell")).toHaveCount(3);

  await page.locator("#reset-settings").click();
  await page.locator("#weighting-select").selectOption("size");
  await expect(page.locator("#size-controls")).toBeVisible();

  await page.locator("#table-search").fill("Center for AI Safety");
  const cais = page.locator("tbody tr").filter({ hasText: "Center for AI Safety" });
  await expect(cais).toHaveCount(1);
  await cais.getByRole("button", { name: "Preview" }).click();
  await expect(page.locator("#source-dialog")).toBeVisible();
  await expect(page.locator("#dialog-evidence")).toContainText("$314,534");
  await page.locator(".dialog-close").click();

  await page.locator("#table-search").fill("");
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
  await page.screenshot({ path: "tmp/app-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("#salary-chart")).toBeVisible();
  await expect(page.locator("#organization-table")).toBeVisible();
  await page.screenshot({ path: "tmp/app-mobile.png", fullPage: true });
});
