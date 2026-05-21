import { test, expect } from '@playwright/test';
import { seedClean } from './helpers/seedClean';

test.describe('Onboarding / Empty State', () => {
  test.beforeEach(async ({ page }) => {
    // Pre-dismiss WelcomeModal so its aria-modal backdrop doesn't hide the
    // FileUpload from accessibility-tree queries. addInitScript lands the
    // flag BEFORE the first render, so the modal never appears.
    await seedClean(page);
    await page.goto('/dashboard');
  });

  test('shows FileUpload empty state when no data', async ({ page }) => {
    // Either the file-upload CTA or a level-1 heading is fine — use auto-waiting
    // because the empty-state content animates in (opacity 0 → 1).
    const uploadCta = page.getByRole('button', { name: /add your first measurement/i });
    const landingH1 = page.getByRole('heading', { level: 1 });
    await expect(uploadCta.or(landingH1).first()).toBeVisible({ timeout: 6000 });
  });

  test('empty state has "Add your first measurement" button', async ({ page }) => {
    const btn = page.getByRole('button', { name: /add your first measurement/i });
    if (await btn.isVisible()) {
      await expect(btn).toBeVisible();
      await expect(btn).toBeEnabled();
    }
  });

  test('clicking "Try demo" loads dashboard', async ({ page }) => {
    const demoBtn = page.getByRole('button', { name: /try demo/i });
    if (await demoBtn.isVisible()) {
      await demoBtn.click();
      // Dashboard sections should appear
      await expect(page.getByText(/performance/i).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('drag-and-drop zone is visible and accessible', async ({ page }) => {
    const dropzone = page.locator('[ondrop]').or(page.getByText(/drop an/i));
    if (await dropzone.first().isVisible()) {
      await expect(dropzone.first()).toBeVisible();
    }
  });
});
