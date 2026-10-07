import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './fixtures';

const ROUTES = ['/', '/add', '/history', '/stats', '/body', '/settings', '/backup', '/goals', '/foods', '/foods/new', '/auth/sign-in'];

// axe is injected as a script, which the production CSP (correctly) forbids.
test.use({ bypassCSP: true });

for (const scheme of ['light', 'dark'] as const) {
  test(`WCAG 2.1 AA (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const violations = result.violations.map((v) => `${route}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html ?? ''}`);
      expect(violations, route).toEqual([]);
    }
  });
}
