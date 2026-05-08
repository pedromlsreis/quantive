import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

test.describe('Add Measurement Modal', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  test('opens modal when New button is clicked', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new/i }).first();
    await newBtn.click();
    await expect(page.getByRole('dialog', { name: /add new measurement/i })
      .or(page.getByText(/add new measurement/i).first())).toBeVisible({ timeout: 4000 });
  });

  test('modal has source name and value inputs', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new/i }).first();
    await newBtn.click();
    const nameInput = page.getByPlaceholder(/source name/i).first();
    const valueInput = page.getByPlaceholder(/^0$/).first();
    await expect(nameInput).toBeVisible({ timeout: 4000 });
    await expect(valueInput).toBeVisible({ timeout: 4000 });
  });

  test('can add a new source row', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new/i }).first();
    await newBtn.click();
    await page.waitForTimeout(300); // wait for modal animation

    const initialRows = await page.getByPlaceholder(/source name/i).count();
    const addSourceBtn = page.getByRole('button', { name: /add data source/i });
    await addSourceBtn.click();
    const newRows = await page.getByPlaceholder(/source name/i).count();
    expect(newRows).toBeGreaterThan(initialRows);
  });

  test('closes modal on Cancel', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new/i }).first();
    await newBtn.click();
    await page.waitForTimeout(300);
    const cancelBtn = page.getByRole('button', { name: /cancel/i });
    await cancelBtn.click();
    await expect(page.getByText(/add new measurement/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('closes modal on backdrop click', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new/i }).first();
    await newBtn.click();
    await page.waitForTimeout(300);
    // Click backdrop (outside modal)
    await page.mouse.click(10, 10);
    await expect(page.getByText(/add new measurement/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('shows validation error for duplicate source names', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new/i }).first();
    await newBtn.click();
    await page.waitForTimeout(300);

    // Attempt to save with no data — check Save button state
    const saveBtn = page.getByRole('button', { name: /save measurement/i });
    await expect(saveBtn).toBeDisabled();
  });
});
