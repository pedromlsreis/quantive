import { test, expect } from '@playwright/test';
import { seedClean } from './helpers/seedClean';

// Landing-page surfaces that landing.spec.ts only smoke-tests:
//   - Section anchors (#features, #pricing, #faq, #how)
//   - StickyNav scroll-to-section behaviour
//   - FAQ accordion (aria-expanded + region visibility)
//   - Footer CTA "Try demo first" routes to /demo
//   - "Get started free" routes to /dashboard

test.describe('Landing page sections and anchors', () => {
  test.beforeEach(async ({ page }) => {
    await seedClean(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 12_000 });
  });

  test('renders the canonical anchor sections', async ({ page }) => {
    for (const id of ['features', 'how', 'pricing', 'faq']) {
      await expect(page.locator(`section[id="${id}"]`)).toBeVisible({ timeout: 8000 });
    }
  });

  test('clicking the Features nav button scrolls to the features section', async ({ page }) => {
    // The sticky nav button uses an onClick handler (smooth scroll). We don't
    // measure the scroll, just confirm the section enters the viewport.
    await page.getByRole('button', { name: /^Features$/ }).first().click();
    const features = page.locator('#features');
    await expect(features).toBeInViewport({ timeout: 6000 });
  });

  test('clicking the Pricing nav button scrolls to the pricing section', async ({ page }) => {
    await page.getByRole('button', { name: /^Pricing$/ }).first().click();
    await expect(page.locator('#pricing')).toBeInViewport({ timeout: 6000 });
  });

  test('FAQ accordion toggles aria-expanded and reveals its answer', async ({ page }) => {
    const firstFaqBtn = page.locator('button.lp-faq-btn').first();
    await firstFaqBtn.scrollIntoViewIfNeeded();
    await expect(firstFaqBtn).toHaveAttribute('aria-expanded', 'false');
    await firstFaqBtn.click();
    await expect(firstFaqBtn).toHaveAttribute('aria-expanded', 'true', { timeout: 4000 });
    await firstFaqBtn.click();
    await expect(firstFaqBtn).toHaveAttribute('aria-expanded', 'false', { timeout: 4000 });
  });

  test('"Try demo first" footer CTA navigates to /demo', async ({ page }) => {
    const demoCta = page.getByRole('link', { name: /try demo first/i });
    await demoCta.scrollIntoViewIfNeeded();
    await demoCta.click();
    await page.waitForURL('**/demo**', { timeout: 10_000 });
  });

  test('"Get started free" footer CTA navigates to /dashboard', async ({ page }) => {
    const startCta = page.getByRole('link', { name: /get started free/i }).last();
    await startCta.scrollIntoViewIfNeeded();
    await startCta.click();
    await page.waitForURL('**/dashboard**', { timeout: 10_000 });
  });
});

test.describe('StickyNav mobile menu', () => {
  test('opens via the hamburger and contains expected navigation items', async ({ page }) => {
    await seedClean(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 12_000 });

    const hamburger = page.getByRole('button', { name: /open menu/i });
    await expect(hamburger).toBeVisible({ timeout: 8000 });
    await hamburger.click();
    // Expanded variant flips the aria-label.
    await expect(page.getByRole('button', { name: /close menu/i })).toBeVisible({ timeout: 4000 });

    // The mobile menu surface lists Features/Pricing/Demo.
    const menu = page.locator('#mobile-nav-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText(/^Features$/)).toBeVisible();
    await expect(menu.getByText(/^Pricing$/)).toBeVisible();
    await expect(menu.getByText(/^Demo$/)).toBeVisible();
  });
});
