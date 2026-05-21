import { test, expect, Page } from '@playwright/test';
import { seedClean } from './helpers/seedClean';

// Open the Add measurement modal via the empty-state CTA.
// We avoid demo mode here because in demo the topbar primary CTA navigates to
// sign-up instead of opening the modal.
async function openModalFromEmptyState(page: Page) {
  // Pre-dismiss WelcomeModal + consent banner via addInitScript so neither
  // backdrop can intercept the CTA click on first render.
  await seedClean(page);
  await page.goto('/dashboard');
  const cta = page.getByRole('button', { name: /add your first measurement/i });
  await expect(cta).toBeVisible({ timeout: 6000 });
  await cta.click();
  await expect(page.getByRole('dialog', { name: /add measurement/i })).toBeVisible({ timeout: 4000 });
}

test.describe('Add Measurement Modal', () => {
  test('opens modal when empty-state CTA is clicked', async ({ page }) => {
    await openModalFromEmptyState(page);
    await expect(page.getByRole('dialog', { name: /add measurement/i })).toBeVisible();
  });

  test('modal has source name and value inputs', async ({ page }) => {
    await openModalFromEmptyState(page);
    const nameInput = page.getByPlaceholder(/account or asset/i).first();
    const valueInput = page.getByRole('dialog').locator('input[inputmode="decimal"]').first();
    await expect(nameInput).toBeVisible({ timeout: 4000 });
    await expect(valueInput).toBeVisible({ timeout: 4000 });
  });

  test('can add a new source row', async ({ page }) => {
    await openModalFromEmptyState(page);
    const initialRows = await page.getByPlaceholder(/account or asset/i).count();
    const addSourceBtn = page.getByRole('button', { name: /add data source|add another|add row/i }).first();
    await addSourceBtn.click();
    const newRows = await page.getByPlaceholder(/account or asset/i).count();
    expect(newRows).toBeGreaterThan(initialRows);
  });

  test('closes modal on Cancel', async ({ page }) => {
    await openModalFromEmptyState(page);
    const cancelBtn = page.getByRole('button', { name: /cancel/i });
    await cancelBtn.click();
    await expect(page.getByRole('dialog', { name: /add measurement/i })).not.toBeVisible({ timeout: 3000 });
  });

  test('closes modal on backdrop click', async ({ page }) => {
    await openModalFromEmptyState(page);
    // Click backdrop (outside modal)
    await page.mouse.click(10, 10);
    await expect(page.getByRole('dialog', { name: /add measurement/i })).not.toBeVisible({ timeout: 3000 });
  });

  test('save button is disabled with no data', async ({ page }) => {
    await openModalFromEmptyState(page);
    const saveBtn = page.getByRole('button', { name: /save measurement/i });
    await expect(saveBtn).toBeDisabled();
  });
});
