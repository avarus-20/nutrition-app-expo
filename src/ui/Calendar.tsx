import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { addDays, addMonths, monthGrid, startOfMonth, startOfWeek, todayLocalDate, type LocalDate } from '@/utils/dates';
import { Button, IconButton } from './Button';
import { AppText } from './Text';

export interface DayInfo {
  /** 0..1 fill (e.g. calories / goal); undefined = no data. */
  level?: number;
  over?: boolean;
  label?: string;
}

export function Calendar({
  month,
  selected,
  onSelect,
  onMonthChange,
  dayInfo,
  maxDate,
}: {
  month: LocalDate;
  selected?: LocalDate | null;
  onSelect: (date: LocalDate) => void;
  onMonthChange: (month: LocalDate) => void;
  dayInfo?: (date: LocalDate) => DayInfo | undefined;
  maxDate?: LocalDate;
}) {
  const { colors, radius, spacing } = useTheme();
  const i18n = useI18n();
  const today = todayLocalDate();
  const weeks = monthGrid(month);
  const weekStart = startOfWeek(today);
  const weekdays = Array.from({ length: 7 }, (_, i) => i18n.weekdayShort(addDays(weekStart, i)));

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" label={i18n.m.history.prevPeriod} onPress={() => onMonthChange(addMonths(month, -1))} />
        <AppText variant="subheading" style={{ flex: 1 }} align="center" accessibilityLiveRegion="polite">
          {i18n.month(month)}
        </AppText>
        <IconButton
          icon="chevron-forward"
          label={i18n.m.history.nextPeriod}
          onPress={() => onMonthChange(addMonths(month, 1))}
          disabled={!!maxDate && startOfMonth(addMonths(month, 1)) > maxDate}
        />
      </View>
      <View style={styles.week} importantForAccessibility="no-hide-descendants">
        {weekdays.map((d) => (
          <AppText key={d} variant="small" tone="muted" align="center" style={styles.cell}>
            {d}
          </AppText>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;
            const info = dayInfo?.(day);
            const isSelected = day === selected;
            const isToday = day === today;
            const disabled = !!maxDate && day > maxDate;
            const fill = info?.level;
            const label = info?.label ?? i18n.date(day, 'weekday');
            return (
              <Pressable
                key={day}
                onPress={() => onSelect(day)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: isSelected, disabled }}
                style={(state) => {
                  const s = state as { focused?: boolean; hovered?: boolean };
                  return [
                    styles.cell,
                    styles.day,
                    {
                      borderRadius: radius.md,
                      backgroundColor: isSelected ? colors.primary : s.hovered ? colors.surfaceAlt : 'transparent',
                      borderColor: s.focused ? colors.focus : isToday ? colors.primary : 'transparent',
                      opacity: disabled ? 0.35 : 1,
                    },
                  ];
                }}
              >
                <AppText
                  variant="small"
                  style={{ color: isSelected ? colors.primaryText : colors.text, fontWeight: isToday ? '700' : '400' }}
                >
                  {Number(day.slice(8))}
                </AppText>
                <View
                  style={{
                    height: 4,
                    width: '60%',
                    borderRadius: 2,
                    backgroundColor:
                      fill === undefined
                        ? 'transparent'
                        : info?.over
                          ? colors.danger
                          : isSelected
                            ? colors.primaryText
                            : colors.primary,
                    opacity: fill === undefined ? 0 : 0.35 + 0.65 * Math.min(1, fill),
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Button showing a date that opens a calendar in a modal. */
export function DateField({
  label,
  value,
  onChange,
  maxDate,
}: {
  label: string;
  value: LocalDate;
  onChange: (date: LocalDate) => void;
  maxDate?: LocalDate;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value);
  const i18n = useI18n();
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, flexGrow: 1 }}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      <Button
        variant="secondary"
        icon="calendar-outline"
        label={i18n.date(value, 'medium')}
        accessibilityLabel={`${label}: ${i18n.date(value, 'long')}`}
        onPress={() => {
          setMonth(value);
          setOpen(true);
        }}
      />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={() => setOpen(false)}
          accessibilityLabel={i18n.m.common.close}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg }]}
            onPress={() => undefined}
            accessibilityViewIsModal
          >
            <AppText variant="subheading">{label}</AppText>
            <Calendar
              month={month}
              selected={value}
              maxDate={maxDate}
              onMonthChange={setMonth}
              onSelect={(d) => {
                onChange(d);
                setOpen(false);
              }}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                label={i18n.m.common.today}
                onPress={() => {
                  onChange(todayLocalDate());
                  setOpen(false);
                }}
              />
              <Button variant="secondary" label={i18n.m.common.cancel} onPress={() => setOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  week: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, minHeight: 44 },
  day: { alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 2 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 420, gap: 12 },
});
