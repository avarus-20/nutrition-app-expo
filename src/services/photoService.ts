import type { SqlDatabase } from '@/database/types';
import type { MediaFile } from '@/domain/types';
import { baseRow, insertEntity, softDeleteEntity } from '@/repositories/base';
import { mediaRepository } from '@/repositories/mediaRepository';
import { AppError } from '@/utils/errors';
import { newId } from '@/utils/ids';
import { logger } from '@/utils/logger';
import { dataEvents } from './events';
import type { OwnerProvider } from './mealService';

/** Device file storage used by media services (see src/media/localFiles*.ts). */
export interface MediaFileStore {
  persistFile(sourceUri: string, name: string): Promise<{ uri: string; size: number | null }>;
  readFileBytes(uri: string): Promise<Uint8Array>;
  deleteLocalFile(uri: string): Promise<void>;
  fileExists(uri: string): Promise<boolean>;
  writeFileBytes(name: string, bytes: Uint8Array, mimeType: string): Promise<string>;
}

/** A compressed image ready to be stored (output of src/media/photoCapture.ts). */
export interface PreparedPhoto {
  uri: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number | null;
  height: number | null;
}

export const MAX_PHOTOS_PER_MEAL = 10;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const EXT: Record<PreparedPhoto['mimeType'], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Meal photos. The binary is stored on the device first and the row is
 * created with `upload_status = 'pending'`; the sync engine uploads it to the
 * private bucket when the user is signed in and online.
 */
export class PhotoService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
    private readonly files: MediaFileStore,
  ) {}

  forMeal(mealId: string): Promise<MediaFile[]> {
    return mediaRepository.photosForMeal(this.db, this.owner(), mealId);
  }

  get(id: string): Promise<MediaFile | null> {
    return mediaRepository.getPhoto(this.db, this.owner(), id);
  }

  async add(mealId: string, photo: PreparedPhoto): Promise<string> {
    const owner = this.owner();
    const meal = await this.db.first<{ n: number; exists_: number }>(
      `SELECT (SELECT COUNT(*) FROM media_files WHERE meal_id = ? AND user_id = ? AND deleted_at IS NULL) AS n,
              EXISTS (SELECT 1 FROM meals WHERE id = ? AND user_id = ? AND deleted_at IS NULL) AS exists_`,
      [mealId, owner, mealId, owner],
    );
    if (!meal?.exists_) throw new AppError('not_found', 'Meal not found');
    if (meal.n >= MAX_PHOTOS_PER_MEAL) {
      throw new AppError('validation', 'Too many photos', { details: { photos: 'too_big' } });
    }
    const id = newId();
    const stored = await this.files.persistFile(photo.uri, `${id}.${EXT[photo.mimeType]}`);
    if (stored.size !== null && stored.size > MAX_PHOTO_BYTES) {
      await this.files.deleteLocalFile(stored.uri);
      throw new AppError('validation', 'Photo is too large', { details: { photo: 'too_big' } });
    }
    try {
      await this.db.transaction((tx) =>
        insertEntity(tx, 'media_files', {
          ...baseRow(id, owner),
          meal_id: mealId,
          kind: 'photo',
          storage_path: null,
          mime_type: photo.mimeType,
          size_bytes: stored.size,
          width: photo.width,
          height: photo.height,
          local_uri: stored.uri,
          upload_status: 'pending',
          upload_attempts: 0,
          upload_error: null,
        }),
      );
    } catch (error) {
      await this.files.deleteLocalFile(stored.uri).catch(() => undefined);
      throw error;
    }
    dataEvents.emit(['media_files']);
    return id;
  }

  /**
   * Soft-deletes the photo (the deletion is synchronized) and frees the
   * device copy right away. The sync engine removes the remote object after
   * the deletion was pushed.
   */
  async remove(id: string): Promise<void> {
    const owner = this.owner();
    const current = await this.get(id);
    if (!current || current.deleted_at) throw new AppError('not_found', 'Photo not found');
    await this.db.transaction(async (tx) => {
      await softDeleteEntity(tx, 'media_files', owner, { column: 'id', value: id });
      await tx.run('UPDATE media_files SET local_uri = NULL WHERE id = ?', [id]);
    });
    if (current.local_uri) {
      await this.files
        .deleteLocalFile(current.local_uri)
        .catch((e: unknown) => logger.warn('media', 'could not delete local photo', e));
    }
    dataEvents.emit(['media_files']);
  }

  /** Adds the new photo first, so a failure never loses the old one. */
  async replace(id: string, photo: PreparedPhoto): Promise<string> {
    const current = await this.get(id);
    if (!current || current.deleted_at) throw new AppError('not_found', 'Photo not found');
    const newPhotoId = await this.add(current.meal_id, photo);
    await this.remove(id);
    return newPhotoId;
  }

  /**
   * Returns a displayable local URI. Photos synchronized from another device
   * only have a `storage_path`; they are downloaded once and cached.
   */
  async ensureLocal(photo: MediaFile, download: ((path: string) => Promise<Uint8Array>) | null): Promise<string | null> {
    if (photo.local_uri && (await this.files.fileExists(photo.local_uri))) return photo.local_uri;
    if (!photo.storage_path || !download) return null;
    const bytes = await download(photo.storage_path);
    const ext = EXT[photo.mime_type as PreparedPhoto['mimeType']] ?? 'bin';
    const uri = await this.files.writeFileBytes(`${photo.id}.${ext}`, bytes, photo.mime_type);
    await this.db.run('UPDATE media_files SET local_uri = ? WHERE id = ? AND user_id = ?', [uri, photo.id, this.owner()]);
    return uri;
  }

  /** Raw bytes of the device copy (for analysis requests). */
  async readBytes(photo: MediaFile): Promise<Uint8Array> {
    if (!photo.local_uri) throw new AppError('not_found', 'Photo is not on this device');
    return this.files.readFileBytes(photo.local_uri);
  }

  /** Re-queues photos whose upload failed permanently (e.g. after a server fix). */
  async retryFailedUploads(): Promise<number> {
    const r = await this.db.run(
      `UPDATE media_files SET upload_status = 'pending', upload_attempts = 0, upload_error = NULL
       WHERE user_id = ? AND upload_status = 'failed' AND deleted_at IS NULL`,
      [this.owner()],
    );
    if (r.changes > 0) dataEvents.emit(['media_files']);
    return r.changes;
  }
}
