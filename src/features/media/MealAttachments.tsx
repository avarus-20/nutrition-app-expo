import React from 'react';
import { View } from 'react-native';

import type { MealAttachmentsProps } from '@/features/nutrition/MealEditor';
import { MealPhotosCard } from '@/features/photos/PhotoViews';
import { useTheme } from '@/providers/PreferencesProvider';

/** Media column of the meal editor. */
export function MealAttachments({ meal }: MealAttachmentsProps) {
  const { spacing } = useTheme();
  const target = { date: meal.local_date, mealType: meal.meal_type, mealId: meal.id };
  return (
    <View style={{ gap: spacing.lg }}>
      <MealPhotosCard mealId={meal.id} target={target} />
    </View>
  );
}
