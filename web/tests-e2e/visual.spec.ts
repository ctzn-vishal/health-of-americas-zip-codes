import { test, expect, type Page } from "@playwright/test";

// The map's WebGL canvas does not composite into headless screenshots and is inherently
// volatile (external tiles), so it carries data-volatile and is masked. Baselines assert the
// stable UI: controls, legend, insight rail, and the four D3 panels.
const MASK = (page: Page) => [page.locator("[data-volatile]")];

async function settle(page: Page) {
  await page.waitForSelector(".legend", { timeout: 30_000 });
  await page.waitForSelector(".panel svg", { timeout: 30_000 });
  // map is best-effort; don't fail the UI baseline if tiles are slow
  await page.waitForSelector('[data-map-ready="true"]', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

const views = [
  { name: "diabetes-gap", url: "/?metric=diabetes&mode=gap" },
  { name: "diabetes-rate", url: "/?metric=diabetes&mode=rate" },
  { name: "obesity-percentile", url: "/?metric=obesity_rate&mode=percentile" },
  { name: "selected-90011", url: "/?metric=diabetes&mode=gap&selected=90011" },
  { name: "invalid-metric", url: "/?metric=bogus_metric" },
];

for (const v of views) {
  test(`visual: ${v.name} @desktop`, async ({ page }) => {
    await page.goto(v.url);
    await settle(page);
    await expect(page).toHaveScreenshot(`${v.name}.png`, { mask: MASK(page), fullPage: true });
  });
}

test("visual: mobile portrait", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?metric=diabetes&mode=gap");
  await settle(page);
  await expect(page).toHaveScreenshot("mobile-diabetes.png", { mask: MASK(page), fullPage: true });
});

test("e2e: metric + mode + selection round-trip via URL", async ({ page }) => {
  await page.goto("/?metric=diabetes&mode=gap");
  await settle(page);

  // change metric -> URL + legend update
  await page.selectOption("#metric-select", "obesity_rate");
  await expect(page).toHaveURL(/metric=obesity_rate/);
  await expect(page.locator(".legend .legend-title")).toContainText("Obesity");

  // toggle mode -> URL update + aria-pressed
  await page.getByRole("button", { name: "Rate", exact: true }).click();
  await expect(page).toHaveURL(/mode=rate/);
  await expect(page.getByRole("button", { name: "Rate", exact: true })).toHaveAttribute("aria-pressed", "true");

  // select a ZIP by clicking a ranked-dot-plot row (an SVG <g role="button">) ->
  // ZIP card appears and the URL carries the selection
  await page.waitForTimeout(600); // let the ranked panel re-render for the new metric
  const firstRow = page.locator('svg g[role="button"]').first();
  await firstRow.scrollIntoViewIfNeeded();
  await firstRow.click();
  await expect(page.locator(".zipcard")).toBeVisible({ timeout: 8000 });
  await expect(page).toHaveURL(/selected=/);
});

test("a11y: every panel has a table fallback and values without hover", async ({ page }) => {
  await page.goto("/?metric=diabetes&mode=gap");
  await settle(page);
  await expect(page.locator(".panel details.table-fallback")).toHaveCount(4);
  // direct value labels are present in the DOM (not hover-only)
  await expect(page.locator(".panel svg text").first()).toBeVisible();
  // map has a text alternative
  await expect(page.locator('[role="img"][aria-label*="ZIP"]').first()).toBeAttached();
});
