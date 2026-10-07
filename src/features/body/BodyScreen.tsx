import React, { useState } from 'react';
import { View } from 'react-native';

import { movingAverage, weightChange } from '@/domain/stats';
import type { WeightEntry } from '@/domain/types';
import { useQuery } from '@/hooks/useQuery';
import { errorText } from '@/i18n';
import { parsePositive } from '@/features/nutrition/nutritionForm';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import { Button, IconButton } from '@/ui/Button';
import { DateField } from '@/ui/Calendar';
import { LineChart } from '@/ui/Charts';
import { Columns } from '@/ui/Columns';
import { ProgressBar } from '@/ui/Controls';
import { confirmAction } from '@/ui/dialogs';
import { Screen } from '@/ui/Screen';
import { Card, Divider, EmptyState, ErrorState, ListRow, LoadingState } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { NumberField } from '@/ui/TextField';
import { useToast } from '@/ui/Toast';
import { localDateTimeToIso, todayLocalDate, toLocalDate, type LocalDate } from '@/utils/dates';
import { toAppError } from '@/utils/errors';

const WATER_PRESETS = [150, 250, 500];

function WeightCard() {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const { spacing } = useTheme();
  const toast = useToast();
  const [text, setText] = useState('');
  const [date, setDate] = useState<LocalDate>(todayLocalDate());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const q = useQuery(() => services.weight.list(365), [], ['weight_entries']);

  const add = async () => {
    const v = parsePositive(text, 700, m);
    if (v.error || v.value === null || v.value < 1) {
      setError(v.error ?? m.common.outOfRange);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      await services.weight.add({ measured_at: localDateTimeToIso(date, time), weight_kg: v.value, notes: null });
      setText('');
      toast.show(m.common.saved);
    } catch (e) {
      toast.show(errorText(m, toAppError(e).code), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: WeightEntry) => {
    const ok = await confirmAction({
      title: m.body.deleteWeightConfirm,
      message: `${i18n.number(entry.weight_kg, 1)} ${m.units.kg}`,
      confirmLabel: m.common.delete,
      cancelLabel: m.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    try {
      await services.weight.remove(entry.id);
    } catch (e) {
      toast.show(errorText(m, toAppError(e).code), 'error');
    }
  };

  const entriesDesc = q.data ?? [];
  const asc = [...entriesDesc].reverse();
  const trend = movingAverage(asc.map((e) => e.weight_kg), 7);
  const points = asc.map((e) => ({ x: new Date(e.measured_at).getTime(), y: e.weight_kg }));
  const change = weightChange(asc, 30);
  const latest = entriesDesc[0];
  const kg = (v: number) => `${i18n.number(v, 1)} ${m.units.kg}`;

  return (
    <Card title={m.body.weight}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-end' }}>
        <View style={{ width: 150 }}>
          <NumberField label={m.body.weightKg} value={text} onChangeText={setText} error={error} testID="weight-input" onSubmitEditing={add} />
        </View>
        <DateField label={m.body.date} value={date} onChange={setDate} maxDate={todayLocalDate()} />
        <Button label={m.body.addWeight} icon="add" onPress={add} loading={saving} testID="weight-add" />
      </View>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : null}
      {!q.data && !q.error ? <LoadingState /> : null}
      {q.data && entriesDesc.length === 0 ? <EmptyState icon="scale-outline" title={m.body.noWeight} /> : null}
      {latest ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl }}>
            <View>
              <AppText variant="small" tone="muted">
                {m.body.latest}
              </AppText>
              <AppText variant="heading" testID="weight-latest">
                {kg(latest.weight_kg)}
              </AppText>
            </View>
            <View>
              <AppText variant="small" tone="muted">
                {m.body.trend}
              </AppText>
              <AppText variant="heading">{kg(trend[trend.length - 1] ?? latest.weight_kg)}</AppText>
            </View>
            <View>
              <AppText variant="small" tone="muted">
                {m.body.change30}
              </AppText>
              <AppText variant="heading">{change === null ? '—' : `${change > 0 ? '+' : ''}${kg(change)}`}</AppText>
            </View>
          </View>
          {points.length > 1 ? (
            <LineChart
              points={points}
              trend={points.map((p, i) => ({ x: p.x, y: trend[i]! }))}
              formatValue={(v) => i18n.number(v, 1)}
              summary={`${m.body.weight}: ${m.body.latest} ${kg(latest.weight_kg)}`}
              xLabels={[i18n.date(toLocalDate(new Date(asc[0]!.measured_at)), 'short'), i18n.date(toLocalDate(new Date(latest.measured_at)), 'short')]}
            />
          ) : null}
          <Divider />
          {entriesDesc.slice(0, 10).map((e) => (
            <ListRow
              key={e.id}
              title={kg(e.weight_kg)}
              subtitle={i18n.dateTime(e.measured_at)}
              right={<IconButton icon="trash-outline" tone="muted" label={t(m.a11y.deleteItem, { name: kg(e.weight_kg) })} onPress={() => remove(e)} />}
            />
          ))}
        </>
      ) : null}
    </Card>
  );
}

function WaterCard() {
  const services = useServices();
  const i18n = useI18n();
  const { m, t } = i18n;
  const { spacing } = useTheme();
  const toast = useToast();
  const today = todayLocalDate();
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const q = useQuery(
    async () => {
      const [entries, goals] = await Promise.all([services.water.forDay(today), services.goals.getGoals()]);
      return { entries, goal: goals.water_ml ?? null };
    },
    [today],
    ['water_entries', 'nutrition_goals'],
  );

  const add = async (amount: number) => {
    try {
      await services.water.add({ consumed_at: new Date().toISOString(), local_date: today, amount_ml: amount });
    } catch (e) {
      toast.show(errorText(m, toAppError(e).code), 'error');
    }
  };

  const addCustom = async () => {
    const v = parsePositive(custom, 10000, m);
    if (v.error || v.value === null) {
      setError(v.error);
      return;
    }
    setError(null);
    await add(Math.round(v.value));
    setCustom('');
  };

  const total = (q.data?.entries ?? []).reduce((s, e) => s + e.amount_ml, 0);
  const goal = q.data?.goal ?? null;

  return (
    <Card title={m.body.water}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="heading" testID="water-total">
            {i18n.number(total, 0)} {m.units.ml}
          </AppText>
          {goal ? <AppText tone="muted">{t(m.body.waterGoal, { goal: i18n.number(goal, 0) })}</AppText> : null}
        </View>
        <ProgressBar value={total} max={goal ?? Math.max(total, 1)} color="water" label={m.body.water} height={10} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {WATER_PRESETS.map((a) => (
          <Button key={a} variant="secondary" icon="water-outline" label={t(m.body.addWater, { amount: a })} onPress={() => add(a)} testID={`water-${a}`} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end' }}>
        <View style={{ width: 170 }}>
          <NumberField integer label={m.body.customWater} value={custom} onChangeText={setCustom} error={error} onSubmitEditing={addCustom} />
        </View>
        <Button variant="secondary" label={m.common.add} onPress={addCustom} />
      </View>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : null}
      {q.data && q.data.entries.length === 0 ? <AppText tone="muted">{m.body.noWater}</AppText> : null}
      {(q.data?.entries ?? [])
        .slice()
        .reverse()
        .map((e) => (
          <ListRow
            key={e.id}
            title={`${i18n.number(e.amount_ml, 0)} ${m.units.ml}`}
            subtitle={i18n.time(e.consumed_at)}
            right={
              <IconButton
                icon="trash-outline"
                tone="muted"
                label={t(m.a11y.deleteItem, { name: `${e.amount_ml} ${m.units.ml}` })}
                onPress={async () => {
                  const ok = await confirmAction({
                    title: m.body.deleteWaterConfirm,
                    confirmLabel: m.common.delete,
                    cancelLabel: m.common.cancel,
                    destructive: true,
                  });
                  if (ok) await services.water.remove(e.id).catch((err: unknown) => toast.show(errorText(m, toAppError(err).code), 'error'));
                }}
              />
            }
          />
        ))}
    </Card>
  );
}

export function BodyScreen() {
  const { m } = useI18n();
  return (
    <Screen title={m.body.title}>
      <Columns>
        <WeightCard />
        <WaterCard />
      </Columns>
    </Screen>
  );
}

