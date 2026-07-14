import { test, expect, type Page } from '@playwright/test';
import { createTodo, register } from './helpers';

const uid = () => `todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

async function visibleTodoTitles(page: Page) {
  return page.locator('h3').allInnerTexts();
}

test.describe('Todo CRUD and priority', () => {
  test('creates todos, defaults to medium, and sorts by priority', async ({ page }) => {
    await register(page, uid());

    const low = `${uid()} low`;
    const high = `${uid()} high`;
    const medium = `${uid()} medium`;

    await createTodo(page, { title: low, priority: 'low' });
    await createTodo(page, { title: high, priority: 'high' });
    await createTodo(page, { title: medium });

    await expect(page.getByRole('heading', { name: low })).toBeVisible();
    await expect(page.getByRole('heading', { name: high })).toBeVisible();
    await expect(page.getByRole('heading', { name: medium })).toBeVisible();

    const titles = await visibleTodoTitles(page);
    expect(titles).toEqual([high, medium, low]);

    // Verify medium badge is rendered on the todo with default priority
    await expect(page.locator('span').filter({ hasText: /^Medium$/ }).first()).toBeVisible();
  });

  test('priority filter narrows the list', async ({ page }) => {
    await register(page, uid());

    const high = `${uid()} high`;
    const medium = `${uid()} medium`;

    await createTodo(page, { title: high, priority: 'high' });
    await createTodo(page, { title: medium, priority: 'medium' });

    await page.getByLabel('Priority filter', { exact: true }).selectOption('high');

    await expect(page.locator('h3', { hasText: high })).toBeVisible();
    await expect(page.locator('h3', { hasText: medium })).toHaveCount(0);
  });

  test('editing priority reorders the todo', async ({ page }) => {
    await register(page, uid());

    const low = `${uid()} low`;
    const medium = `${uid()} medium`;

    await createTodo(page, { title: low, priority: 'low' });
    await createTodo(page, { title: medium, priority: 'medium' });

    // After creation: medium sorts first (higher priority), low sorts second.
    // Promote the low todo (last Edit button) to high so it moves to the top.
    await page.getByRole('button', { name: 'Edit' }).last().click();
    await page.getByLabel('Edit priority').selectOption('high');
    await page.getByRole('button', { name: 'Update Todo' }).click();

    // low (now high priority) should be first, medium second
    const titles = await visibleTodoTitles(page);
    expect(titles[0]).toBe(low);
  });

  test('delete removes a todo immediately', async ({ page }) => {
    await register(page, uid());

    const title = `${uid()} delete me`;
    await createTodo(page, { title, priority: 'medium' });

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  });
});