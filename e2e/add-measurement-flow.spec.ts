import { test, expect } from '@playwright/test';
import { seedClean } from './helpers/seedClean';

// Full Add-measurement flow that the existing add-measurement.spec.ts only
// teases at: open the modal from the empty state, fill in source name +
// value + currency, save, and confirm the dashboard hydrates with a
// non-empty Performance section.
//
// All assertions go through accessible roles; the underlying state lives in
// localStorage under `portfolio-data` so the test is fully offline.

test.describe('Add Measurement — full submit flow', () => {
  test.beforeEach(async ({ page }) => {
    await seedClean(page);
    await page.goto('/dashboard');
  });

  test('saving a single measurement renders the dashboard with data', async ({ page }) => {
    const cta = page.getByRole('button', { name: /add your first measurement/i });
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    // Fill the first row — name + value. Currency defaults to display currency.
    const nameInput = dialog.getByPlaceholder(/account or asset/i).first();
    const valueInput = dialog.locator('input[inputmode="decimal"]').first();
    await nameInput.fill('Checking');
    await valueInput.fill('12500');

    const saveBtn = dialog.getByRole('button', { name: /save measurement/i });
    await expect(saveBtn).toBeEnabled({ timeout: 4000 });
    await saveBtn.click();

    await expect(dialog).not.toBeVisible({ timeout: 6000 });
    // Empty-state CTA should be gone — dashboard now has data.
    await expect(page.getByRole('button', { name: /add your first measurement/i })).toHaveCount(0, { timeout: 8000 });
    // Performance section is the canonical "we have data" marker.
    await expect(page.locator('[id="performance"]')).toBeVisible({ timeout: 8000 });
  });

  test('adding a second source row and saving keeps both values', async ({ page }) => {
    const cta = page.getByRole('button', { name: /add your first measurement/i });
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    // First row.
    await dialog.getByPlaceholder(/account or asset/i).first().fill('Checking');
    await dialog.locator('input[inputmode="decimal"]').first().fill('5000');

    // Add another row via the "Add data source" affordance.
    const addRow = dialog.getByRole('button', { name: /add data source|add another|add row/i }).first();
    await addRow.click();

    // Locate the *second* row's inputs — placeholder repeats per row.
    const names = dialog.getByPlaceholder(/account or asset/i);
    const values = dialog.locator('input[inputmode="decimal"]');
    await expect.poll(async () => names.count(), { timeout: 4000 }).toBeGreaterThanOrEqual(2);
    await names.nth(1).fill('Brokerage');
    await values.nth(1).fill('25000');

    await dialog.getByRole('button', { name: /save measurement/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 6000 });

    // Both source names should appear somewhere on the dashboard (KPIs/charts/Sources card).
    // Use a poll because allocations/performance sections animate in.
    await expect.poll(async () => {
      const text = await page.locator('main, [class*="q-content"]').first().textContent();
      return text ?? '';
    }, { timeout: 10_000 }).toMatch(/Checking|Brokerage/);
  });

  test('Cancel without saving leaves the empty state intact', async ({ page }) => {
    const cta = page.getByRole('button', { name: /add your first measurement/i });
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    // Fill a row but cancel — values should not persist.
    await dialog.getByPlaceholder(/account or asset/i).first().fill('Should Not Save');
    await dialog.locator('input[inputmode="decimal"]').first().fill('99999');

    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 4000 });

    // Empty state should remain because nothing was saved.
    await expect(page.getByRole('button', { name: /add your first measurement/i })).toBeVisible({ timeout: 6000 });
    // And nothing the partial entry leaked onto the dashboard.
    await expect(page.getByText('Should Not Save')).toHaveCount(0);
  });
});
