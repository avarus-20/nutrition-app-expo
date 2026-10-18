import type { SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { AppError } from '@/utils/errors';

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface SignUpResult {
  user: AuthUser | null;
  /** True when the project requires e-mail confirmation before sign-in. */
  needsConfirmation: boolean;
}

/**
 * Authentication boundary. The app talks to this interface only, so other
 * providers (Google, Apple via `signInWithIdToken`) can be added in one place.
 */
export interface AuthGateway {
  getUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  acceptRecoveryLink(url: string): Promise<boolean>;
  /** Deletes the account and all server data (server-side function). */
  deleteAccount(): Promise<void>;
  onChange(listener: (user: AuthUser | null, event: string) => void): () => void;
}

interface ErrorLike {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

export function mapAuthError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = (error ?? {}) as ErrorLike;
  const msg = e.message ?? 'Authentication failed';
  if (e.name === 'AuthRetryableFetchError' || /fetch|network/i.test(msg) || e.status === 0) {
    return new AppError('network', msg, { cause: error });
  }
  switch (e.code) {
    case 'invalid_credentials':
    case 'email_not_confirmed':
      return new AppError(e.code === 'invalid_credentials' ? 'auth_invalid_credentials' : 'auth', msg, {
        cause: error,
        details: { reason: e.code },
      });
    case 'user_already_exists':
    case 'email_exists':
      return new AppError('auth_email_taken', msg, { cause: error });
    case 'weak_password':
      return new AppError('auth_weak_password', msg, { cause: error });
    default:
      if (/invalid login credentials/i.test(msg)) return new AppError('auth_invalid_credentials', msg, { cause: error });
      if (/already registered/i.test(msg)) return new AppError('auth_email_taken', msg, { cause: error });
      return new AppError('auth', msg, { cause: error, details: { reason: e.code } });
  }
}

const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
  u ? { id: u.id, email: u.email ?? null } : null;

export class SupabaseAuthGateway implements AuthGateway {
  constructor(private readonly supabase: SupabaseClient) {}

  async getUser(): Promise<AuthUser | null> {
    // getSession reads the persisted session (works offline); the token is
    // refreshed automatically when the network is available.
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw mapAuthError(error);
    return toUser(data.session?.user);
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw mapAuthError(error);
    const user = toUser(data.user);
    if (!user) throw new AppError('auth', 'No user returned');
    return user;
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await this.supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw mapAuthError(error);
    return { user: toUser(data.user), needsConfirmation: !data.session };
  }

  async signOut(): Promise<void> {
    // 'local' scope: works offline and only ends this device's session.
    const { error } = await this.supabase.auth.signOut({ scope: 'local' });
    if (error) throw mapAuthError(error);
  }

  async resetPassword(email: string): Promise<void> {
    // Both the website and the native deep link land on a password editor.
    const redirectTo = `${Linking.createURL('/auth/update-password')}?type=recovery`;
    const { error } = await this.supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw mapAuthError(error);
  }

  async updatePassword(password: string): Promise<void> {
    if (password.length < 8) throw new AppError('auth_weak_password', 'Password is too short');
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) throw mapAuthError(error);
  }

  /**
   * Native callbacks must exchange a PKCE auth code created by a recovery
   * request on this SAME device. Never install caller-supplied session tokens:
   * another app can invoke public custom URI schemes.
   */
  async acceptRecoveryLink(url: string): Promise<boolean> {
    if (!url.includes('/auth/update-password?')) return false;
    const params = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '');
    if (params.get('type') !== 'recovery') return false;
    const code = params.get('code');
    if (!code) throw new AppError('auth', 'Expected a PKCE recovery code');
    // FI: Koodin vaihto vaatii aiemmin tähän laitteeseen tallennetun PKCE-varmenteen.
    // RU: Обмен кода требует PKCE-верификатор, ранее сохранённый на этом устройстве.
    const { error } = await this.supabase.auth.exchangeCodeForSession(code);
    if (error) throw mapAuthError(error);
    return true;
  }

  async deleteAccount(): Promise<void> {
    const { error } = await this.supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      const context = (error as { context?: { status?: number } }).context;
      throw new AppError(context?.status ? 'auth' : 'network', error.message, { cause: error });
    }
    await this.supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  onChange(listener: (user: AuthUser | null, event: string) => void): () => void {
    const { data } = this.supabase.auth.onAuthStateChange((event, session) => listener(toUser(session?.user), event));
    return () => data.subscription.unsubscribe();
  }
}

/** A normal authenticated session must never unlock the recovery form. */
export function hasVerifiedRecovery(status: string, recoveryReady: boolean): boolean {
  return status === 'signedIn' && recoveryReady;
}

export function validateCredentials(email: string, password: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'invalid_email';
  if (password.length < 8) errors.password = 'too_short';
  return errors;
}
