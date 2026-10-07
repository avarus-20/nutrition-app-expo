import { Directory, File, Paths } from 'expo-file-system';

import { AppError } from '@/utils/errors';

/**
 * Device-local media storage (native). Files live in the app's document
 * directory under `media/`, so they survive restarts and are excluded from
 * caches the OS may evict. The web variant is `localFiles.web.ts`.
 */
const MEDIA_DIR = 'media';

function mediaDirectory(): Directory {
  const dir = new Directory(Paths.document, MEDIA_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Copies a temporary file (camera, picker, recorder) into permanent storage. */
export async function persistFile(sourceUri: string, name: string): Promise<{ uri: string; size: number | null }> {
  try {
    const source = new File(sourceUri);
    const target = new File(mediaDirectory(), name);
    if (target.exists) target.delete();
    await source.copy(target);
    return { uri: target.uri, size: target.size ?? null };
  } catch (error) {
    throw new AppError('database', 'Could not save the file on this device', { cause: error });
  }
}

export async function readFileBytes(uri: string): Promise<Uint8Array> {
  try {
    return await new File(uri).bytes();
  } catch (error) {
    throw new AppError('not_found', 'Local file is missing', { cause: error });
  }
}

export async function deleteLocalFile(uri: string): Promise<void> {
  const file = new File(uri);
  if (file.exists) file.delete();
}

export async function fileExists(uri: string): Promise<boolean> {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Writes downloaded bytes (e.g. a photo synchronized from another device). */
export async function writeFileBytes(name: string, bytes: Uint8Array, _mimeType: string): Promise<string> {
  const target = new File(mediaDirectory(), name);
  if (target.exists) target.delete();
  target.create();
  target.write(bytes);
  return target.uri;
}
