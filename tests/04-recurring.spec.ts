import { expect, test } from "@playwright/test";

import { loginAsTestUser } from "./helpers";

test("recurring todo generates next instance on completion", async ({ page }) => {
  await loginAsTestUser(page);

  await page.getByLabel("Title").first().fill("Recurring Task");
  await page.getByLabel("Due date").first().fill("2099-01-01T09:00");
  await page.getByLabel("Recurrence").first().selectOption("daily");
  await page.getByRole("button", { name: "Add Todo" }).click();

  await page.getByRole("button", { name: "Mark Complete" }).first().click();
  await expect(page.getByText("Recurring Task").first()).toBeVisible();
});
