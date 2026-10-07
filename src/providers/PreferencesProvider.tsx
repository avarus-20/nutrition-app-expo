import { useLocales } from 'expo-localization';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { createTranslator, localeTag, resolveLanguage, type Translator } from '@/i18n';
import { useServices } from '@/providers/ServicesProvider';
import type { LanguagePreference, Preferences, ThemePreference } from '@/services/settingsService';
import { darkTheme, lightTheme, type Theme } from '@/theme/tokens';
import { logger } from '@/utils/logger';

interface PreferencesContextValue {
  preferences: Preferences;
  setLanguage(language: LanguagePreference): void;
  setTheme(theme: ThemePreference): void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);
const ThemeContext = createContext<Theme>(lightTheme);
const I18nContext = createContext<Translator | null>(null);

export function PreferencesProvider({ initial, children }: { initial: Preferences; children: React.ReactNode }) {
  const { settings } = useServices();
  const [preferences, setPreferences] = useState(initial);
  const systemScheme = useColorScheme();
  const locales = useLocales();

  const update = useCallback(
    (patch: Partial<Preferences>) => {
      const next = { ...preferences, ...patch };
      setPreferences(next);
      settings.save(next).catch((error: unknown) => logger.error('preferences', 'save failed', error));
    },
    [preferences, settings],
  );

  const scheme = preferences.theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preferences.theme;
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  const translator = useMemo(() => {
    const system = locales.map((l) => ({ languageCode: l.languageCode, languageTag: l.languageTag }));
    const language = resolveLanguage(preferences.language, system);
    return createTranslator(language, localeTag(language, system));
  }, [preferences.language, locales]);

  const prefsValue = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      setLanguage: (language) => update({ language }),
      setTheme: (t) => update({ theme: t }),
    }),
    [preferences, update],
  );

  return (
    <PreferencesContext.Provider value={prefsValue}>
      <ThemeContext.Provider value={theme}>
        <I18nContext.Provider value={translator}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          {children}
        </I18nContext.Provider>
      </ThemeContext.Provider>
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useI18n(): Translator {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside PreferencesProvider');
  return ctx;
}
