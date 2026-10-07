import Constants from 'expo-constants';
import * as Network from 'expo-network';
import React, { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { getSupabase } from '@/backend/supabase';
import { config } from '@/config/env';
import { deleteLocalFile } from '@/media/localFiles';
import { useServices } from '@/providers/ServicesProvider';
import { LOCAL_OWNER } from '@/domain/types';
import { dataEvents } from '@/services/events';
import { ownerStore } from '@/services/ownerStore';
import { logger } from '@/utils/logger';
import type { RemoteGateway } from './remoteGateway';
import { SupabaseGateway } from './supabaseGateway';
import { SyncEngine, type SyncResult } from './syncEngine';

export type SyncPhase = 'disabled' | 'signedOut' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

interface SyncContextValue {
  status: SyncStatus;
  /** Starts a sync now (no-op unless signed in). */
  syncNow(): Promise<SyncResult | null>;
  gateway: RemoteGateway | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const LOCAL_CHANGE_DEBOUNCE_MS = 3_000;
const PERIODIC_SYNC_MS = 5 * 60_000;
const SIGN_IN_SYNC_DELAY_MS = 300;

function platform(): 'ios' | 'android' | 'web' | 'other' {
  return Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'other';
}

export function SyncProvider({ children, gateway: injected }: { children: React.ReactNode; gateway?: RemoteGateway | null }) {
  const { db } = useServices();
  const { state: auth } = useAuth();
  const userId = auth.status === 'signedIn' ? auth.user.id : null;

  const [gateway] = useState<RemoteGateway | null>(() => {
    if (injected !== undefined) return injected;
    const client = getSupabase();
    return client ? new SupabaseGateway(client, config.mediaBucket) : null;
  });
  const [engine] = useState<SyncEngine | null>(() =>
    gateway
      ? new SyncEngine(db, gateway, {
          userId: () => ownerStore.get(),
          deviceInfo: () => ({ platform: platform(), appVersion: Constants.expoConfig?.version ?? null }),
          deleteLocalFile,
        })
      : null,
  );

  const [status, setStatus] = useState<SyncStatus>({
    phase: gateway ? 'signedOut' : 'disabled',
    pending: 0,
    lastSyncedAt: null,
    lastError: null,
  });

  const refreshCounts = useCallback(
    async (patch: Partial<SyncStatus> = {}) => {
      if (!engine) return;
      const [pending, lastSyncedAt] = await Promise.all([engine.pendingCount(), engine.lastSyncedAt()]);
      setStatus((s) => ({ ...s, pending, lastSyncedAt, ...patch }));
    },
    [engine],
  );

  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    if (!engine || ownerStore.get() === LOCAL_OWNER) return null;
    setStatus((s) => ({ ...s, phase: 'syncing' }));
    try {
      const result = await engine.sync();
      const phase: SyncPhase =
        result.status === 'offline' ? 'offline' : result.status === 'partial' ? 'error' : result.status === 'skipped' ? 'signedOut' : 'idle';
      await refreshCounts({ phase, lastError: result.errors[0] ?? null });
      return result;
    } catch (error) {
      logger.error('sync', 'unexpected sync failure', error);
      await refreshCounts({ phase: 'error', lastError: String(error) }).catch(() => undefined);
      return null;
    }
  }, [engine, refreshCounts]);

  const trigger = useEffectEvent(() => {
    void syncNow();
  });

  // Sign-in (and session restore) starts a sync shortly after the UI settled.
  useEffect(() => {
    if (!engine || !userId) return;
    const timer = setTimeout(trigger, SIGN_IN_SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [engine, userId]);

  // Local writes: debounce, then sync if something is queued.
  useEffect(() => {
    if (!engine || !userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = dataEvents.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void engine.pendingCount().then((n) => {
          setStatus((s) => ({ ...s, pending: n }));
          if (n > 0 && !engine.isRunning()) trigger();
        });
      }, LOCAL_CHANGE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [engine, userId]);

  // Reconnect, foreground and periodic triggers.
  useEffect(() => {
    if (!engine || !userId) return;
    let wasOnline: boolean | null = null;
    const network = Network.addNetworkStateListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      if (online && wasOnline === false) trigger();
      wasOnline = online;
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') trigger();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') trigger();
    }, PERIODIC_SYNC_MS);
    return () => {
      network.remove();
      appState.remove();
      clearInterval(interval);
    };
  }, [engine, userId]);

  const value = useMemo<SyncContextValue>(
    () => ({ status: gateway && !userId ? { ...status, phase: 'signedOut' } : status, syncNow, gateway }),
    [status, syncNow, gateway, userId],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
