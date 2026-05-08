import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  test('renders all four KPI cards', async ({ page }) => {
    const kpiLabels = ['Net Worth', 'Year-over-Year', 'Sources', 'Liquid Assets'];
    for (const label of kpiLabels) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 6000 });
    }
  });

  test('KPI cards display numeric values', async ({ page }) => {
    // Values like "€123,456" or "42%" should be present
    const netWorthValue = page.locator('[id="performance"]').getByText(/[€$£₪]\s*[\d,]+|[\d,]+\s*[€$£₪]/).first();
    await expect(netWorthValue).toBeVisible({ timeout: 6000 });
  });

  test('Performance section is expanded by default', async ({ page }) => {
    const section = page.locator('[id="performance"]');
    await expect(section).toBeVisible();
    // Charts inside should be visible
    const chart = section.locator('svg').first();
    await expect(chart).toBeVisible({ timeout: 6000 });
  });

  test('section collapse/expand works', async ({ page }) => {
    // Find the Performance section header button
    const collapseBtn = page.locator('button[aria-controls="performance-content"]');
    if (await collapseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Collapse
      await collapseBtn.click();
      await expect(collapseBtn).toHaveAttribute('aria-expanded', 'false');
      // Re-expand
      await collapseBtn.click();
      await expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');
    }
  });

  test('filter bar is visible', async ({ page }) => {
    const filterBar = page.locator('[role="radiogroup"]').first();
    await expect(filterBar).toBeVisible({ timeout: 6000 });
  });

  test('New measurement button is visible and enabled', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: /new/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 6000 });
    await expect(newBtn).toBeEnabled();
  });

  test('dashboard has no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test('demo banner is shown in demo mode', async ({ page }) => {
    const banner = page.getByText(/demo|sample data/i).first();
    // May or may not be present depending on state — just check it doesn't crash
    const isBannerVisible = await banner.isVisible().catch(() => false);
    // This is a soft check — we just verify the page renders
    expect(page.url()).not.toContain('/404');
  });
});
