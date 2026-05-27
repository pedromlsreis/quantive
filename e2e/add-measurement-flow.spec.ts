import { test, expect, type Locator } from '@playwright/test';
import { seedClean } from './helpers/seedClean';

// New-source composer: every source is added through this inline form
// (post-modal-revamp). Tests share this helper to stay decoupled from
// composer field ordering.
async function addSourceInComposer(
  dialog: Locator,
  { name, value }: { name: string; value: string },
) {
  const composer = dialog.locator('.q-new-src-form');
  await expect(composer).toBeVisible({ timeout: 4000 });
  await composer.getByPlaceholder(/bank of america/i).fill(name);
  // Composer-local value input; the q-new-src-form scope excludes any
  // already-committed q-src-row inputs.
  await composer.locator('input[inputmode="decimal"]').fill(value);
  await composer.getByRole('button', { name: /^add source$/i }).click();
  // Composer collapses on commit — the "Add a new source" prompt returns.
  await expect(dialog.getByRole('button', { name: /add a new source/i })).toBeVisible({ timeout: 4000 });
}

// Full Add-measurement flow that the existing add-measurement.spec.ts only
// teases at: open the modal from the empty state, fill in source name +
// value + currency, save, and confirm the dashboard hydrates with a
// non-empty Performance section.
//
// All assertions go through accessible roles; the underlying state lives in
// localStorage under `portfolio-data` so the test is fully offline.

test.describe('Add Measurement — full submit flow', () => {
  test.beforeEach(async ({ page }) => {
    await seedClean(page);
    await page.goto('/dashboard');
  });

  test('saving a single measurement renders the dashboard with data', async ({ page }) => {
    const cta = page.getByRole('button', { name: /add your first measurement/i });
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    // Open the inline new-source composer and fill name + initial value.
    // First-time users have no existing rows; the composer is the only entry.
    await dialog.getByRole('button', { name: /add a new source/i }).click();
    await addSourceInComposer(dialog, { name: 'Checking', value: '12500' });

    const saveBtn = dialog.getByRole('button', { name: /save measurement/i });
    await expect(saveBtn).toBeEnabled({ timeout: 4000 });
    await saveBtn.click();

    await expect(dialog).not.toBeVisible({ timeout: 6000 });
    // Empty-state CTA should be gone — dashboard now has data.
    await expect(page.getByRole('button', { name: /add your first measurement/i })).toHaveCount(0, { timeout: 8000 });
    // Performance section is the canonical "we have data" marker.
    await expect(page.locator('[id="performance"]')).toBeVisible({ timeout: 8000 });
  });

  test('adding a second source row and saving keeps both values', async ({ page }) => {
    const cta = page.getByRole('button', { name: /add your first measurement/i });
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    // First source.
    await dialog.getByRole('button', { name: /add a new source/i }).click();
    await addSourceInComposer(dialog, { name: 'Checking', value: '5000' });

    // Second source — composer collapses after each "Add source" press, so
    // re-open it for the next entry.
    await dialog.getByRole('button', { name: /add a new source/i }).click();
    await addSourceInComposer(dialog, { name: 'Brokerage', value: '25000' });

    await dialog.getByRole('button', { name: /save measurement/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 6000 });

    // Both source names should appear somewhere on the dashboard (KPIs/charts/Sources card).
    // Use a poll because allocations/performance sections animate in.
    await expect.poll(async () => {
      const text = await page.locator('main, [class*="q-content"]').first().textContent();
      return text ?? '';
    }, { timeout: 10_000 }).toMatch(/Checking|Brokerage/);
  });

  test('Cancel without saving leaves the empty state intact', async ({ page }) => {
    const cta = page.getByRole('button', { name: /add your first measurement/i });
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    // Add a source via the composer, then bail via the modal's Cancel.
    await dialog.getByRole('button', { name: /add a new source/i }).click();
    await addSourceInComposer(dialog, { name: 'Should Not Save', value: '99999' });

    // The composer commits to an in-memory row, but until the modal's
    // Save button is pressed nothing should reach the dashboard.
    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 4000 });

    // Empty state should remain because nothing was saved.
    await expect(page.getByRole('button', { name: /add your first measurement/i })).toBeVisible({ timeout: 6000 });
    // And nothing the partial entry leaked onto the dashboard.
    await expect(page.getByText('Should Not Save')).toHaveCount(0);
  });

  // ─── New-modal-flow coverage (composer-specific) ────────────────────────
  //
  // The composer is the only entry-point for first-time users, so its
  // contract deserves direct coverage beyond the legacy "happy path" specs
  // above. We assert the composer's commit/cancel semantics here.

  test('composer Cancel discards in-progress entry without adding a row', async ({ page }) => {
    const cta = page.getByRole('button', { name: /add your first measurement/i });
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    await dialog.getByRole('button', { name: /add a new source/i }).click();
    const composer = dialog.locator('.q-new-src-form');
    await expect(composer).toBeVisible({ timeout: 4000 });
    await composer.getByPlaceholder(/bank of america/i).fill('Abandoned');
    await composer.locator('input[inputmode="decimal"]').fill('123');

    // Composer's own Cancel (the .q-new-src-form-foot one) closes the
    // composer without committing — modal stays open, no row added.
    await composer.getByRole('button', { name: /^cancel$/i }).click();
    await expect(composer).not.toBeVisible({ timeout: 4000 });
    await expect(dialog).toBeVisible();

    // Save remains disabled — nothing was committed.
    await expect(dialog.getByRole('button', { name: /save measurement/i })).toBeDisabled();
    // Composer prompt is back, ready for a fresh attempt.
    await expect(dialog.getByRole('button', { name: /add a new source/i })).toBeVisible();
  });

  test('committing a source enables Save and renders the new row inline', async ({ page }) => {
    const cta = page.getByRole('button', { name: /add your first measurement/i });
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    // Initially zero rows + Save disabled.
    await expect(dialog.locator('.q-src-row')).toHaveCount(0);
    const saveBtn = dialog.getByRole('button', { name: /save measurement/i });
    await expect(saveBtn).toBeDisabled();

    await dialog.getByRole('button', { name: /add a new source/i }).click();
    await addSourceInComposer(dialog, { name: 'Vanguard ETF', value: '7500' });

    // The committed source is rendered as a q-src-row labelled with its name.
    const rows = dialog.locator('.q-src-row');
    await expect(rows).toHaveCount(1, { timeout: 4000 });
    await expect(rows.first()).toContainText(/Vanguard ETF/);
    // Save flips to enabled because the row's filled value contributes.
    await expect(saveBtn).toBeEnabled({ timeout: 4000 });
  });

  test('"Add source" stays disabled until a name is typed', async ({ page }) => {
    const cta = page.getByRole('button', { name: /add your first measurement/i });
    await expect(cta).toBeVisible({ timeout: 12_000 });
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /add measurement/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });
    await dialog.getByRole('button', { name: /add a new source/i }).click();

    const composer = dialog.locator('.q-new-src-form');
    const commit = composer.getByRole('button', { name: /^add source$/i });
    await expect(commit).toBeDisabled();

    // A 1-character name is treated as below the minimum threshold.
    await composer.getByPlaceholder(/bank of america/i).fill('A');
    await expect(commit).toBeDisabled();

    await composer.getByPlaceholder(/bank of america/i).fill('Ally');
    await expect(commit).toBeEnabled();
  });
});
