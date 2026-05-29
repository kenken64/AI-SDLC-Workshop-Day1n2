import { expect, test } from "@playwright/test";

import { loginAsTestUser } from "./helpers";

test("set reminder and show reminder badge", async ({ page }) => {
  await loginAsTestUser(page);

  await page.getByLabel("Title").first().fill("Reminder Task");
  await page.getByLabel("Due date").first().fill("2099-01-02T10:00");
  await page.getByLabel("Reminder").first().selectOption("1h");
  await page.getByRole("button", { name: "Add Todo" }).click();

  await expect(page.getByText("🔔 1h")).toBeVisible();
});
