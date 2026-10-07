import React, { useState } from 'react';
import { View } from 'react-native';

import { macroEnergySplit } from '@/domain/nutrition';
import {
  dailySeries,
  isValidRange,
  presetRange,
  trendDirection,
  type RangePreset,
  type StatNutrient,
} from '@/domain/stats';
import { useQuery } from '@/hooks/useQuery';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import { DateField } from '@/ui/Calendar';
import { BarChart, Legend } from '@/ui/Charts';
import { Columns } from '@/ui/Columns';
import { ProgressBar, SegmentedControl } from '@/ui/Controls';
import { Screen } from '@/ui/Screen';
import { Banner, Card, Chip, EmptyState, ErrorState, LoadingState } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { addDays, todayLocalDate, type LocalDate } from '@/utils/dates';

const NUTRIENTS: StatNutrient[] = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
const COLORS = { calories: 'calories', protein_g: 'protein', carbs_g: 'carbs', fat_g: 'fat' } as const;

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { spacing } = useTheme();
  return (
    <Card style={{ flexBasis: 160, flexGrow: 1, gap: spacing.xs }}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      <AppText variant="heading">{value}</AppText>
      {hint ? (
        <AppText variant="small" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </Card>
  );
}

export function StatsScreen() {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const { spacing } = useTheme();
  const today = todayLocalDate();
  const [preset, setPreset] = useState<RangePreset>('7');
  const [custom, setCustom] = useState<{ from: LocalDate; to: LocalDate }>({ from: addDays(today, -13), to: today });
  const [nutrient, setNutrient] = useState<StatNutrient>('calories');
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  const valid = isValidRange(range.from, range.to);

  const q = useQuery(
    () => (valid ? services.stats.range(range.from, range.to) : Promise.resolve(null)),
    [range.from, range.to, valid],
    ['meals', 'meal_items', 'nutrition_goals'],
  );
  const stats = q.data;
  const unit = nutrient === 'calories' ? m.units.kcal : m.units.g;
  const fmt = (v: number | null, digits = nutrient === 'calories' ? 0 : 1) =>
    v === null ? '—' : `${i18n.number(v, digits)} ${unit}`;

  const series = stats ? dailySeries(stats.daily, range.from, range.to, nutrient) : [];
  const chartData = series.map((d) => ({
    key: d.date,
    label: series.length <= 7 ? i18n.weekdayShort(d.date) : String(Number(d.date.slice(8))),
    value: d.value,
  }));
  const s = stats?.summary;
  const direction = trendDirection(stats?.calorieTrend ?? null, 10);
  const split = s
    ? macroEnergySplit({
        calories: s.total.calories,
        protein_g: s.total.protein_g,
        carbs_g: s.total.carbs_g,
        fat_g: s.total.fat_g,
        fiber_g: null,
        sugar_g: null,
        salt_g: null,
      })
    : null;

  return (
    <Screen title={m.stats.title}>
      <SegmentedControl
        label={m.stats.title}
        value={preset}
        onChange={setPreset}
        options={[
          { value: '7', label: m.stats.range7 },
          { value: '30', label: m.stats.range30 },
          { value: 'month', label: m.stats.rangeMonth },
          { value: 'custom', label: m.stats.rangeCustom },
        ]}
        testID="stats-range"
      />
      {preset === 'custom' ? (
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <DateField label={m.common.from} value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} maxDate={today} />
            <DateField label={m.common.to} value={custom.to} onChange={(to) => setCustom((c) => ({ ...c, to }))} maxDate={today} />
          </View>
          {!valid ? <Banner tone="error" message={m.stats.invalidRange} /> : null}
        </Card>
      ) : null}
      <AppText tone="muted">
        {i18n.date(range.from, 'medium')} – {i18n.date(range.to, 'medium')}
      </AppText>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : null}
      {valid && !stats && !q.error ? <LoadingState /> : null}
      {stats && s ? (
        s.loggedDays === 0 ? (
          <Card>
            <EmptyState icon="stats-chart-outline" title={m.stats.noData} />
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <Metric
                label={m.stats.averagePerDay}
                value={`${i18n.number(s.average.calories ?? 0, 0)} ${m.units.kcal}`}
                hint={stats.goals.calories ? `${m.dashboard.target}: ${i18n.number(stats.goals.calories, 0)} ${m.units.kcal}` : undefined}
              />
              <Metric label={m.stats.daysLogged} value={`${s.loggedDays} / ${s.days}`} />
              <Metric
                label={m.stats.goalHit}
                value={s.goalHitDays === null ? '—' : t(m.stats.goalHitValue, { hit: s.goalHitDays, days: s.loggedDays })}
                hint={s.goalHitDays === null ? m.dashboard.noGoal : undefined}
              />
              <Metric
                label={m.stats.trend}
                value={
                  direction === null
                    ? '—'
                    : direction === 'flat'
                      ? m.stats.trendFlat
                      : t(direction === 'up' ? m.stats.trendUp : m.stats.trendDown, {
                          value: `${i18n.number(Math.abs(stats.calorieTrend ?? 0), 0)} ${m.units.kcal}`,
                        })
                }
              />
            </View>
            <Columns at="desktop">
              <Card title={m.nutrients[nutrient]}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {NUTRIENTS.map((n) => (
                    <Chip key={n} label={m.nutrients[n]} selected={n === nutrient} onPress={() => setNutrient(n)} />
                  ))}
                </View>
                <BarChart
                  data={chartData}
                  goal={stats.goals[nutrient] ?? null}
                  color={COLORS[nutrient]}
                  formatValue={(v) => i18n.number(v, 0)}
                  summary={`${t(m.stats.chartLabel, {
                    nutrient: m.nutrients[nutrient],
                    from: i18n.date(range.from, 'medium'),
                    to: i18n.date(range.to, 'medium'),
                  })}. ${m.stats.averagePerDay}: ${fmt(s.average[nutrient])}`}
                />
                <AppText tone="muted" variant="small">
                  {m.history.average}: {fmt(s.average[nutrient])} · {m.history.total}: {fmt(s.total[nutrient])}
                </AppText>
              </Card>
              <Card title={m.stats.averagePerDay}>
                {NUTRIENTS.map((n) => {
                  const goal = stats.goals[n];
                  const avg = s.average[n];
                  const u = n === 'calories' ? m.units.kcal : m.units.g;
                  return (
                    <View key={n} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <AppText variant="small">{m.nutrients[n]}</AppText>
                        <AppText variant="small" tone="muted">
                          {avg === null ? '—' : `${i18n.number(avg, n === 'calories' ? 0 : 1)} ${u}`}
                          {goal ? ` / ${i18n.number(goal, 0)} ${u}` : ''}
                        </AppText>
                      </View>
                      <ProgressBar value={avg ?? 0} max={goal ?? Math.max(avg ?? 0, 1)} color={COLORS[n]} label={m.nutrients[n]} />
                    </View>
                  );
                })}
                {split ? (
                  <View style={{ gap: spacing.sm }}>
                    <AppText variant="small" tone="muted">
                      {m.stats.macroSplit}
                    </AppText>
                    <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' }}>
                      <SplitPart share={split.protein} color="protein" />
                      <SplitPart share={split.carbs} color="carbs" />
                      <SplitPart share={split.fat} color="fat" />
                    </View>
                    <Legend
                      items={[
                        { color: 'protein', label: `${m.nutrients.protein_g} ${Math.round(split.protein * 100)}%` },
                        { color: 'carbs', label: `${m.nutrients.carbs_g} ${Math.round(split.carbs * 100)}%` },
                        { color: 'fat', label: `${m.nutrients.fat_g} ${Math.round(split.fat * 100)}%` },
                      ]}
                    />
                  </View>
                ) : null}
              </Card>
            </Columns>
          </>
        )
      ) : null}
    </Screen>
  );
}

function SplitPart({ share, color }: { share: number; color: 'protein' | 'carbs' | 'fat' }) {
  const { colors } = useTheme();
  return <View style={{ flex: Math.max(share, 0.0001), backgroundColor: colors[color] }} />;
}
