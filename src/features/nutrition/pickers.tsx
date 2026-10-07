import React from 'react';
import { View } from 'react-native';

import { MEAL_TYPES, UNITS, type MealType, type Unit } from '@/domain/types';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { SegmentedControl } from '@/ui/Controls';
import { Chip } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';

export function MealTypePicker({ value, onChange, label }: { value: MealType; onChange: (v: MealType) => void; label?: string }) {
  const { m } = useI18n();
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="small" tone="muted">
        {label ?? m.add.meal}
      </AppText>
      <SegmentedControl
        testID="meal-type"
        label={label ?? m.add.meal}
        value={value}
        onChange={onChange}
        options={MEAL_TYPES.map((t) => ({ value: t, label: m.mealTypes[t] }))}
      />
    </View>
  );
}

export function UnitPicker({ value, onChange, label }: { value: Unit; onChange: (v: Unit) => void; label: string }) {
  const { m } = useI18n();
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {UNITS.map((u) => (
          <Chip key={u} label={m.units[u]} selected={u === value} onPress={() => onChange(u)} />
        ))}
      </View>
    </View>
  );
}

/** Default meal type for "now": breakfast before 10:30, lunch before 15:00, snack before 17:00, else dinner. */
export function mealTypeForTime(date: Date = new Date()): MealType {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 10 * 60 + 30) return 'breakfast';
  if (minutes < 15 * 60) return 'lunch';
  if (minutes < 17 * 60) return 'snack';
  return 'dinner';
}
