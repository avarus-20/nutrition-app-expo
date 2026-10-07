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
