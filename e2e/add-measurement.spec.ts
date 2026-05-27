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

  test('modal exposes the source composer name and value inputs', async ({ page }) => {
    await openModalFromEmptyState(page);
    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    // For a first-time user, the composer is opened from the "Add a new
    // source" prompt — there are no pre-existing rows.
    await dialog.getByRole('button', { name: /add a new source/i }).click();
    const composer = dialog.locator('.q-new-src-form');
    await expect(composer).toBeVisible({ timeout: 4000 });
    await expect(composer.getByPlaceholder(/bank of america/i)).toBeVisible();
    await expect(composer.locator('input[inputmode="decimal"]')).toBeVisible();
  });

  test('committing a source via the composer adds it to the source list', async ({ page }) => {
    await openModalFromEmptyState(page);
    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    const rows = dialog.locator('.q-src-row');
    await expect(rows).toHaveCount(0);

    await dialog.getByRole('button', { name: /add a new source/i }).click();
    const composer = dialog.locator('.q-new-src-form');
    await composer.getByPlaceholder(/bank of america/i).fill('Cash ISA');
    await composer.locator('input[inputmode="decimal"]').fill('2500');
    await composer.getByRole('button', { name: /^add source$/i }).click();

    await expect(rows).toHaveCount(1, { timeout: 4000 });
    await expect(rows.first()).toContainText(/Cash ISA/);
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
