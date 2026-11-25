import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Orrery" })).toBeVisible();
});

test("the interface is set in its own font, not the browser's serif default", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Geist");
});
