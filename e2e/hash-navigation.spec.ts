import { test, expect, type Page } from '@playwright/test';
import { seedClean } from './helpers/seedClean';

// BrowserRouter doesn't scroll to `#id` targets on its own; ScrollToHash in
// App.tsx does, and `scroll-padding-top` in index.css keeps the target clear of
// the fixed nav. Without both, `/#faq` links from other pages land at the top
// or under the nav.

async function navBottom(page: Page): Promise<number> {
  const box = await page.getByRole('navigation').first().boundingBox();
  if (!box) throw new Error('navigation landmark not rendered');
  return box.y + box.height;
}

test.describe('Hash navigation to landing sections', () => {
  test.beforeEach(async ({ page }) => {
    await seedClean(page);
  });

  test('nav "Features" from /pricing lands on #features', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 12_000 });

    await page.getByRole('navigation').first().getByRole('link', { name: 'Features', exact: true }).click();

    await page.waitForURL('**/#features', { timeout: 10_000 });
    await expect(page.locator('section#features')).toBeInViewport({ timeout: 6000 });
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 6000 }).toBeGreaterThan(0);
  });

  test('direct load of /#faq puts the FAQ heading below the fixed nav', async ({ page }) => {
    await page.goto('/#faq');
    const heading = page.locator('section#faq').getByRole('heading', { level: 2 }).first();
    await expect(heading).toBeInViewport({ timeout: 12_000 });

    const bottom = await navBottom(page);
    await expect
      .poll(async () => (await heading.boundingBox())?.y ?? -1, { timeout: 6000 })
      .toBeGreaterThanOrEqual(bottom);
  });
});
