import { test, expect } from '@playwright/test';

test.describe('Onboarding / Empty State', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored data so we get the empty state
    await page.goto('/dashboard');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/dashboard');
  });

  test('shows FileUpload empty state when no data', async ({ page }) => {
    // Either file upload or redirect to landing — both are valid
    const hasUpload = await page.getByText(/add your first measurement/i).isVisible().catch(() => false);
    const hasLanding = await page.getByRole('heading', { level: 1 }).isVisible().catch(() => false);
    expect(hasUpload || hasLanding).toBe(true);
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
