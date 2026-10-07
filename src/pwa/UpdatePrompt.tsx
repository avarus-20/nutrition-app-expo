import React, { useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { Button } from '@/ui/Button';
import { AppText } from '@/ui/Text';
import { applyUpdate, isUpdateReady, subscribeToUpdate } from './serviceWorker';

/** Web only: offers to reload when a new app version has been downloaded. */
export function UpdatePrompt() {
  const ready = useSyncExternalStore(subscribeToUpdate, isUpdateReady, () => false);
  const [dismissed, setDismissed] = useState(false);
  const { m } = useI18n();
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  if (!ready || dismissed) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 88 }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        testID="pwa-update"
        style={[
          styles.bar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: spacing.md,
            gap: spacing.sm,
          },
        ]}
      >
        <AppText style={{ flex: 1 }}>{m.pwa.updateAvailable}</AppText>
        <Button compact variant="ghost" label={m.pwa.later} onPress={() => setDismissed(true)} />
        <Button compact label={m.pwa.reload} onPress={applyUpdate} testID="pwa-reload" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    maxWidth: 560,
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
