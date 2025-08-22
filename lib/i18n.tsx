// lib/i18n.ts
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Lang = 'ru' | 'fi';

const STRINGS = {
  ru: {
    today: 'Сегодня',
    stats: 'Статистика',
    history: 'История',
    add: 'ДОБАВИТЬ',
    dish: 'Блюдо',
    calories: 'Калории',
    emptyToday: 'Пока пусто. Добавьте первый приём пищи 👇',
    totalToday: '— всего:',
    statsFor: 'Статистика за',
    eatenToday: 'Съедено сегодня:',
    historyTitle: 'История',
    nothingYet: 'Пока нет записей.',
    langShort: 'RU',
    explore: 'explore',
  },
  fi: {
    today: 'Tänään',
    stats: 'Tilastot',
    history: 'Historia',
    add: 'LISÄÄ',
    dish: 'Ruoka',
    calories: 'Kalorit',
    emptyToday: 'Tyhjää. Lisää päivän ensimmäinen merkintä 👇',
    totalToday: '— yhteensä:',
    statsFor: 'Tilastot päivälle',
    eatenToday: 'Syöty tänään:',
    historyTitle: 'Historia',
    nothingYet: 'Ei merkintöjä vielä.',
    langShort: 'FI',
    explore: 'explore',
  },
} as const;

type Dict = typeof STRINGS['ru'];

const I18nCtx = createContext<{
  t: Dict;
  lang: Lang;
  switchLang: () => void;
}>({
  t: STRINGS.ru,
  lang: 'ru',
  switchLang: () => {},
});

const KEY = 'app_lang';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('ru');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'ru' || v === 'fi') setLang(v);
    });
  }, []);

  const switchLang = async () => {
    const next: Lang = lang === 'ru' ? 'fi' : 'ru';
    setLang(next);
    await AsyncStorage.setItem(KEY, next);
  };

  const t = useMemo(() => STRINGS[lang], [lang]);

  return (
    <I18nCtx.Provider value={{ t, lang, switchLang }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useT() {
  return useContext(I18nCtx);
}
