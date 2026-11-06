const { test, expect } = require("@playwright/test");

const path = "/ceo-salary-benchmark/";
/** @param {Record<string, unknown>} payload */
const encoded = (payload) => btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
/** @param {import("@playwright/test").Page} page */
const modelTab = (page) => page.locator('[role="tab"][data-chart-view="model"]');

/** @param {import("@playwright/test").Page} page */
async function noRpPresentation(page) {
  expect(await page.locator("body").innerText()).not.toMatch(/\bRP\b|Rethink Priorities/);
  await expect(page.locator(".rp-reference-row, .rp-reference-guide, .weight-profile-rp-reference")).toHaveCount(0);
}

test("unqualified entry uses a generic example without changing the empirical cohort", async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-benchmark-profile", "generic");
  await expect(page.locator(".eyebrow")).toHaveText("Nonprofit compensation");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
  const expectedCount = await page.evaluate(() => /** @type {any} */ (window).CEO_BENCHMARK_DATA.incumbents
    .filter((/** @type {any} */ row) => row.defaultIncluded && row.salary?.base > 0 && row.expenses >= 3e6 && row.expenses <= 35e6).length);
  await expect(page.locator("#stat-n")).toHaveText(String(expectedCount));
  await noRpPresentation(page);
  const helpText = await page.locator("[data-tooltip]").evaluateAll((elements) => elements.map((el) => el.getAttribute("data-tooltip")).join("\n"));
  expect(helpText).not.toMatch(/\bRP\b|Rethink Priorities/);

  await page.locator('#weighting-components input[value="size"]').check();
  await expect(page.locator("#target-expense")).toHaveValue("10");
  await expect(page.locator("#rp-scale-reference")).toBeHidden();
  await noRpPresentation(page);
  await modelTab(page).click();
  await expect(page.locator("#model-expenses")).toHaveValue("10000000");
  await expect(page.locator("#model-staff")).toHaveValue("50");
  await expect(page.locator("#model-highest-other")).toHaveValue("150000");
  await expect(page.locator("#model-focus")).toHaveValue("__average__");
  await expect(page.locator("#model-settings-note")).toContainText("Illustrative inputs");
  await noRpPresentation(page);
  await page.getByRole("tab", { name: "Model details" }).click();
  await page.locator(".model-spec-button").first().click();
  await expect(page.locator("#model-explanation-dialog")).toBeVisible();
  await expect(page.locator("#model-explanation-dialog")).toContainText("Profile inputs do not change the fixed fitted cohort");
  await noRpPresentation(page);
  await page.keyboard.press("Escape");
  const shared = page.url();
  await page.reload();
  await expect(page.locator("#model-expenses")).toHaveValue("10000000");
  await expect(modelTab(page)).toHaveAttribute("aria-selected", "true");
  expect(new URL(shared).searchParams.get("profile")).toBeNull();
  await noRpPresentation(page);
  expect(errors).toEqual([]);
});

test("RP mode restores references and keeps its preset through reset and sharing", async ({ page }) => {
  await page.goto(path + "?profile=RP");
  await expect(page.locator("html")).toHaveAttribute("data-benchmark-profile", "RP");
  await expect(page.locator(".eyebrow")).toHaveText("Rethink Priorities");
  await expect(page.locator(".rp-reference-row")).toHaveCount(1);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "assets/rethink-priorities-favicon.png");
  await modelTab(page).click();
  await expect(page.locator("#model-expenses")).toHaveValue("7500000");
  await expect(page.locator("#model-staff")).toHaveValue("57");
  await expect(page.locator(".rp-reference-guide")).toHaveCount(1);
  await page.locator("#model-expenses").fill("8000000");
  await page.locator("#model-expenses").press("Tab");
  await page.reload();
  await expect(page.locator("#model-expenses")).toHaveValue("8000000");
  expect(new URL(page.url()).searchParams.get("profile")).toBe("RP");
  await page.locator("#reset-settings").click();
  await expect(page.locator(".rp-reference-row")).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("profile")).toBe("RP");
  await modelTab(page).click();
  await expect(page.locator("#model-expenses")).toHaveValue("7500000");
});

test("legacy compact URLs retain RP defaults and their original empirical or pooled behavior", async ({ page }) => {
  await page.goto(path + "?s=" + encoded({ v: 10, l: 2 }));
  await expect(page.locator("html")).toHaveAttribute("data-benchmark-profile", "RP");
  await expect(page.locator("#model-expenses")).toHaveValue("7500000");
  expect(new URL(page.url()).searchParams.get("profile")).toBe("RP");
  await page.goto(path + "?s=" + encoded({ v: 10 }));
  await expect(page.locator("#stream-select")).toHaveValue("incumbents");
  await expect(page.locator('input[name="distribution"][value="empirical"]')).toBeChecked();
  await expect(page.locator("#expense-range-value")).toHaveText("$3.0M–$35M");
  await page.goto(path + "?s=" + encoded({ v: 9 }));
  await expect(page.locator("#stream-select")).toHaveValue("combined");
  await expect(page.locator('input[name="distribution"][value="lognormal"]')).toBeChecked();
  await expect(page.locator("#expense-range-value")).toHaveText("All");
});

test("generic saved scenarios contain no RP reference and stay separate from RP scenarios", async ({ page }) => {
  await page.goto(path);
  await page.locator("#results-tab-compare").click();
  await page.locator("#scenario-name").fill("Generic example");
  await page.locator("#scenario-save").click();
  await expect(page.locator("#scenario-count")).toHaveText("1 / 4 saved");
  await noRpPresentation(page);
  await expect(page.locator("#scenario-comparison")).not.toContainText("RP reference");
  const storage = await page.evaluate(() => ({
    generic: localStorage.getItem("nonprofit-salary-benchmark.scenarios.v1"),
    rp: localStorage.getItem("rp-salary-benchmark.scenarios.v1"),
  }));
  expect(storage.generic).toContain("Generic example");
  expect(storage.rp).toBeNull();
  await page.goto(path + "?profile=RP");
  await page.locator("#results-tab-compare").click();
  await expect(page.locator("#scenario-count")).toHaveText("0 / 4 saved");
});

test("source previews keep neutral provenance and reserve original RP comparison prose for RP mode", async ({ page }) => {
  const cases = [
    { stream: "jobAds", id: "SRC-AD-DRW", original: "Legal and direct advocacy delivery differ from RP's research-centered model.", neutral: "The archived official page explicitly describes a private nonprofit organization with its own boards and councils." },
    { stream: "jobAds", id: "SRC-AD-DREAM-2026", original: "Full national CEO scope and 39-person staff; broader campaign/advocacy mix than RP.", neutral: "The posting describes an organization-wide CEO accountable to a board of directors." },
    { stream: "incumbents", id: "SRC-990-EXT-CENTER-FOR-CLIMATE-AND-ENERGY-SOLUTIONS", original: "Climate-policy research institute; expenses modestly above RP strict band but within expanded band.", neutral: "The peer group and mission area agree between the selection and filing reviews." },
    { stream: "incumbents", id: "SRC-990-EA-FORESIGHT-INSTITUTE", original: "Clean full-year CEO observation, but six filing-reported employees is substantially below RP scale; included only in sensitivity presets.", neutral: "Form 990 for compensation calendar year 2024. Allison Duettmann, CEO. Schedule J base: $276,150; Part VII cash/W-2 proxy: $276,150; Part VII other compensation: $8,285; filing total: $284,435; reported weekly hours: 40.", evidence: true },
  ];
  for (const mode of ["generic", "RP"]) {
    await page.goto(path + (mode === "RP" ? "?profile=RP" : ""));
    for (const example of cases) {
      await page.locator("#stream-select").selectOption(example.stream);
      await page.locator("#sample-select").selectOption("observed");
      await page.locator(`#organization-table tr[data-id="${example.id}"] .preview-button`).click();
      await page.locator("#dialog-category-provenance summary").click();
      const provenance = page.locator("#dialog-category-provenance");
      const dialog = page.locator("#source-dialog");
      await expect(dialog).toContainText(example.neutral);
      expect(await provenance.locator(".provenance-citations a").count()).toBeGreaterThan(0);
      if (mode === "RP") {
        await expect(provenance).toContainText(example.original);
        await expect(provenance).not.toContainText("Organization-specific comparison notes are omitted here");
        if (example.evidence) await expect(page.locator("#dialog-evidence")).toContainText(example.original);
      } else {
        expect(await dialog.innerText()).not.toMatch(/\bRP\b|Rethink Priorities/);
        await expect(provenance).toContainText("Organization-specific comparison notes are omitted here");
        if (example.evidence) await expect(page.locator("#dialog-evidence")).toContainText("[Organization-specific comparison note omitted.]");
      }
      await page.keyboard.press("Escape");
    }
    await page.goto("/finance-manager-salary-benchmark/" + (mode === "RP" ? "?profile=RP" : ""));
    await page.locator("#stream-select").selectOption("jobAds");
    await page.locator("#sample-select").selectOption("observed");
    await page.locator('#organization-table tr[data-id="AD::r9:LAWAI:finance-manager-2026"] .preview-button').click();
    await page.locator("#dialog-category-provenance summary").click();
    const evidence = page.locator("#dialog-evidence");
    await expect(evidence).toContainText("Wayback employer capture verifies a full-time Finance Manager, annual USD range, nonprofit finance scope, and January 2026 deadline.");
    await expect(evidence).toContainText("Multi-country location-dependent payroll remains unresolved, so default inclusion is false.");
    if (mode === "RP") await expect(evidence).toContainText("LawAI is independent of RP.");
    else {
      expect(await page.locator("#source-dialog").innerText()).not.toMatch(/\bRP\b|Rethink Priorities/);
      await expect(evidence).toContainText("[Organization-specific comparison note omitted.]");
    }
  }
});

test("semantic role routes share the generic presentation, navigation and a fitting desktop workspace", async ({ page }) => {
  await page.goto("/operations-leadership-salary-benchmark/");
  await expect(page.locator("#position-select")).toHaveValue("operations_leadership");
  await expect(page.locator("html")).toHaveAttribute("data-benchmark-profile", "generic");
  await noRpPresentation(page);
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    workspaceBottom: /** @type {HTMLElement} */ (document.querySelector("#app-shell")).getBoundingClientRect().bottom,
    height: innerHeight,
  }));
  expect(layout.overflow).toBe(0);
  expect(layout.workspaceBottom).toBeLessThanOrEqual(layout.height + 1);
  await page.locator('[data-tool-help="#benchmark-help"]').click();
  await expect(page.locator("#benchmark-help")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#benchmark-help")).toBeHidden();
});
