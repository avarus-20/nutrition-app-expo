import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import type { EntryDraft } from '@/domain/drafts';
import type { MealType } from '@/domain/types';
import { parseDecimal } from '@/domain/validation';
import { useQuery } from '@/hooks/useQuery';
import { errorText } from '@/i18n';
import { inputNumber, NutritionFields } from '@/features/nutrition/NutritionFields';
import { kcal } from '@/features/nutrition/format';
import { MealTypePicker, UnitPicker } from '@/features/nutrition/pickers';
import { PhotoImage } from '@/features/photos/PhotoViews';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import { Button, IconButton } from '@/ui/Button';
import { DateField } from '@/ui/Calendar';
import { Columns } from '@/ui/Columns';
import { confirmAction } from '@/ui/dialogs';
import { goBack, Screen } from '@/ui/Screen';
import { Banner, Card, EmptyState, ErrorState, ListRow, LoadingState } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { TextField, NumberField } from '@/ui/TextField';
import { useToast } from '@/ui/Toast';
import type { LocalDate } from '@/utils/dates';
import { toAppError } from '@/utils/errors';
import { formsToDraftItems, parseDraftForms, toDraftForm, type DraftFormErrors, type DraftItemForm } from './draftForm';

export function DraftListScreen() {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const drafts = useQuery(() => services.drafts.list(), [], ['entry_drafts']);
  return (
    <Screen title={m.drafts.listTitle} back backHref="/">
      {drafts.error ? <ErrorState error={drafts.error} onRetry={drafts.reload} /> : null}
      {drafts.loading && !drafts.data ? <LoadingState /> : null}
      {drafts.data && drafts.data.length === 0 ? (
        <Card>
          <EmptyState icon="checkmark-done-outline" title={m.drafts.noDrafts} />
        </Card>
      ) : null}
      {drafts.data && drafts.data.length > 0 ? (
        <Card>
          {drafts.data.map((d) => (
            <ListRow
              key={d.id}
              testID={`draft-${d.id}`}
              title={`${m.mealTypes[d.meal_type]} · ${i18n.date(d.local_date, 'short')}`}
              subtitle={`${d.source === 'photo_ai' ? m.drafts.fromPhoto : m.drafts.fromVoice} · ${t(m.dashboard.items, { count: d.items.length })}`}
              onPress={() => router.push(`/drafts/${d.id}`)}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function ItemCard({
  form,
  errors,
  onChange,
  onRemove,
  index,
}: {
  form: DraftItemForm;
  errors?: Record<string, string>;
  onChange: (next: DraftItemForm) => void;
  onRemove: () => void;
  index: number;
}) {
  const i18n = useI18n();
  const { m } = i18n;
  const { spacing } = useTheme();
  const missingCalories = form.nutrition.calories.trim() === '';
  return (
    <Card
      title={form.name || `#${index + 1}`}
      action={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {form.confidence !== null ? (
            <AppText variant="small" tone="muted">
              {m.drafts.estimated} · {i18n.number(Math.round(form.confidence * 100), 0)}%
            </AppText>
          ) : null}
          <IconButton icon="trash-outline" tone="danger" label={`${m.drafts.remove}: ${form.name}`} onPress={onRemove} testID={`draft-remove-${index}`} />
        </View>
      }
    >
      {missingCalories ? <Banner tone="warning" message={m.drafts.caloriesUnknown} /> : null}
      <TextField
        label={m.add.name}
        value={form.name}
        onChangeText={(name) => onChange({ ...form, name })}
        error={errors?.name}
        maxLength={200}
        testID={`draft-name-${index}`}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <View style={{ width: 160 }}>
          <NumberField
            label={m.add.quantity}
            value={form.quantity}
            onChangeText={(quantity) => onChange({ ...form, quantity })}
            error={errors?.quantity}
            testID={`draft-quantity-${index}`}
          />
        </View>
        <View style={{ flex: 1, minWidth: 220 }}>
          <UnitPicker label={m.item.unit} value={form.unit} onChange={(unit) => onChange({ ...form, unit })} />
        </View>
      </View>
      <NutritionFields
        value={form.nutrition}
        onChange={(nutrition) => onChange({ ...form, nutrition })}
        errors={errors}
        testIDPrefix={`draft-${index}`}
      />
    </Card>
  );
}

function DraftReview({ draft }: { draft: EntryDraft }) {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const { spacing } = useTheme();
  const toast = useToast();
  const [forms, setForms] = useState<DraftItemForm[]>(() => draft.items.map((i) => toDraftForm(i, (v) => inputNumber(i18n, v))));
  const [date, setDate] = useState<LocalDate>(draft.local_date);
  const [mealType, setMealType] = useState<MealType>(draft.meal_type);
  const [errors, setErrors] = useState<DraftFormErrors>({});
  const [busy, setBusy] = useState<'confirm' | 'dismiss' | null>(null);
  const photo = useQuery(
    () => (draft.media_id ? services.photos.get(draft.media_id) : Promise.resolve(null)),
    [draft.media_id],
    ['media_files'],
  );

  const persist = (next: DraftItemForm[]) => {
    services.drafts
      .saveItems(draft.id, formsToDraftItems(next, parseDecimal))
      .catch((error: unknown) => toast.show(errorText(m, toAppError(error).code), 'error'));
  };

  const remove = (key: string) => {
    const next = forms.filter((f) => f.key !== key);
    setForms(next);
    persist(next);
  };

  const confirm = async () => {
    const parsed = parseDraftForms(forms, m);
    if (parsed.errors) {
      setErrors(parsed.errors);
      toast.show(m.errors.validation, 'error');
      return;
    }
    setErrors({});
    setBusy('confirm');
    try {
      const sameTarget = date === draft.local_date && mealType === draft.meal_type;
      await services.drafts.confirm(draft.id, parsed.items, {
        date,
        mealType,
        mealId: sameTarget ? draft.meal_id : null,
      });
      toast.show(t(m.add.added, { count: parsed.items.length }));
      router.replace({ pathname: '/', params: { date } });
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
      setBusy(null);
    }
  };

  const dismiss = async () => {
    const ok = await confirmAction({
      title: m.drafts.dismiss,
      message: m.drafts.dismissConfirm,
      confirmLabel: m.drafts.dismiss,
      cancelLabel: m.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusy('dismiss');
    try {
      await services.drafts.dismiss(draft.id);
      goBack('/');
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
      setBusy(null);
    }
  };

  const total = forms.reduce((s, f) => {
    const v = parseDecimal(f.nutrition.calories);
    return s + (v !== null && !Number.isNaN(v) ? v : 0);
  }, 0);

  return (
    <Screen
      title={m.drafts.title}
      back
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button variant="secondary" label={m.drafts.dismiss} onPress={dismiss} loading={busy === 'dismiss'} disabled={busy !== null} testID="draft-dismiss" />
          <Button
            label={t(m.drafts.confirm, { count: forms.length })}
            onPress={confirm}
            loading={busy === 'confirm'}
            disabled={forms.length === 0 || busy !== null}
            style={{ flex: 1 }}
            testID="draft-confirm"
          />
        </View>
      }
    >
      <Banner tone="warning" message={m.drafts.description} />
      <Columns>
        <View style={{ gap: spacing.lg }}>
          <Card>
            <MealTypePicker value={mealType} onChange={setMealType} />
            <DateField label={m.add.date} value={date} onChange={setDate} />
            <AppText tone="muted">
              {m.meal.total}: {kcal(i18n, total)}
            </AppText>
          </Card>
          {photo.data ? (
            <Card title={m.photos.title}>
              <PhotoImage photo={photo.data} height={260} contentFit="contain" />
            </Card>
          ) : null}
          {draft.input_text ? (
            <Card title={m.voice.transcript}>
              <AppText>{draft.input_text}</AppText>
            </Card>
          ) : null}
        </View>
        <View style={{ gap: spacing.lg }}>
          {forms.length === 0 ? (
            <Card>
              <EmptyState icon="list-outline" title={m.drafts.empty} />
            </Card>
          ) : null}
          {forms.map((form, index) => (
            <ItemCard
              key={form.key}
              index={index}
              form={form}
              errors={errors[form.key]}
              onChange={(next) => setForms((list) => list.map((f) => (f.key === form.key ? next : f)))}
              onRemove={() => remove(form.key)}
            />
          ))}
        </View>
      </Columns>
    </Screen>
  );
}

export function DraftReviewScreen({ id }: { id: string }) {
  const services = useServices();
  const { m } = useI18n();
  const q = useQuery(() => services.drafts.get(id), [id], []);
  if (q.error) {
    return (
      <Screen title={m.drafts.title} back>
        <ErrorState error={q.error} onRetry={q.reload} />
      </Screen>
    );
  }
  if (q.loading && q.data === undefined) {
    return (
      <Screen title={m.drafts.title} back>
        <LoadingState />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen title={m.drafts.title} back backHref="/drafts">
        <EmptyState icon="checkmark-done-outline" title={m.drafts.notFound} />
      </Screen>
    );
  }
  return <DraftReview key={q.data.id} draft={q.data} />;
}
