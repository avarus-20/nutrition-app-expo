import { phrasesToDraftItems, type FoodCandidate } from '@/domain/foodMatcher';
import { parseFoodPhrases } from '@/domain/phraseParser';
import { bytesToBase64 } from '@/utils/base64';
import { AppError } from '@/utils/errors';
import type { Services } from './container';
import type { MealTarget } from './mealService';
import type { RecognitionGateway } from './recognition';

/**
 * Sends a stored meal photo to the estimation function and saves the result
 * as a draft for review. Returns the draft id.
 */
export async function estimatePhotoToDraft(
  services: Pick<Services, 'photos' | 'drafts'>,
  recognition: RecognitionGateway | null,
  photoId: string,
  target: MealTarget,
  locale: string,
): Promise<string> {
  if (!recognition) throw new AppError('not_configured', 'Recognition is not available');
  const photo = await services.photos.get(photoId);
  if (!photo || photo.deleted_at) throw new AppError('not_found', 'Photo not found');
  const bytes = await services.photos.readBytes(photo);
  const estimate = await recognition.estimatePhoto({ imageBase64: bytesToBase64(bytes), mimeType: photo.mime_type, locale });
  return services.drafts.create({ source: 'photo_ai', target, items: estimate.items, mediaId: photo.id });
}

/** Saved foods first, then recent entries: used to fill nutrition of spoken/typed foods. */
async function foodCandidates(services: Pick<Services, 'foods' | 'meals'>): Promise<FoodCandidate[]> {
  const [foods, recent] = await Promise.all([services.foods.search('', 500), services.meals.recentItems(200)]);
  return [
    ...foods.map((f) => ({ ...f, quantity: f.serving_size, unit: f.serving_unit })),
    ...recent.map((r) => ({ ...r, name: r.food_name })),
  ];
}

/**
 * Parses what the user said or typed into draft entries (offline, no AI
 * needed) and saves them for review. Returns the draft id.
 */
export async function textToDraft(
  services: Pick<Services, 'foods' | 'meals' | 'drafts' | 'voice'>,
  text: string,
  target: MealTarget,
  voiceNoteId: string | null,
): Promise<string> {
  const phrases = parseFoodPhrases(text);
  if (phrases.length === 0) throw new AppError('validation', 'Nothing recognized', { details: { text: 'empty' } });
  const items = phrasesToDraftItems(phrases, await foodCandidates(services));
  if (voiceNoteId) await services.voice.setTranscript(voiceNoteId, text);
  return services.drafts.create({ source: 'voice', target, items, voiceNoteId, inputText: text });
}

/** Speech-to-text for a stored voice note (server-side provider). */
export async function transcribeVoiceNote(
  services: Pick<Services, 'voice'>,
  recognition: RecognitionGateway | null,
  noteId: string,
  locale: string,
): Promise<string> {
  if (!recognition) throw new AppError('not_configured', 'Recognition is not available');
  const note = await services.voice.get(noteId);
  if (!note || note.deleted_at) throw new AppError('not_found', 'Voice note not found');
  const bytes = await services.voice.readBytes(note);
  const { text } = await recognition.transcribe({ audioBase64: bytesToBase64(bytes), mimeType: note.mime_type, locale });
  return text.trim();
}
