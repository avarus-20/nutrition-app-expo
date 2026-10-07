import Constants from 'expo-constants';

/**
 * Client configuration. Only public, client-safe values may live here:
 * `EXPO_PUBLIC_*` variables are inlined into the JS bundle at build time.
 * Never add service-role keys or third-party API secrets.
 */
export type AppVariant = 'development' | 'preview' | 'production';

export interface AppConfig {
  variant: AppVariant;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  mediaBucket: string;
}

function readVariant(): AppVariant {
  const v = (Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant;
  return v === 'development' || v === 'preview' ? v : 'production';
}

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export const config: AppConfig = {
  variant: readVariant(),
  supabaseUrl: clean(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  mediaBucket: clean(process.env.EXPO_PUBLIC_SUPABASE_MEDIA_BUCKET) ?? 'user-media',
};

export const isBackendConfigured = (): boolean => Boolean(config.supabaseUrl && config.supabaseAnonKey);
