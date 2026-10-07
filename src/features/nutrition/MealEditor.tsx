import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { sumNutrition } from '@/domain/nutrition';
import type { MealType, MealWithItems } from '@/domain/types';
import { useQuery } from '@/hooks/useQuery';
import { errorText } from '@/i18n';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import { Button } from '@/ui/Button';
import { DateField } from '@/ui/Calendar';
import { Columns } from '@/ui/Columns';
import { confirmAction } from '@/ui/dialogs';
import { goBack, Screen } from '@/ui/Screen';
import { Card, EmptyState, ErrorState, ListRow, LoadingState } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useToast } from '@/ui/Toast';
import { isoToLocalTime, localDateTimeToIso, type LocalDate } from '@/utils/dates';
import { toAppError } from '@/utils/errors';
import { addHref } from './DayView';
import { itemSubtitle, kcal } from './format';
import { parseTime } from './nutritionForm';
import { MealTypePicker } from './pickers';

export interface MealAttachmentsProps {
  meal: MealWithItems;
}

function MealItems({ meal }: { meal: MealWithItems }) {
  const services = useServices();
  const i18n = useI18n();
  const { m } = i18n;
  // Items reload live (e.g. after editing one), independent of the form state.
  const q = useQuery(() => services.meals.getMeal(meal.id), [meal.id], ['meal_items']);
  const items = q.data?.items ?? meal.items;
  const total = sumNutrition(items).calories;
  return (
    <Card
      title={m.meal.items}
      action={
        <AppText tone="muted" variant="small">
          {m.meal.total}: {kcal(i18n, total)}
        </AppText>
      }
    >
      {items.length === 0 ? <AppText tone="muted">{m.meal.noItems}</AppText> : null}
      {items.map((item) => (
        <ListRow
          key={item.id}
          title={item.food_name}
          subtitle={itemSubtitle(i18n, item)}
          onPress={() => router.push(`/item/${item.id}`)}
          right={<AppText variant="subheading">{i18n.number(Math.round(item.calories), 0)}</AppText>}
        />
      ))}
      <Button
        variant="secondary"
        icon="add"
        label={m.meal.addItem}
        onPress={() => router.push(addHref(meal.local_date, meal.meal_type, meal.id))}
      />
    </Card>
  );
}

function MealForm({ meal, attachments }: { meal: MealWithItems; attachments?: React.ComponentType<MealAttachmentsProps> }) {
  const services = useServices();
  const { m } = useI18n();
  const { spacing } = useTheme();
  const toast = useToast();
  const [type, setType] = useState<MealType>(meal.meal_type);
  const [date, setDate] = useState<LocalDate>(meal.local_date);
  const [time, setTime] = useState(isoToLocalTime(meal.eaten_at));
  const [title, setTitle] = useState(meal.title ?? '');
  const [notes, setNotes] = useState(meal.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const Attachments = attachments;

  const save = async () => {
    const parsedTime = parseTime(time);
    const errs: Record<string, string> = {};
    if (!parsedTime) errs.time = m.common.invalidValue;
    if (title.length > 200) errs.title = m.common.tooLong;
    if (notes.length > 4000) errs.notes = m.common.tooLong;
    setErrors(errs);
    if (!parsedTime || Object.keys(errs).length > 0) return;
    setBusy('save');
    try {
      await services.meals.updateMeal(meal.id, {
        meal_type: type,
        local_date: date,
        eaten_at: localDateTimeToIso(date, parsedTime),
        title: title.trim() || null,
        notes: notes.trim() || null,
      });
      toast.show(m.common.saved);
      goBack('/');
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: m.meal.deleteMeal,
      message: m.meal.deleteConfirm,
      confirmLabel: m.common.delete,
      cancelLabel: m.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await services.meals.deleteMeal(meal.id);
      toast.show(m.common.deleted);
      goBack('/');
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
      setBusy(null);
    }
  };

  return (
    <Screen
      title={m.mealTypes[meal.meal_type]}
      back
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button variant="danger" icon="trash-outline" label={m.meal.deleteMeal} onPress={remove} loading={busy === 'delete'} testID="meal-delete" />
          <Button label={m.common.save} onPress={save} loading={busy === 'save'} style={{ flex: 1 }} testID="meal-save" />
        </View>
      }
    >
      <Columns>
        <View style={{ gap: spacing.lg }}>
          <Card>
            <MealTypePicker label={m.meal.type} value={type} onChange={setType} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <DateField label={m.add.date} value={date} onChange={setDate} />
              <View style={{ width: 140 }}>
                <TextField
                  label={m.meal.time}
                  value={time}
                  onChangeText={setTime}
                  hint={m.meal.timeHint}
                  error={errors.time}
                  inputMode="numeric"
                  maxLength={5}
                  testID="meal-time"
                />
              </View>
            </View>
            <TextField label={`${m.meal.name} (${m.common.optional})`} value={title} onChangeText={setTitle} error={errors.title} maxLength={200} />
            <TextField label={`${m.meal.notes} (${m.common.optional})`} value={notes} onChangeText={setNotes} error={errors.notes} multiline maxLength={4000} />
          </Card>
          <MealItems meal={meal} />
        </View>
        {Attachments ? <Attachments meal={meal} /> : null}
      </Columns>
    </Screen>
  );
}

export function MealEditorScreen({ id, attachments }: { id: string; attachments?: React.ComponentType<MealAttachmentsProps> }) {
  const services = useServices();
  const { m } = useI18n();
  const q = useQuery(() => services.meals.getMeal(id), [id], []);
  if (q.error) {
    return (
      <Screen title={m.meal.title} back>
        <ErrorState error={q.error} onRetry={q.reload} />
      </Screen>
    );
  }
  if (q.loading && q.data === undefined) {
    return (
      <Screen title={m.meal.title} back>
        <LoadingState />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen title={m.meal.title} back>
        <EmptyState icon="help-circle-outline" title={m.meal.notFound} />
      </Screen>
    );
  }
  return <MealForm key={q.data.id} meal={q.data} attachments={attachments} />;
}
