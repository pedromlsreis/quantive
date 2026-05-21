import { test, expect, Page } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';
import { seedClean } from './helpers/seedClean';

/**
 * Feature 4 — PDF wealth report.
 *
 * We drive the entitlement via the dev-only `quantive-test-plan` override.
 * Pro path: trigger present → modal opens → Generate triggers a PDF download.
 * Free path: the FeatureGate hides the trigger (or renders no fallback),
 * so the button is not in the DOM.
 *
 * For the forecast conditional we don't try to drive an end-to-end render
 * here — the document-tree behaviour is covered exhaustively in the Vitest
 * `pdfReport.test.tsx` snapshot tests. Here we only assert the entry point,
 * modal wiring, and the actual blob download.
 */
async function gotoPerformanceAs(page: Page, plan: 'pro' | 'free') {
  // Seed plan override + dismissal flags via addInitScript BEFORE any
  // navigation so FeatureGate sees the override on first render and the
  // WelcomeModal/ConsentBanner can't intercept the sidebar click.
  await seedClean(page, { plan });
  await loadDemo(page);
  // SPA-navigate to keep mock data in memory (page.goto would hard-reload
  // and wipe the in-memory PortfolioContext).
  await page.getByRole('link', { name: /^performance$/i }).first().click();
  await page.waitForURL(/\/performance$/, { timeout: 10_000 });
  await page.waitForSelector('h1', { timeout: 10_000 });
}

test.describe('PDF wealth report', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('quantive-test-plan');
      } catch {
        /* ignore */
      }
    }).catch(() => null);
  });

  test('Pro user can open the period modal and trigger a PDF download', async ({ page }) => {
    // @react-pdf/renderer is heavy to load and render in headless Chromium.
    // Use the "all time" period (full demo dataset) and give the test plenty
    // of room: ~1 s for module load + ~5–15 s for first render.
    test.setTimeout(90_000);
    await gotoPerformanceAs(page, 'pro');

    const trigger = page.getByTestId('pdf-report-trigger');
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    // Modal opens.
    const modal = page.getByRole('dialog', { name: /pdf wealth report/i });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Default selection is "This year".
    await expect(modal.getByLabel(/this year/i)).toBeChecked();

    const generate = page.getByTestId('pdf-report-generate');
    await expect(generate).toBeEnabled();

    // The download event fires asynchronously after @react-pdf renders the
    // document; give it room.
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await generate.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^quantive_wealth_report_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test('Free user does not see the PDF report trigger', async ({ page }) => {
    await gotoPerformanceAs(page, 'free');
    // The FeatureGate wraps the trigger; it should not render at all for free.
    const trigger = page.getByTestId('pdf-report-trigger');
    await expect(trigger).toHaveCount(0);
  });
});
