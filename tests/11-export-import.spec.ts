/**
 * tests/11-export-import.spec.ts
 * Person E — Export & Import (PRP 09)
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { register, createTodo } from './helpers';

test.describe('Export & Import', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, `export-user-${Date.now()}`);
  });

  test('exports todos as JSON and file is downloaded', async ({ page }) => {
    await createTodo(page, { title: 'Export test todo' });

    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export json/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('exports todos as CSV and file is downloaded', async ({ page }) => {
    await createTodo(page, { title: 'CSV export todo' });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export csv/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('imports a JSON file and todos appear in the list', async ({ page }) => {
    // Build a minimal valid export payload
    const exportPayload = {
      version: 1,
      exported_at: new Date().toISOString(),
      todos: [
        {
          title: 'Imported todo alpha',
          completed: false,
          due_date: null,
          priority: 'medium',
          is_recurring: false,
          recurrence_pattern: null,
          reminder_minutes: null,
          created_at: new Date().toISOString(),
          subtasks: [],
          tags: [],
        },
        {
          title: 'Imported todo beta',
          completed: false,
          due_date: null,
          priority: 'high',
          is_recurring: false,
          recurrence_pattern: null,
          reminder_minutes: null,
          created_at: new Date().toISOString(),
          subtasks: [],
          tags: [],
        },
      ],
    };

    // Write the file to a temp location
    const tmpPath = path.join('/tmp', `todos-import-test-${Date.now()}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify(exportPayload));

    // Upload the file via the hidden import input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpPath);

    // Both imported todos should appear
    await expect(page.getByText('Imported todo alpha')).toBeVisible();
    await expect(page.getByText('Imported todo beta')).toBeVisible();

    fs.unlinkSync(tmpPath);
  });

  test('shows an error banner for invalid JSON import', async ({ page }) => {
    const tmpPath = path.join('/tmp', `bad-import-${Date.now()}.json`);
    fs.writeFileSync(tmpPath, '{ "invalid": true }');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpPath);

    // An error message should appear
    await expect(page.getByText(/failed to import|invalid|error/i)).toBeVisible();

    fs.unlinkSync(tmpPath);
  });

  test('re-importing the same file duplicates todos by design', async ({ page }) => {
    await createTodo(page, { title: 'Duplicate on re-import' });

    // Export first
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export json/i }).click();
    const download = await downloadPromise;

    const savePath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(savePath);

    // Import the same file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(savePath);

    // The same title should appear at least twice
    const matches = await page.getByText('Duplicate on re-import').count();
    expect(matches).toBeGreaterThanOrEqual(2);

    fs.unlinkSync(savePath);
  });
});
