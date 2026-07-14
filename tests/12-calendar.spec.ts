/**
 * tests/12-calendar.spec.ts
 * Person E — Calendar View (PRP 10)
 */
import { test, expect } from '@playwright/test';
import { register, createTodo } from './helpers';

test.describe('Calendar View', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, `cal-user-${Date.now()}`);
  });

  test('navigates to calendar page', async ({ page }) => {
    await page.getByRole('link', { name: /calendar/i }).click();
    await expect(page).toHaveURL(/\/calendar/);
    // Month label should be visible
    await expect(page.getByText(/january|february|march|april|may|june|july|august|september|october|november|december/i)).toBeVisible();
  });

  test('calendar shows 42 day cells (6×7 grid)', async ({ page }) => {
    await page.goto('/calendar');
    // Each cell is a button (CalendarCell renders a <button>)
    // 42 cells = 6 rows × 7 cols
    const cells = page.locator('.grid-cols-7 button');
    await expect(cells).toHaveCount(42);
  });

  test('today cell is highlighted', async ({ page }) => {
    await page.goto('/calendar');
    // Today's date number has a blue circle background
    const todayCell = page.locator('button').filter({
      has: page.locator('span.bg-blue-500'),
    }).first();
    await expect(todayCell).toBeVisible();
  });

  test('navigates to previous and next month', async ({ page }) => {
    await page.goto('/calendar');
    const initialLabel = await page.locator('h1').textContent();

    await page.getByRole('button', { name: '▶' }).click();
    const nextLabel = await page.locator('h1').textContent();
    expect(nextLabel).not.toBe(initialLabel);

    await page.getByRole('button', { name: '◀' }).click();
    const backLabel = await page.locator('h1').textContent();
    expect(backLabel).toBe(initialLabel);
  });

  test('Today button returns to current month', async ({ page }) => {
    await page.goto('/calendar?month=2024-01');
    await page.getByRole('button', { name: 'Today' }).click();
    // URL should no longer be 2024-01
    await expect(page).not.toHaveURL(/month=2024-01/);
  });

  test('todo with due date appears on correct calendar cell', async ({ page }) => {
    // Create a todo with a due date tomorrow (relative to Singapore "now")
    // We use a fixed future date so the test is deterministic
    const futureDate = '2027-03-15';
    await createTodo(page, { title: 'Calendar visibility test', dueDate: futureDate });

    // Navigate to that month
    await page.goto('/calendar?month=2027-03');

    // The todo title should appear somewhere in the grid
    await expect(page.getByText('Calendar visibility test')).toBeVisible();
  });

  test('clicking a day cell opens the day detail modal', async ({ page }) => {
    await page.goto('/calendar');
    // Click the first day cell in the current month
    const firstCurrentMonthCell = page.locator('button').filter({
      has: page.locator('.text-slate-700, .text-slate-200').first(),
    }).first();
    await firstCurrentMonthCell.click();

    // Modal should open showing "Due on" heading
    await expect(page.getByText(/due on/i)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText(/due on/i)).not.toBeVisible();
  });

  test('Link back to list view works', async ({ page }) => {
    await page.goto('/calendar');
    await page.getByRole('link', { name: /list view/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('invalid month param falls back to current month', async ({ page }) => {
    await page.goto('/calendar?month=not-a-month');
    // Should still render a calendar — no crash, month label visible
    await expect(page.getByRole('heading')).toBeVisible();
    await expect(page.locator('.grid-cols-7 button')).toHaveCount(42);
  });
});
