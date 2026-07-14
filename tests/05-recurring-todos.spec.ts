/**
 * tests/05-recurring-todos.spec.ts
 *
 * E2E tests for Person C's recurring todos feature.
 * Owner: Person C (Wave 3).
 */

import { test, expect } from '@playwright/test';
import { register, createTodo } from './helpers';

// Returns a date string N days from today in YYYY-MM-DD format (Singapore timezone).
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); // YYYY-MM-DD via en-CA
}

const uid = () => `recur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

test.describe('Recurring todos', () => {
  test('creates a daily recurring todo and shows the 🔄 badge', async ({ page }) => {
    await register(page, uid());

    const title = `Daily task ${uid()}`;
    await createTodo(page, {
      title,
      dueDate: daysFromNow(1),
      recurring: 'daily',
    });

    await expect(page.locator('h3', { hasText: title })).toBeVisible();
    // Recurrence badge should appear
    await expect(page.locator('span', { hasText: /🔄 daily/ })).toBeVisible();
  });

  test('creates a weekly recurring todo and shows 🔄 weekly badge', async ({ page }) => {
    await register(page, uid());

    const title = `Weekly meeting ${uid()}`;
    await createTodo(page, {
      title,
      dueDate: daysFromNow(3),
      recurring: 'weekly',
    });

    await expect(page.locator('span', { hasText: /🔄 weekly/ })).toBeVisible();
  });

  test('completing a recurring todo spawns a new instance', async ({ page }) => {
    await register(page, uid());

    const title = `Recurring complete ${uid()}`;
    await createTodo(page, {
      title,
      dueDate: daysFromNow(1),
      recurring: 'daily',
    });

    // Count of todos with this title before completion
    await expect(page.locator('h3', { hasText: title })).toHaveCount(1);

    // Complete the todo
    const article = page.locator('article').filter({ hasText: title }).first();
    await article.locator('input[type="checkbox"]').check();

    // The original moves to Completed; a new instance should appear in Pending/Overdue
    await expect(page.locator('h3', { hasText: title })).toHaveCount(2);
  });

  test('new recurring instance after completion has completed=false', async ({ page }) => {
    await register(page, uid());

    const title = `Fresh instance ${uid()}`;
    await createTodo(page, {
      title,
      dueDate: daysFromNow(2),
      recurring: 'weekly',
    });

    const article = page.locator('article').filter({ hasText: title }).first();
    await article.locator('input[type="checkbox"]').check();

    // Wait for two instances
    await expect(page.locator('h3', { hasText: title })).toHaveCount(2);

    // At least one instance should be unchecked (the new one)
    const uncheckedBoxes = page
      .locator('article')
      .filter({ hasText: title })
      .locator('input[type="checkbox"]:not(:checked)');
    await expect(uncheckedBoxes).toHaveCount(1);
  });

  test('repeat checkbox is disabled without a due date', async ({ page }) => {
    await register(page, uid());

    // The "Repeat" checkbox must be disabled when no due date is set
    await expect(page.getByRole('checkbox', { name: /repeat/i })).toBeDisabled();

    // Text hint should appear
    await expect(page.getByText(/set a due date to enable repeat/i)).toBeVisible();
  });

  test('attempting to create recurring todo without due date via API returns 400', async ({ page }) => {
    await register(page, uid());

    const res = await page.request.post('/api/todos', {
      data: {
        title: 'No due date recurring',
        is_recurring: true,
        recurrence_pattern: 'daily',
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/due date/i);
  });

  test('unchecking Repeat removes the 🔄 badge', async ({ page }) => {
    await register(page, uid());

    const title = `Disable recur ${uid()}`;
    await createTodo(page, {
      title,
      dueDate: daysFromNow(2),
      recurring: 'weekly',
    });

    await expect(page.locator('span', { hasText: /🔄 weekly/ })).toBeVisible();

    // Open edit modal
    const article = page.locator('article').filter({ hasText: title }).first();
    await article.getByRole('button', { name: 'Edit' }).click();

    // Uncheck Repeat in the edit form
    await page.getByRole('checkbox', { name: /repeat/i }).uncheck();
    await page.getByRole('button', { name: 'Update Todo' }).click();

    // Badge should be gone
    await expect(page.locator('span', { hasText: /🔄/ })).toHaveCount(0);
  });
});
