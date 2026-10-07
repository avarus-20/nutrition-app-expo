import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getSupabase } from '@/backend/supabase';
import { ENTITY_ORDER } from '@/database/schema';
import { LOCAL_OWNER } from '@/domain/types';
import { useServices } from '@/providers/ServicesProvider';
import { dataEvents } from '@/services/events';
import { ownerStore } from '@/services/ownerStore';
import { deleteLocalFile } from '@/media/localFiles';
import { AppError, toAppError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { SupabaseAuthGateway, type AuthGateway, type AuthUser, type SignUpResult } from './authGateway';
import { claimLocalData, wipeAccountData } from './claimLocalData';

export type AuthState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: AuthUser };

interface AuthContextValue {
  state: AuthState;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
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
    const unsubscribe = gateway.onChange((user) => {
      void apply(user);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [db, gateway]);

  const requireGateway = useCallback((): AuthGateway => {
    if (!gateway) throw new AppError('not_configured', 'Backend not configured');
    return gateway;
  }, [gateway]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: async (email, password) => {
        await requireGateway().signIn(email, password);
      },
      signUp: (email, password) => requireGateway().signUp(email, password),
      signOut: async () => {
        await requireGateway().signOut();
        ownerStore.set(LOCAL_OWNER);
        setState({ status: 'signedOut' });
      },
      resetPassword: (email) => requireGateway().resetPassword(email),
      deleteAccount: async () => {
        if (state.status !== 'signedIn') throw new AppError('auth', 'Not signed in');
        await requireGateway().deleteAccount();
        const files = await wipeAccountData(db, state.user.id);
        for (const uri of files) await deleteLocalFile(uri).catch(() => undefined);
        ownerStore.set(LOCAL_OWNER);
        setState({ status: 'signedOut' });
        dataEvents.emit(ENTITY_ORDER);
      },
    }),
    [state, requireGateway, db],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
