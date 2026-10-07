import { expect, test as base, type Page } from '@playwright/test';

/**
 * Every test fails if the page logs an error/warning or throws. Dialogs
 * (window.confirm) are accepted, as a user confirming would.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() !== 'error' && m.type() !== 'warning') return;
        const text = m.text();
        // Chrome logs failed requests while offline; that is the scenario under test.
        if (/ERR_INTERNET_DISCONNECTED/.test(text)) return;
        errors.push(`${m.type()}: ${text}`);
      });
      page.on('dialog', (d) => void d.accept());
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Navigates and waits until the app has booted (the given element is visible). */
export async function openApp(page: Page, path = '/', readyTestId = 'tab-index') {
  await page.goto(path, { waitUntil: 'networkidle' });
  await expect(page.getByTestId(readyTestId).first()).toBeVisible();
}

export async function addManualEntry(page: Page, name: string, grams: string, calories: string) {
  await page.getByTestId('add-food').click();
  await page.getByRole('radio', { name: 'Manual' }).click();
  await page.getByTestId('manual-name').fill(name);
  await page.getByTestId('manual-quantity').fill(grams);
  await page.getByRole('button', { name: 'g', exact: true }).click();
  await page.getByTestId('manual-calories').fill(calories);
  await page.getByTestId('manual-submit').click();
}
