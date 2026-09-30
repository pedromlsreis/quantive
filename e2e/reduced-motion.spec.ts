import { test, expect, type Page } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

// The global reduced-motion rule shortens every transition to 0.01ms, which
// still creates (instant) transition objects; count only ones that last.
const LASTING = `document.getAnimations().filter((a) => a.playState === 'running' && Number(a.effect?.getTiming().duration) > 1).length`;

// Every authored transition sits under html[data-app-motion='on'], which is
// set only when the OS allows motion. Automation normally turns motion off
// (navigator.webdriver), so these tests unset it to exercise the real gate.
// It stays set while the document parses: a reused dev server's auto-login
// script runs inline in <head> and must still skip this browser.
async function asRealBrowser(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => document.readyState === 'loading' });
  });
}

test.describe('Reduced motion', () => {
  test('motion is on when the OS allows it', async ({ page }) => {
    await asRealBrowser(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await loadDemo(page);
    await expect(page.locator('html')).toHaveAttribute('data-app-motion', 'on');
  });

  test('with reduced motion the overview is complete, static and fully visible', async ({ page }) => {
    await asRealBrowser(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadDemo(page);

    await expect(page.locator('html')).not.toHaveAttribute('data-app-motion', 'on');
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.locator('.q-fig--hero')).toBeVisible();

    // Nothing is hidden waiting for an animation, and nothing is running.
    const hidden = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('main *'))
        .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).opacity === '0')
        .map((el) => el.className || el.tagName),
    );
    expect(hidden).toEqual([]);
    expect(await page.evaluate(LASTING)).toBe(0);
  });

  test('with reduced motion the composer opens without animating', async ({ page }) => {
    await asRealBrowser(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadDemo(page);
    await page.evaluate(() => window.dispatchEvent(new Event('quantive:add-measurement')));
    const dialog = page.getByRole('dialog', { name: /add entry/i });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(LASTING)).toBe(0);
  });
});
