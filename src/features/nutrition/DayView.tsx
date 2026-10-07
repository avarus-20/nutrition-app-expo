import { router } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { MEAL_TYPES, type Goals, type MealType, type MealWithItems, type Nutrition } from '@/domain/types';
import { sumNutrition } from '@/domain/nutrition';
import { useQuery } from '@/hooks/useQuery';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import { SyncBadge } from '@/sync/SyncBadge';
import { Button, IconButton } from '@/ui/Button';
import { Calendar } from '@/ui/Calendar';
import { ProgressRing } from '@/ui/Charts';
import { Columns } from '@/ui/Columns';
import { useLayout } from '@/ui/layout';
import { ProgressBar } from '@/ui/Controls';
import { Screen } from '@/ui/Screen';
import { Banner, Card, Divider, EmptyState, ErrorState, ListRow, LoadingState } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { addDays, todayLocalDate, type LocalDate } from '@/utils/dates';
import { itemSubtitle, kcal } from './format';

export function addHref(date: LocalDate, mealType?: MealType, mealId?: string) {
  return { pathname: '/add' as const, params: { date, ...(mealType ? { meal: mealType } : {}), ...(mealId ? { mealId } : {}) } };
}

function SummaryCard({ totals, goals, waterMl }: { totals: Nutrition; goals: Goals; waterMl: number }) {
  const i18n = useI18n();
  const { m, t } = i18n;
  const { spacing } = useTheme();
  const { isTablet } = useLayout();
  const target = goals.calories ?? null;
  const remaining = target !== null ? target - totals.calories : null;

  const macros = [
    { key: 'protein_g', color: 'protein', value: totals.protein_g },
    { key: 'carbs_g', color: 'carbs', value: totals.carbs_g },
    { key: 'fat_g', color: 'fat', value: totals.fat_g },
  ] as const;

  return (
    <Card>
      <View style={[styles.summary, { gap: isTablet ? spacing.xl : spacing.lg }]}>
        <ProgressRing
          size={isTablet ? 148 : 116}
          stroke={isTablet ? 14 : 11}
          value={totals.calories}
          max={target}
          label={
            target !== null
              ? t(m.a11y.progress, { label: m.nutrients.calories, value: Math.round(totals.calories), max: target })
              : `${m.nutrients.calories}: ${kcal(i18n, totals.calories)}`
          }
        >
          <AppText variant={isTablet ? 'number' : 'heading'} testID="calories-consumed">
            {i18n.number(Math.round(totals.calories), 0)}
          </AppText>
          <AppText variant="small" tone="muted">
            {m.units.kcal}
          </AppText>
        </ProgressRing>
        <View style={{ flex: 1, minWidth: 150, gap: spacing.sm }}>
          <Stat label={m.dashboard.consumed} value={kcal(i18n, totals.calories)} />
          <Stat label={m.dashboard.target} value={target !== null ? kcal(i18n, target) : m.common.notSet} />
          {remaining !== null ? (
            <Stat
              label={remaining >= 0 ? m.dashboard.remaining : m.dashboard.over}
              value={kcal(i18n, Math.abs(remaining))}
              tone={remaining >= 0 ? 'primary' : 'danger'}
              testID="calories-remaining"
            />
          ) : (
            <Button variant="ghost" compact label={m.dashboard.setGoals} onPress={() => router.push('/goals')} />
          )}
        </View>
      </View>
      <Divider />
      <View style={{ gap: spacing.md }}>
        {macros.map((macro) => {
          const goal = goals[macro.key];
          const value = macro.value;
          return (
            <View key={macro.key} style={{ gap: 4 }}>
              <View style={styles.rowBetween}>
                <AppText variant="small">{m.nutrients[macro.key]}</AppText>
                <AppText variant="small" tone="muted">
                  {value === null ? '—' : `${i18n.number(value, 1)} ${m.units.g}`}
                  {goal ? ` / ${i18n.number(goal, 0)} ${m.units.g}` : ''}
                </AppText>
              </View>
              <ProgressBar value={value ?? 0} max={goal ?? Math.max(value ?? 0, 1)} color={macro.color} label={m.nutrients[macro.key]} />
            </View>
          );
        })}
      </View>
      {goals.water_ml || waterMl > 0 ? (
        <>
          <Divider />
          <Pressable onPress={() => router.push('/body')} accessibilityRole="button" style={{ gap: 4 }}>
            <View style={styles.rowBetween}>
              <AppText variant="small">{m.dashboard.water}</AppText>
              <AppText variant="small" tone="muted">
                {i18n.number(waterMl, 0)} {m.units.ml}
                {goals.water_ml ? ` / ${i18n.number(goals.water_ml, 0)} ${m.units.ml}` : ''}
              </AppText>
            </View>
            <ProgressBar value={waterMl} max={goals.water_ml ?? Math.max(waterMl, 1)} color="water" label={m.dashboard.water} />
          </Pressable>
        </>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  testID,
}: {
  label: string;
  value: string;
  tone?: 'primary' | 'danger';
  testID?: string;
}) {
  return (
    <View style={styles.rowBetween}>
      <AppText tone="muted">{label}</AppText>
      <AppText variant="subheading" tone={tone ?? 'default'} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

function MealCard({ type, meals, date }: { type: MealType; meals: MealWithItems[]; date: LocalDate }) {
  const i18n = useI18n();
  const { m, t } = i18n;
  const items = meals.flatMap((meal) => meal.items);
  const total = sumNutrition(items).calories;

  return (
    <Card
      title={m.mealTypes[type]}
      action={
        <View style={styles.cardActions}>
          {items.length > 0 ? (
            <AppText tone="muted" variant="small">
              {kcal(i18n, total)}
            </AppText>
          ) : null}
          <IconButton
            icon="add-circle-outline"
            tone="primary"
            label={t(m.dashboard.addTo, { meal: m.mealTypes[type] })}
            onPress={() => router.push(addHref(date, type, meals[0]?.id))}
            testID={`add-${type}`}
          />
        </View>
      }
    >
      {meals.map((meal) => (
        <View key={meal.id} style={{ gap: 2 }}>
          {meals.length > 1 || meal.title || meal.notes ? (
            <Pressable onPress={() => router.push(`/meal/${meal.id}`)} accessibilityRole="button">
              <AppText variant="small" tone="muted">
                {[i18n.time(meal.eaten_at), meal.title].filter(Boolean).join(' · ')}
              </AppText>
            </Pressable>
          ) : null}
          {meal.items.map((item) => (
            <ListRow
              key={item.id}
              testID={`item-${item.food_name}`}
              title={item.food_name}
              subtitle={itemSubtitle(i18n, item)}
              onPress={() => router.push(`/item/${item.id}`)}
              accessibilityHint={t(m.a11y.editItem, { name: item.food_name })}
              right={<AppText variant="subheading">{i18n.number(Math.round(item.calories), 0)}</AppText>}
            />
          ))}
          <Button
            variant="ghost"
            compact
            icon="create-outline"
            label={m.meal.title}
            accessibilityLabel={`${m.common.edit}: ${m.mealTypes[type]} ${i18n.time(meal.eaten_at)}`}
            onPress={() => router.push(`/meal/${meal.id}`)}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ))}
    </Card>
  );
}

function DatePickerModal({
  open,
  value,
  onClose,
  onSelect,
}: {
  open: boolean;
  value: LocalDate;
  onClose: () => void;
  onSelect: (d: LocalDate) => void;
}) {
  const [month, setMonth] = useState(value);
  const { colors, radius, spacing } = useTheme();
  const { m } = useI18n();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel={m.common.close}>
        <Pressable
          onPress={() => undefined}
          accessibilityViewIsModal
          style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxWidth: 420, gap: 12 }}
        >
          <Calendar month={month} selected={value} onMonthChange={setMonth} onSelect={onSelect} />
          <Button variant="secondary" label={m.common.close} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Dashboard for one day: summary, meal groups and quick add. */
export function DayView({ date, onDateChange }: { date: LocalDate; onDateChange: (d: LocalDate) => void }) {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const { spacing } = useTheme();
  const [picking, setPicking] = useState(false);
  const today = todayLocalDate();

  const day = useQuery(
    async () => {
      const [meals, goals, water] = await Promise.all([
        services.meals.getDay(date),
        services.goals.getGoals(),
        services.water.forDay(date),
      ]);
      return { meals, goals, waterMl: water.reduce((s, w) => s + w.amount_ml, 0) };
    },
    [date],
    ['meals', 'meal_items', 'nutrition_goals', 'water_entries'],
  );

  const title =
    date === today
      ? m.common.today
      : date === addDays(today, -1)
        ? m.common.yesterday
        : date === addDays(today, 1)
          ? m.common.tomorrow
          : i18n.date(date, 'weekday');

  const meals = day.data?.meals ?? [];
  const items = meals.flatMap((meal) => meal.items);
  const totals = sumNutrition(items);
  const unknownMacros = items.some((i) => i.protein_g === null || i.carbs_g === null || i.fat_g === null);

  return (
    <Screen
      title={title}
      subtitle={date === today || date === addDays(today, -1) ? i18n.date(date, 'weekday') : undefined}
      actions={
        <>
          <IconButton icon="chevron-back" label={m.dashboard.prevDay} onPress={() => onDateChange(addDays(date, -1))} testID="prev-day" />
          <IconButton icon="calendar-outline" label={m.dashboard.pickDate} onPress={() => setPicking(true)} />
          <IconButton icon="chevron-forward" label={m.dashboard.nextDay} onPress={() => onDateChange(addDays(date, 1))} testID="next-day" />
          <SyncBadge />
        </>
      }
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {date !== today ? <Button variant="secondary" label={m.dashboard.goToToday} onPress={() => onDateChange(today)} /> : null}
          <Button
            label={m.dashboard.addFood}
            icon="add"
            onPress={() => router.push(addHref(date))}
            style={{ flex: 1 }}
            testID="add-food"
          />
        </View>
      }
    >
      <DatePickerModal
        open={picking}
        value={date}
        onClose={() => setPicking(false)}
        onSelect={(d) => {
          setPicking(false);
          onDateChange(d);
        }}
      />
      {day.error ? (
        <ErrorState error={day.error} onRetry={day.reload} />
      ) : day.loading && !day.data ? (
        <LoadingState />
      ) : (
        <Columns at="desktop">
          <View style={{ gap: spacing.lg }}>
            <SummaryCard totals={totals} goals={day.data?.goals ?? {}} waterMl={day.data?.waterMl ?? 0} />
            {items.length > 0 ? (
              <AppText tone="muted" variant="small">
                {t(m.dashboard.items, { count: items.length })}
                {unknownMacros ? ` · ${m.dashboard.unknownMacros}` : ''}
              </AppText>
            ) : null}
            {!day.data?.goals.calories ? <Banner message={m.dashboard.noGoal} action={<Button compact variant="ghost" label={m.dashboard.setGoals} onPress={() => router.push('/goals')} />} /> : null}
          </View>
          <View style={{ gap: spacing.lg }}>
            {items.length === 0 ? (
              <Card>
                <EmptyState
                  icon="restaurant-outline"
                  title={m.dashboard.emptyDay}
                  message={m.dashboard.emptyDayHint}
                />
              </Card>
            ) : null}
            {MEAL_TYPES.map((type) => (
              <MealCard key={type} type={type} date={date} meals={meals.filter((meal) => meal.meal_type === type)} />
            ))}
          </View>
        </Columns>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
