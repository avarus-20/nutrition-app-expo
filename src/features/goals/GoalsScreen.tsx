import React, { useState } from 'react';
import { View } from 'react-native';

import { GOAL_KEYS, type GoalKey, type Goals } from '@/domain/types';
import { parseDecimal } from '@/domain/validation';
import { useQuery } from '@/hooks/useQuery';
import { errorText } from '@/i18n';
import { inputNumber } from '@/features/nutrition/NutritionFields';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import { Button } from '@/ui/Button';
import { goBack, Screen } from '@/ui/Screen';
import { Card, ErrorState, LoadingState } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { NumberField } from '@/ui/TextField';
import { useToast } from '@/ui/Toast';
import { toAppError } from '@/utils/errors';

const MAX: Record<GoalKey, number> = {
  calories: 20000,
  protein_g: 2000,
  carbs_g: 2000,
  fat_g: 2000,
  fiber_g: 500,
  sugar_g: 2000,
  salt_g: 200,
  water_ml: 10000,
};

function GoalsForm({ goals }: { goals: Goals }) {
  const services = useServices();
  const i18n = useI18n();
  const { m } = i18n;
  const { spacing } = useTheme();
  const toast = useToast();
  const [text, setText] = useState<Record<GoalKey, string>>(() => {
    const out = {} as Record<GoalKey, string>;
    for (const k of GOAL_KEYS) out[k] = goals[k] !== undefined ? inputNumber(i18n, goals[k]) : '';
    return out;
  });
  const [errors, setErrors] = useState<Partial<Record<GoalKey, string>>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const errs: Partial<Record<GoalKey, string>> = {};
    const values = {} as Record<GoalKey, number | null>;
    for (const k of GOAL_KEYS) {
      const v = parseDecimal(text[k]);
      if (v === null) values[k] = null;
      else if (Number.isNaN(v)) errs[k] = m.common.invalidNumber;
      else if (v <= 0 || v > MAX[k]) errs[k] = m.common.outOfRange;
      else values[k] = v;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      for (const k of GOAL_KEYS) {
        if ((goals[k] ?? null) !== values[k]) await services.goals.setGoal(k, values[k]);
      }
      toast.show(m.common.saved);
      goBack('/settings');
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    } finally {
      setSaving(false);
    }
  };

  const unit = (k: GoalKey) => (k === 'calories' ? m.units.kcal : k === 'water_ml' ? m.units.ml : m.units.g);

  return (
    <Screen
      title={m.goals.title}
      back
      backHref="/settings"
      maxWidth={760}
      footer={<Button label={m.common.save} onPress={save} loading={saving} testID="goals-save" />}
    >
      <AppText tone="muted">{m.goals.description}</AppText>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {GOAL_KEYS.map((k) => (
            <View key={k} style={{ flexBasis: 200, flexGrow: 1 }}>
              <NumberField
                testID={`goal-${k}`}
                label={m.nutrients[k]}
                value={text[k]}
                onChangeText={(v) => setText((prev) => ({ ...prev, [k]: v }))}
                suffix={`${unit(k)} ${m.goals.perDay}`}
                error={errors[k]}
              />
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

export function GoalsScreen() {
  const services = useServices();
  const { m } = useI18n();
  const q = useQuery(() => services.goals.getGoals(), [], []);
  if (q.error) {
    return (
      <Screen title={m.goals.title} back backHref="/settings">
        <ErrorState error={q.error} onRetry={q.reload} />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen title={m.goals.title} back backHref="/settings">
        <LoadingState />
      </Screen>
    );
  }
  return <GoalsForm goals={q.data} />;
}
