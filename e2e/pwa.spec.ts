import fs from 'node:fs';
import path from 'node:path';

import { expect, openApp, test } from './fixtures';

const SW = path.join(__dirname, '..', 'dist', 'sw.js');

test('installable, starts offline with local data, prompts for updates', async ({ page, context }) => {
  await openApp(page, '/body', 'water-250');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest).toMatchObject({ name: 'Nutrition Tracker', display: 'standalone', start_url: '/' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await page.getByTestId('water-250').click();
  await expect(page.getByTestId('water-total')).toHaveText('250 ml');

  await context.setOffline(true);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.getByTestId('calories-consumed')).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.goto('/body', { waitUntil: 'load' });
  await expect(page.getByTestId('water-total')).toHaveText('250 ml');
  await context.setOffline(false);

  const original = fs.readFileSync(SW, 'utf8');
  fs.writeFileSync(SW, original.replace(/const BUILD = '([0-9a-f]+)'/, "const BUILD = '$1-next'"));
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await expect(page.getByTestId('pwa-update')).toContainText('A new version of the app is available.');
    await Promise.all([page.waitForEvent('load'), page.getByTestId('pwa-reload').click()]);
    await expect(page.getByTestId('pwa-update')).toHaveCount(0);
    const caches = await page.evaluate(async () => (await self.caches.keys()).sort());
    expect(caches.every((k) => k.endsWith('-next'))).toBe(true);
  } finally {
    fs.writeFileSync(SW, original);
  }
});
