import { addManualEntry, expect, openApp, test } from './fixtures';

test('goals, manual and saved-food entries, editing, deletion and persistence', async ({ page }) => {
  await openApp(page, '/goals', 'goals-save');
  await page.getByTestId('goal-calories').fill('2000');
  await page.getByTestId('goals-save').click();

  await openApp(page);
  await page.getByTestId('add-food').click();
  await page.getByRole('radio', { name: 'Manual' }).click();
  await page.getByTestId('manual-name').fill('Oatmeal');
  await page.getByTestId('manual-quantity').fill('250');
  await page.getByRole('button', { name: 'g', exact: true }).click();
  await page.getByTestId('manual-calories').fill('350');
  await page.getByTestId('manual-protein_g').fill('12,5');
  await page.getByText('Also save as a food for later').click();
  await page.getByTestId('manual-submit').click();
  await expect(page.getByTestId('calories-consumed')).toHaveText('350');

  // Saved food, half the amount: nutrition scales.
  await page.getByTestId('add-food').click();
  await page.getByTestId('food-search').fill('oat');
  await page.getByTestId('food-Oatmeal').click();
  await page.getByLabel('Amount').last().fill('125');
  await page.getByTestId('add-selected').click();
  await expect(page.getByTestId('calories-consumed')).toHaveText('525');

  // Edit: doubling the quantity doubles calories; move to dinner.
  await page.getByTestId('item-Oatmeal').first().click();
  await page.getByTestId('item-quantity').fill('500');
  await expect(page.getByTestId('item-calories')).toHaveValue('700');
  await page.getByTestId('item-name').fill('Big oatmeal');
  await page.getByRole('radio', { name: 'Dinner' }).click();
  await page.getByTestId('item-save').click();
  await expect(page.getByTestId('calories-consumed')).toHaveText('875');

  await page.getByTestId('item-Big oatmeal').click();
  await page.getByTestId('item-delete').click();
  await expect(page.getByTestId('calories-consumed')).toHaveText('175');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('calories-consumed')).toHaveText('175');
});

test('history, statistics, weight and water', async ({ page }) => {
  await openApp(page);
  await addManualEntry(page, 'Soup', '300', '240');
  await expect(page.getByTestId('calories-consumed')).toHaveText('240');

  await openApp(page, '/body');
  await page.getByTestId('weight-input').fill('72,5');
  await page.getByTestId('weight-add').click();
  await expect(page.getByTestId('weight-latest')).toContainText('72.5');
  await page.getByTestId('water-250').click();
  await page.getByTestId('water-500').click();
  await expect(page.getByTestId('water-total')).toHaveText('750 ml');

  await openApp(page, '/history');
  await expect(page.getByText('240').first()).toBeVisible();

  await openApp(page, '/stats');
  await expect(page.getByText('Days logged')).toBeVisible();
});
