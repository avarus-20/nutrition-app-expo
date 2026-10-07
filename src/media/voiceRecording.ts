import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, type RecordingOptions } from 'expo-audio';
import { Platform } from 'react-native';

import { AppError } from '@/utils/errors';

/**
 * Speech-oriented recording: mono AAC (m4a) at 64 kbit/s on iOS/Android
 * (~0.5 MB per minute, accepted by common speech-to-text APIs). Browsers
 * record WebM/Opus where supported; Safari falls back to MP4 and the stored
 * MIME type is taken from the recorded blob.
 */
export const VOICE_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};

export const recordedMimeType = (): string => (Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4');

/** Asks for microphone access and switches the audio session to recording. */
export async function beginRecordingSession(): Promise<void> {
  let granted = false;
  try {
    granted = (await requestRecordingPermissionsAsync()).granted;
  } catch (error) {
    throw new AppError('microphone', 'Microphone unavailable', { cause: error });
  }
  if (!granted) throw new AppError('permission_denied', 'Microphone permission denied');
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
}

export async function endRecordingSession(): Promise<void> {
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
}
