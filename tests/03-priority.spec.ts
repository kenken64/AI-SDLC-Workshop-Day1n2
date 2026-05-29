import { expect, test } from "@playwright/test";

import { loginAsTestUser } from "./helpers";

test("priority create and filter", async ({ page }) => {
  await loginAsTestUser(page);

  await page.getByLabel("Title").first().fill("High Priority");
  await page.getByLabel("Priority").first().selectOption("high");
  await page.getByRole("button", { name: "Add Todo" }).click();

  await expect(page.getByText("high").first()).toBeVisible();
  await page.getByLabel("Priority").nth(1).selectOption("high");
  await expect(page.getByText("Showing", { exact: false })).toBeVisible();
});
