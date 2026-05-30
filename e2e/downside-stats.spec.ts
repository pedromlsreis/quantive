import { test, expect, Page } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';
import { seedClean } from './helpers/seedClean';

/**
 * Drawdown and downside panel on /performance.
 *
 * A render smoke: unit tests cover the maths in `drawdownStats.ts`, but they
 * never mount the component, so this guards against the panel throwing on
 * real-shaped demo snapshots or silently disappearing in a refactor.
 *
 * Entitlement is driven by the dev-only `quantive-test-plan` override (same
 * mechanism as month-summary.spec.ts), which lets us assert the free-tier
 * history-floor copy as well as the Pro full-history copy.
 */
async function gotoPerformanceAs(page: Page, plan: 'pro' | 'free') {
  await seedClean(page, { plan });
  await loadDemo(page);
  await page.getByRole('link', { name: /^performance$/i }).first().click();
  await page.waitForURL(/\/performance$/, { timeout: 10_000 });
  await page.waitForSelector('table.q-table', { timeout: 10_000 });
}

test.describe('Drawdown and downside panel', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('quantive-test-plan');
      } catch {
        /* ignore */
      }
    }).catch(() => null);
  });

  test('renders the heading and all four stat cards', async ({ page }) => {
    await gotoPerformanceAs(page, 'pro');

    await expect(page.getByRole('heading', { name: /drawdown and downside/i })).toBeVisible();
    await expect(page.getByText('Maximum drawdown', { exact: true })).toBeVisible();
    await expect(page.getByText('Longest decline', { exact: true })).toBeVisible();
    await expect(page.getByText('Best 12 months', { exact: true })).toBeVisible();
    await expect(page.getByText('Worst 12 months', { exact: true })).toBeVisible();
  });

  test('Pro sees full-history copy, Free sees the 12-month-window copy', async ({ page }) => {
    await gotoPerformanceAs(page, 'pro');
    await expect(page.getByText(/computed across your full history/i)).toBeVisible();

    await gotoPerformanceAs(page, 'free');
    await expect(page.getByText(/computed across the last 12 months/i)).toBeVisible();
  });
});
