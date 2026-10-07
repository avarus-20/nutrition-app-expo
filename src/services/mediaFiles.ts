import type { MediaEntity } from '@/database/schema';
import type { SqlExecutor } from '@/database/types';

/** Device file storage used by media services (see src/media/localFiles*.ts). */
export interface MediaFileStore {
  /** `mimeType` is reported when the platform knows the stored content type (web blobs). */
  persistFile(sourceUri: string, name: string): Promise<{ uri: string; size: number | null; mimeType?: string | null }>;
  readFileBytes(uri: string): Promise<Uint8Array>;
  deleteLocalFile(uri: string): Promise<void>;
  fileExists(uri: string): Promise<boolean>;
  writeFileBytes(name: string, bytes: Uint8Array, mimeType: string): Promise<string>;
}

export type Downloader = (storagePath: string) => Promise<Uint8Array>;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

export const extensionFor = (mimeType: string): string => EXTENSIONS[mimeType] ?? 'bin';

/** "audio/webm;codecs=opus" -> "audio/webm". */
export const baseMimeType = (mimeType: string): string => mimeType.split(';')[0]!.trim().toLowerCase();

export const isSupportedMimeType = (mimeType: string): boolean => mimeType in EXTENSIONS;

/**
 * Returns a usable local URI for a media row. Rows synchronized from another
 * device only have a `storage_path`: the object is downloaded once (when a
 * downloader is available, i.e. signed in) and cached on the device.
 */
export async function ensureLocalCopy(
  db: SqlExecutor,
  files: MediaFileStore,
  entity: MediaEntity,
  ownerId: string,
  row: { id: string; local_uri: string | null; storage_path: string | null; mime_type: string },
  download: Downloader | null,
): Promise<string | null> {
  if (row.local_uri && (await files.fileExists(row.local_uri))) return row.local_uri;
  if (!row.storage_path || !download) return null;
  const bytes = await download(row.storage_path);
  const uri = await files.writeFileBytes(`${row.id}.${extensionFor(row.mime_type)}`, bytes, row.mime_type);
  await db.run(`UPDATE ${entity} SET local_uri = ? WHERE id = ? AND user_id = ?`, [uri, row.id, ownerId]);
  return uri;
}
