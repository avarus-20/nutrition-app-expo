import { useMemo } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { getSupabase } from '@/backend/supabase';
import { SupabaseRecognition, type RecognitionGateway } from '@/services/recognition';

export { estimatePhotoToDraft, textToDraft, transcribeVoiceNote } from '@/services/recognitionFlows';

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
