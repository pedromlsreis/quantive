import { test, expect, type Page } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';
import { seedClean } from './helpers/seedClean';

// /forecast is gated behind the `forecasting` entitlement. Pro users see the
// growth-rate/horizon controls, the chart and its central/range summary; Free
// users see the Pro gate.
//
// The test plan override (`quantive-test-plan`) is read on first render by
// useEntitlements — it MUST land via addInitScript before navigation. seedClean
// does both that and the dismissal flags in one shot.

async function setPlanAndLoadDemo(page: Page, plan: 'pro' | 'free') {
  await seedClean(page, { plan });
  await page.goto('/demo');
  // Wait for the dashboard to settle — demo loading hydrates PortfolioContext.
  await expect(page.locator('[id="performance"]')).toBeVisible({ timeout: 15_000 });
}

async function gotoForecastViaSidebar(page: Page) {
  // In-app nav preserves the demo's in-memory state (mock data is not
  // mirrored to localStorage by design).
  await page.getByRole('link', { name: /^Forecast$/ }).first().click();
  await page.waitForURL('**/forecast', { timeout: 10_000 });
}

test.describe('Forecast page — Pro', () => {
  test.beforeEach(async ({ page }) => {
    await setPlanAndLoadDemo(page, 'pro');
    await gotoForecastViaSidebar(page);
  });

  test('renders the Forecast heading and the chart', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Forecast$/ })).toBeVisible({ timeout: 10_000 });
    // The ForecastChart renders an SVG; we don't assert specific paths.
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 10_000 });
  });

  test('summarises the projection as a central value and a range', async ({ page }) => {
    // The band is ±1.96σ of past deviation, not percentiles: the page names
    // it central / range. Demo seeds enough history for "Your pace".
    await expect(page.getByText(/central/i).first()).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(/range/i).first()).toBeVisible();
    await expect(page.getByRole('tablist', { name: /growth rate/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /your pace/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('does not show the upsell card', async ({ page }) => {
    await expect(page.getByRole('link', { name: /upgrade to pro/i })).toHaveCount(0);
  });
});

test.describe('Forecast page — Free', () => {
  test.beforeEach(async ({ page }) => {
    await setPlanAndLoadDemo(page, 'free');
    await gotoForecastViaSidebar(page);
  });

  test('shows the upsell card with an "Upgrade to Pro" CTA', async ({ page }) => {
    await expect(page.getByRole('link', { name: /upgrade to pro/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('does NOT render the projection controls', async ({ page }) => {
    // The gate replaces the chart and its controls.
    await expect(page.getByRole('tablist', { name: /growth rate/i })).toHaveCount(0);
  });
});
