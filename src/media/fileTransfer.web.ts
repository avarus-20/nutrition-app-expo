import * as DocumentPicker from 'expo-document-picker';

import { AppError } from '@/utils/errors';

/** Browser variant: exports are downloaded, imports read through a file input. */
export async function saveTextFile(name: string, content: string, mimeType: string): Promise<void> {
  if (typeof document === 'undefined') throw new AppError('unsupported_platform', 'No document');
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export async function pickTextFile(maxBytes: number): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', '.json'], multiple: false });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (asset.size !== undefined && asset.size > maxBytes) throw new AppError('invalid_import', 'File is too large');
  try {
    return asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
  } catch (error) {
    throw new AppError('invalid_import', 'Could not read the file', { cause: error });
  }
}
