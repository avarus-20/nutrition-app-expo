import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { sumNutrition } from '@/domain/nutrition';
import type { DailyTotals } from '@/domain/types';
import { kcal } from '@/features/nutrition/format';
import { useQuery } from '@/hooks/useQuery';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import { Button, IconButton } from '@/ui/Button';
import { Calendar } from '@/ui/Calendar';
import { Columns } from '@/ui/Columns';
import { ProgressBar, SegmentedControl } from '@/ui/Controls';
import { Screen } from '@/ui/Screen';
import { Card, Divider, EmptyState, ErrorState, ListRow, LoadingState } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { addDays, endOfMonth, startOfMonth, startOfWeek, todayLocalDate, type LocalDate } from '@/utils/dates';

type Mode = 'day' | 'week' | 'month';
const PAGE = 30;

const openDay = (date: LocalDate) => router.push({ pathname: '/', params: { date } });

function DayPreview({ date }: { date: LocalDate }) {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const q = useQuery(() => services.meals.getDay(date), [date], ['meals', 'meal_items']);
  const items = (q.data ?? []).flatMap((meal) => meal.items);
  const total = sumNutrition(items);
  return (
    <Card title={i18n.date(date, 'long')}>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : null}
      {q.data && items.length === 0 ? <AppText tone="muted">{m.history.noData}</AppText> : null}
      {q.data?.map((meal) =>
        meal.items.length > 0 ? (
          <View key={meal.id}>
            <AppText variant="small" tone="muted">
              {m.mealTypes[meal.meal_type]} · {kcal(i18n, sumNutrition(meal.items).calories)}
            </AppText>
            <AppText numberOfLines={2}>{meal.items.map((i) => i.food_name).join(', ')}</AppText>
          </View>
        ) : null,
      )}
      {items.length > 0 ? (
        <>
          <Divider />
          <AppText variant="subheading">{kcal(i18n, total.calories)}</AppText>
        </>
      ) : null}
      <Button
        label={t(m.history.openDay, { date: i18n.date(date, 'short') })}
        variant="secondary"
        icon="open-outline"
        onPress={() => openDay(date)}
        testID="history-open-day"
      />
    </Card>
  );
}

function MonthView({ selected, onSelect }: { selected: LocalDate; onSelect: (d: LocalDate) => void }) {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const [month, setMonth] = useState(startOfMonth(selected));
  const q = useQuery(
    async () => {
      const [totals, goals] = await Promise.all([
        services.meals.dailyTotals(startOfMonth(month), endOfMonth(month)),
        services.goals.getGoals(),
      ]);
      return { byDate: new Map(totals.filter((d) => d.item_count > 0).map((d) => [d.date, d])), goal: goals.calories ?? null };
    },
    [month],
    ['meals', 'meal_items', 'nutrition_goals'],
  );
  return (
    <Card>
      <Calendar
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        onSelect={onSelect}
        dayInfo={(date) => {
          const d = q.data?.byDate.get(date);
          if (!d) return { label: t(m.a11y.calendarDayEmpty, { date: i18n.date(date, 'long') }) };
          const goal = q.data?.goal;
          return {
            level: goal ? d.calories / goal : 0.8,
            over: !!goal && d.calories > goal,
            label: t(m.a11y.calendarDay, { date: i18n.date(date, 'long'), calories: i18n.number(d.calories, 0) }),
          };
        }}
      />
    </Card>
  );
}

function WeekView({ selected, onSelect }: { selected: LocalDate; onSelect: (d: LocalDate) => void }) {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const { spacing } = useTheme();
  const [weekStart, setWeekStart] = useState(startOfWeek(selected));
  const weekEnd = addDays(weekStart, 6);
  const q = useQuery(
    async () => {
      const [totals, goals] = await Promise.all([services.meals.dailyTotals(weekStart, weekEnd), services.goals.getGoals()]);
      return { byDate: new Map(totals.map((d) => [d.date, d])), goal: goals.calories ?? null };
    },
    [weekStart],
    ['meals', 'meal_items', 'nutrition_goals'],
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const logged = days.map((d) => q.data?.byDate.get(d)).filter((d): d is DailyTotals => !!d && d.item_count > 0);
  const avg = logged.length ? logged.reduce((s, d) => s + d.calories, 0) / logged.length : null;
  const maxCalories = Math.max(q.data?.goal ?? 0, ...logged.map((d) => d.calories), 1);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton icon="chevron-back" label={m.history.prevPeriod} onPress={() => setWeekStart(addDays(weekStart, -7))} />
        <AppText variant="subheading" align="center" style={{ flex: 1 }}>
          {i18n.date(weekStart, 'short')} – {i18n.date(weekEnd, 'short')}
        </AppText>
        <IconButton icon="chevron-forward" label={m.history.nextPeriod} onPress={() => setWeekStart(addDays(weekStart, 7))} />
      </View>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : null}
      {days.map((date) => {
        const d = q.data?.byDate.get(date);
        const has = !!d && d.item_count > 0;
        return (
          <ListRow
            key={date}
            title={i18n.date(date, 'weekday')}
            subtitle={has ? kcal(i18n, d.calories) : m.history.noData}
            onPress={() => onSelect(date)}
            right={
              <View style={{ width: 120 }}>
                <ProgressBar value={has ? d.calories : 0} max={maxCalories} label={m.nutrients.calories} />
              </View>
            }
          />
        );
      })}
      <Divider />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
        <AppText tone="muted">{t(m.history.daysLogged, { count: logged.length })}</AppText>
        <AppText tone="muted">
          {m.history.average}: {avg === null ? '—' : kcal(i18n, avg)}
        </AppText>
      </View>
    </Card>
  );
}

function DayList({ onSelect }: { onSelect: (d: LocalDate) => void }) {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const [pages, setPages] = useState(1);
  const q = useQuery(() => services.meals.daysWithData(PAGE * pages + 1, 0), [pages], ['meals', 'meal_items']);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <LoadingState />;
  const hasMore = q.data.length > PAGE * pages;
  const rows = q.data.slice(0, PAGE * pages);
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon="calendar-outline" title={m.history.noData} />
      </Card>
    );
  }
  return (
    <Card>
      {rows.map((d, i) => (
        <View key={d.date}>
          {i > 0 ? <Divider /> : null}
          <ListRow
            title={i18n.date(d.date, 'long')}
            subtitle={kcal(i18n, d.calories)}
            onPress={() => onSelect(d.date)}
            accessibilityHint={t(m.history.openDay, { date: i18n.date(d.date, 'short') })}
          />
        </View>
      ))}
      {hasMore ? <Button variant="ghost" label={m.common.more} onPress={() => setPages((p) => p + 1)} /> : null}
    </Card>
  );
}

export function HistoryScreen() {
  const { m } = useI18n();
  const [mode, setMode] = useState<Mode>('month');
  const [selected, setSelected] = useState<LocalDate>(todayLocalDate());

  return (
    <Screen title={m.history.title}>
      <SegmentedControl
        label={m.history.title}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'day', label: m.history.day },
          { value: 'week', label: m.history.week },
          { value: 'month', label: m.history.month },
        ]}
        testID="history-mode"
      />
      <Columns>
        {mode === 'month' ? <MonthView selected={selected} onSelect={setSelected} /> : null}
        {mode === 'week' ? <WeekView selected={selected} onSelect={setSelected} /> : null}
        {mode === 'day' ? <DayList onSelect={setSelected} /> : null}
        <DayPreview date={selected} />
      </Columns>
    </Screen>
  );
}
