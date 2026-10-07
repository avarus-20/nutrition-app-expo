import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { MediaFile } from '@/domain/types';
import { estimatePhotoToDraft, useRecognition } from '@/features/drafts/recognition';
import { useQuery } from '@/hooks/useQuery';
import { errorText } from '@/i18n';
import { capturePhoto, type PhotoSource } from '@/media/photoCapture';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import type { MealTarget } from '@/services/mealService';
import { MAX_PHOTOS_PER_MEAL, type PreparedPhoto } from '@/services/photoService';
import { useSync } from '@/sync/SyncProvider';
import { Button, IconButton } from '@/ui/Button';
import { confirmAction } from '@/ui/dialogs';
import { Banner, Card } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { useToast } from '@/ui/Toast';
import { toAppError } from '@/utils/errors';

/** Resolves a displayable URI, downloading photos that came from another device. */
function usePhotoUri(photo: MediaFile) {
  const services = useServices();
  const { gateway, status } = useSync();
  const canDownload = gateway !== null && status.phase !== 'signedOut' && status.phase !== 'disabled';
  return useQuery(
    () => services.photos.ensureLocal(photo, canDownload ? (path) => gateway.downloadFile(path) : null),
    [photo.id, photo.local_uri, photo.storage_path, canDownload],
    [],
  );
}

export function PhotoImage({ photo, height, contentFit = 'cover' }: { photo: MediaFile; height?: number; contentFit?: 'cover' | 'contain' }) {
  const { colors, radius } = useTheme();
  const { m } = useI18n();
  const uri = usePhotoUri(photo);
  const box = [styles.fill, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }, height ? { height } : null];
  if (uri.data) {
    return (
      <Image
        source={{ uri: uri.data }}
        style={box}
        contentFit={contentFit}
        accessibilityLabel={m.photos.preview}
        accessible
      />
    );
  }
  return (
    <View style={[box, styles.center]}>
      {uri.loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Ionicons name="cloud-outline" size={22} color={colors.textMuted} />
          <AppText variant="small" tone="muted" align="center">
            {m.photos.notDownloaded}
          </AppText>
        </>
      )}
    </View>
  );
}

function UploadBadge({ photo }: { photo: MediaFile }) {
  const { colors, radius } = useTheme();
  const { m } = useI18n();
  const { status } = useSync();
  if (status.phase === 'disabled' || status.phase === 'signedOut' || photo.upload_status === 'uploaded') return null;
  const failed = photo.upload_status === 'failed';
  return (
    <View
      style={[styles.badge, { backgroundColor: failed ? colors.dangerSoft : colors.surface, borderRadius: radius.sm }]}
      accessible
      accessibilityLabel={failed ? m.photos.uploadFailed : m.photos.pendingUpload}
    >
      <Ionicons name={failed ? 'alert-circle-outline' : 'cloud-upload-outline'} size={14} color={failed ? colors.danger : colors.textMuted} />
    </View>
  );
}

/** Runs the camera / library flow with permission and error handling. */
export function usePhotoCapture() {
  const { m } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<PhotoSource | null>(null);
  const capture = async (source: PhotoSource): Promise<PreparedPhoto | null> => {
    setBusy(source);
    try {
      return await capturePhoto(source);
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { capture, busy };
}

export function CaptureButtons({
  onCaptured,
  disabled,
  busy: externalBusy,
}: {
  onCaptured: (photo: PreparedPhoto) => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { m } = useI18n();
  const { spacing } = useTheme();
  const { capture, busy } = usePhotoCapture();
  const run = async (source: PhotoSource) => {
    const photo = await capture(source);
    if (photo) await onCaptured(photo);
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      <Button
        variant="secondary"
        icon="camera-outline"
        label={m.photos.take}
        onPress={() => run('camera')}
        loading={busy === 'camera'}
        disabled={disabled || busy !== null || externalBusy}
        testID="photo-take"
      />
      <Button
        variant="secondary"
        icon="images-outline"
        label={m.photos.choose}
        onPress={() => run('library')}
        loading={busy === 'library'}
        disabled={disabled || busy !== null || externalBusy}
        testID="photo-choose"
      />
    </View>
  );
}

function PhotoViewer({ photo, target, onClose }: { photo: MediaFile; target: MealTarget; onClose: () => void }) {
  const services = useServices();
  const i18n = useI18n();
  const { m } = i18n;
  const { colors, radius, spacing } = useTheme();
  const toast = useToast();
  const recognition = useRecognition();
  const [busy, setBusy] = useState<'estimate' | 'remove' | 'replace' | null>(null);
  const { capture } = usePhotoCapture();

  const fail = (error: unknown) => toast.show(errorText(m, toAppError(error).code), 'error');

  const remove = async () => {
    const ok = await confirmAction({
      title: m.photos.remove,
      message: m.photos.removeConfirm,
      confirmLabel: m.common.delete,
      cancelLabel: m.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusy('remove');
    try {
      await services.photos.remove(photo.id);
      toast.show(m.common.deleted);
      onClose();
    } catch (error) {
      fail(error);
      setBusy(null);
    }
  };

  const replace = async () => {
    const next = await capture('library');
    if (!next) return;
    setBusy('replace');
    try {
      await services.photos.replace(photo.id, next);
      toast.show(m.common.saved);
      onClose();
    } catch (error) {
      fail(error);
      setBusy(null);
    }
  };

  const estimate = async () => {
    setBusy('estimate');
    try {
      const draftId = await estimatePhotoToDraft(services, recognition, photo.id, target, i18n.locale);
      onClose();
      router.push(`/drafts/${draftId}`);
    } catch (error) {
      const e = toAppError(error);
      toast.show(e.code === 'validation' ? m.photos.nothingRecognized : errorText(m, e.code), 'error');
      setBusy(null);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View
          style={[styles.sheet, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md }]}
          accessibilityViewIsModal
        >
          <View style={styles.headerRow}>
            <AppText variant="subheading" style={{ flex: 1 }}>
              {m.photos.preview}
            </AppText>
            <IconButton icon="close" label={m.common.close} onPress={onClose} testID="photo-close" />
          </View>
          <ScrollView contentContainerStyle={{ gap: spacing.md }}>
            <PhotoImage photo={photo} height={360} contentFit="contain" />
            {recognition ? (
              <Banner tone="info" message={m.photos.estimateDisclaimer} />
            ) : (
              <Banner tone="info" message={m.photos.estimateUnavailable} />
            )}
            <Button
              icon="sparkles-outline"
              label={busy === 'estimate' ? m.photos.estimating : m.photos.estimate}
              onPress={estimate}
              loading={busy === 'estimate'}
              disabled={!recognition || !photo.local_uri || (busy !== null && busy !== 'estimate')}
              testID="photo-estimate"
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Button variant="secondary" icon="swap-horizontal" label={m.photos.replace} onPress={replace} loading={busy === 'replace'} disabled={busy !== null} />
              <Button variant="danger" icon="trash-outline" label={m.photos.remove} onPress={remove} loading={busy === 'remove'} disabled={busy !== null} testID="photo-remove" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function PhotoGrid({ photos, target }: { photos: MediaFile[]; target: MealTarget }) {
  const { m } = useI18n();
  const { spacing } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const openPhoto = photos.find((p) => p.id === open) ?? null;
  return (
    <>
      <View style={[styles.grid, { gap: spacing.sm }]}>
        {photos.map((photo, index) => (
          <Pressable
            key={photo.id}
            onPress={() => setOpen(photo.id)}
            style={({ pressed }) => [styles.thumb, { opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${m.photos.preview} ${index + 1}`}
            testID={`photo-${index}`}
          >
            <PhotoImage photo={photo} />
            <UploadBadge photo={photo} />
          </Pressable>
        ))}
      </View>
      {openPhoto ? <PhotoViewer photo={openPhoto} target={target} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** Photos card of the meal editor. */
export function MealPhotosCard({ mealId, target }: { mealId: string; target: MealTarget }) {
  const services = useServices();
  const { m } = useI18n();
  const toast = useToast();
  const photos = useQuery(() => services.photos.forMeal(mealId), [mealId], ['media_files']);
  const [saving, setSaving] = useState(false);
  const list = photos.data ?? [];

  const add = async (photo: PreparedPhoto) => {
    setSaving(true);
    try {
      await services.photos.add(mealId, photo);
      toast.show(m.photos.attached);
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={m.photos.title}>
      {list.length === 0 && !photos.loading ? <AppText tone="muted">{m.photos.noPhotos}</AppText> : null}
      {list.length > 0 ? <PhotoGrid photos={list} target={target} /> : null}
      <CaptureButtons onCaptured={add} busy={saving} disabled={list.length >= MAX_PHOTOS_PER_MEAL} />
      <AppText variant="small" tone="muted">
        {m.photos.attachHint}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thumb: { width: 104, height: 104 },
  badge: { position: 'absolute', right: 6, top: 6, padding: 4 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '92%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
