import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { errorText } from '@/i18n';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { MIN_TOUCH } from '@/theme/tokens';
import { toAppError } from '@/utils/errors';
import { Button, type IconName } from './Button';
import { AppText } from './Text';

export function Card({
  title,
  action,
  children,
  style,
  padded = true,
}: {
  title?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: padded ? spacing.lg : 0,
          gap: spacing.md,
        },
        style,
      ]}
    >
      {title || action ? (
        <View style={[styles.cardHeader, !padded && { padding: spacing.lg, paddingBottom: 0 }]}>
          {title ? (
            <AppText variant="subheading" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </AppText>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function LoadingState({ label }: { label?: string }) {
  const { colors } = useTheme();
  const { m } = useI18n();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label ?? m.common.loading}>
      <ActivityIndicator color={colors.primary} />
      <AppText tone="muted">{label ?? m.common.loading}</AppText>
    </View>
  );
}

export function EmptyState({
  icon = 'leaf-outline',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={36} color={colors.textMuted} />
      <AppText variant="subheading" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText tone="muted" align="center" style={{ maxWidth: 420 }}>
          {message}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { m } = useI18n();
  const { colors } = useTheme();
  const appError = toAppError(error);
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={36} color={colors.danger} />
      <AppText align="center">{errorText(m, appError.code)}</AppText>
      {onRetry ? <Button label={m.common.retry} variant="secondary" onPress={onRetry} icon="refresh" /> : null}
    </View>
  );
}

export function Banner({
  tone = 'info',
  message,
  action,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  message: string;
  action?: React.ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  const palette = {
    info: { bg: colors.surfaceAlt, fg: colors.text, icon: 'information-circle-outline' as const },
    warning: { bg: colors.surfaceAlt, fg: colors.warning, icon: 'warning-outline' as const },
    error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle-outline' as const },
    success: { bg: colors.primarySoft, fg: colors.primary, icon: 'checkmark-circle-outline' as const },
  }[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: palette.bg, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }]}
    >
      <Ionicons name={palette.icon} size={20} color={palette.fg} />
      <AppText style={{ flex: 1, color: palette.fg }}>{message}</AppText>
      {action}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  leading,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  leading?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}) {
  const { colors, spacing, radius } = useTheme();
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText numberOfLines={2}>{title}</AppText>
        {subtitle ? (
          <AppText variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </>
  );
  const base = [styles.row, { gap: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm }];
  if (!onPress) {
    return (
      <View style={base} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      style={(state) => {
        const s = state as { pressed: boolean; hovered?: boolean; focused?: boolean };
        return [
          base,
          {
            backgroundColor: s.pressed || s.hovered ? colors.surfaceAlt : 'transparent',
            outlineColor: colors.focus,
            outlineWidth: s.focused ? 2 : 0,
            outlineStyle: 'solid',
          } as ViewStyle,
        ];
      }}
    >
      {content}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        {
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          backgroundColor: selected ? colors.primarySoft : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? colors.primary : colors.textMuted} /> : null}
      <AppText variant="small" style={{ color: selected ? colors.primary : colors.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  banner: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderWidth: 1 },
});
