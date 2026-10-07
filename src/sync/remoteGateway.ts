import type { EntityName } from '@/database/schema';

export type RemoteRow = Record<string, unknown>;

export interface PullCursor {
  ts: string;
  id: string;
}

export interface DeviceInfo {
  id: string;
  user_id: string;
  platform: 'ios' | 'android' | 'web' | 'other';
  app_version: string | null;
  last_seen_at: string;
}

/**
 * Server boundary used by the sync engine. Implemented with Supabase in
 * production and with an in-memory fake in tests.
 *
 * Errors: implementations throw AppError('network') for transport failures
 * (retry later, nothing is wrong with the data) and AppError('sync') for
 * rejected requests (constraint/RLS violations, bad payloads).
 */
export interface RemoteGateway {
  /** Idempotent insert-or-update by primary key. */
  upsert(entity: EntityName, rows: RemoteRow[]): Promise<void>;
  /** Rows of `userId` changed after `after` ordered by (server_updated_at, id). */
  pull(entity: EntityName, userId: string, after: PullCursor | null, limit: number): Promise<RemoteRow[]>;
  /** Uploads a local file to private object storage (overwrites the same path). */
  uploadFile(path: string, localUri: string, mimeType: string): Promise<void>;
  /** Downloads a private object of the signed-in user. */
  downloadFile(path: string): Promise<Uint8Array>;
  /** Removes a private object of the signed-in user (missing objects are not an error). */
  removeFile(path: string): Promise<void>;
  registerDevice(device: DeviceInfo): Promise<void>;
}
