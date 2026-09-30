import { expect, type Locator } from '@playwright/test';

/**
 * Opens the composer's new-source form. With no sources to carry forward
 * (a first entry) the form is already open and the trigger isn't rendered.
 */
export async function openNewSourceForm(dialog: Locator) {
  const form = dialog.locator('.q-new-src-form');
  if (await form.isVisible()) return;
  await dialog.getByRole('button', { name: /add a new source/i }).click();
  await expect(form).toBeVisible({ timeout: 4000 });
}
