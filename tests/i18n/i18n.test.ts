import { createTranslator, DICTIONARIES, errorText, interpolate, LANGUAGES, localeTag, resolveLanguage } from '@/i18n';
import { isPluralForms } from '@/i18n/plural';
import type { AppErrorCode } from '@/utils/errors';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(path, v);
    else if (isPluralForms(v)) out.set(path, (v as unknown as { other: string }).other);
    else for (const [p, s] of leaves(v, path)) out.set(p, s);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  const reference = leaves(DICTIONARIES.en as unknown as Tree);

  it.each(LANGUAGES)('%s has every key, no empty strings and the same placeholders', (lang) => {
    const dict = leaves(DICTIONARIES[lang] as unknown as Tree);
    expect([...dict.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, value] of dict) {
      expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
      expect({ key, p: placeholders(value) }).toEqual({ key, p: placeholders(reference.get(key)!) });
    }
  });

  it('has a message for every error code', () => {
    const codes: AppErrorCode[] = [
      'database', 'migration', 'network', 'sync', 'auth', 'auth_invalid_credentials', 'auth_email_taken',
      'auth_weak_password', 'permission_denied', 'camera', 'microphone', 'upload', 'validation', 'invalid_import',
      'unsupported_version', 'not_configured', 'not_found', 'unsupported_platform', 'unknown',
    ];
    for (const lang of LANGUAGES) {
      for (const code of codes) expect(errorText(DICTIONARIES[lang], code)).not.toBe('');
    }
    expect(errorText(DICTIONARIES.en, 'no_such_code')).toBe(DICTIONARIES.en.errors.unknown);
  });
});

describe('language resolution', () => {
  it('prefers the explicit choice', () => {
    expect(resolveLanguage('fi', [{ languageCode: 'ru', languageTag: 'ru-RU' }])).toBe('fi');
  });
  it('uses the first supported system language', () => {
    expect(
      resolveLanguage('system', [
        { languageCode: 'de', languageTag: 'de-DE' },
        { languageCode: 'RU', languageTag: 'ru-RU' },
      ]),
    ).toBe('ru');
  });
  it('falls back to English', () => {
    expect(resolveLanguage('system', [{ languageCode: 'de', languageTag: 'de-DE' }])).toBe('en');
    expect(resolveLanguage('system', [])).toBe('en');
  });
  it('keeps the system region for formatting', () => {
    expect(localeTag('en', [{ languageCode: 'en', languageTag: 'en-US' }])).toBe('en-US');
    expect(localeTag('fi', [{ languageCode: 'en', languageTag: 'en-US' }])).toBe('fi');
  });
});

describe('translator', () => {
  it('interpolates and leaves unknown placeholders', () => {
    expect(interpolate('Add {amount} ml {x}', { amount: 250 })).toBe('Add 250 ml {x}');
  });

  it('selects Russian plural forms', () => {
    const tr = createTranslator('ru', 'ru');
    expect(tr.t(tr.m.dashboard.items, { count: 1 })).toBe('1 запись');
    expect(tr.t(tr.m.dashboard.items, { count: 3 })).toBe('3 записи');
    expect(tr.t(tr.m.dashboard.items, { count: 5 })).toBe('5 записей');
    expect(tr.t(tr.m.dashboard.items, { count: 21 })).toBe('21 запись');
  });

  it('selects Finnish and English plural forms', () => {
    const fi = createTranslator('fi', 'fi');
    expect(fi.t(fi.m.dashboard.items, { count: 1 })).toBe('1 merkintä');
    expect(fi.t(fi.m.dashboard.items, { count: 2 })).toBe('2 merkintää');
    const en = createTranslator('en', 'en');
    expect(en.t(en.m.dashboard.items, { count: 1 })).toBe('1 item');
    expect(en.t(en.m.dashboard.items, { count: 0 })).toBe('0 items');
  });

  it('formats numbers with the locale decimal separator', () => {
    expect(createTranslator('fi', 'fi').number(1.5)).toMatch(/^1,5$/);
    expect(createTranslator('en', 'en').number(1.5)).toBe('1.5');
  });

  it('formats local dates without shifting the day', () => {
    const tr = createTranslator('en', 'en-GB');
    expect(tr.date('2024-03-31', 'medium')).toContain('31');
  });
});
