import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { PreparedPhoto } from '@/services/photoService';
import { AppError } from '@/utils/errors';
import { PHOTO_QUALITY, targetSize } from './photoSize';

export type PhotoSource = 'camera' | 'library';

async function ensurePermission(source: PhotoSource): Promise<void> {
  if (Platform.OS === 'web') return; // the browser asks when the file input / camera opens
  const response =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!response.granted) throw new AppError('permission_denied', `${source} permission denied`);
}

/**
 * Lets the user take or choose a photo and returns a compressed JPEG, or
 * `null` when the user cancelled.
 */
export async function capturePhoto(source: PhotoSource): Promise<PreparedPhoto | null> {
  await ensurePermission(source);
  let result: ImagePicker.ImagePickerResult;
  try {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
    result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  } catch (error) {
    throw new AppError(source === 'camera' ? 'camera' : 'unknown', 'Could not open the picker', { cause: error });
  }
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return compressPhoto(asset.uri, asset.width, asset.height);
}

/** Downscales to MAX_PHOTO_EDGE and re-encodes as JPEG (also strips EXIF/location metadata). */
export async function compressPhoto(uri: string, width: number, height: number): Promise<PreparedPhoto> {
  try {
    const size = targetSize(width, height);
    const context = ImageManipulator.manipulate(uri);
    if (size.width !== width || size.height !== height) context.resize({ width: size.width, height: size.height });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
    return { uri: saved.uri, mimeType: 'image/jpeg', width: saved.width, height: saved.height };
  } catch (error) {
    throw new AppError('unknown', 'Could not process the photo', { cause: error });
  }
}
