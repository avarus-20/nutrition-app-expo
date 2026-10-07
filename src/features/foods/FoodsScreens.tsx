import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import type { Unit } from '@/domain/types';
import { useQuery } from '@/hooks/useQuery';
import { errorText } from '@/i18n';
import { inputNumber, NutritionFields } from '@/features/nutrition/NutritionFields';
import { kcal } from '@/features/nutrition/format';
import { nutritionToText, parseNutrition, parsePositive, type NutritionText } from '@/features/nutrition/nutritionForm';
import { UnitPicker } from '@/features/nutrition/pickers';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import type { FoodWithFavorite } from '@/repositories/foodRepository';
import { Button, IconButton } from '@/ui/Button';
import { confirmAction } from '@/ui/dialogs';
import { goBack, Screen } from '@/ui/Screen';
import { Card, Divider, EmptyState, ErrorState, ListRow, LoadingState } from '@/ui/Surfaces';
import { NumberField, TextField } from '@/ui/TextField';
import { useToast } from '@/ui/Toast';
import { AppError, toAppError } from '@/utils/errors';

export function FoodListScreen() {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const toast = useToast();
  const [query, setQuery] = useState('');
  const foods = useQuery(() => services.foods.search(query, 200), [query], ['foods', 'favorite_foods']);

  const toggleFavorite = async (food: FoodWithFavorite) => {
    try {
      await services.foods.setFavorite(food.id, !food.is_favorite);
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    }
  };

  return (
    <Screen
      title={m.foods.title}
      back
      backHref="/settings"
      maxWidth={760}
      actions={<Button compact icon="add" label={m.foods.new} onPress={() => router.push('/foods/new')} testID="food-new" />}
    >
      <TextField label={m.common.search} value={query} onChangeText={setQuery} autoCapitalize="none" />
      {foods.error ? <ErrorState error={foods.error} onRetry={foods.reload} /> : null}
      {foods.loading && !foods.data ? <LoadingState /> : null}
      {foods.data && foods.data.length === 0 ? (
        <EmptyState icon="nutrition-outline" title={query ? m.add.noResults : m.foods.empty} />
      ) : null}
      {foods.data && foods.data.length > 0 ? (
        <Card>
          {foods.data.map((food, index) => (
            <View key={food.id}>
              {index > 0 ? <Divider /> : null}
              <ListRow
                title={food.brand ? `${food.name} (${food.brand})` : food.name}
                subtitle={`${kcal(i18n, food.calories)} · ${t(m.add.perServing, {
                  size: i18n.number(food.serving_size, 2),
                  unit: m.units[food.serving_unit],
                })}`}
                onPress={() => router.push(`/foods/${food.id}`)}
                right={
                  <IconButton
                    icon={food.is_favorite ? 'star' : 'star-outline'}
                    tone={food.is_favorite ? 'primary' : 'muted'}
                    selected={!!food.is_favorite}
                    label={food.is_favorite ? m.foods.removeFavorite : m.foods.addFavorite}
                    onPress={() => toggleFavorite(food)}
                  />
                }
              />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function FoodForm({ food }: { food: FoodWithFavorite | null }) {
  const services = useServices();
  const i18n = useI18n();
  const { m } = i18n;
  const { spacing } = useTheme();
  const toast = useToast();
  const fmt = (v: number) => inputNumber(i18n, v);
  const [name, setName] = useState(food?.name ?? '');
  const [brand, setBrand] = useState(food?.brand ?? '');
  const [barcode, setBarcode] = useState(food?.barcode ?? '');
  const [size, setSize] = useState(food ? fmt(food.serving_size) : '100');
  const [unit, setUnit] = useState<Unit>(food?.serving_unit ?? 'g');
  const [nutrition, setNutrition] = useState<NutritionText>(nutritionToText(food, fmt));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = m.common.required;
    const code = barcode.replace(/\s+/g, '');
    if (code && !/^[0-9]{6,14}$/.test(code)) errs.barcode = m.foods.barcodeHint;
    const s = parsePositive(size, 100000, m);
    if (s.error) errs.size = s.error;
    const n = parseNutrition(nutrition, m);
    if (n.errors) Object.assign(errs, n.errors);
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !n.value || s.value === null) return;
    setBusy('save');
    try {
      if (code) {
        const existing = await services.foods.lookupBarcode(code);
        if (existing && 'id' in existing && existing.id !== food?.id) {
          throw new AppError('validation', 'barcode taken', { details: { barcode: 'taken' } });
        }
      }
      const input = {
        ...n.value,
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: code || null,
        serving_size: s.value,
        serving_unit: unit,
      };
      if (food) await services.foods.update(food.id, input);
      else await services.foods.create(input);
      toast.show(m.common.saved);
      goBack('/foods');
    } catch (error) {
      const e = toAppError(error);
      if (e.code === 'validation' && (e.details as Record<string, string> | undefined)?.barcode === 'taken') {
        setErrors({ barcode: m.foods.barcodeTaken });
      } else {
        toast.show(errorText(m, e.code), 'error');
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!food) return;
    const ok = await confirmAction({
      title: m.foods.deleteConfirm,
      message: food.name,
      confirmLabel: m.common.delete,
      cancelLabel: m.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await services.foods.remove(food.id);
      toast.show(m.common.deleted);
      goBack('/foods');
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
      setBusy(null);
    }
  };

  return (
    <Screen
      title={food ? m.foods.edit : m.foods.new}
      back
      backHref="/foods"
      maxWidth={760}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {food ? <Button variant="danger" icon="trash-outline" label={m.common.delete} onPress={remove} loading={busy === 'delete'} /> : null}
          <Button label={m.common.save} onPress={save} loading={busy === 'save'} style={{ flex: 1 }} testID="food-save" />
        </View>
      }
    >
      <Card>
        <TextField label={m.foods.name} value={name} onChangeText={setName} error={errors.name} maxLength={200} testID="food-name" />
        <TextField label={`${m.foods.brand} (${m.common.optional})`} value={brand} onChangeText={setBrand} maxLength={200} />
        <TextField
          label={`${m.foods.barcode} (${m.common.optional})`}
          value={barcode}
          onChangeText={setBarcode}
          error={errors.barcode}
          hint={m.foods.barcodeHint}
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={14}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <View style={{ width: 160 }}>
            <NumberField label={m.foods.servingSize} value={size} onChangeText={setSize} error={errors.size} testID="food-size" />
          </View>
          <View style={{ flex: 1, minWidth: 220 }}>
            <UnitPicker label={m.foods.servingUnit} value={unit} onChange={setUnit} />
          </View>
        </View>
      </Card>
      <Card title={m.foods.nutritionPer}>
        <NutritionFields value={nutrition} onChange={setNutrition} errors={errors} testIDPrefix="food" />
      </Card>
    </Screen>
  );
}

export function FoodEditorScreen({ id }: { id: string }) {
  const services = useServices();
  const { m } = useI18n();
  const isNew = id === 'new';
  const q = useQuery(() => (isNew ? Promise.resolve(null) : services.foods.get(id)), [id], []);
  if (isNew) return <FoodForm food={null} />;
  if (q.error) {
    return (
      <Screen title={m.foods.edit} back backHref="/foods">
        <ErrorState error={q.error} onRetry={q.reload} />
      </Screen>
    );
  }
  if (q.loading && q.data === undefined) {
    return (
      <Screen title={m.foods.edit} back backHref="/foods">
        <LoadingState />
      </Screen>
    );
  }
  if (!q.data || q.data.deleted_at) {
    return (
      <Screen title={m.foods.edit} back backHref="/foods">
        <EmptyState icon="help-circle-outline" title={m.foods.notFound} />
      </Screen>
    );
  }
  return <FoodForm key={q.data.id} food={q.data} />;
}
