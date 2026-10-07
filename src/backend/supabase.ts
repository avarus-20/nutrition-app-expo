import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { config, isBackendConfigured } from '@/config/env';

let client: SupabaseClient | null = null;
let appStateHooked = false;

/**
 * Supabase client configured with the public (anon/publishable) key only.
 * Returns null when the backend is not configured: the app then runs in
 * local-only mode. The session is persisted via expo-sqlite's localStorage
 * implementation (native) or the browser's localStorage (web).
 */
export function getSupabase(): SupabaseClient | null {
  if (!isBackendConfigured()) return null;
  if (!client) {
    client = createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      auth: {
        storage: globalThis.localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
    if (Platform.OS !== 'web' && !appStateHooked) {
      appStateHooked = true;
      // Recommended by Supabase for React Native: refresh tokens only while foregrounded.
      AppState.addEventListener('change', (state) => {
        if (state === 'active') void client?.auth.startAutoRefresh();
        else void client?.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}
