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

export async function createTodo(page: Page, opts: CreateTodoOptions): Promise<void> {
  await page.getByLabel('Title').fill(opts.title);

  if (opts.priority) {
    await page.getByLabel('Priority', { exact: true }).selectOption(opts.priority);
  }

  if (opts.dueDate) {
    await page.getByLabel('Due date and time').fill(`${opts.dueDate}T09:00`);
  }

  if (opts.recurring && opts.dueDate) {
    await page.getByRole('checkbox', { name: /repeat/i }).check();
    await page.locator('select').filter({ hasText: /Daily|Weekly|Monthly|Yearly/ }).selectOption(opts.recurring);
  }

  if (opts.reminder && opts.dueDate) {
    await page.getByLabel('Reminder').selectOption(String(opts.reminder));
  }

  await page.getByRole('button', { name: 'Add Todo' }).click();
}

// ─── Subtask / Tag helpers (Person D fills in the body) ──────────────────────

/**
 * Expands a todo's subtask section and adds a subtask with the given title.
 * Assumes the todo is visible on the page.
 */
export async function addSubtask(page: Page, todoTitle: string, subtaskTitle: string): Promise<void> {
  // Find the todo card that contains the title
  const card = page.locator('article').filter({ hasText: todoTitle }).first();
  // Expand subtasks
  const subtaskBtn = card.getByRole('button', { name: /subtasks/i });
  if (await subtaskBtn.isVisible()) {
    const isExpanded = (await subtaskBtn.textContent())?.includes('▼');
    if (!isExpanded) await subtaskBtn.click();
  }
  // Add subtask
  await card.getByPlaceholder('Add subtask…').fill(subtaskTitle);
  await card.getByRole('button', { name: 'Add' }).click();
  // Wait for the subtask to appear
  await expect(card.getByText(subtaskTitle)).toBeVisible();
}

/**
 * Opens the Manage Tags modal and creates a tag with the given name and color.
 */
export async function createTag(page: Page, name: string, color?: string): Promise<void> {
  await page.getByRole('button', { name: /manage tags/i }).click();
  await page.getByPlaceholder('Tag name').fill(name);
  if (color) {
    await page.locator('input[type="color"]').last().fill(color);
  }
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page.getByText(name)).toBeVisible();
  // Close the modal
  await page.getByRole('button', { name: /^close$/i }).click();
}

// ─── Template helpers (Person E) ─────────────────────────────────────────────

export interface CreateTemplateOptions {
  name: string;
  description?: string;
  category?: string;
  titleTemplate?: string; // defaults to the todo title already in the form
}

/**
 * With a todo already filled in the creation form, clicks "Save as Template",
 * fills in the modal and saves it.
 */
export async function createTemplate(page: Page, opts: CreateTemplateOptions): Promise<void> {
  await page.getByRole('button', { name: /save as template/i }).click();

  await page.getByPlaceholder('e.g. Weekly Team Meeting').fill(opts.name);
  if (opts.description) await page.getByPlaceholder('Optional description').fill(opts.description);
  if (opts.category) await page.getByPlaceholder('e.g. Work, Personal').fill(opts.category);

  await page.getByRole('button', { name: /^save template$/i }).click();
  // Wait for modal to close
  await expect(page.getByPlaceholder('e.g. Weekly Team Meeting')).not.toBeVisible();
}
