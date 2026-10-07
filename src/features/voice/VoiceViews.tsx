import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { router } from 'expo-router';
import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { VoiceNote } from '@/domain/types';
import { textToDraft, transcribeVoiceNote, useRecognition } from '@/features/drafts/recognition';
import { useQuery } from '@/hooks/useQuery';
import { errorText } from '@/i18n';
import { beginRecordingSession, endRecordingSession, recordedMimeType, VOICE_RECORDING } from '@/media/voiceRecording';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import type { MealTarget } from '@/services/mealService';
import { MAX_VOICE_DURATION_MS, MAX_VOICE_NOTES_PER_MEAL, type RecordedAudio } from '@/services/voiceService';
import { useSync } from '@/sync/SyncProvider';
import { Button, IconButton } from '@/ui/Button';
import { confirmAction } from '@/ui/dialogs';
import { Banner, Card } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useToast } from '@/ui/Toast';
import { toAppError } from '@/utils/errors';
import { formatDuration } from './duration';

type RecorderPhase = 'idle' | 'starting' | 'recording' | 'saving';

/** Record / stop control. Recording stops automatically after 3 minutes. */
export function VoiceRecorder({ onRecorded, disabled }: { onRecorded: (audio: RecordedAudio) => Promise<void>; disabled?: boolean }) {
  const { m, t } = useI18n();
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const state = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const session = useRef<{ startedAt: number; done: boolean } | null>(null);

  const finish = async (url: string | null) => {
    const current = session.current;
    if (!current || current.done) return;
    current.done = true;
    setPhase('saving');
    await endRecordingSession();
    try {
      if (url) await onRecorded({ uri: url, mimeType: recordedMimeType(), durationMs: Date.now() - current.startedAt });
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    } finally {
      session.current = null;
      setPhase('idle');
    }
  };

  const onStatus = useEffectEvent((status: { isFinished: boolean; hasError: boolean; url: string | null }) => {
    if (status.isFinished) void finish(status.url ?? recorder.uri);
    else if (status.hasError) void finish(null);
  });

  useEffect(() => {
    const sub = recorder.addListener('recordingStatusUpdate', (status) => onStatus(status));
    return () => sub.remove();
  }, [recorder]);

  const start = async () => {
    setPhase('starting');
    try {
      await beginRecordingSession();
      await recorder.prepareToRecordAsync();
      session.current = { startedAt: Date.now(), done: false };
      recorder.record({ forDuration: MAX_VOICE_DURATION_MS / 1000 });
      setPhase('recording');
    } catch (error) {
      session.current = null;
      await endRecordingSession();
      setPhase('idle');
      const e = toAppError(error, 'microphone');
      toast.show(errorText(m, e.code === 'unknown' ? 'microphone' : e.code), 'error');
    }
  };

  const stop = async () => {
    setPhase('saving');
    try {
      await recorder.stop();
    } catch (error) {
      toast.show(errorText(m, toAppError(error, 'microphone').code), 'error');
    }
    // Some platforms do not emit a final status event on manual stop.
    await finish(recorder.uri);
  };

  if (phase === 'recording') {
    return (
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
        <AppText style={{ flex: 1 }} accessibilityLiveRegion="polite" testID="voice-recording">
          {t(m.voice.recording, { time: formatDuration(state.durationMillis) })}
        </AppText>
        <Button variant="danger" icon="stop" label={m.voice.stop} onPress={stop} testID="voice-stop" />
      </View>
    );
  }
  return (
    <Button
      variant="secondary"
      icon="mic-outline"
      label={m.voice.record}
      onPress={start}
      loading={phase === 'starting' || phase === 'saving'}
      disabled={disabled || phase !== 'idle'}
      testID="voice-record"
    />
  );
}

function useVoiceUri(note: VoiceNote) {
  const services = useServices();
  const { gateway, status } = useSync();
  const canDownload = gateway !== null && status.phase !== 'signedOut' && status.phase !== 'disabled';
  return useQuery(
    () => services.voice.ensureLocal(note, canDownload ? (path) => gateway.downloadFile(path) : null),
    [note.id, note.local_uri, note.storage_path, canDownload],
    [],
  );
}

function Player({ uri, durationMs, index }: { uri: string; durationMs: number | null; index: number }) {
  const { m } = useI18n();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration > 0 ? status.duration * 1000 : durationMs;
  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) await player.seekTo(0);
    player.play();
  };
  return (
    <>
      <IconButton
        icon={status.playing ? 'pause' : 'play'}
        tone="primary"
        label={status.playing ? m.voice.pause : m.voice.play}
        onPress={toggle}
        testID={`voice-play-${index}`}
      />
      <AppText variant="small" tone="muted" style={{ minWidth: 80 }} testID={`voice-time-${index}`}>
        {formatDuration(status.currentTime * 1000)} / {formatDuration(duration)}
      </AppText>
    </>
  );
}

export function VoiceNoteRow({ note, index, onTurnIntoEntries }: { note: VoiceNote; index: number; onTurnIntoEntries?: () => void }) {
  const services = useServices();
  const { m } = useI18n();
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const uri = useVoiceUri(note);

  const remove = async () => {
    const ok = await confirmAction({
      title: m.voice.delete,
      message: m.voice.deleteConfirm,
      confirmLabel: m.common.delete,
      cancelLabel: m.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    try {
      await services.voice.remove(note.id);
      toast.show(m.common.deleted);
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    }
  };

  return (
    <View style={{ gap: spacing.xs }} testID={`voice-note-${index}`}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        {uri.data ? (
          <Player uri={uri.data} durationMs={note.duration_ms} index={index} />
        ) : (
          <>
            <Ionicons name="cloud-outline" size={20} color={colors.textMuted} />
            <AppText variant="small" tone="muted">
              {uri.loading ? m.common.loading : m.photos.notDownloaded} · {formatDuration(note.duration_ms)}
            </AppText>
          </>
        )}
        <View style={{ flex: 1 }} />
        {onTurnIntoEntries ? (
          <Button compact variant="ghost" icon="sparkles-outline" label={m.voice.transcribe} onPress={onTurnIntoEntries} testID={`voice-entries-${index}`} />
        ) : null}
        <IconButton icon="trash-outline" tone="danger" label={m.voice.delete} onPress={remove} testID={`voice-delete-${index}`} />
      </View>
      {note.transcript ? (
        <AppText variant="small" tone="muted" numberOfLines={3}>
          “{note.transcript}”
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * Converts a voice note (via server speech-to-text) or typed text into draft
 * entries. Typing works offline and without an account.
 */
export function VoiceDraftPanel({ note, target, replace }: { note: VoiceNote | null; target: MealTarget; replace?: boolean }) {
  const services = useServices();
  const i18n = useI18n();
  const { m } = i18n;
  const { spacing } = useTheme();
  const toast = useToast();
  const recognition = useRecognition();
  const [text, setText] = useState(note?.transcript ?? '');
  const [busy, setBusy] = useState<'transcribe' | 'parse' | null>(null);

  const transcribe = async () => {
    if (!note) return;
    setBusy('transcribe');
    try {
      const result = await transcribeVoiceNote(services, recognition, note.id, i18n.locale);
      if (result) setText(result);
      else toast.show(m.voice.nothingRecognized, 'error');
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    } finally {
      setBusy(null);
    }
  };

  const parse = async () => {
    setBusy('parse');
    try {
      const draftId = await textToDraft(services, text, target, note?.id ?? null);
      if (replace) router.replace(`/drafts/${draftId}`);
      else router.push(`/drafts/${draftId}`);
    } catch (error) {
      const e = toAppError(error);
      toast.show(e.code === 'validation' ? m.voice.nothingRecognized : errorText(m, e.code), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      {note ? (
        recognition ? (
          <Button
            variant="secondary"
            icon="text-outline"
            label={busy === 'transcribe' ? m.voice.transcribing : m.voice.transcribe}
            onPress={transcribe}
            loading={busy === 'transcribe'}
            disabled={busy !== null || !note.local_uri}
            testID="voice-transcribe"
          />
        ) : (
          <Banner tone="info" message={m.voice.sttUnavailable} />
        )
      ) : null}
      <TextField
        label={note ? m.voice.transcript : m.voice.typeInstead}
        value={text}
        onChangeText={setText}
        placeholder={m.voice.typePlaceholder}
        multiline
        maxLength={4000}
        testID="voice-text"
      />
      <Button
        icon="list-outline"
        label={m.voice.parse}
        onPress={parse}
        loading={busy === 'parse'}
        disabled={busy !== null || text.trim().length === 0}
        testID="voice-parse"
      />
    </View>
  );
}

/** Voice notes card of the meal editor. */
export function MealVoiceCard({ mealId, target }: { mealId: string; target: MealTarget }) {
  const services = useServices();
  const { m } = useI18n();
  const { spacing } = useTheme();
  const toast = useToast();
  const notes = useQuery(() => services.voice.forMeal(mealId), [mealId], ['voice_notes']);
  const [active, setActive] = useState<string | null>(null);
  const list = notes.data ?? [];
  const activeNote = list.find((n) => n.id === active) ?? null;

  const add = async (audio: RecordedAudio) => {
    await services.voice.add(mealId, audio);
    toast.show(m.common.saved);
  };

  return (
    <Card title={m.voice.title}>
      {list.length === 0 && !notes.loading ? <AppText tone="muted">{m.voice.noNotes}</AppText> : null}
      {list.map((note, index) => (
        <VoiceNoteRow key={note.id} note={note} index={index} onTurnIntoEntries={() => setActive(active === note.id ? null : note.id)} />
      ))}
      {activeNote ? (
        <View style={{ gap: spacing.sm }}>
          <VoiceDraftPanel key={activeNote.id} note={activeNote} target={target} />
        </View>
      ) : null}
      <VoiceRecorder onRecorded={add} disabled={list.length >= MAX_VOICE_NOTES_PER_MEAL} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
