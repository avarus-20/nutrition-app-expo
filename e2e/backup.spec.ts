import fs from 'node:fs';

import { addManualEntry, expect, openApp, test } from './fixtures';

test('JSON backup restores into a fresh browser profile; CSV export; bad files rejected', async ({
  page,
  browser,
}, testInfo) => {
  await openApp(page);
  await addManualEntry(page, 'Oatmeal, "classic"', '250', '350');
  await expect(page.getByTestId('calories-consumed')).toHaveText('350');

  await openApp(page, '/backup', 'backup-export-json');
  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export-json').click()]);
  expect(jsonDownload.suggestedFilename()).toMatch(/^nutrition-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const jsonPath = testInfo.outputPath('backup.json');
  await jsonDownload.saveAs(jsonPath);
  const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  expect(backup).toMatchObject({ format: 'nutrition-tracker-backup', version: 1 });
  expect(backup.data.meal_items).toHaveLength(1);

  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export-csv').click()]);
  const csvPath = testInfo.outputPath('entries.csv');
  await csvDownload.saveAs(csvPath);
  const lines = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').trimEnd().split('\r\n');
  expect(lines[0]).toMatch(/^date,time,meal,food,quantity,unit,calories_kcal,/);
  expect(lines[1]).toContain('"Oatmeal, ""classic""",250,g,350');

  // Fresh profile = new device / cleared browser.
  const other = await browser.newContext();
  const page2 = await other.newPage();
  page2.on('dialog', (d) => void d.accept());
  await page2.goto('/backup', { waitUntil: 'networkidle' });
  const restore = async (file: string) => {
    const [chooser] = await Promise.all([page2.waitForEvent('filechooser'), page2.getByTestId('backup-restore').click()]);
    await chooser.setFiles(file);
  };
  await restore(jsonPath);
  await expect(page2.getByText('Restored: 2 new, 0 updated, 0 unchanged.')).toBeVisible();
  await restore(jsonPath);
  await expect(page2.getByText('Restored: 0 new, 0 updated, 2 unchanged.')).toBeVisible();

  const bad = testInfo.outputPath('bad.json');
  fs.writeFileSync(bad, JSON.stringify({ hello: 'world' }));
  await restore(bad);
  await expect(page2.getByText('This file is not a valid Nutrition Tracker backup.')).toBeVisible();
  const newer = testInfo.outputPath('newer.json');
  fs.writeFileSync(newer, JSON.stringify({ ...backup, version: 99 }));
  await restore(newer);
  await expect(page2.getByText(/newer app version \(99\)/)).toBeVisible();

  await page2.goto('/', { waitUntil: 'networkidle' });
  await expect(page2.getByTestId('calories-consumed')).toHaveText('350');
  await other.close();
});
