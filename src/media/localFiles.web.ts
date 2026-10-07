import { AppError } from '@/utils/errors';

/**
 * Device-local media storage (web). Browsers have no app file system that
 * survives reloads with stable URIs, and `blob:` URLs die with the page, so
 * media is kept as a `data:` URI inside the local database row. Photos are
 * compressed before they get here (see docs/MEDIA.md), which keeps rows small.
 */

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

export async function persistFile(sourceUri: string, _name: string): Promise<{ uri: string; size: number | null }> {
  if (sourceUri.startsWith('data:')) {
    const blob = await (await fetch(sourceUri)).blob();
    return { uri: sourceUri, size: blob.size };
  }
  try {
    const blob = await (await fetch(sourceUri)).blob();
    return { uri: await blobToDataUri(blob), size: blob.size };
  } catch (error) {
    throw new AppError('database', 'Could not save the file in this browser', { cause: error });
  }
}

export async function readFileBytes(uri: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  } catch (error) {
    throw new AppError('not_found', 'Local file is missing', { cause: error });
  }
}

export async function deleteLocalFile(_uri: string): Promise<void> {
  // Data lives in the database row and disappears with it.
}

export async function fileExists(uri: string): Promise<boolean> {
  return uri.startsWith('data:');
}

export async function writeFileBytes(_name: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  return blobToDataUri(new Blob([bytes as BlobPart], { type: mimeType }));
}
