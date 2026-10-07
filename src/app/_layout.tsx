import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthProvider';
import { createTranslator, errorText, localeTag, resolveLanguage } from '@/i18n';
import { PreferencesProvider, useTheme } from '@/providers/PreferencesProvider';
import { ServicesProvider, useBoot } from '@/providers/ServicesProvider';
import { SyncProvider } from '@/sync/SyncProvider';
import { darkColors, lightColors } from '@/theme/tokens';
import { ToastProvider } from '@/ui/Toast';

/** Shown before preferences are available, so it uses the system language and scheme. */
function BootScreen({ error, onRetry }: { error?: { code: string }; onRetry?: () => void }) {
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
            {m.errors.bootTitle}
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
      <Stack.Screen name="drafts" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [boot, retry] = useBoot();

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
                </ToastProvider>
              </SyncProvider>
            </AuthProvider>
          </PreferencesProvider>
        </ServicesProvider>
      )}
    </SafeAreaProvider>
  );
}
