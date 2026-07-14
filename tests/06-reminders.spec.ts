/**
 * tests/06-reminders.spec.ts
 *
 * E2E tests for Person C's reminders & notifications feature.
 * Owner: Person C (Wave 3).
 */

import { test, expect } from '@playwright/test';
import { register, createTodo } from './helpers';

const uid = () => `remind_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

test.describe('Reminders and notifications', () => {
  test('reminder dropdown is disabled without a due date', async ({ page }) => {
    await register(page, uid());

    await expect(page.getByLabel('Reminder')).toBeDisabled();
  });

  test('reminder dropdown is enabled when a due date is set', async ({ page }) => {
    await register(page, uid());

    await page.getByLabel('Due date and time').fill(`${daysFromNow(1)}T09:00`);
    await expect(page.getByLabel('Reminder')).toBeEnabled();
  });

  test('creates a todo with 15m reminder and shows 🔔 15m badge', async ({ page }) => {
    await register(page, uid());

    const title = `Remind 15m ${uid()}`;
    await createTodo(page, { title, dueDate: daysFromNow(1), reminder: 15 });

    await expect(page.locator('h3', { hasText: title })).toBeVisible();
    await expect(page.locator('span', { hasText: /🔔 15m/ })).toBeVisible();
  });

  test('creates a todo with 1h reminder and shows 🔔 1h badge', async ({ page }) => {
    await register(page, uid());

    const title = `Remind 1h ${uid()}`;
    await createTodo(page, { title, dueDate: daysFromNow(1), reminder: 60 });

    await expect(page.locator('span', { hasText: /🔔 1h/ })).toBeVisible();
  });

  test('creates a todo with 1d reminder and shows 🔔 1d badge', async ({ page }) => {
    await register(page, uid());

    const title = `Remind 1d ${uid()}`;
    await createTodo(page, { title, dueDate: daysFromNow(3), reminder: 1440 });

    await expect(page.locator('span', { hasText: /🔔 1d/ })).toBeVisible();
  });

  test('creates a todo with 1w reminder and shows 🔔 1w badge', async ({ page }) => {
    await register(page, uid());

    const title = `Remind 1w ${uid()}`;
    await createTodo(page, { title, dueDate: daysFromNow(8), reminder: 10080 });

    await expect(page.locator('span', { hasText: /🔔 1w/ })).toBeVisible();
  });

  test('GET /api/notifications/check returns 401 for unauthenticated requests', async ({ page }) => {
    const res = await page.request.get('/api/notifications/check');
    expect(res.status()).toBe(401);
  });

  test('GET /api/notifications/check returns empty list when no reminders due', async ({ page }) => {
    await register(page, uid());

    // Create a todo with a reminder far in the future — no notification should be due.
    const title = `Far future ${uid()}`;
    await createTodo(page, { title, dueDate: daysFromNow(30), reminder: 15 });

    const res = await page.request.get('/api/notifications/check');
    expect(res.status()).toBe(200);
    const body = await res.json() as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  test('editing due date on a todo with a fired reminder re-arms the notification', async ({ page }) => {
    await register(page, uid());

    // Create todo and mark last_notification_sent via API to simulate a fired reminder.
    const title = `Rearm ${uid()}`;
    await createTodo(page, { title, dueDate: daysFromNow(1), reminder: 15 });

    // Get the todo id from the API.
    const listRes = await page.request.get('/api/todos');
    const todos = await listRes.json() as Array<{ id: number; title: string; last_notification_sent: string | null }>;
    const todo = todos.find((t) => t.title === title);
    expect(todo).toBeDefined();

    // Simulate notification already sent.
    await page.request.put(`/api/todos/${todo!.id}`, {
      data: { last_notification_sent: new Date().toISOString() },
    });

    // Verify it is now stamped.
    const afterStamp = await page.request.get('/api/todos');
    const stamped = (await afterStamp.json() as Array<{ id: number; title: string; last_notification_sent: string | null }>).find((t) => t.title === title);
    expect(stamped?.last_notification_sent).not.toBeNull();

    // Edit the due date — this should reset last_notification_sent.
    await page.locator('article').filter({ hasText: title }).first().getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Edit due date and time').fill(`${daysFromNow(2)}T10:00`);
    await page.getByRole('button', { name: 'Update Todo' }).click();

    // After edit, last_notification_sent should be null again.
    const afterEdit = await page.request.get('/api/todos');
    const rearmed = (await afterEdit.json() as Array<{ id: number; title: string; last_notification_sent: string | null }>).find((t) => t.title === title);
    expect(rearmed?.last_notification_sent).toBeNull();
  });

  test('notification enable button is visible in the header', async ({ page }) => {
    await register(page, uid());

    await expect(page.getByRole('button', { name: /enable notifications/i })).toBeVisible();
  });
});
