import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import type { ColorTokens } from '@/theme/tokens';
import { AppText } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Single-choice control (radio group semantics). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  testID,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.segments, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            accessibilityLabel={o.label}
            style={(state) => {
              const s = state as { focused?: boolean };
              return [
                styles.segment,
                {
                  backgroundColor: selected ? colors.surface : 'transparent',
                  borderRadius: radius.sm,
                  borderColor: s.focused ? colors.focus : selected ? colors.border : 'transparent',
                },
              ];
            }}
          >
            <AppText
              variant="small"
              numberOfLines={1}
              style={{ color: selected ? colors.text : colors.textMuted, fontWeight: selected ? '700' : '500' }}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({
  value,
  max,
  color = 'primary',
  label,
  height = 8,
}: {
  value: number;
  max: number;
  color?: keyof ColorTokens;
  label: string;
  height?: number;
}) {
  const { colors, radius } = useTheme();
  const { m, t, number } = useI18n();
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const over = max > 0 && value > max;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t(m.a11y.progress, { label, value: number(value, 0), max: number(max, 0) })}
      accessibilityValue={{ min: 0, max: Math.round(max), now: Math.round(value) }}
      style={{ height, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${ratio * 100}%`,
          height: '100%',
          borderRadius: radius.pill,
          backgroundColor: over ? colors.danger : colors[color],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', padding: 3, gap: 3, alignSelf: 'stretch' },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
  },
});
