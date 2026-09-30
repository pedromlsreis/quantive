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

for (const vp of VIEWPORTS) {
  test.describe(`Modal screenshots — ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('AddMeasurementModal', async ({ page }) => {
      await seedClean(page); // dismiss welcome + consent
      await page.goto('/dashboard');
      const cta = page.getByRole('button', { name: /add your first entry/i });
      await cta.waitFor({ timeout: 6000 });
      await cta.click();
      await page.getByRole('dialog', { name: /add entry/i }).waitFor({ timeout: 4000 });
      await shot(page, 'add-measurement', vp.name);
    });

    test('Feedback dialog', async ({ page }) => {
      await seedClean(page);
      await page.goto('/dashboard');
      // The sidebar's "Send feedback" opens it; the sidebar is hidden on
      // mobile, so dispatch the click via JS on both viewports.
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => /^Send feedback$/i.test((b.textContent ?? '').trim())), { timeout: 8000 });
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        buttons.find(b => /^Send feedback$/i.test((b.textContent ?? '').trim()))?.click();
      });
      const dialog = page.getByRole('dialog', { name: /send feedback/i });
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
      // With no goals the page offers "Add your first goal"; with goals, the
      // header button is labelled "Add a goal".
      const addGoal = page.getByRole('button', { name: /add your first goal|add a goal/i }).first();
      await addGoal.waitFor({ timeout: 8000 });
      await addGoal.click();
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
      // Switch to sign-up from inside the modal.
      const signUpLink = page.getByRole('button', { name: /^create an account$/i });
      if (await signUpLink.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await signUpLink.first().click();
        await page.getByRole('dialog', { name: /create your account/i }).waitFor({ timeout: 5000 });
      }
      await shot(page, 'auth-signup', vp.name);
    });
  });
}
