import { test, expect, Page } from "@playwright/test";

async function enableVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("WebAuthn.enable");

  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

function uniqueUsername(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

test.describe("PRP 11: Authentication (WebAuthn)", () => {
  test.beforeEach(async ({ request, page }) => {
    await request.post("http://localhost:3000/api/test-reset");
    await enableVirtualAuthenticator(page);
  });

  test("should register a new user with passkey", async ({ page }) => {
    const username = uniqueUsername("register");

    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Register" }).click();

    await expect(page).toHaveURL(/\/$/);
  });

  test("should login with an existing passkey", async ({ page }) => {
    const username = uniqueUsername("login");

    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/$/);
  });

  test("should logout and clear session", async ({ page }) => {
    const username = uniqueUsername("logout");

    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should redirect unauthenticated users to /login", async ({ page, context }) => {
    await context.clearCookies();

    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should redirect authenticated users from /login to /", async ({ page }) => {
    const username = uniqueUsername("already-auth");

    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);
  });
});
