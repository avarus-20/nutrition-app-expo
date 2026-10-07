// Shared helpers for Edge Functions (Deno runtime).
import { createClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Resolves the calling user from the request JWT, or null. */
export async function requireUser(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Validates a base64 payload and its decoded size (bytes). */
export function checkBase64(value: unknown, maxBytes: number): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) return 'invalid_payload';
  if (value.length > Math.ceil(maxBytes / 3) * 4) return 'payload_too_large';
  if (!BASE64.test(value)) return 'invalid_payload';
  return null;
}

/** Normalizes a BCP 47 tag to one of the app languages. */
export function appLanguage(locale: unknown): 'en' | 'ru' | 'fi' {
  const l = typeof locale === 'string' ? locale.toLowerCase() : '';
  if (l.startsWith('ru')) return 'ru';
  if (l.startsWith('fi')) return 'fi';
  return 'en';
}

export type QuotaFunction = 'estimate-photo' | 'transcribe';

const QUOTA_DEFAULTS: Record<QuotaFunction, { env: string; perHour: number }> = {
  'estimate-photo': { env: 'AI_PHOTO_LIMIT_PER_HOUR', perHour: 30 },
  transcribe: { env: 'AI_STT_LIMIT_PER_HOUR', perHour: 60 },
};

export function quotaLimit(fn: QuotaFunction, raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : QUOTA_DEFAULTS[fn].perHour;
}

/**
 * Counts one request against the user's hourly quota (migration
 * 20261007000004_ai_rate_limit.sql). Fails closed: if the quota cannot be
 * checked, the provider is not called.
 */
export async function consumeQuota(userId: string, fn: QuotaFunction): Promise<'ok' | 'exceeded' | 'unavailable'> {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc('consume_ai_quota', {
    p_user_id: userId,
    p_function: fn,
    p_limit: quotaLimit(fn, Deno.env.get(QUOTA_DEFAULTS[fn].env)),
    p_window_seconds: 3600,
  });
  if (error) {
    console.error(`${fn} quota check failed`, error.message);
    return 'unavailable';
  }
  return data === true ? 'ok' : 'exceeded';
}

/** Response for a quota outcome other than 'ok'. */
export function quotaResponse(outcome: 'exceeded' | 'unavailable'): Response {
  return outcome === 'exceeded'
    ? new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '3600' },
      })
    : json(503, { error: 'quota_unavailable' });
}
