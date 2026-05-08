import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('settings page renders without crashing', async ({ page }) => {
    // Either shows settings content or redirects to login
    const isSettings = await page.getByText(/settings|preferences|profile/i).first().isVisible().catch(() => false);
    const isAuth = await page.getByText(/sign in|log in|email/i).first().isVisible().catch(() => false);
    expect(isSettings || isAuth).toBe(true);
  });

  test('settings page has a heading', async ({ page }) => {
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test('settings page has no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});

test.describe('404 Not Found', () => {
  test('shows 404 page for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-abc123');
    const notFound = page.getByText(/not found|404|doesn't exist/i).first();
    await expect(notFound).toBeVisible({ timeout: 5000 });
  });
});
