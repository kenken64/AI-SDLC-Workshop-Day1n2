/**
 * tests/helpers.ts — shared test utilities.
 *
 * Each feature owner adds their own helpers following the same camelCase convention:
 *   Person A: register(), login(), setupVirtualAuthenticator()
 *   Person B: createTodo()
 *   Person D: addSubtask(), createTag()
 *   Person E: createTemplate()
 */

import { expect, type Page, type CDPSession } from '@playwright/test';

// ─── WebAuthn Virtual Authenticator ─────────────────────────────────────────

export interface VirtualAuthenticator {
  cdp:             CDPSession;
  authenticatorId: string;
}

/**
 * Enables the WebAuthn Testing API on the given page and adds a virtual
 * platform authenticator that auto-approves all WebAuthn operations.
 * Must be called before any register/login action that triggers WebAuthn.
 */
export async function setupVirtualAuthenticator(page: Page): Promise<VirtualAuthenticator> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol:            'ctap2',
      transport:            'internal',
      hasResidentKey:       true,
      hasUserVerification:  true,
      isUserVerified:       true,
    },
  });
  return { cdp, authenticatorId };
}

// ─── Auth helpers ────────────────────────────────────────────────────────────

/**
 * Navigates to /login, sets up a virtual authenticator, enters the username,
 * clicks Register, and waits for the redirect to /.
 */
export async function register(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await setupVirtualAuthenticator(page);
  await page.getByLabel('Username').fill(username);
  await page.getByRole('button', { name: 'Register New Account' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * Navigates to /login, sets up a virtual authenticator, enters the username,
 * clicks Sign in, and waits for the redirect to /.
 * Requires the account to have been registered first in the same browser context.
 */
export async function login(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await setupVirtualAuthenticator(page);
  await page.getByLabel('Username').fill(username);
  await page.getByRole('button', { name: 'Sign in with Passkey' }).click();
  await expect(page).toHaveURL('/');
}

// ─── Todo helpers (Person B fills in the body) ───────────────────────────────

export interface CreateTodoOptions {
  title:      string;
  priority?:  'high' | 'medium' | 'low';
  dueDate?:   string; // YYYY-MM-DD
  recurring?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  reminder?:  number; // minutes
}

/**
 * TODO (Person B): implement this helper once the todo UI is in place.
 */
export async function createTodo(_page: Page, _opts: CreateTodoOptions): Promise<void> {
  throw new Error('createTodo() not yet implemented — Person B will add this');
}

// ─── Subtask / Tag helpers (Person D fills in the body) ──────────────────────

/**
 * TODO (Person D): implement once subtask UI is in place.
 */
export async function addSubtask(_page: Page, _todoTitle: string, _subtaskTitle: string): Promise<void> {
  throw new Error('addSubtask() not yet implemented — Person D will add this');
}

/**
 * TODO (Person D): implement once tag UI is in place.
 */
export async function createTag(_page: Page, _name: string, _color?: string): Promise<void> {
  throw new Error('createTag() not yet implemented — Person D will add this');
}

// ─── Template helper (Person E fills in the body) ───────────────────────────

/**
 * TODO (Person E): implement once template UI is in place.
 */
export async function createTemplate(_page: Page, _opts: { name: string; title: string }): Promise<void> {
  throw new Error('createTemplate() not yet implemented — Person E will add this');
}
