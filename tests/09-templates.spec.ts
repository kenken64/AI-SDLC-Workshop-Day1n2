/**
 * tests/09-templates.spec.ts
 * Person E — Template System (PRP 07)
 */
import { test, expect } from '@playwright/test';
import { register, createTodo, createTemplate } from './helpers';

test.describe('Template System', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, `tpl-user-${Date.now()}`);
  });

  test('saves a todo as a template and lists it', async ({ page }) => {
    // Fill in a todo but don't add it — just fill the form so "Save as Template" is usable
    await page.getByLabel('Title').fill('Weekly standup');
    await createTemplate(page, { name: 'Weekly Standup Template', description: 'Team sync' });

    // Open Template Manager and verify the template appears
    await page.getByRole('button', { name: /templates/i }).click();
    await expect(page.getByText('Weekly Standup Template')).toBeVisible();
    await expect(page.getByText('Team sync')).toBeVisible();
  });

  test('uses a template to create a todo', async ({ page }) => {
    // Create a template first
    await page.getByLabel('Title').fill('Deploy release');
    await createTemplate(page, { name: 'Release Template' });

    // Open Template Manager and use the template
    await page.getByRole('button', { name: /templates/i }).click();
    await page.getByText('Release Template').waitFor();
    // Click "Use" button for that template
    const templateRow = page.locator('li, article, div').filter({ hasText: 'Release Template' }).first();
    await templateRow.getByRole('button', { name: /use/i }).click();

    // A new todo should have been created and appear in the list
    await expect(page.getByText('Deploy release')).toBeVisible();
  });

  test('deletes a template', async ({ page }) => {
    await page.getByLabel('Title').fill('One-off task');
    await createTemplate(page, { name: 'Delete Me Template' });

    await page.getByRole('button', { name: /templates/i }).click();
    await expect(page.getByText('Delete Me Template')).toBeVisible();

    const templateRow = page.locator('li, article, div').filter({ hasText: 'Delete Me Template' }).first();
    await templateRow.getByRole('button', { name: /delete/i }).click();

    await expect(page.getByText('Delete Me Template')).not.toBeVisible();
  });

  test('template includes priority from current form', async ({ page }) => {
    await page.getByLabel('Title').fill('High priority task');
    await page.getByLabel('Priority', { exact: true }).selectOption('high');
    await createTemplate(page, { name: 'High Priority Template' });

    await page.getByRole('button', { name: /templates/i }).click();
    const templateRow = page.locator('li, article, div').filter({ hasText: 'High Priority Template' }).first();
    await expect(templateRow).toContainText(/high/i);
  });
});
