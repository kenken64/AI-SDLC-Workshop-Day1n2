/**
 * tests/01-authentication.spec.ts
 *
 * E2E tests for WebAuthn registration, login, session persistence, and logout.
 * Uses virtual authenticators via the WebAuthn Testing API (Chromium only).
 */

import { test, expect } from '@playwright/test';
import { register, login, setupVirtualAuthenticator } from './helpers';

// Use a unique prefix per test run to avoid collisions when reusing the dev server.
const uid = () => `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

test.describe('Authentication', () => {

  test('registration creates account and redirects to /', async ({ page }) => {
    const username = uid();
    await page.goto('/login');
    await setupVirtualAuthenticator(page);
    await page.getByLabel('Username').fill(username);
    await page.getByRole('button', { name: 'Register New Account' }).click();
    await expect(page).toHaveURL('/');
  });

  test('duplicate username shows 409 error', async ({ page }) => {
    const username = uid();
    // First registration succeeds.
    await register(page, username);
    // Go back to login and try to register the same name again.
    await page.goto('/login');
    await setupVirtualAuthenticator(page);
    await page.getByLabel('Username').fill(username);
    await page.getByRole('button', { name: 'Register New Account' }).click();
    await expect(page.getByRole('alert')).toContainText(/already taken/i);
  });

  test('login after registration succeeds', async ({ page }) => {
    const username = uid();
    // Register first, then log out, then log in again.
    await register(page, username);
    await page.request.post('/api/auth/logout');
    await login(page, username);
    await expect(page).toHaveURL('/');
  });

  test('session persists across page reload', async ({ page }) => {
    const username = uid();
    await register(page, username);
    await page.reload();
    // middleware should keep us on / rather than redirecting to /login
    await expect(page).toHaveURL('/');
  });

  test('unauthenticated access to / redirects to /login', async ({ page }) => {
    // Fresh context — no cookie.
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('unauthenticated access to /calendar redirects to /login', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page).toHaveURL('/login');
  });

  test('already-authenticated visit to /login redirects to /', async ({ page }) => {
    const username = uid();
    await register(page, username);
    await page.goto('/login');
    // The useEffect in login/page.tsx calls /api/auth/me and redirects.
    await expect(page).toHaveURL('/');
  });

  test('logout clears session and redirects to /login', async ({ page }) => {
    const username = uid();
    await register(page, username);

    // Trigger logout via API (the logout button will be added by Person B).
    await page.request.post('/api/auth/logout');
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('/api/auth/me returns 401 when not logged in', async ({ page }) => {
    const res = await page.request.get('/api/auth/me');
    expect(res.status()).toBe(401);
  });

  test('/api/auth/me returns user info when logged in', async ({ page }) => {
    const username = uid();
    await register(page, username);
    const res  = await page.request.get('/api/auth/me');
    const body = await res.json() as { username: string };
    expect(res.status()).toBe(200);
    expect(body.username).toBe(username);
  });

  test('login with unregistered username returns error', async ({ page }) => {
    await page.goto('/login');
    await setupVirtualAuthenticator(page);
    await page.getByLabel('Username').fill('no_such_user_' + uid());
    await page.getByRole('button', { name: 'Sign in with Passkey' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('empty username shows validation error', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in with Passkey' }).click();
    await expect(page.getByRole('alert')).toContainText(/required/i);
  });

});
