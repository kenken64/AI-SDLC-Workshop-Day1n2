import { expect, test } from "@playwright/test";

import { loginAsTestUser } from "./helpers";

test("calendar page loads and navigates", async ({ page }) => {
  await loginAsTestUser(page);
  await page.goto("/calendar");

  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Previous" }).click();
});
