import type { SupabaseClient } from '@supabase/supabase-js';

import type { EntityName } from '@/database/schema';
import { readFileBytes } from '@/media/localFiles';
import { AppError, errorMessage } from '@/utils/errors';
import type { DeviceInfo, PullCursor, RemoteGateway, RemoteRow } from './remoteGateway';

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  statusCode?: string | number;
}

const NETWORK_PATTERN = /network|fetch|timeout|timed out|ECONN|socket|offline|aborted/i;
/** PostgREST / GoTrue codes meaning "the session is not usable right now". */
const SESSION_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

/**
 * Maps a Supabase error to the sync error contract: transient problems
 * (transport, 5xx, rate limit, expired session) become `network` so the
 * whole sync is retried later; anything else is a per-record rejection.
 */
export function classifyRemoteError(error: unknown, rejected: 'sync' | 'upload' = 'sync'): AppError {
  if (error instanceof AppError) return error;
  const e = (error ?? {}) as ErrorLike;
  const message = e.message ?? errorMessage(error);
  const status = Number(e.status ?? e.statusCode ?? 0);
  const code = e.code ?? '';
  let transient: boolean;
  if (/^[0-9A-Z]{5}$/.test(code)) {
    // SQLSTATE: constraint/RLS violations are data problems; serialization
    // failures, cancellations and resource exhaustion are worth retrying.
    transient = /^(40001|40P01|57014|53...)$/.test(code);
  } else if (SESSION_CODES.has(code)) {
    transient = true;
  } else {
    transient =
      NETWORK_PATTERN.test(message) || status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
  }
  return transient
    ? new AppError('network', message, { cause: error })
    : new AppError(rejected, message, { cause: error, details: code || undefined });
}

/** Quotes a value for a PostgREST `or=(...)` filter. */
const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export class SupabaseGateway implements RemoteGateway {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async upsert(entity: EntityName, rows: RemoteRow[]): Promise<void> {
    if (rows.length === 0) return;
    let response;
    try {
      response = await this.client.from(entity).upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
    } catch (error) {
      throw classifyRemoteError(error);
    }
    if (response.error) throw classifyRemoteError({ ...response.error, status: response.status });
  }

  async pull(entity: EntityName, userId: string, after: PullCursor | null, limit: number): Promise<RemoteRow[]> {
    let query = this.client.from(entity).select('*').eq('user_id', userId);
    if (after) {
      query = after.id
        ? query.or(
            `server_updated_at.gt.${quote(after.ts)},and(server_updated_at.eq.${quote(after.ts)},id.gt.${quote(after.id)})`,
          )
        : query.gte('server_updated_at', after.ts);
    }
    let response;
    try {
      response = await query.order('server_updated_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
    } catch (error) {
      throw classifyRemoteError(error);
    }
    if (response.error) throw classifyRemoteError({ ...response.error, status: response.status });
    return (response.data ?? []) as RemoteRow[];
  }

  async uploadFile(path: string, localUri: string, mimeType: string): Promise<void> {
    const bytes = await readFileBytes(localUri).catch((error: unknown) => {
      throw new AppError('upload', 'Local file is missing', { cause: error });
    });
    let response;
    try {
      response = await this.client.storage.from(this.bucket).upload(path, bytes.buffer as ArrayBuffer, {
        contentType: mimeType,
        upsert: true,
      });
    } catch (error) {
      throw classifyRemoteError(error, 'upload');
    }
    if (response.error) throw classifyRemoteError(response.error, 'upload');
  }

  async downloadFile(path: string): Promise<Uint8Array> {
    let response;
    try {
      response = await this.client.storage.from(this.bucket).download(path);
    } catch (error) {
      throw classifyRemoteError(error);
    }
    if (response.error || !response.data) throw classifyRemoteError(response.error ?? new Error('empty download'));
    return new Uint8Array(await response.data.arrayBuffer());
  }

  async removeFile(path: string): Promise<void> {
    let response;
    try {
      response = await this.client.storage.from(this.bucket).remove([path]);
    } catch (error) {
      throw classifyRemoteError(error);
    }
    if (response.error) throw classifyRemoteError(response.error);
  }

  async registerDevice(device: DeviceInfo): Promise<void> {
    let response;
    try {
      response = await this.client.from('devices').upsert(device, { onConflict: 'id' });
    } catch (error) {
      throw classifyRemoteError(error);
    }
    if (response.error) throw classifyRemoteError({ ...response.error, status: response.status });
  }
}
