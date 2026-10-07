import { defineConfig } from '@playwright/test';

/**
 * Browser end-to-end tests against the production web build (`npm run web:build`),
 * served with the production headers (COOP/COEP, CSP) by scripts/serve-web.mjs.
 * Uses the installed Google Chrome (`channel: 'chrome'`).
 */
const PORT = Number(process.env.E2E_PORT ?? 8090);

export default defineConfig({
  testDir: './e2e',
  // The PWA spec rewrites dist/sw.js to simulate a deployment; keep runs sequential.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `node scripts/serve-web.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}/manifest.webmanifest`,
    reuseExistingServer: !process.env.CI,
  },
});
