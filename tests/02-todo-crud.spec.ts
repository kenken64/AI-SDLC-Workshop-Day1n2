import { expect, test } from "@playwright/test";

import { createTodo, loginAsTestUser } from "./helpers";

test("todo CRUD flow", async ({ page }) => {
  await loginAsTestUser(page);
  await createTodo(page, "CRUD Todo");

  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Title").first().fill("CRUD Todo Updated");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("CRUD Todo Updated").first()).toBeVisible();

  await page.getByRole("button", { name: "Mark Complete" }).first().click();
  await expect(page.getByRole("heading", { name: /Completed/ })).toBeVisible();
});
