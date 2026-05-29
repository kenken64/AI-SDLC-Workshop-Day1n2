import { expect, test } from "@playwright/test";

import { loginAsTestUser } from "./helpers";

test("authentication routes and protected pages work", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Todo App Login" })).toBeVisible();

  await loginAsTestUser(page);
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
});
