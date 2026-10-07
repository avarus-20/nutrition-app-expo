import { Slot } from 'expo-router';

import { I18nProvider } from '../lib/i18n';

export default function RootLayout() {
  return (
    <I18nProvider>
      <Slot />
    </I18nProvider>
  );
}
