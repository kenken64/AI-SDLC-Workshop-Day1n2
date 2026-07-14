/**
 * tests/03-subtasks-tags-search.spec.ts
 *
 * E2E tests for Person D features:
 *   - Subtasks & Progress (PRP 05)
 *   - Tag System (PRP 06)
 *   - Search & Filtering (PRP 08)
 */

import { test, expect } from '@playwright/test';
import { register, createTodo, addSubtask, createTag } from './helpers';

const uid = () => `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// ─── Subtasks & Progress ─────────────────────────────────────────────────────

test.describe('Subtasks & Progress', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uid());
  });

  test('can add a subtask to a todo', async ({ page }) => {
    await createTodo(page, { title: 'Write report' });
    await addSubtask(page, 'Write report', 'Gather data');
    const card = page.locator('article').filter({ hasText: 'Write report' }).first();
    await expect(card.getByText('Gather data')).toBeVisible();
  });

  test('subtask checkbox toggles completion', async ({ page }) => {
    await createTodo(page, { title: 'Plan meeting' });
    await addSubtask(page, 'Plan meeting', 'Send invites');

    const card = page.locator('article').filter({ hasText: 'Plan meeting' }).first();
    const subtaskCheckbox = card.locator('input[type="checkbox"]').nth(1); // 0 is the todo checkbox
    await subtaskCheckbox.check();
    await expect(subtaskCheckbox).toBeChecked();
  });

  test('progress bar appears and updates', async ({ page }) => {
    await createTodo(page, { title: 'Build feature' });
    await addSubtask(page, 'Build feature', 'Design');
    await addSubtask(page, 'Build feature', 'Implement');
    await addSubtask(page, 'Build feature', 'Test');

    const card = page.locator('article').filter({ hasText: 'Build feature' }).first();
    // Progress bar should show 0/3
    await expect(card.getByText('0/3')).toBeVisible();

    // Check one subtask
    const subtaskCheckbox = card.locator('input[type="checkbox"]').nth(1);
    await subtaskCheckbox.check();
    await expect(card.getByText('1/3')).toBeVisible();
  });

  test('can delete a subtask', async ({ page }) => {
    await createTodo(page, { title: 'Shopping list' });
    await addSubtask(page, 'Shopping list', 'Buy milk');

    const card = page.locator('article').filter({ hasText: 'Shopping list' }).first();
    const deleteBtn = card.locator('button[aria-label="Delete subtask"]');
    await deleteBtn.click();
    await expect(card.getByText('Buy milk')).not.toBeVisible();
  });

  test('subtasks toggle expand/collapse', async ({ page }) => {
    await createTodo(page, { title: 'Todo with subs' });

    const card = page.locator('article').filter({ hasText: 'Todo with subs' }).first();
    const subtaskBtn = card.getByRole('button', { name: /subtasks/i });

    // Expand
    await subtaskBtn.click();
    await expect(card.getByPlaceholder('Add subtask…')).toBeVisible();

    // Collapse
    await subtaskBtn.click();
    await expect(card.getByPlaceholder('Add subtask…')).not.toBeVisible();
  });
});

// ─── Tag System ───────────────────────────────────────────────────────────────

test.describe('Tag System', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uid());
  });

  test('can create a tag via Manage Tags modal', async ({ page }) => {
    await createTag(page, 'Work');
    // Tag appears in the modal list
    await expect(page.getByText('Work')).toBeVisible();
    // Close modal
    await page.getByRole('button', { name: 'Close' }).click();
    // Tag should now appear in the tag picker below the create form
    await expect(page.getByRole('button', { name: 'Work' }).first()).toBeVisible();
  });

  test('duplicate tag name shows error', async ({ page }) => {
    await createTag(page, 'Personal');
    // Try to create same name again
    await page.getByPlaceholder('Tag name').fill('Personal');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible();
  });

  test('can edit a tag name', async ({ page }) => {
    await createTag(page, 'OldName');
    // Click Edit next to OldName
    await page.getByRole('button', { name: 'Edit' }).first().click();
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.clear();
    await nameInput.fill('NewName');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('NewName')).toBeVisible();
    await expect(page.getByText('OldName')).not.toBeVisible();
  });

  test('can delete a tag', async ({ page }) => {
    await createTag(page, 'ToDelete');
    await page.getByRole('button', { name: 'Delete' }).click();
    page.on('dialog', (d) => d.accept());
    await expect(page.getByText('ToDelete')).not.toBeVisible();
  });

  test('can attach a tag to a todo', async ({ page }) => {
    await createTag(page, 'Urgent');
    await page.getByRole('button', { name: 'Close' }).click();

    // Select tag in create form
    await page.getByRole('button', { name: 'Urgent' }).first().click();
    await createTodo(page, { title: 'Tagged task' });

    // Tag pill should appear on the todo card
    const card = page.locator('article').filter({ hasText: 'Tagged task' }).first();
    await expect(card.getByText('Urgent')).toBeVisible();
  });
});

// ─── Search & Filtering ───────────────────────────────────────────────────────

test.describe('Search & Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uid());
    // Create a couple of todos to filter over
    await createTodo(page, { title: 'High priority task', priority: 'high' });
    await createTodo(page, { title: 'Low priority task', priority: 'low' });
    await createTodo(page, { title: 'Medium priority task', priority: 'medium' });
  });

  test('search filters todos by title', async ({ page }) => {
    await page.getByPlaceholder('Search todos and subtasks...').fill('High');
    // debounce: wait briefly
    await page.waitForTimeout(400);
    await expect(page.getByText('High priority task')).toBeVisible();
    await expect(page.getByText('Low priority task')).not.toBeVisible();
  });

  test('clear search button resets filter', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search todos and subtasks...');
    await searchInput.fill('High');
    await page.waitForTimeout(400);

    await page.getByLabel('Clear search').click();
    await expect(searchInput).toHaveValue('');
    await expect(page.getByText('Low priority task')).toBeVisible();
  });

  test('priority filter narrows todo list', async ({ page }) => {
    await page.getByLabel('Priority').first().selectOption('high');
    await expect(page.getByText('High priority task')).toBeVisible();
    await expect(page.getByText('Low priority task')).not.toBeVisible();
    await expect(page.getByText('Medium priority task')).not.toBeVisible();
  });

  test('Clear All button resets all filters', async ({ page }) => {
    await page.getByPlaceholder('Search todos and subtasks...').fill('High');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Clear All' }).click();
    await expect(page.getByText('Low priority task')).toBeVisible();
  });

  test('search matches subtask titles', async ({ page }) => {
    await addSubtask(page, 'Low priority task', 'unique-subtask-content');
    await page.getByPlaceholder('Search todos and subtasks...').fill('unique-subtask-content');
    await page.waitForTimeout(400);
    await expect(page.getByText('Low priority task')).toBeVisible();
    await expect(page.getByText('High priority task')).not.toBeVisible();
  });

  test('can save and reapply a filter preset', async ({ page }) => {
    // Set a filter
    await page.getByLabel('Priority').first().selectOption('low');

    // Open advanced to see preset section
    await page.getByRole('button', { name: /advanced/i }).click();
    await page.getByRole('button', { name: /save filter/i }).click();

    // Name and save the preset
    await page.getByPlaceholder('Preset name…').fill('Low only');
    await page.getByRole('button', { name: 'Save' }).last().click();

    // Clear filter
    await page.getByRole('button', { name: 'Clear All' }).click();
    await expect(page.getByText('High priority task')).toBeVisible();

    // Re-apply preset
    await page.getByRole('button', { name: /advanced/i }).click();
    await page.getByRole('button', { name: 'Low only' }).click();
    await expect(page.getByText('Low priority task')).toBeVisible();
    await expect(page.getByText('High priority task')).not.toBeVisible();
  });
});
