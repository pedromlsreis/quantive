import { test, expect } from '@playwright/test';
import { hasE2EAuth, signIn } from './helpers/auth';
import { seedClean } from './helpers/seedClean';

test.describe('Getting-started checklist', () => {
  test.skip(!hasE2EAuth(), 'Set TEST_USER_* and SUPABASE_SERVICE_ROLE_KEY to run authed specs.');

  test.beforeEach(async ({ page }) => {
    await seedClean(page);
    await page.goto('/');
    await signIn(page);
  });

  // Best-effort: the card only shows when the test account still has open
  // onboarding steps, and the harness seeds localStorage flags rather than
  // encrypted portfolio state, so it can't force that. When the card is
  // present this covers the one integration the unit tests mock — the Add step
  // opening the real measurement modal via the window event AppShell listens
  // for.
  test('Add step opens the real measurement modal', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /getting started/i });
    const cardShown = await heading.isVisible({ timeout: 6000 }).catch(() => false);
    test.skip(!cardShown, 'Test account has no open onboarding steps.');

    const card = page.locator('section', { has: heading });
    const addBtn = card.getByRole('button', { name: /^add$/i });
    const addShown = await addBtn.isVisible().catch(() => false);
    test.skip(!addShown, 'Accounts step already complete on the test account.');

    await addBtn.click();
    await expect(page.getByRole('dialog', { name: /add measurement/i })).toBeVisible({ timeout: 6000 });
  });
});
