import type { Page } from '@playwright/test';

export async function loadDemo(page: Page) {
  await page.goto('/demo');
  await page.waitForURL(/dashboard|\//, { timeout: 10_000 });
  const demoBtn = page.getByRole('button', { name: /try demo/i });
  if (await demoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await demoBtn.click();
  }
  await page.waitForSelector('[id="performance"]', { timeout: 10_000 }).catch(() => null);
}
