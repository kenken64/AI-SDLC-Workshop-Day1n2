import { expect, test } from "@playwright/test";

import { createTodo, loginAsTestUser } from "./helpers";

test("subtasks and progress", async ({ page }) => {
  await loginAsTestUser(page);
  await createTodo(page, "Parent Task");

  await page.getByRole("button", { name: "Show Subtasks" }).first().click();
  await page.getByPlaceholder("New subtask").first().fill("First subtask");
  await page.getByRole("button", { name: "Add" }).last().click();

  await expect(page.getByText("First subtask")).toBeVisible();
  await expect(page.getByText("subtasks")).toBeVisible();
});
