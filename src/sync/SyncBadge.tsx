import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { AppText } from '@/ui/Text';
import { useSync, type SyncPhase } from './SyncProvider';

const ICONS: Record<SyncPhase, React.ComponentProps<typeof Ionicons>['name']> = {
  disabled: 'phone-portrait-outline',
  signedOut: 'phone-portrait-outline',
  idle: 'cloud-done-outline',
  syncing: 'sync-outline',
  offline: 'cloud-offline-outline',
  error: 'warning-outline',
};

/** Compact synchronization indicator; opens Settings. */
export function SyncBadge({ showLabel = false }: { showLabel?: boolean }) {
  const { status } = useSync();
  const { m, t } = useI18n();
  const { colors, radius } = useTheme();
  const label = m.sync[status.phase];
  const pending = status.pending > 0 && status.phase !== 'disabled' && status.phase !== 'signedOut';
  const full = pending ? `${label}, ${t(m.sync.pendingBadge, { count: status.pending })}` : label;
  const color = status.phase === 'error' ? colors.warning : status.phase === 'offline' ? colors.textMuted : colors.primary;
  return (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel={full}
      style={[styles.badge, { borderRadius: radius.pill, borderColor: colors.border }]}
    >
      <Ionicons name={ICONS[status.phase]} size={18} color={color} />
      {showLabel || pending ? (
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {showLabel ? full : status.pending}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, minWidth: 44, paddingHorizontal: 10, borderWidth: 1, justifyContent: 'center' },
});
