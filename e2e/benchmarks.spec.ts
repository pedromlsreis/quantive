import { test, expect, type Page } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';
import { seedClean } from './helpers/seedClean';

// Helpers — set the dev-only Pro/Free override exposed by useEntitlements.ts.
// `quantive-test-plan` is only honoured under `import.meta.env.DEV`; production
// bundles strip the override branch entirely.
async function setPlan(page: Page, plan: 'pro' | 'free') {
  await seedClean(page, { plan });
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

    // The benchmark card is present. Lives below the fold and hydrates after
    // the stubbed /benchmarks REST response resolves — give it the same 8s
    // budget the sibling tests use for this exact locator (5s default has
    // been seen to lose the race on cold Playwright workers, even though the
    // heading does render).
    await expect(page.getByRole('heading', { name: 'Benchmark comparison' })).toBeVisible({ timeout: 8000 });

    // Overlay control is a multi-select toggle group with three buttons.
    // From here on the assertions are local to the card so the default
    // timeout is plenty.
    const overlayGroup = page.getByRole('group', { name: 'Benchmark overlay' });
    await expect(overlayGroup).toBeVisible();
    const sp500Btn = overlayGroup.getByRole('button', { name: /S.*P.*500/ });
    const inflationBtn = overlayGroup.getByRole('button', { name: 'Inflation EU' });
    const offBtn = overlayGroup.getByRole('button', { name: 'Off' });
    await expect(sp500Btn).toBeVisible();
    await expect(inflationBtn).toBeVisible();
    await expect(offBtn).toBeVisible();

    // Default: S&P 500 on, Inflation EU off, Off not pressed.
    await expect(sp500Btn).toHaveAttribute('aria-pressed', 'true');
    await expect(inflationBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(offBtn).toHaveAttribute('aria-pressed', 'false');

    // Activate Inflation EU alongside S&P 500 — both should now be pressed.
    await inflationBtn.click();
    await expect(sp500Btn).toHaveAttribute('aria-pressed', 'true');
    await expect(inflationBtn).toHaveAttribute('aria-pressed', 'true');

    // Off clears both toggles and becomes pressed itself.
    await offBtn.click();
    await expect(sp500Btn).toHaveAttribute('aria-pressed', 'false');
    await expect(inflationBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(offBtn).toHaveAttribute('aria-pressed', 'true');
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

    // The 12-month note is rendered for Free users on the benchmark overlay.
    // After the merge, the MonthSummaryTable below also surfaces an
    // `history.full` upsell containing "last 12 months", so match the
    // benchmark-specific copy exclusively.
    await expect(
      page.getByText(/Showing the last 12 months\. Upgrade to Pro for the full horizon\./i)
    ).toBeVisible();

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

    // S&P 500 is the default active toggle, so the staleness banner for it
    // should already be visible. The banner is tied to whichever series are
    // currently active in the multi-select group.
    const overlayGroup = page.getByRole('group', { name: 'Benchmark overlay' });
    await expect(overlayGroup.getByRole('button', { name: /S.*P.*500/ }))
      .toHaveAttribute('aria-pressed', 'true');

    // Amber banner with the "hasn't refreshed" copy is visible.
    await expect(page.getByText(/hasn.t refreshed since/i)).toBeVisible();
  });
});
