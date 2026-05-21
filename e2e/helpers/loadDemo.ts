import type { Page } from '@playwright/test';
import { seedClean } from './seedClean';

export async function loadDemo(page: Page) {
  // Seed dismissal flags before any navigation so the WelcomeModal /
  // ConsentBanner can't intercept clicks downstream. Idempotent if the spec
  // has already seeded its own plan override.
  await seedClean(page);
  await page.goto('/demo');
  await page.waitForURL(/dashboard|\//, { timeout: 10_000 });
  const demoBtn = page.getByRole('button', { name: /try demo/i });
  if (await demoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await demoBtn.click();
  }
  await page.waitForSelector('[id="performance"]', { timeout: 10_000 }).catch(() => null);
}
