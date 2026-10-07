import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Switch, View } from 'react-native';

import { MEAL_TYPES, type MealType, type Unit } from '@/domain/types';
import { estimatePhotoToDraft, useRecognition } from '@/features/drafts/recognition';
import { CaptureButtons, PhotoImage } from '@/features/photos/PhotoViews';
import { VoiceDraftPanel, VoiceNoteRow, VoiceRecorder } from '@/features/voice/VoiceViews';
import { errorText } from '@/i18n';
import { useQuery } from '@/hooks/useQuery';
import { inputNumber, NutritionFields } from '@/features/nutrition/NutritionFields';
import { itemSubtitle, kcal } from '@/features/nutrition/format';
import { nutritionToText, parseNutrition, parsePositive, type NutritionText } from '@/features/nutrition/nutritionForm';
import { mealTypeForTime, MealTypePicker, UnitPicker } from '@/features/nutrition/pickers';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import type { PreparedPhoto } from '@/services/photoService';
import type { RecordedAudio } from '@/services/voiceService';
import { Button, IconButton } from '@/ui/Button';
import { DateField } from '@/ui/Calendar';
import { SegmentedControl } from '@/ui/Controls';
import { goBack, Screen } from '@/ui/Screen';
import { Banner, Card, Divider, EmptyState, ErrorState, ListRow, LoadingState } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { NumberField, TextField } from '@/ui/TextField';
import { useToast } from '@/ui/Toast';
import { isValidLocalDate, todayLocalDate, type LocalDate } from '@/utils/dates';
import { toAppError } from '@/utils/errors';
import { entryNutrition, fromFood, fromRecent, toItemInput, type SelectedEntry } from './selection';

export type AddTab = 'search' | 'manual' | 'photo' | 'voice';

export interface AddTarget {
  date: LocalDate;
  mealType: MealType;
  /** Existing meal to add to (only while the meal type is unchanged). */
  mealId: string | null;
}

function SearchTab({ target, onDone }: { target: AddTarget; onDone: () => void }) {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const { spacing } = useTheme();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SelectedEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const fmt = (v: number) => inputNumber(i18n, v);

  const data = useQuery(
    async () => {
      const q = query.trim().toLocaleLowerCase();
      const [favorites, recent, foods] = await Promise.all([
        services.foods.favorites(),
        services.meals.recentItems(q ? 100 : 15),
        services.foods.search(query, q ? 50 : 20),
      ]);
      return {
        favorites: q ? [] : favorites,
        recent: q ? recent.filter((r) => r.food_name.toLocaleLowerCase().includes(q)).slice(0, 20) : recent,
        foods: q ? foods : foods.filter((f) => !f.is_favorite),
      };
    },
    [query],
    ['foods', 'favorite_foods', 'meal_items'],
  );

  const toggle = (entry: SelectedEntry) =>
    setSelected((list) => (list.some((e) => e.key === entry.key) ? list.filter((e) => e.key !== entry.key) : [...list, entry]));
  const isSelected = (key: string) => selected.some((e) => e.key === key);
  const inputs = selected.map(toItemInput);
  const valid = inputs.every((i) => i !== null) && inputs.length > 0;

  const submit = async () => {
    const items = inputs.filter((i): i is NonNullable<typeof i> => i !== null);
    setSaving(true);
    try {
      await services.meals.addItemsToDay({ date: target.date, mealType: target.mealType, mealId: target.mealId }, items);
      toast.show(t(m.add.added, { count: items.length }));
      onDone();
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    } finally {
      setSaving(false);
    }
  };

  const check = (key: string) => (
    <AppText tone={isSelected(key) ? 'primary' : 'muted'} variant="subheading">
      {isSelected(key) ? '✓' : '+'}
    </AppText>
  );

  const section = (title: string, rows: React.ReactNode[]) =>
    rows.length > 0 ? (
      <Card title={title}>
        {rows}
      </Card>
    ) : null;

  const d = data.data;
  const nothing = d && d.favorites.length + d.recent.length + d.foods.length === 0;

  return (
    <View style={{ gap: spacing.lg }}>
      <TextField
        label={m.common.search}
        value={query}
        onChangeText={setQuery}
        placeholder={m.add.searchPlaceholder}
        testID="food-search"
        returnKeyType="search"
        autoCapitalize="none"
      />
      {selected.length > 0 ? (
        <Card title={m.add.selected}>
          {selected.map((entry) => {
            const n = entryNutrition(entry);
            return (
              <View key={entry.key} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText numberOfLines={1}>{entry.name}</AppText>
                  <AppText variant="small" tone="muted">
                    {n ? kcal(i18n, n.calories) : m.common.invalidNumber}
                  </AppText>
                </View>
                <View style={{ width: 130 }}>
                  <NumberField
                    label={m.add.quantity}
                    value={entry.quantityText}
                    suffix={m.units[entry.unit]}
                    error={n ? null : m.common.invalidNumber}
                    onChangeText={(text) =>
                      setSelected((list) => list.map((e) => (e.key === entry.key ? { ...e, quantityText: text } : e)))
                    }
                  />
                </View>
                <IconButton icon="close" label={`${m.common.delete}: ${entry.name}`} onPress={() => toggle(entry)} />
              </View>
            );
          })}
          <Button
            label={t(m.add.addSelected, { count: selected.length })}
            onPress={submit}
            disabled={!valid}
            loading={saving}
            testID="add-selected"
          />
        </Card>
      ) : null}
      {data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : null}
      {!d && data.loading ? <LoadingState /> : null}
      {d ? (
        <>
          {section(
            m.add.favorites,
            d.favorites.map((f) => {
              const e = fromFood(f, fmt);
              return (
                <ListRow key={e.key} title={e.name} subtitle={`${kcal(i18n, f.calories)} · ${t(m.add.perServing, { size: i18n.number(f.serving_size, 2), unit: m.units[f.serving_unit] })}`} onPress={() => toggle(e)} right={check(e.key)} />
              );
            }),
          )}
          {section(
            m.add.recent,
            d.recent.map((r) => {
              const e = fromRecent(r, fmt);
              return (
                <ListRow key={e.key} testID={`recent-${r.food_name}`} title={r.food_name} subtitle={`${kcal(i18n, r.calories)} · ${itemSubtitle(i18n, r)}`} onPress={() => toggle(e)} right={check(e.key)} />
              );
            }),
          )}
          {section(
            m.add.myFoods,
            d.foods.map((f) => {
              const e = fromFood(f, fmt);
              return (
                <ListRow key={e.key} testID={`food-${f.name}`} title={e.name} subtitle={`${kcal(i18n, f.calories)} · ${t(m.add.perServing, { size: i18n.number(f.serving_size, 2), unit: m.units[f.serving_unit] })}`} onPress={() => toggle(e)} right={check(e.key)} />
              );
            }),
          )}
          {nothing ? <EmptyState icon="search-outline" title={query ? m.add.noResults : m.add.noFoodsYet} /> : null}
        </>
      ) : null}
    </View>
  );
}

const EMPTY_NUTRITION: NutritionText = nutritionToText(null, String);

function ManualTab({ target, onDone }: { target: AddTarget; onDone: () => void }) {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const { spacing, colors } = useTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<Unit>('serving');
  const [nutrition, setNutrition] = useState<NutritionText>(EMPTY_NUTRITION);
  const [saveAsFood, setSaveAsFood] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const errs: Record<string, string> = {};
    const trimmed = name.trim();
    if (!trimmed) errs.name = m.common.required;
    else if (trimmed.length > 200) errs.name = m.common.tooLong;
    const q = parsePositive(quantity, 100000, m);
    if (q.error) errs.quantity = q.error;
    const n = parseNutrition(nutrition, m);
    if (n.errors) Object.assign(errs, n.errors);
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !n.value || q.value === null) return;

    setSaving(true);
    try {
      let foodId: string | null = null;
      if (saveAsFood) {
        foodId = await services.foods.create({
          ...n.value,
          name: trimmed,
          brand: null,
          barcode: null,
          serving_size: q.value,
          serving_unit: unit,
        });
      }
      await services.meals.addItemsToDay({ date: target.date, mealType: target.mealType, mealId: target.mealId }, [
        { ...n.value, food_name: trimmed, food_id: foodId, quantity: q.value, unit, source: foodId ? 'food' : 'manual' },
      ]);
      toast.show(t(m.add.added, { count: 1 }));
      onDone();
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <TextField label={m.add.name} value={name} onChangeText={setName} error={errors.name} testID="manual-name" maxLength={200} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <View style={{ width: 160 }}>
          <NumberField label={m.add.quantity} value={quantity} onChangeText={setQuantity} error={errors.quantity} testID="manual-quantity" />
        </View>
        <View style={{ flex: 1, minWidth: 220 }}>
          <UnitPicker label={m.item.unit} value={unit} onChange={setUnit} />
        </View>
      </View>
      <NutritionFields value={nutrition} onChange={setNutrition} errors={errors} testIDPrefix="manual" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Switch
          value={saveAsFood}
          onValueChange={setSaveAsFood}
          accessibilityLabel={m.add.saveAsFood}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
        <AppText style={{ flex: 1 }} onPress={() => setSaveAsFood((v) => !v)}>
          {m.add.saveAsFood}
        </AppText>
      </View>
      <Divider />
      <Button label={m.add.add} icon="add" onPress={submit} loading={saving} testID="manual-submit" />
    </Card>
  );
}

function PhotoTab({ target, onDone }: { target: AddTarget; onDone: () => void }) {
  const services = useServices();
  const i18n = useI18n();
  const { m } = i18n;
  const { spacing } = useTheme();
  const toast = useToast();
  const recognition = useRecognition();
  const [saved, setSaved] = useState<{ mealId: string; photoId: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'estimate' | null>(null);
  const photo = useQuery(() => (saved ? services.photos.get(saved.photoId) : Promise.resolve(null)), [saved?.photoId], ['media_files']);
  const mealTarget = { date: target.date, mealType: target.mealType, mealId: saved?.mealId ?? target.mealId };

  const attach = async (prepared: PreparedPhoto) => {
    setBusy('save');
    try {
      const mealId = saved?.mealId ?? (await services.meals.ensureMeal(target));
      const photoId = await services.photos.add(mealId, prepared);
      setSaved({ mealId, photoId });
      toast.show(m.photos.attached);
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    } finally {
      setBusy(null);
    }
  };

  const estimate = async () => {
    if (!saved) return;
    setBusy('estimate');
    try {
      const draftId = await estimatePhotoToDraft(services, recognition, saved.photoId, mealTarget, i18n.locale);
      router.replace(`/drafts/${draftId}`);
    } catch (error) {
      const e = toAppError(error);
      toast.show(e.code === 'validation' ? m.photos.nothingRecognized : errorText(m, e.code), 'error');
      setBusy(null);
    }
  };

  return (
    <Card>
      <AppText tone="muted">{m.photos.attachHint}</AppText>
      {photo.data ? <PhotoImage photo={photo.data} height={300} contentFit="contain" /> : null}
      <CaptureButtons onCaptured={attach} busy={busy !== null} />
      {saved ? (
        <>
          <Banner tone="info" message={recognition ? m.photos.estimateDisclaimer : m.photos.estimateUnavailable} />
          <Button
            icon="sparkles-outline"
            label={busy === 'estimate' ? m.photos.estimating : m.photos.estimate}
            onPress={estimate}
            loading={busy === 'estimate'}
            disabled={!recognition || busy === 'save'}
            testID="photo-estimate"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Button variant="secondary" icon="restaurant-outline" label={m.photos.openMeal} onPress={() => router.replace(`/meal/${saved.mealId}`)} />
            <Button variant="ghost" label={m.common.done} onPress={onDone} testID="photo-done" />
          </View>
        </>
      ) : null}
    </Card>
  );
}

function VoiceTab({ target }: { target: AddTarget }) {
  const services = useServices();
  const { m } = useI18n();
  const toast = useToast();
  const [saved, setSaved] = useState<{ mealId: string; noteId: string } | null>(null);
  const note = useQuery(() => (saved ? services.voice.get(saved.noteId) : Promise.resolve(null)), [saved?.noteId], ['voice_notes']);
  const draftTarget = { date: target.date, mealType: target.mealType, mealId: saved?.mealId ?? target.mealId };

  const record = async (audio: RecordedAudio) => {
    const mealId = saved?.mealId ?? (await services.meals.ensureMeal(target));
    const noteId = await services.voice.add(mealId, audio);
    setSaved({ mealId, noteId });
    toast.show(m.common.saved);
  };

  return (
    <Card>
      <VoiceRecorder onRecorded={record} />
      {note.data ? <VoiceNoteRow note={note.data} index={0} /> : null}
      <Divider />
      <VoiceDraftPanel key={note.data?.id ?? 'typed'} note={note.data ?? null} target={draftTarget} replace />
    </Card>
  );
}

export function AddFoodScreen() {
  const params = useLocalSearchParams<{ date?: string; meal?: string; mealId?: string; tab?: string }>();
  const { m } = useI18n();
  const { spacing } = useTheme();
  const initialType = (MEAL_TYPES as readonly string[]).includes(params.meal ?? '') ? (params.meal as MealType) : mealTypeForTime();
  const [date, setDate] = useState<LocalDate>(params.date && isValidLocalDate(params.date) ? params.date : todayLocalDate());
  const [mealType, setMealType] = useState<MealType>(initialType);
  const tabs: { value: AddTab; label: string }[] = [
    { value: 'search', label: m.add.tabSearch },
    { value: 'manual', label: m.add.tabManual },
    { value: 'photo', label: m.add.tabPhoto },
    { value: 'voice', label: m.add.tabVoice },
  ];
  const [tab, setTab] = useState<AddTab>(tabs.some((x) => x.value === params.tab) ? (params.tab as AddTab) : 'search');

  const target: AddTarget = {
    date,
    mealType,
    mealId: params.mealId && mealType === initialType && date === params.date ? params.mealId : null,
  };
  const onDone = () => goBack('/');

  return (
    <Screen title={m.add.title} back maxWidth={760}>
      <Card>
        <MealTypePicker value={mealType} onChange={setMealType} />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <DateField label={m.add.date} value={date} onChange={setDate} />
        </View>
      </Card>
      <SegmentedControl label={m.add.title} options={tabs} value={tab} onChange={setTab} testID="add-tabs" />
      {tab === 'search' ? <SearchTab target={target} onDone={onDone} /> : null}
      {tab === 'manual' ? <ManualTab target={target} onDone={onDone} /> : null}
      {tab === 'voice' ? <VoiceTab key={`${target.date}:${target.mealType}`} target={target} /> : null}
      {tab === 'photo' ? <PhotoTab key={`${target.date}:${target.mealType}`} target={target} onDone={onDone} /> : null}
    </Screen>
  );
}
