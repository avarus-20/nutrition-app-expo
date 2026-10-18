import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { getSupabase } from '@/backend/supabase';
import { ENTITY_ORDER } from '@/database/schema';
import { LOCAL_OWNER } from '@/domain/types';
import { useServices } from '@/providers/ServicesProvider';
import { dataEvents } from '@/services/events';
import { ownerStore } from '@/services/ownerStore';
import { deleteLocalFile } from '@/media/localFiles';
import { AppError, toAppError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { hasVerifiedRecovery, SupabaseAuthGateway, type AuthGateway, type AuthUser, type SignUpResult } from './authGateway';
import { claimLocalData, wipeAccountData } from './claimLocalData';

export type AuthState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: AuthUser };

interface AuthContextValue {
  state: AuthState;
  recoveryReady: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  deleteAccount(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function createGateway(): AuthGateway | null {
  const supabase = getSupabase();
  return supabase ? new SupabaseAuthGateway(supabase) : null;
}

export function AuthProvider({
  children,
  gateway: injected,
}: {
  children: React.ReactNode;
  gateway?: AuthGateway | null;
}) {
  const { db } = useServices();
  const [gateway] = useState<AuthGateway | null>(() => (injected !== undefined ? injected : createGateway()));
  const [state, setState] = useState<AuthState>(gateway ? { status: 'loading' } : { status: 'disabled' });
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    if (!gateway) return;
    let active = true;

    const apply = async (user: AuthUser | null) => {
      if (user) {
        try {
          await claimLocalData(db, user.id);
        } catch (error) {
          logger.error('auth', 'claiming local data failed', error);
        }
      }
      if (!active) return;
      ownerStore.set(user?.id ?? LOCAL_OWNER);
      setState(user ? { status: 'signedIn', user } : { status: 'signedOut' });
    };

    gateway
      .getUser()
      .then(apply)
      .catch((error: unknown) => {
        logger.warn('auth', 'session restore failed', toAppError(error));
        void apply(null);
      });
    const unsubscribe = gateway.onChange((user, event) => {
      // FI: Tavallinen kirjautuminen ei todista salasanan palautuslinkkiä.
      // RU: Обычный вход не подтверждает ссылку восстановления пароля.
      if (event === 'PASSWORD_RECOVERY' && user) setRecoveryReady(true);
      else if (!user || event === 'SIGNED_IN' || event === 'SIGNED_OUT') setRecoveryReady(false);
      void apply(user);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [db, gateway]);

  useEffect(() => {
    if (!gateway || Platform.OS === 'web') return;
    let active = true;
    const accept = async (url: string) => {
      if (!active || !url.includes('auth/update-password')) return;
      setRecoveryReady(false);
      try {
        const verified = await gateway.acceptRecoveryLink(url);
        if (active && verified) setRecoveryReady(true);
      } catch (error) {
        logger.warn('auth', 'password recovery link could not be verified', toAppError(error));
        if (active) setRecoveryReady(false);
      }
    };
    const subscription = Linking.addEventListener('url', ({ url }) => { void accept(url); });
    void Linking.getInitialURL().then((url) => { if (url) void accept(url); });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [gateway]);

  const requireGateway = useCallback((): AuthGateway => {
    if (!gateway) throw new AppError('not_configured', 'Backend not configured');
    return gateway;
  }, [gateway]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      recoveryReady,
      signIn: async (email, password) => {
        setRecoveryReady(false);
        await requireGateway().signIn(email, password);
      },
      signUp: (email, password) => {
        setRecoveryReady(false);
        return requireGateway().signUp(email, password);
      },
      signOut: async () => {
        setRecoveryReady(false);
        await requireGateway().signOut();
        ownerStore.set(LOCAL_OWNER);
        setState({ status: 'signedOut' });
      },
      resetPassword: (email) => requireGateway().resetPassword(email),
      updatePassword: async (password) => {
        if (!hasVerifiedRecovery(state.status, recoveryReady)) {
          throw new AppError('auth', 'A verified recovery session is required');
        }
        await requireGateway().updatePassword(password);
        setRecoveryReady(false);
      },
      deleteAccount: async () => {
        if (state.status !== 'signedIn') throw new AppError('auth', 'Not signed in');
        setRecoveryReady(false);
        await requireGateway().deleteAccount();
        const files = await wipeAccountData(db, state.user.id);
        for (const uri of files) await deleteLocalFile(uri).catch(() => undefined);
        ownerStore.set(LOCAL_OWNER);
        setState({ status: 'signedOut' });
        dataEvents.emit([...ENTITY_ORDER, 'entry_drafts']);
      },
    }),
    [state, recoveryReady, requireGateway, db],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
