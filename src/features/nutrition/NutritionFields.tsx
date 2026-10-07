import React, { useState } from 'react';
import { View } from 'react-native';

import { NUTRIENTS, type Nutrient } from '@/domain/types';
import type { Translator } from '@/i18n';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { Button } from '@/ui/Button';
import { NumberField } from '@/ui/TextField';
import type { NutritionText } from './nutritionForm';

/** Number → input text without grouping, with the locale's decimal separator. */
export function inputNumber(i18n: Pick<Translator, 'language'>, value: number): string {
  const s = String(Math.round(value * 100) / 100);
  return i18n.language === 'en' ? s : s.replace('.', ',');
}

const PRIMARY: Nutrient[] = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
const SECONDARY: Nutrient[] = NUTRIENTS.filter((n) => !PRIMARY.includes(n));

export function NutritionFields({
  value,
  onChange,
  errors,
  testIDPrefix = 'nutrition',
}: {
  value: NutritionText;
  onChange: (next: NutritionText) => void;
  errors?: Partial<Record<Nutrient, string>>;
  testIDPrefix?: string;
}) {
  const { m } = useI18n();
  const { spacing } = useTheme();
  const hasSecondary = SECONDARY.some((k) => value[k] !== '' || errors?.[k]);
  const [expanded, setExpanded] = useState(hasSecondary);

  const field = (k: Nutrient) => (
    <View key={k} style={{ flexBasis: 140, flexGrow: 1 }}>
      <NumberField
        testID={`${testIDPrefix}-${k}`}
        label={k === 'calories' ? m.nutrients.calories : `${m.nutrients[k]} (${m.common.optional})`}
        value={value[k]}
        onChangeText={(text) => onChange({ ...value, [k]: text })}
        suffix={k === 'calories' ? m.units.kcal : m.units.g}
        error={errors?.[k] ?? null}
        integer={false}
      />
    </View>
  );

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>{PRIMARY.map(field)}</View>
      {expanded || hasSecondary ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>{SECONDARY.map(field)}</View>
      ) : (
        <Button
          variant="ghost"
          compact
          icon="add"
          label={`${m.nutrients.fiber_g}, ${m.nutrients.sugar_g}, ${m.nutrients.salt_g}`}
          onPress={() => setExpanded(true)}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
    </View>
  );
}
