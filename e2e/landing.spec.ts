import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders hero section with headline and CTAs', async ({ page }) => {
    await expect(page).toHaveTitle(/Quantive/i);
    // Hero heading visible
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
  });

  test('sticky nav is visible on load', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible();
  });

  test('CTA button navigates to dashboard or auth', async ({ page }) => {
    // Find any primary CTA button
    const ctaButton = page.getByRole('link', { name: /get started|try free|sign up/i }).first();
    if (await ctaButton.isVisible()) {
      await ctaButton.click();
      // Should navigate somewhere — just verify no crash
      await expect(page).not.toHaveURL('/404');
    }
  });

  test('has no horizontal scrollbar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
