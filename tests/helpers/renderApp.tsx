import { render } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PreferencesProvider } from '@/providers/PreferencesProvider';
import { ServicesProvider } from '@/providers/ServicesProvider';
import { createServices, type Services } from '@/services/container';
import type { Preferences } from '@/services/settingsService';
import { ToastProvider } from '@/ui/Toast';
import { FakeFiles } from './fakeFiles';
import { setupDb } from './fixtures';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Real services on an in-memory SQLite database. */
export async function testServices(owner = 'local'): Promise<Services> {
  return createServices(await setupDb(), () => owner, new FakeFiles(), 'test');
}

export async function renderWithApp(
  ui: React.ReactElement,
  services: Services,
  preferences: Preferences = { language: 'en', theme: 'light' },
) {
  return await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ServicesProvider services={services}>
        <PreferencesProvider initial={preferences}>
          <ToastProvider>{ui}</ToastProvider>
        </PreferencesProvider>
      </ServicesProvider>
    </SafeAreaProvider>,
  );
}
