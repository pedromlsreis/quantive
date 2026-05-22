import { test, expect } from '@playwright/test';

// First-run experience: WelcomeModal + ConsentBanner. Other specs seedClean to
// suppress these — here we test them head-on by NOT seeding the dismissal
// flags. Each test gets a fresh isolated storage context (Playwright default).

test.describe('WelcomeModal first-run experience', () => {
  test('appears on a fresh dashboard visit', async ({ page }) => {
    await page.goto('/dashboard');
    const dialog = page.getByRole('dialog', { name: /welcome to quantive/i });
    await expect(dialog).toBeVisible({ timeout: 12_000 });
  });

  test('Close button dismisses the modal for this session', async ({ page }) => {
    await page.goto('/dashboard');
    const dialog = page.getByRole('dialog', { name: /welcome to quantive/i });
    await expect(dialog).toBeVisible({ timeout: 12_000 });

    await dialog.getByRole('button', { name: /^close$/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 4000 });
  });

  test('"Don\'t show again" persists across reload', async ({ page }) => {
    await page.goto('/dashboard');
    const dialog = page.getByRole('dialog', { name: /welcome to quantive/i });
    await expect(dialog).toBeVisible({ timeout: 12_000 });

    // Tick the persistence checkbox and close.
    const checkbox = dialog.getByRole('checkbox');
    await checkbox.check();
    await dialog.getByRole('button', { name: /^close$/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 4000 });

    // Confirm localStorage was updated.
    const stored = await page.evaluate(() => localStorage.getItem('finance-cockpit-welcome-dismissed'));
    expect(stored).toBe('true');

    // Reload — modal must not reappear.
    await page.reload();
    await expect(page.getByRole('dialog', { name: /welcome to quantive/i })).not.toBeVisible({ timeout: 6000 });
  });
});

test.describe('Analytics consent banner', () => {
  test('appears for first-time visitors without a saved decision', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: /how quantive is used/i });
    await expect(banner).toBeVisible({ timeout: 12_000 });
    await expect(banner.getByRole('button', { name: /^accept$/i })).toBeVisible();
    await expect(banner.getByRole('button', { name: /^decline$/i })).toBeVisible();
  });

  test('Accept dismisses the banner and persists the choice', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: /how quantive is used/i });
    await expect(banner).toBeVisible({ timeout: 12_000 });

    await banner.getByRole('button', { name: /^accept$/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 4000 });

    const stored = await page.evaluate(() => localStorage.getItem('quantive_analytics_consent'));
    expect(stored).toBe('granted');

    // Banner does not return on the next route.
    await page.goto('/pricing');
    await expect(page.getByRole('dialog', { name: /how quantive is used/i })).not.toBeVisible({ timeout: 4000 });
  });

  test('Decline dismisses the banner and persists denial', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: /how quantive is used/i });
    await expect(banner).toBeVisible({ timeout: 12_000 });

    await banner.getByRole('button', { name: /^decline$/i }).click();
    await expect(banner).not.toBeVisible({ timeout: 4000 });

    const stored = await page.evaluate(() => localStorage.getItem('quantive_analytics_consent'));
    expect(stored).toBe('denied');
  });
});
