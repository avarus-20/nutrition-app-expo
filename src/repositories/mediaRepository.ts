import type { MediaEntity } from '@/database/schema';
import type { SqlExecutor } from '@/database/types';
import type { MediaFile, VoiceNote } from '@/domain/types';

export const mediaRepository = {
  async photosForMeal(db: SqlExecutor, ownerId: string, mealId: string): Promise<MediaFile[]> {
    return db.all<MediaFile>(
      `SELECT * FROM media_files WHERE user_id = ? AND meal_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [ownerId, mealId],
    );
  },

  async voiceNotesForMeal(db: SqlExecutor, ownerId: string, mealId: string): Promise<VoiceNote[]> {
    return db.all<VoiceNote>(
      `SELECT * FROM voice_notes WHERE user_id = ? AND meal_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [ownerId, mealId],
    );
  },

  async getPhoto(db: SqlExecutor, ownerId: string, id: string): Promise<MediaFile | null> {
    return db.first<MediaFile>('SELECT * FROM media_files WHERE id = ? AND user_id = ?', [id, ownerId]);
  },

  async getVoiceNote(db: SqlExecutor, ownerId: string, id: string): Promise<VoiceNote | null> {
    return db.first<VoiceNote>('SELECT * FROM voice_notes WHERE id = ? AND user_id = ?', [id, ownerId]);
  },

  /** Media files whose binary still has to reach object storage. */
  async pendingUploads(
    db: SqlExecutor,
    entity: MediaEntity,
    ownerId: string,
    maxAttempts: number,
  ): Promise<(MediaFile | VoiceNote)[]> {
    return db.all(
      `SELECT * FROM ${entity}
       WHERE user_id = ? AND upload_status != 'uploaded' AND deleted_at IS NULL
         AND local_uri IS NOT NULL AND upload_attempts < ?
       ORDER BY created_at ASC`,
      [ownerId, maxAttempts],
    );
  },

  /** Photo and voice note counts per meal of one day. */
  async countsForDay(
    db: SqlExecutor,
    ownerId: string,
    date: string,
  ): Promise<{ meal_id: string; photos: number; voice: number }[]> {
    return db.all(
      `SELECT m.id AS meal_id,
         (SELECT COUNT(*) FROM media_files f WHERE f.meal_id = m.id AND f.deleted_at IS NULL) AS photos,
         (SELECT COUNT(*) FROM voice_notes v WHERE v.meal_id = m.id AND v.deleted_at IS NULL) AS voice
       FROM meals m WHERE m.user_id = ? AND m.local_date = ? AND m.deleted_at IS NULL`,
      [ownerId, date],
    );
  },

  async counts(db: SqlExecutor, ownerId: string): Promise<{ pending: number; failed: number }> {
    const row = await db.first<{ pending: number; failed: number }>(
      `SELECT
         (SELECT COUNT(*) FROM media_files WHERE user_id = ?1 AND deleted_at IS NULL AND upload_status = 'pending')
         + (SELECT COUNT(*) FROM voice_notes WHERE user_id = ?1 AND deleted_at IS NULL AND upload_status = 'pending') AS pending,
         (SELECT COUNT(*) FROM media_files WHERE user_id = ?1 AND deleted_at IS NULL AND upload_status = 'failed')
         + (SELECT COUNT(*) FROM voice_notes WHERE user_id = ?1 AND deleted_at IS NULL AND upload_status = 'failed') AS failed`,
      [ownerId],
    );
    return row ?? { pending: 0, failed: 0 };
  },
};
