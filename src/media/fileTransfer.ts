import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { AppError } from '@/utils/errors';

/**
 * Export/import of user files (native). The export is written to the cache
 * directory and handed to the system share sheet ("Save to Files", Drive,
 * mail…). The web variant is `fileTransfer.web.ts`.
 */
const UTI: Record<string, string> = {
  'application/json': 'public.json',
  'text/csv': 'public.comma-separated-values-text',
};

export async function saveTextFile(name: string, content: string, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new AppError('unsupported_platform', 'Sharing is not available');
  const file = new File(Paths.cache, name);
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(content);
  } catch (error) {
    throw new AppError('database', 'Could not write the export file', { cause: error });
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name, UTI: UTI[mimeType] });
}

/** Lets the user pick a file; resolves to its text, or null when cancelled. */
export async function pickTextFile(maxBytes: number): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'application/octet-stream', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (asset.size !== undefined && asset.size > maxBytes) throw new AppError('invalid_import', 'File is too large');
  try {
    return await new File(asset.uri).text();
  } catch (error) {
    throw new AppError('invalid_import', 'Could not read the file', { cause: error });
  }
}
