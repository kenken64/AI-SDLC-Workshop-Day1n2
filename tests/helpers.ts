import { expect, Page } from "@playwright/test";

export async function loginAsTestUser(page: Page) {
  await page.request.post("/api/auth/test-login");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Todo App" })).toBeVisible();
}

export async function createTodo(page: Page, title: string) {
  await page.getByLabel("Title").first().fill(title);
  await page.getByRole("button", { name: "Add Todo" }).click();
  await expect(page.getByText(title).first()).toBeVisible();
}
