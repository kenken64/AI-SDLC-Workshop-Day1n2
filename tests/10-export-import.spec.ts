import { expect, test } from "@playwright/test";

import { createTodo, loginAsTestUser } from "./helpers";

test("export and import actions are available", async ({ page }) => {
  await loginAsTestUser(page);
  await createTodo(page, "Exported Todo");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("todos-export-");

  await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
});
