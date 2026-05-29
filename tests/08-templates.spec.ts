import { expect, test } from "@playwright/test";

import { loginAsTestUser } from "./helpers";

test("save and use template", async ({ page }) => {
  await loginAsTestUser(page);

  await page.getByLabel("Title").first().fill("Template Source Todo");
  page.once("dialog", async (dialog) => {
    await dialog.accept("Default Template");
  });
  page.once("dialog", async (dialog) => {
    await dialog.accept("Description");
  });
  page.once("dialog", async (dialog) => {
    await dialog.accept("Work");
  });
  await page.getByRole("button", { name: "Save as Template" }).click();

  await page.getByRole("button", { name: "Templates" }).click();
  await expect(page.getByText("Default Template")).toBeVisible();
});
