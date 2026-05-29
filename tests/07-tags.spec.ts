import { expect, test } from "@playwright/test";

import { loginAsTestUser } from "./helpers";

test("tag create and assign", async ({ page }) => {
  await loginAsTestUser(page);

  await page.getByRole("button", { name: "Manage Tags" }).click();
  await page.getByLabel("Name").first().fill("work");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("work")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
});
