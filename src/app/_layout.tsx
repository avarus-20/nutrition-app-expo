import { getLocales } from 'expo-localization';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthProvider';
import { createTranslator, errorText, localeTag, resolveLanguage } from '@/i18n';
import { registerServiceWorker } from '@/pwa/serviceWorker';
import { UpdatePrompt } from '@/pwa/UpdatePrompt';
import { PreferencesProvider, useTheme } from '@/providers/PreferencesProvider';
import { ServicesProvider, useBoot } from '@/providers/ServicesProvider';
import { SyncProvider } from '@/sync/SyncProvider';
import { darkColors, lightColors } from '@/theme/tokens';
import { ToastProvider } from '@/ui/Toast';
import { toAppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/** Shown before preferences are available, so it uses the system language and scheme. */
function BootScreen({ error, onRetry, crashed }: { error?: { code: string }; onRetry?: () => void; crashed?: boolean }) {
  const colors = useColorScheme() === 'dark' ? darkColors : lightColors;
  const system = getLocales().map((l) => ({ languageCode: l.languageCode, languageTag: l.languageTag }));
  const language = resolveLanguage('system', system);
  const { m } = createTranslator(language, localeTag(language, system));
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: colors.background }}
    >
      {error ? (
        <>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
            {crashed ? m.errors.crashTitle : m.errors.bootTitle}
          </Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{errorText(m, error.code)}</Text>
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 }}
          >
            <Text style={{ color: colors.primaryText, fontWeight: '600' }}>{m.common.retry}</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={colors.primary} accessibilityLabel={m.common.loading} />
      )}
    </View>
  );
}

function AppStack() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

/** Last-resort screen for render errors anywhere in the app. Local data is unaffected. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  logger.error('ui', 'unhandled render error', error);
  return <BootScreen crashed error={{ code: toAppError(error).code }} onRetry={() => void retry()} />;
}

export default function RootLayout() {
  const [boot, retry] = useBoot();
  useEffect(registerServiceWorker, []);

  return (
    <SafeAreaProvider>
      {boot.status === 'loading' ? (
        <BootScreen />
      ) : boot.status === 'error' ? (
        <BootScreen error={boot.error} onRetry={retry} />
      ) : (
        <ServicesProvider services={boot.services}>
          <PreferencesProvider initial={boot.preferences}>
            <AuthProvider>
              <SyncProvider>
                <ToastProvider>
                  <AppStack />
                  <UpdatePrompt />
                </ToastProvider>
              </SyncProvider>
            </AuthProvider>
          </PreferencesProvider>
        </ServicesProvider>
      )}
    </SafeAreaProvider>
  );
}
