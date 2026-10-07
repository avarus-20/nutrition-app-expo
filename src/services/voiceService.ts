import type { SqlDatabase } from '@/database/types';
import type { VoiceNote } from '@/domain/types';
import { baseRow, insertEntity, softDeleteEntity, updateEntity } from '@/repositories/base';
import { mediaRepository } from '@/repositories/mediaRepository';
import { AppError } from '@/utils/errors';
import { newId } from '@/utils/ids';
import { logger } from '@/utils/logger';
import { dataEvents } from './events';
import type { OwnerProvider } from './mealService';
import {
  baseMimeType,
  ensureLocalCopy,
  extensionFor,
  isSupportedMimeType,
  type Downloader,
  type MediaFileStore,
} from './mediaFiles';

/** A finished recording (output of src/media/voiceRecording.ts). */
export interface RecordedAudio {
  uri: string;
  mimeType: string;
  durationMs: number | null;
}

export const MAX_VOICE_NOTES_PER_MEAL = 10;
export const MAX_VOICE_DURATION_MS = 3 * 60_000;
const MAX_VOICE_BYTES = 20 * 1024 * 1024;

/**
 * Voice notes attached to meals. Same storage model as photos: device copy
 * first, `upload_status = 'pending'`, uploaded to the private bucket by sync.
 */
export class VoiceService {
  constructor(
    private readonly db: SqlDatabase,
    private readonly owner: OwnerProvider,
    private readonly files: MediaFileStore,
  ) {}

  forMeal(mealId: string): Promise<VoiceNote[]> {
    return mediaRepository.voiceNotesForMeal(this.db, this.owner(), mealId);
  }

  get(id: string): Promise<VoiceNote | null> {
    return mediaRepository.getVoiceNote(this.db, this.owner(), id);
  }

  async add(mealId: string, audio: RecordedAudio): Promise<string> {
    const owner = this.owner();
    const meal = await this.db.first<{ n: number; exists_: number }>(
      `SELECT (SELECT COUNT(*) FROM voice_notes WHERE meal_id = ? AND user_id = ? AND deleted_at IS NULL) AS n,
              EXISTS (SELECT 1 FROM meals WHERE id = ? AND user_id = ? AND deleted_at IS NULL) AS exists_`,
      [mealId, owner, mealId, owner],
    );
    if (!meal?.exists_) throw new AppError('not_found', 'Meal not found');
    if (meal.n >= MAX_VOICE_NOTES_PER_MEAL) {
      throw new AppError('validation', 'Too many voice notes', { details: { voice: 'too_big' } });
    }
    const id = newId();
    const requested = baseMimeType(audio.mimeType);
    const stored = await this.files.persistFile(audio.uri, `${id}.${extensionFor(requested)}`);
    const mimeType = stored.mimeType ? baseMimeType(stored.mimeType) : requested;
    const reject = async (message: string) => {
      await this.files.deleteLocalFile(stored.uri).catch(() => undefined);
      throw new AppError('validation', message, { details: { voice: 'invalid' } });
    };
    if (!isSupportedMimeType(mimeType) || !mimeType.startsWith('audio/')) await reject(`Unsupported audio type ${mimeType}`);
    if (stored.size !== null && (stored.size === 0 || stored.size > MAX_VOICE_BYTES)) await reject('Recording is empty or too large');
    const duration =
      audio.durationMs === null ? null : Math.max(0, Math.min(Math.round(audio.durationMs), MAX_VOICE_DURATION_MS + 5_000));
    try {
      await this.db.transaction((tx) =>
        insertEntity(tx, 'voice_notes', {
          ...baseRow(id, owner),
          meal_id: mealId,
          storage_path: null,
          mime_type: mimeType,
          size_bytes: stored.size,
          duration_ms: duration,
          transcript: null,
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
    dataEvents.emit(['voice_notes']);
    return id;
  }

  /** Stores the (user-confirmed) transcript; it is synchronized with the note. */
  async setTranscript(id: string, transcript: string | null): Promise<void> {
    const text = transcript?.trim().slice(0, 4000) || null;
    await this.db.transaction((tx) => updateEntity(tx, 'voice_notes', this.owner(), id, { transcript: text }));
    dataEvents.emit(['voice_notes']);
  }

  async remove(id: string): Promise<void> {
    const owner = this.owner();
    const current = await this.get(id);
    if (!current || current.deleted_at) throw new AppError('not_found', 'Voice note not found');
    await this.db.transaction(async (tx) => {
      await softDeleteEntity(tx, 'voice_notes', owner, { column: 'id', value: id });
      await tx.run('UPDATE voice_notes SET local_uri = NULL WHERE id = ?', [id]);
    });
    if (current.local_uri) {
      await this.files
        .deleteLocalFile(current.local_uri)
        .catch((e: unknown) => logger.warn('media', 'could not delete local voice note', e));
    }
    dataEvents.emit(['voice_notes']);
  }

  ensureLocal(note: VoiceNote, download: Downloader | null): Promise<string | null> {
    return ensureLocalCopy(this.db, this.files, 'voice_notes', this.owner(), note, download);
  }

  async readBytes(note: VoiceNote): Promise<Uint8Array> {
    if (!note.local_uri) throw new AppError('not_found', 'Voice note is not on this device');
    return this.files.readFileBytes(note.local_uri);
  }
}
