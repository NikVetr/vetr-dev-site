const { test, expect } = require("@playwright/test");

test("benchmark interactions and validated sources", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "CEO salary benchmark" })).toBeVisible();
  await expect(page.locator("#stat-n")).toHaveText("110");
  await expect(page.locator(".bar-block")).toHaveCount(110);

  await page.locator("#fit-select").selectOption("lognormal");
  await expect(page.locator(".density-line")).toHaveCount(1);
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
