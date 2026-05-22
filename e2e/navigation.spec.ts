import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';
import { seedClean } from './helpers/seedClean';

// Exercise in-app navigation surfaces:
//   - Sidebar links between Workspace/Plan/Account sections
//   - Topbar breadcrumb reflects the current page
//   - Footer legal links from public pages
//   - Logo button returns to landing
//   - /demo redirect loads the dashboard with demo data
//
// We deliberately use in-app `<Link>`/`<NavLink>` clicks instead of page.goto
// for routes that read PortfolioContext — page.goto would unmount the provider
// and wipe the demo's in-memory state (mock data is not mirrored to storage).

test.describe('In-app sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  for (const { label, urlFragment, headingPattern } of [
    { label: 'Allocations', urlFragment: '/allocations', headingPattern: /^Allocations$/ },
    { label: 'Sources',     urlFragment: '/sources',     headingPattern: /^Sources$/     },
    { label: 'Forecast',    urlFragment: '/forecast',    headingPattern: /^Forecast$/    },
    { label: 'Performance', urlFragment: '/performance', headingPattern: /^Performance$/ },
    { label: 'Goals',       urlFragment: '/goals',       headingPattern: /goals/i        },
  ]) {
    test(`sidebar link to ${label} navigates and shows page heading`, async ({ page }) => {
      const link = page.getByRole('link', { name: new RegExp(`^${label}$`) }).first();
      await expect(link).toBeVisible({ timeout: 8000 });
      await link.click();
      await page.waitForURL(`**${urlFragment}`, { timeout: 10_000 });
      // Either the page heading or — for gated content — the upsell card.
      const heading = page.getByRole('heading', { name: headingPattern }).first();
      const upsell = page.getByRole('link', { name: /upgrade to pro/i }).first();
      await expect(heading.or(upsell)).toBeVisible({ timeout: 10_000 });
    });
  }

  test('topbar breadcrumb reflects the active page', async ({ page }) => {
    // Overview to start (loadDemo lands on /dashboard).
    await expect(page.getByText(/Personal/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Overview/i).first()).toBeVisible();

    // Move to Allocations and the trailing crumb should swap.
    await page.getByRole('link', { name: /^Allocations$/ }).first().click();
    await page.waitForURL('**/allocations');
    await expect(page.getByText(/Allocations/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('quantive home logo on the topbar returns to the landing page', async ({ page }) => {
    const home = page.getByRole('button', { name: /quantive home/i }).first();
    await expect(home).toBeVisible({ timeout: 8000 });
    await home.click();
    await page.waitForURL(/\/(?:$|\?)/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Footer navigation from public pages', () => {
  test.beforeEach(async ({ page }) => {
    await seedClean(page);
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toBeVisible({ timeout: 12_000 });
  });

  for (const { label, urlFragment } of [
    { label: 'Security',  urlFragment: '/security'  },
    { label: 'Privacy',   urlFragment: '/privacy'   },
    { label: 'Terms',     urlFragment: '/terms'     },
    { label: 'Impressum', urlFragment: '/impressum' },
  ]) {
    test(`footer link "${label}" navigates to ${urlFragment}`, async ({ page }) => {
      // Anchor into viewport before clicking — the footer is below the fold on
      // mobile viewports and Playwright auto-scrolls but it's cheaper to be
      // explicit when there are stagger animations on the way.
      const link = page.getByRole('contentinfo').getByRole('link', { name: new RegExp(`^${label}$`) });
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await page.waitForURL(`**${urlFragment}`, { timeout: 10_000 });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    });
  }
});

test.describe('Demo redirect', () => {
  test('/demo loads the dashboard with sample data', async ({ page }) => {
    await seedClean(page);
    await page.goto('/demo');
    // DemoRedirect bounces to / or /dashboard depending on auth state, then a
    // CTA may flip the bit. Wait for the performance section which is only
    // rendered once demo data lands.
    await expect(page.locator('[id="performance"]')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Unknown route', () => {
  test('shows a 404 page for an unknown path', async ({ page }) => {
    await seedClean(page);
    await page.goto('/this-truly-does-not-exist-xyz789');
    await expect(page.getByText(/not found|404|doesn.?t exist/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
