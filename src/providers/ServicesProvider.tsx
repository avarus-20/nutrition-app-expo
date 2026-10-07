import Constants from 'expo-constants';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { getDatabase } from '@/database/client';
import { createServices, type Services } from '@/services/container';
import { migrateLegacyAsyncStorage, readLegacyLanguage } from '@/services/legacyMigration';
import { ownerStore } from '@/services/ownerStore';
import type { Preferences } from '@/services/settingsService';
import { AppError, toAppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export type BootState =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; services: Services; preferences: Preferences; legacyMigrationError: AppError | null };

const ServicesContext = createContext<Services | null>(null);

async function boot(): Promise<Extract<BootState, { status: 'ready' }>> {
  const db = await getDatabase();
  const services = createServices(db, ownerStore.get, undefined, Constants.expoConfig?.version ?? null);
  let legacyMigrationError: AppError | null = null;
  try {
    await migrateLegacyAsyncStorage(db, ownerStore.get());
  } catch (error) {
    // The app stays usable; the import is retried on next start.
    legacyMigrationError = toAppError(error, 'migration');
    logger.error('boot', 'legacy migration failed', error);
  }
  return { status: 'ready', services, preferences: await loadPreferences(services), legacyMigrationError };
}

/** On first start the language chosen in the previous app version (`app_lang`) is carried over. */
async function loadPreferences(services: Services): Promise<Preferences> {
  if (await services.settings.isInitialized()) return services.settings.load();
  const prefs = await services.settings.load();
  const legacy = await readLegacyLanguage();
  if (legacy === 'ru' || legacy === 'fi') prefs.language = legacy;
  await services.settings.save(prefs);
  return prefs;
}

export function useBoot(): [BootState, () => void] {
  const [state, setState] = useState<BootState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    boot()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((error: unknown) => {
        logger.error('boot', 'failed to open database', error);
        if (!cancelled) setState({ status: 'error', error: toAppError(error, 'database') });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };
  return [state, retry];
}

export function ServicesProvider({ services, children }: { services: Services; children: React.ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new AppError('unknown', 'useServices must be used inside ServicesProvider');
  return s;
}
