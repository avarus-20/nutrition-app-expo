import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/providers/PreferencesProvider';
import { useLayout } from './layout';

/**
 * Side-by-side columns on wide screens, a single stacked column on phones.
 * `at` selects the breakpoint from which columns are used.
 */
export function Columns({ children, at = 'tablet' }: { children: React.ReactNode; at?: 'tablet' | 'desktop' }) {
  const { spacing } = useTheme();
  const { isTablet, isDesktop } = useLayout();
  const wide = at === 'tablet' ? isTablet : isDesktop;
  const items = React.Children.toArray(children).filter(Boolean);
  if (!wide) return <View style={{ gap: spacing.lg }}>{items}</View>;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' }}>
      {items.map((child, i) => (
        <View key={i} style={{ flex: 1, minWidth: 0, gap: spacing.lg }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function Column({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return <View style={{ gap: spacing.lg }}>{children}</View>;
}
