import type { SqlDatabase } from '@/database/types';
import { metaRepository } from '@/repositories/metaRepository';

export type LanguagePreference = 'system' | 'en' | 'ru' | 'fi';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface Preferences {
  language: LanguagePreference;
  theme: ThemePreference;
}

const KEY = 'preferences';

export const DEFAULT_PREFERENCES: Preferences = { language: 'system', theme: 'system' };

const LANGS: LanguagePreference[] = ['system', 'en', 'ru', 'fi'];
const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

export function sanitizePreferences(value: unknown): Preferences {
  const v = (value ?? {}) as Partial<Record<keyof Preferences, unknown>>;
  return {
    language: LANGS.includes(v.language as LanguagePreference)
      ? (v.language as LanguagePreference)
      : DEFAULT_PREFERENCES.language,
    theme: THEMES.includes(v.theme as ThemePreference) ? (v.theme as ThemePreference) : DEFAULT_PREFERENCES.theme,
  };
}

/** Device-local preferences (not synchronized; stored in SQLite app_meta). */
export class SettingsService {
  constructor(private readonly db: SqlDatabase) {}

  async load(): Promise<Preferences> {
    return sanitizePreferences(await metaRepository.getJson(this.db, KEY));
  }

  async save(prefs: Preferences): Promise<void> {
    await metaRepository.setJson(this.db, KEY, sanitizePreferences(prefs));
  }

  async isInitialized(): Promise<boolean> {
    return (await metaRepository.get(this.db, KEY)) !== null;
  }
}
