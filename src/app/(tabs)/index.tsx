import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { DayView } from '@/features/nutrition/DayView';
import { isValidLocalDate, todayLocalDate } from '@/utils/dates';

export default function TodayScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date && isValidLocalDate(params.date) ? params.date : todayLocalDate();
  return (
    <DayView
      date={date}
      onDateChange={(next) => router.setParams({ date: next === todayLocalDate() ? undefined : next })}
    />
  );
}
