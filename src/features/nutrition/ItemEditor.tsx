import React, { useState } from 'react';
import { View } from 'react-native';

import { MEAL_TYPES, type MealItem, type MealType, type Unit } from '@/domain/types';
import { useQuery } from '@/hooks/useQuery';
import { errorText } from '@/i18n';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import { Button } from '@/ui/Button';
import { SegmentedControl } from '@/ui/Controls';
import { confirmAction } from '@/ui/dialogs';
import { goBack, Screen } from '@/ui/Screen';
import { Card, EmptyState, ErrorState, LoadingState } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { NumberField, TextField } from '@/ui/TextField';
import { useToast } from '@/ui/Toast';
import { toAppError } from '@/utils/errors';
import { inputNumber, NutritionFields } from './NutritionFields';
import { nutritionToText, parseNutrition, parsePositive, scaleNutrition, type NutritionText } from './nutritionForm';
import { UnitPicker } from './pickers';
import { parseDecimal } from '@/domain/validation';

function ItemForm({ item, mealType }: { item: MealItem; mealType: MealType }) {
  const services = useServices();
  const i18n = useI18n();
  const { m } = i18n;
  const { spacing } = useTheme();
  const toast = useToast();
  const fmt = (v: number) => inputNumber(i18n, v);
  const [name, setName] = useState(item.food_name);
  const [quantity, setQuantity] = useState(fmt(item.quantity));
  const [unit, setUnit] = useState<Unit>(item.unit);
  const [nutrition, setNutrition] = useState<NutritionText>(nutritionToText(item, fmt));
  const [nutritionEdited, setNutritionEdited] = useState(false);
  const [type, setType] = useState<MealType>(mealType);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const onQuantity = (text: string) => {
    setQuantity(text);
    const q = parseDecimal(text);
    // Keep nutrition proportional to the amount until the user edits it.
    if (!nutritionEdited && q !== null && !Number.isNaN(q) && q > 0) {
      setNutrition(nutritionToText(scaleNutrition(item, item.quantity, q), fmt));
    }
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = m.common.required;
    const q = parsePositive(quantity, 100000, m);
    if (q.error) errs.quantity = q.error;
    const n = parseNutrition(nutrition, m);
    if (n.errors) Object.assign(errs, n.errors);
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !n.value || q.value === null) return;
    setBusy('save');
    try {
      await services.meals.updateItem(item.id, {
        ...n.value,
        food_name: name.trim(),
        food_id: item.food_id,
        quantity: q.value,
        unit,
      });
      if (type !== mealType) await services.meals.moveItemToType(item.id, type);
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
      title: m.item.deleteConfirm,
      message: item.food_name,
      confirmLabel: m.common.delete,
      cancelLabel: m.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await services.meals.deleteItem(item.id);
      toast.show(m.common.deleted);
      goBack('/');
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
      setBusy(null);
    }
  };

  return (
    <Screen
      title={m.item.title}
      back
      maxWidth={760}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button variant="danger" icon="trash-outline" label={m.common.delete} onPress={remove} loading={busy === 'delete'} testID="item-delete" />
          <Button label={m.common.save} onPress={save} loading={busy === 'save'} style={{ flex: 1 }} testID="item-save" />
        </View>
      }
    >
      <Card>
        <TextField label={m.item.name} value={name} onChangeText={setName} error={errors.name} maxLength={200} testID="item-name" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <View style={{ width: 160 }}>
            <NumberField label={m.item.quantity} value={quantity} onChangeText={onQuantity} error={errors.quantity} testID="item-quantity" />
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <UnitPicker label={m.item.unit} value={unit} onChange={setUnit} />
          </View>
        </View>
        <NutritionFields
          value={nutrition}
          onChange={(next) => {
            setNutritionEdited(true);
            setNutrition(next);
          }}
          errors={errors}
          testIDPrefix="item"
        />
      </Card>
      <Card title={m.item.moveTo}>
        <SegmentedControl
          label={m.item.moveTo}
          value={type}
          onChange={setType}
          options={MEAL_TYPES.map((t) => ({ value: t, label: m.mealTypes[t] }))}
        />
      </Card>
      <AppText tone="muted" variant="small">
        {m.item.source}: {m.item.sources[item.source]}
      </AppText>
    </Screen>
  );
}

export function ItemEditorScreen({ id }: { id: string }) {
  const services = useServices();
  const { m } = useI18n();
  const q = useQuery(
    async () => {
      const item = await services.meals.getItem(id);
      const meal = item ? await services.meals.getMeal(item.meal_id) : null;
      return item && meal ? { item, mealType: meal.meal_type } : null;
    },
    [id],
    [],
  );
  if (q.error) {
    return (
      <Screen title={m.item.title} back>
        <ErrorState error={q.error} onRetry={q.reload} />
      </Screen>
    );
  }
  if (q.loading && q.data === undefined) {
    return (
      <Screen title={m.item.title} back>
        <LoadingState />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen title={m.item.title} back>
        <EmptyState icon="help-circle-outline" title={m.item.notFound} />
      </Screen>
    );
  }
  return <ItemForm key={q.data.item.id} item={q.data.item} mealType={q.data.mealType} />;
}
