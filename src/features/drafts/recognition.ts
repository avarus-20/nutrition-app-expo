import { useMemo } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { getSupabase } from '@/backend/supabase';
import type { Services } from '@/services/container';
import type { MealTarget } from '@/services/mealService';
import { SupabaseRecognition, type RecognitionGateway } from '@/services/recognition';
import { bytesToBase64 } from '@/utils/base64';
import { AppError } from '@/utils/errors';

/** Recognition is only available to signed-in users of a configured backend. */
export function useRecognition(): RecognitionGateway | null {
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  return useMemo(() => {
    if (!signedIn) return null;
    const client = getSupabase();
    return client ? new SupabaseRecognition(client) : null;
  }, [signedIn]);
}

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
