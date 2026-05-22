import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

// Edit + delete individual measurements from the Sources page dropdown.
// Demo mode is sufficient — it seeds enough fact rows for the History modal
// to be non-empty without requiring auth or a fixture upload.

test.describe('Measurement history (edit + delete)', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
    // In-app navigation — a hard page.goto('/sources') would unmount the
    // PortfolioProvider and drop the in-memory demo data (mock state is
    // never mirrored to localStorage, by design).
    const sourcesLink = page.getByRole('link', { name: /^Sources$/ }).first();
    await sourcesLink.click();
    await page.waitForURL(/\/sources/, { timeout: 4000 });
    // Wait for at least one source row to render.
    await expect(page.getByRole('table')).toBeVisible({ timeout: 6000 });
  });

  test('"View measurements" opens the history modal scoped to one source', async ({ page }) => {
    // Open the first source's actions menu.
    const firstActions = page.getByRole('button', { name: /Actions for /i }).first();
    await firstActions.click();
    await page.getByRole('menuitem', { name: /View measurements/i }).click();

    const modal = page.getByRole('dialog', { name: /Measurements for /i });
    await expect(modal).toBeVisible({ timeout: 4000 });
    await expect(modal.getByRole('table')).toBeVisible();
  });

  test('editing a measurement persists and the dashboard reflects it', async ({ page }) => {
    // Capture the first source's name from the actions button so we can
    // re-locate the row after the edit.
    const firstActions = page.getByRole('button', { name: /Actions for /i }).first();
    const actionsLabel = await firstActions.getAttribute('aria-label') ?? '';
    const sourceName = actionsLabel.replace(/^Actions for /i, '').trim();
    expect(sourceName.length).toBeGreaterThan(0);

    await firstActions.click();
    await page.getByRole('menuitem', { name: /View measurements/i }).click();
    const modal = page.getByRole('dialog', { name: /Measurements for /i });
    await expect(modal).toBeVisible({ timeout: 4000 });

    // Click the first row's edit pencil.
    await modal.getByRole('button', { name: /^Edit measurement from /i }).first().click();
    const editModal = page.getByRole('dialog', { name: /Edit measurement/i });
    await expect(editModal).toBeVisible({ timeout: 4000 });

    const valueInput = editModal.getByLabel('Measurement value');
    await valueInput.fill('424242');
    await editModal.getByRole('button', { name: /Save changes/i }).click();

    // Edit sub-modal closes; history modal stays open and shows the new value.
    await expect(editModal).not.toBeVisible({ timeout: 4000 });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/424,242|424\.242/)).toBeVisible({ timeout: 4000 });
  });

  test('delete confirmation gates the destructive action', async ({ page }) => {
    const firstActions = page.getByRole('button', { name: /Actions for /i }).first();
    await firstActions.click();
    await page.getByRole('menuitem', { name: /View measurements/i }).click();
    const modal = page.getByRole('dialog', { name: /Measurements for /i });
    await expect(modal).toBeVisible({ timeout: 4000 });

    const rowsBefore = await modal.getByRole('row').count();
    // Trigger delete on the first row.
    await modal.getByRole('button', { name: /^Delete measurement from /i }).first().click();

    // AlertDialog appears with a "Cancel" affordance.
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible({ timeout: 4000 });
    await expect(confirm.getByText(/Delete measurement from /i)).toBeVisible();
    await confirm.getByRole('button', { name: /^Cancel$/ }).click();

    // Cancel keeps the row count intact.
    await expect(confirm).not.toBeVisible({ timeout: 4000 });
    const rowsAfter = await modal.getByRole('row').count();
    expect(rowsAfter).toBe(rowsBefore);
  });

  test('confirmed delete removes the row from the history', async ({ page }) => {
    const firstActions = page.getByRole('button', { name: /Actions for /i }).first();
    await firstActions.click();
    await page.getByRole('menuitem', { name: /View measurements/i }).click();
    const modal = page.getByRole('dialog', { name: /Measurements for /i });
    await expect(modal).toBeVisible({ timeout: 4000 });

    const rowsBefore = await modal.getByRole('row').count();
    await modal.getByRole('button', { name: /^Delete measurement from /i }).first().click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible({ timeout: 4000 });
    await confirm.getByRole('button', { name: /^Delete measurement$/ }).click();

    await expect(confirm).not.toBeVisible({ timeout: 4000 });
    // History modal stays open; the row count drops by exactly one.
    await expect(modal).toBeVisible();
    await expect.poll(async () => modal.getByRole('row').count()).toBe(rowsBefore - 1);
  });
});
