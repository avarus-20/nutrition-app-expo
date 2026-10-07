import type { LanguagePreference } from '@/services/settingsService';
import { parseLocalDate, type LocalDate } from '@/utils/dates';
import { en, type Messages } from './en';
import { fi } from './fi';
import { isPluralForms, type PluralForms } from './plural';
import { ru } from './ru';

export const LANGUAGES = ['en', 'ru', 'fi'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DICTIONARIES: Record<Language, Messages> = { en, ru, fi };

/** Language names are shown in their own language. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ru: 'Русский', fi: 'Suomi' };

export interface SystemLocale {
  languageCode: string | null;
  languageTag: string;
}

const isLanguage = (v: unknown): v is Language => (LANGUAGES as readonly unknown[]).includes(v);

/** Explicit choice wins; otherwise the first supported system language; else English. */
export function resolveLanguage(pref: LanguagePreference, system: readonly SystemLocale[]): Language {
  if (pref !== 'system') return pref;
  for (const l of system) {
    const code = l.languageCode?.toLowerCase();
    if (isLanguage(code)) return code;
  }
  return 'en';
}

/** BCP-47 tag for Intl: keeps the system region when it matches the language (e.g. en-US vs en-GB). */
export function localeTag(language: Language, system: readonly SystemLocale[]): string {
  const match = system.find((l) => l.languageCode?.toLowerCase() === language);
  return match?.languageTag ?? language;
}

export type Params = Record<string, string | number>;

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole,
  );
}

export interface Translator {
  language: Language;
  locale: string;
  m: Messages;
  /** Interpolates a message; plural messages need a `count` param. */
  t(message: string | PluralForms, params?: Params): string;
  number(value: number, maxFractionDigits?: number): string;
  /** Long localized date for a local calendar date. */
  date(value: LocalDate, style?: 'long' | 'medium' | 'short' | 'weekday'): string;
  /** Month name and year. */
  month(value: LocalDate): string;
  time(iso: string): string;
  dateTime(iso: string): string;
  weekdayShort(value: LocalDate): string;
}

export function createTranslator(language: Language, locale: string): Translator {
  const m = DICTIONARIES[language];
  const pluralRules = new Intl.PluralRules(locale);
  const numberFormats = new Map<number, Intl.NumberFormat>();
  const numberFormat = (digits: number) => {
    let f = numberFormats.get(digits);
    if (!f) {
      f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
      numberFormats.set(digits, f);
    }
    return f;
  };
  const dateFormats = {
    long: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    medium: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    short: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }),
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
  };
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const dateTimeFormat = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    language,
    locale,
    m,
    t(message, params) {
      if (isPluralForms(message)) {
        const count = Number(params?.count ?? 0);
        const rule = pluralRules.select(count) as keyof PluralForms;
        return interpolate(message[rule] ?? message.other, { ...params, count: numberFormat(2).format(count) });
      }
      return interpolate(message, params);
    },
    number: (value, digits = 1) => numberFormat(digits).format(value),
    date: (value, style = 'long') => dateFormats[style].format(parseLocalDate(value)),
    month: (value) => {
      const s = monthFormat.format(parseLocalDate(value));
      return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
    },
    time: (iso) => timeFormat.format(new Date(iso)),
    dateTime: (iso) => dateTimeFormat.format(new Date(iso)),
    weekdayShort: (value) => weekdayShort.format(parseLocalDate(value)),
  };
}

/** Returns the localized message for an error code (falls back to `unknown`). */
export function errorText(m: Messages, code: string): string {
  return (m.errors as Record<string, string>)[code] ?? m.errors.unknown;
}

export type { Messages, PluralForms };
