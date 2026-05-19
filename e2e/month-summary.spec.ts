import { test, expect, Page } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

/**
 * Feature 3 — month-by-month summary table on /performance.
 *
 * We drive the Pro/Free entitlement via the dev-only override in
 * `useEntitlements`: `localStorage.quantive-test-plan = 'pro' | 'free'`. The
 * override only honours `import.meta.env.DEV` so production bundles strip the
 * branch entirely.
 */
async function gotoPerformanceAs(page: Page, plan: 'pro' | 'free') {
  // Set the test-plan override before loading the demo so that the first
  // render of the page tree (and FeatureGate) honours it.
  await page.goto('/dashboard');
  await page.evaluate((p) => {
    window.localStorage.setItem('quantive-test-plan', p);
  }, plan);
  await loadDemo(page);
  // SPA-navigate to keep in-memory mock data alive (page.goto would be a
  // hard reload and would wipe the PortfolioContext).
  await page.getByRole('link', { name: /^performance$/i }).first().click();
  await page.waitForURL(/\/performance$/, { timeout: 10_000 });
  await page.waitForSelector('table.q-table', { timeout: 10_000 });
}

test.describe('Month-by-month summary table', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('quantive-test-plan');
      } catch {
        /* ignore */
      }
    }).catch(() => null);
  });

  test('Pro user sees the table newest-first', async ({ page }) => {
    await gotoPerformanceAs(page, 'pro');
    // Header row.
    await expect(page.getByRole('columnheader', { name: /month-end/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /net worth/i })).toBeVisible();

    // First body row's Month-end cell should be lexicographically >= the last.
    const monthEndCells = page.locator('table.q-table tbody tr td:first-child');
    const count = await monthEndCells.count();
    expect(count).toBeGreaterThan(0);
    if (count >= 2) {
      const first = (await monthEndCells.nth(0).innerText()).trim();
      const last = (await monthEndCells.nth(count - 1).innerText()).trim();
      expect(first.localeCompare(last)).toBeGreaterThanOrEqual(0);
    }
  });

  test('Pro user can download the CSV', async ({ page }) => {
    await gotoPerformanceAs(page, 'pro');
    const downloadBtn = page.getByRole('button', { name: /download as csv|download csv/i });
    await expect(downloadBtn).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      downloadBtn.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^monthly_summary_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('Free user sees redacted rows beyond 12 months and an upsell', async ({ page }) => {
    await gotoPerformanceAs(page, 'free');
    // The demo dataset spans well over 12 months — so at least one row must be
    // flagged as redacted. If the demo data is updated to be shorter than 12mo
    // this assertion would need revisiting (treat that as a real signal, not a
    // flake).
    const redactedRows = page.locator('table.q-table tbody tr[data-redacted="true"]');
    await expect.poll(async () => await redactedRows.count(), { timeout: 5000 }).toBeGreaterThan(0);

    // Upsell card present.
    const upsell = page.getByText(/upgrade|pro|unlock/i).first();
    await expect(upsell).toBeVisible({ timeout: 5_000 });
  });
});
