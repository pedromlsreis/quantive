import { test, expect } from '@playwright/test';

// First-run experience. The welcome modal is gone: the consent banner is the
// only first-visit surface and the empty overview itself says what to do.
// Other specs seedClean to suppress the banner; here it is left unseeded.

test.describe('First visit', () => {
  test('opens on the empty overview with no welcome modal', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: /add your first entry/i })).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('dialog', { name: /welcome to quantive/i })).toHaveCount(0);
  });
});

test.describe('Analytics consent banner', () => {
  test('appears for first-time visitors without a saved decision', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: /allow anonymous analytics/i });
    await expect(banner).toBeVisible({ timeout: 12_000 });
    await expect(banner.getByRole('button', { name: /^accept$/i })).toBeVisible();
    await expect(banner.getByRole('button', { name: /^decline$/i })).toBeVisible();
  });

  test('Accept dismisses the banner and persists the choice', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: /allow anonymous analytics/i });
    await expect(banner).toBeVisible({ timeout: 12_000 });

    await banner.getByRole('button', { name: /^accept$/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 4000 });

    const stored = await page.evaluate(() => localStorage.getItem('quantive_analytics_consent'));
    expect(stored).toBe('granted');

    // Banner does not return on the next route.
    await page.goto('/pricing');
    await expect(page.getByRole('dialog', { name: /allow anonymous analytics/i })).not.toBeVisible({ timeout: 4000 });
  });

  test('Decline dismisses the banner and persists denial', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: /allow anonymous analytics/i });
    await expect(banner).toBeVisible({ timeout: 12_000 });

    await banner.getByRole('button', { name: /^decline$/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 4000 });

    const stored = await page.evaluate(() => localStorage.getItem('quantive_analytics_consent'));
    expect(stored).toBe('denied');
  });
});
