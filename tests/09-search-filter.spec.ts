import { expect, test } from "@playwright/test";

import { createTodo, loginAsTestUser } from "./helpers";

test("search filters todo list", async ({ page }) => {
  await loginAsTestUser(page);
  await createTodo(page, "Searchable Item");

  await page.getByLabel("Search").fill("Searchable");
  await expect(page.getByText("Showing 1 result")).toBeVisible();
});
