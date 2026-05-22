import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

// Mobile bottom tab bar — primary 4 tabs + "More" sheet. Only renders within
// the in-app shell (i.e. inside AppShell, not on the landing page).

test.describe('Mobile bottom tab bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadDemo(page);
  });

  test('primary tabs are visible and reflect the active route', async ({ page }) => {
    const bar = page.getByRole('navigation', { name: /^Primary$/ });
    await expect(bar).toBeVisible({ timeout: 12_000 });

    // Overview should be the active tab when we land from loadDemo.
    const overview = bar.getByRole('link', { name: /Overview/i });
    await expect(overview).toBeVisible();
    await expect(overview).toHaveClass(/is-active/);
  });

  test('tapping Allocations swaps the active tab and navigates', async ({ page }) => {
    const bar = page.getByRole('navigation', { name: /^Primary$/ });
    await bar.getByRole('link', { name: /^Allocations$/ }).click();
    await page.waitForURL('**/allocations', { timeout: 10_000 });
    await expect(bar.getByRole('link', { name: /^Allocations$/ })).toHaveClass(/is-active/, { timeout: 4000 });
  });

  test('the More sheet opens and lists secondary navigation items', async ({ page }) => {
    const more = page.getByRole('button', { name: /more navigation/i });
    await expect(more).toBeVisible({ timeout: 8000 });
    await more.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible({ timeout: 6000 });
    // Secondary items live in the More sheet — at least Performance is there.
    await expect(sheet.getByRole('link', { name: /^Performance$/ })).toBeVisible({ timeout: 4000 });
  });

  test('Escape closes the More sheet', async ({ page }) => {
    const more = page.getByRole('button', { name: /more navigation/i });
    await more.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible({ timeout: 6000 });
    await page.keyboard.press('Escape');
    await expect(sheet).not.toBeVisible({ timeout: 4000 });
  });
});
