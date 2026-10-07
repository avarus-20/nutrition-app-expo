import path from 'node:path';

import { expect, openApp, test } from './fixtures';

const IMAGE = path.join(__dirname, '..', 'assets', 'icon.png');

test('photo attached offline, shown in the meal and removed', async ({ page }) => {
  await openApp(page, '/add?meal=breakfast', 'food-search');
  await page.getByRole('radio', { name: 'Photo' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('photo-choose').first().click()]);
  await chooser.setFiles(IMAGE);
  await expect(page.getByText('Photo attached').first()).toBeVisible();
  // Local-only build: AI estimate needs an account.
  await expect(page.getByTestId('photo-estimate')).toBeDisabled();

  await page.getByRole('button', { name: 'Open meal' }).click();
  await expect(page.getByTestId('photo-0')).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('photo-0')).toBeVisible();

  await page.getByTestId('photo-0').click();
  await page.getByTestId('photo-remove').click();
  await expect(page.getByTestId('photo-0')).toHaveCount(0);
});

test('voice note: record, play, typed text becomes a confirmed draft', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await openApp(page, '/add?meal=breakfast', 'food-search');
  await page.getByRole('radio', { name: 'Voice' }).click();

  await page.getByTestId('voice-record').click();
  await expect(page.getByTestId('voice-recording')).toContainText('0:02', { timeout: 8000 });
  await page.getByTestId('voice-stop').click();
  await expect(page.getByTestId('voice-time-0')).toHaveText(/^0:00 \/ 0:0[2-3]$/);
  await page.getByTestId('voice-play-0').click();
  await expect(page.getByTestId('voice-time-0')).toHaveText(/^0:0[1-3] \//);

  await expect(page.getByText('Speech recognition needs an account')).toBeVisible();
  await page.getByTestId('voice-text').fill('2 eggs, a cup of coffee');
  await page.getByTestId('voice-parse').click();
  await page.waitForURL(/\/drafts\//);
  await expect(page.getByTestId('draft-name-0')).toHaveValue('Eggs');
  await expect(page.getByTestId('draft-quantity-0')).toHaveValue('2');
  await expect(page.getByTestId('draft-name-1')).toHaveValue('Coffee');

  // Unknown nutrition blocks confirmation until entered.
  await page.getByTestId('draft-confirm').click();
  await expect(page.getByText('Calories unknown — please enter them').first()).toBeVisible();
  await page.getByTestId('draft-0-calories').fill('140');
  await page.getByTestId('draft-1-calories').fill('2');
  await page.getByTestId('draft-confirm').click();
  await page.waitForURL((u) => !u.pathname.includes('/drafts'));
  await expect(page.getByTestId('calories-consumed')).toHaveText('142');
  await expect(page.getByText('1 voice note', { exact: true })).toBeVisible();
});
