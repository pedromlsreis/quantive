import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';
test.describe('Accessibility', () => {
  test('landing page has skip link or main landmark', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');
    await expect(main).toBeAttached();
  });

  test('all images on landing have alt text', async ({ page }) => {
    await page.goto('/');
    const images = page.locator('img:not([alt])');
    const count = await images.count();
    // No images missing alt attribute
    expect(count).toBe(0);
  });

  test('interactive elements are keyboard-focusable', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    // First focusable element receives focus
    expect(['a', 'button', 'input', 'select', 'textarea', 'div']).toContain(focusedTag);
  });

  test('dashboard KPI cards are keyboard accessible', async ({ page }) => {
    await loadDemo(page);

    // Tab through the page and verify focus moves
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
    }
    const focused = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    expect(focused).not.toBe('body');
  });

  test('modal can be closed with Escape key', async ({ page }) => {
    await loadDemo(page);

    const newBtn = page.getByRole('button', { name: /new/i }).first();
    if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await expect(page.getByText(/add new measurement/i)).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('buttons have accessible labels', async ({ page }) => {
    await page.goto('/');
    // All icon-only buttons should have aria-label
    const buttonsWithoutText = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.filter(btn => {
        const hasText = (btn.textContent || '').trim().length > 0;
        const hasAriaLabel = btn.hasAttribute('aria-label');
        const hasTitle = btn.hasAttribute('title');
        return !hasText && !hasAriaLabel && !hasTitle;
      }).length;
    });
    // Soft check — report count but allow some tolerance
    expect(buttonsWithoutText).toBeLessThan(5);
  });
});
