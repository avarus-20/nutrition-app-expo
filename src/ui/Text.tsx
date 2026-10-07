import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';

import { useTheme } from '@/providers/PreferencesProvider';
import type { ColorTokens, Theme } from '@/theme/tokens';

export type TextVariant = keyof Theme['typography'];
export type TextTone = 'default' | 'muted' | 'primary' | 'danger' | 'warning' | 'inverse';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  color?: keyof ColorTokens;
  align?: 'left' | 'center' | 'right';
}

export function AppText({ variant = 'body', tone = 'default', color, align, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const c = theme.colors;
  const toneColor = {
    default: c.text,
    muted: c.textMuted,
    primary: c.primary,
    danger: c.danger,
    warning: c.warning,
    inverse: c.primaryText,
  }[tone];
  const isHeading = variant === 'title' || variant === 'heading';
  return (
    <RNText
      accessibilityRole={isHeading ? 'header' : undefined}
      maxFontSizeMultiplier={2}
      {...rest}
      style={[theme.typography[variant], { color: color ? c[color] : toneColor, textAlign: align }, style]}
    />
  );
}
