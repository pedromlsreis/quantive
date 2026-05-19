import { test, expect, type Page } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

// Helpers — set the dev-only Pro/Free override exposed by useEntitlements.ts.
// Mirrors Agent A's `localStorage.quantive-test-plan` shape; production
// bundles strip the override branch via import.meta.env.DEV.
async function setPlan(page: Page, plan: 'pro' | 'free') {
  await page.addInitScript((p) => {
    window.localStorage.setItem('quantive-test-plan', p);
  }, plan);
}

async function clearPlan(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.removeItem('quantive-test-plan');
  });
}

// Stub the Supabase /benchmarks REST query so the spec doesn't depend on the
// edge function having run. We seed enough rows to make the SP500 series
// look fresh (recent) and the HICP series look stale (>45 days behind).
async function stubBenchmarks(
  page: Page,
  opts: { sp500Stale?: boolean; hicpStale?: boolean } = {},
) {
  const today = new Date();
  const isoDaysAgo = (d: number) => {
    const x = new Date(today);
    x.setUTCDate(x.getUTCDate() - d);
    return x.toISOString().slice(0, 10);
  };

  const sp500: { series_id: string; date: string; value: number }[] = [];
  // 18 months of weekly-ish SP500 points so even the 1y window has data.
  for (let i = 0; i < 78; i++) {
    sp500.push({
      series_id: 'sp500',
      date: isoDaysAgo(opts.sp500Stale ? 10 + i * 7 : i * 7),
      value: 5000 - i * 12,
    });
  }
  const hicp: { series_id: string; date: string; value: number }[] = [];
  for (let i = 0; i < 18; i++) {
    hicp.push({
      series_id: 'inflation_eu',
      date: isoDaysAgo(opts.hicpStale ? 60 + i * 30 : i * 30),
      value: 120 - i * 0.3,
    });
  }
  const all = [...sp500, ...hicp].sort((a, b) => a.date.localeCompare(b.date));

  await page.route(/\/rest\/v1\/benchmarks/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(all),
    });
  });
}

test.describe('Performance — benchmark comparison', () => {
  test.afterEach(async ({ page }) => {
    await clearPlan(page);
  });

  test('Pro user can toggle benchmark overlays on /performance', async ({ page }) => {
    await setPlan(page, 'pro');
    await stubBenchmarks(page);
    await loadDemo(page);

    // Navigate via the sidebar link instead of page.goto so React state
    // (loaded demo data) survives — page.goto would reset the in-memory
    // PortfolioContext and the page would render FileUpload instead.
    await page.getByRole('link', { name: /Performance/i }).first().click();
    await page.waitForURL('**/performance');
    await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible({ timeout: 8000 });

    // The benchmark card is present.
    await expect(page.getByRole('heading', { name: 'Benchmark comparison' })).toBeVisible();

    // Overlay tablist has the three options.
    const overlayTabs = page.getByRole('tablist', { name: 'Benchmark overlay' });
    await expect(overlayTabs).toBeVisible();
    await expect(overlayTabs.getByRole('tab', { name: 'Inflation' })).toBeVisible();
    await expect(overlayTabs.getByRole('tab', { name: /S.*P.*500/ })).toBeVisible();
    await expect(overlayTabs.getByRole('tab', { name: 'Off' })).toBeVisible();

    // Default selection: Inflation.
    await expect(overlayTabs.getByRole('tab', { name: 'Inflation' })).toHaveAttribute('aria-selected', 'true');

    // Toggle to S&P 500.
    await overlayTabs.getByRole('tab', { name: /S.*P.*500/ }).click();
    await expect(overlayTabs.getByRole('tab', { name: /S.*P.*500/ })).toHaveAttribute('aria-selected', 'true');

    // Toggle Off.
    await overlayTabs.getByRole('tab', { name: 'Off' }).click();
    await expect(overlayTabs.getByRole('tab', { name: 'Off' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Free user sees a 12-month preview with the benchmark upsell', async ({ page }) => {
    await setPlan(page, 'free');
    await stubBenchmarks(page);
    await loadDemo(page);

    // Navigate via the sidebar link instead of page.goto so React state
    // (loaded demo data) survives — page.goto would reset the in-memory
    // PortfolioContext and the page would render FileUpload instead.
    await page.getByRole('link', { name: /Performance/i }).first().click();
    await page.waitForURL('**/performance');
    await expect(page.getByRole('heading', { name: 'Benchmark comparison' })).toBeVisible({ timeout: 8000 });

    // The 12-month note is rendered for Free users.
    await expect(page.getByText(/last 12 months/i)).toBeVisible();

    // The benchmarks UpsellCard appears with its "Upgrade to Pro" CTA.
    await expect(page.getByRole('link', { name: /upgrade to pro/i }).first()).toBeVisible();
  });

  test('Stale-data banner appears when the daily series is past its freshness threshold', async ({ page }) => {
    await setPlan(page, 'pro');
    // Make SP500 stale (most recent point >3 days behind).
    await stubBenchmarks(page, { sp500Stale: true });
    await loadDemo(page);

    // Navigate via the sidebar link instead of page.goto so React state
    // (loaded demo data) survives — page.goto would reset the in-memory
    // PortfolioContext and the page would render FileUpload instead.
    await page.getByRole('link', { name: /Performance/i }).first().click();
    await page.waitForURL('**/performance');
    await expect(page.getByRole('heading', { name: 'Benchmark comparison' })).toBeVisible({ timeout: 8000 });

    // Switch the overlay to S&P 500 — staleness banner is tied to the
    // currently-selected series.
    const overlayTabs = page.getByRole('tablist', { name: 'Benchmark overlay' });
    await overlayTabs.getByRole('tab', { name: /S.*P.*500/ }).click();

    // Amber banner with the "hasn't refreshed" copy is visible.
    await expect(page.getByText(/hasn.t refreshed since/i)).toBeVisible();
  });
});
