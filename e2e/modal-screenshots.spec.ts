/**
 * Visual screenshot sweep for the redesigned q-modal system.
 * Captures every reachable modal at desktop (1440x900) and mobile (390x844).
 *
 * Outputs to test-results/modal-shots/. Inspected by hand after the sweep.
 */
import { test, type Page } from '@playwright/test';
import { seedClean } from './helpers/seedClean';
import path from 'path';

const OUT_DIR = path.join(process.cwd(), 'test-results', 'modal-shots');

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
] as const;

async function shot(page: Page, name: string, viewport: string) {
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.${viewport}.png`),
    fullPage: false,
  });
}

async function gotoEmptyDashboard(page: Page) {
  // Dismiss consent only — leave welcome flag alone if we want the welcome modal.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('quantive_analytics_consent', 'denied'); }
    catch { /* noop */ }
  });
  await page.goto('/dashboard');
}

for (const vp of VIEWPORTS) {
  test.describe(`Modal screenshots — ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('WelcomeModal', async ({ page }) => {
      await gotoEmptyDashboard(page);
      const dialog = page.getByRole('dialog', { name: /welcome to quantive/i });
      await dialog.waitFor({ timeout: 8000 });
      await shot(page, 'welcome', vp.name);
    });

    test('AddMeasurementModal', async ({ page }) => {
      await seedClean(page); // dismiss welcome + consent
      await page.goto('/dashboard');
      const cta = page.getByRole('button', { name: /add your first measurement/i });
      await cta.waitFor({ timeout: 6000 });
      await cta.click();
      await page.getByRole('dialog', { name: /add measurement/i }).waitFor({ timeout: 4000 });
      await shot(page, 'add-measurement', vp.name);
    });

    test('FeedbackButton modal', async ({ page }) => {
      await seedClean(page);
      await page.goto('/dashboard');
      // FeedbackButton is rendered in a 0x0 hidden container (FeedbackLauncher).
      // The offscreen native click() is geometry-blocked even with force:true,
      // so dispatch a click via JS — works on both viewports.
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find(b => /Suggest a feature or improvement|Feedback/i.test(b.textContent ?? ''));
        target?.click();
      });
      const dialog = page.getByRole('dialog', { name: /share your feedback/i });
      await dialog.waitFor({ timeout: 5000 });
      await shot(page, 'feedback-empty', vp.name);

      // Fill ≥ 1600 chars so the char counter is visible (threshold check).
      const longText = 'Add cross-currency cost basis tracking with FIFO matching across assets and a clean export to CSV. '.repeat(20);
      await page.getByPlaceholder(/what would you like quantive/i).fill(longText.slice(0, 1700));
      await shot(page, 'feedback-typed', vp.name);
    });

    test('GoalForm modal', async ({ page }) => {
      await seedClean(page);
      await page.goto('/goals');
      // Wait for hydration then JS-click the Add-goal CTA; geometry checks
      // sometimes mark it "hidden" inside the responsive shell, so dispatch
      // a click on the underlying DOM node.
      await page.waitForFunction(() => !!document.querySelector('button[aria-label="Add a goal"]'), { timeout: 8000 });
      await page.evaluate(() => {
        const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Add a goal"]');
        btn?.click();
      });
      const dialog = page.getByRole('dialog', { name: /add a goal|edit goal/i });
      await dialog.waitFor({ timeout: 5000 });
      await shot(page, 'goal-form', vp.name);
    });

    test('AuthModal — signup', async ({ page }) => {
      await seedClean(page);
      await page.goto('/dashboard');
      // Topbar's Sign in button is hidden on mobile (label only on >=sm).
      // Use JS click to bypass viewport visibility checks.
      await page.waitForFunction(() => !!document.querySelector('button[aria-label="Sign in"]'), { timeout: 8000 });
      await page.evaluate(() => {
        const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Sign in"]');
        btn?.click();
      });
      await page.getByRole('dialog', { name: /sign in|create your account/i }).waitFor({ timeout: 5000 });
      // Switch to signup link inside the modal.
      const signUpLink = page.getByRole('button', { name: /^sign up$/i });
      if (await signUpLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await signUpLink.first().click();
        await page.getByRole('dialog', { name: /create your account/i }).waitFor({ timeout: 5000 });
      }
      await shot(page, 'auth-signup', vp.name);
    });
  });
}
