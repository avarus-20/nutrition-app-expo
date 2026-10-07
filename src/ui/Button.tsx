import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/providers/PreferencesProvider';
import { MIN_TOUCH } from '@/theme/tokens';
import { AppText } from './Text';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface InteractionState {
  pressed: boolean;
  hovered?: boolean;
  focused?: boolean;
}

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  compact,
  fullWidth,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={(state) => {
        const { pressed, hovered, focused } = state as InteractionState;
        return [
          styles.base,
          {
            backgroundColor: palette.bg,
            borderColor: focused ? colors.focus : palette.border,
            borderRadius: radius.md,
            paddingHorizontal: compact ? spacing.md : spacing.lg,
            minHeight: compact ? 36 : MIN_TOUCH,
            opacity: inactive ? 0.5 : pressed ? 0.8 : hovered ? 0.92 : 1,
            alignSelf: fullWidth ? 'stretch' : 'auto',
          },
          focused && styles.focused,
          style,
        ];
      }}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={18} color={palette.fg} />
        ) : null}
        <AppText variant="subheading" style={{ color: palette.fg }} numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress?: () => void;
  tone?: 'default' | 'primary' | 'danger' | 'muted';
  disabled?: boolean;
  size?: number;
  testID?: string;
  selected?: boolean;
}

/** Icon-only button with an accessible label and a 44×44 touch target. */
export function IconButton({ icon, label, onPress, tone = 'default', disabled, size = 22, testID, selected }: IconButtonProps) {
  const { colors, radius } = useTheme();
  const color = { default: colors.text, primary: colors.primary, danger: colors.danger, muted: colors.textMuted }[tone];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected }}
      hitSlop={4}
      style={(state) => {
        const { pressed, hovered, focused } = state as InteractionState;
        return [
          styles.icon,
          {
            borderRadius: radius.pill,
            backgroundColor: pressed || hovered ? colors.surfaceAlt : 'transparent',
            borderColor: focused ? colors.focus : 'transparent',
            opacity: disabled ? 0.4 : 1,
          },
        ];
      }}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, justifyContent: 'center' },
  focused: { borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  icon: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
