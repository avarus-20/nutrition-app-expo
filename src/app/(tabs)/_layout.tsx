import { Ionicons } from '@expo/vector-icons';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { SyncBadge } from '@/sync/SyncBadge';
import type { IconName } from '@/ui/Button';
import { useLayout } from '@/ui/layout';
import { AppText } from '@/ui/Text';

const ICONS: Record<string, IconName> = {
  index: 'restaurant-outline',
  history: 'calendar-outline',
  stats: 'stats-chart-outline',
  body: 'body-outline',
  settings: 'settings-outline',
};

/** Bottom tab bar on phones, sidebar on desktop-width screens. */
function NavigationBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, spacing, radius } = useTheme();
  const { m } = useI18n();
  const { isDesktop } = useLayout();
  const insets = useSafeAreaInsets();

  const items = state.routes.map((route, index) => {
    const focused = state.index === index;
    const title = descriptors[route.key]?.options.title ?? route.name;
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    const color = focused ? colors.primary : colors.textMuted;
    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        aria-selected={focused}
        accessibilityLabel={title}
        testID={`tab-${route.name}`}
        style={(s) => {
          const st = s as { hovered?: boolean; focused?: boolean };
          return [
            isDesktop ? styles.sideItem : styles.bottomItem,
            {
              borderRadius: radius.md,
              backgroundColor: focused && isDesktop ? colors.primarySoft : st.hovered ? colors.surfaceAlt : 'transparent',
              borderColor: st.focused ? colors.focus : 'transparent',
            },
          ];
        }}
      >
        <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={isDesktop ? 22 : 24} color={color} />
        <AppText
          variant="small"
          numberOfLines={1}
          style={{ color, fontWeight: focused ? '700' : '500', fontSize: isDesktop ? 15 : 11 }}
        >
          {title}
        </AppText>
      </Pressable>
    );
  });

  if (isDesktop) {
    return (
      <View
        style={[
          styles.sidebar,
          { backgroundColor: colors.surface, borderRightColor: colors.border, padding: spacing.lg, paddingTop: insets.top + spacing.xl },
        ]}
      >
        <View style={[styles.brand, { marginBottom: spacing.xl }]}>
          <Ionicons name="leaf" size={26} color={colors.primary} />
          <AppText variant="subheading" numberOfLines={2} style={{ flex: 1 }}>
            {m.nav.appName}
          </AppText>
        </View>
        <View accessibilityRole="tablist" style={{ gap: spacing.xs }}>
          {items}
        </View>
        <View style={{ flex: 1 }} />
        <SyncBadge showLabel />
      </View>
    );
  }
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bottom,
        { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 6) },
      ]}
    >
      {items}
    </View>
  );
}

export default function TabsLayout() {
  const { m } = useI18n();
  const { isDesktop } = useLayout();
  return (
    <Tabs
      tabBar={(props) => <NavigationBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: isDesktop ? 'left' : 'bottom' }}
    >
      <Tabs.Screen name="index" options={{ title: m.nav.today }} />
      <Tabs.Screen name="history" options={{ title: m.nav.history }} />
      <Tabs.Screen name="stats" options={{ title: m.nav.stats }} />
      <Tabs.Screen name="body" options={{ title: m.nav.body }} />
      <Tabs.Screen name="settings" options={{ title: m.nav.settings }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bottom: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, paddingHorizontal: 4 },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 52, borderWidth: 2 },
  sidebar: { width: 248, borderRightWidth: StyleSheet.hairlineWidth },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 12, borderWidth: 2 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
