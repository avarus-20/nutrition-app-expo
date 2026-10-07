import { router, type Href } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { IconButton } from './Button';
import { CONTENT_MAX_WIDTH, useLayout } from './layout';
import { AppText } from './Text';

export interface ScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Show a back button (stack screens). Falls back to `backHref` when there is no history. */
  back?: boolean;
  backHref?: Href;
  actions?: React.ReactNode;
  scroll?: boolean;
  /** Content pinned below the scroll area (e.g. a save bar). */
  footer?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  maxWidth?: number;
  testID?: string;
}

export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function Screen({
  title,
  subtitle,
  children,
  back,
  backHref = '/',
  actions,
  scroll = true,
  footer,
  onRefresh,
  refreshing = false,
  maxWidth = CONTENT_MAX_WIDTH,
  testID,
}: ScreenProps) {
  const { colors, spacing } = useTheme();
  const { m } = useI18n();
  const insets = useSafeAreaInsets();
  const { isDesktop, isTablet } = useLayout();
  const padding = isTablet ? spacing.xl : spacing.lg;

  const header = (
    <View style={[styles.header, { paddingHorizontal: padding, paddingTop: insets.top + spacing.md, gap: spacing.sm }]}>
      <View style={[styles.headerInner, { maxWidth }]}>
        {back ? <IconButton icon="arrow-back" label={m.common.back} onPress={() => goBack(backHref)} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant={isDesktop ? 'title' : 'heading'} numberOfLines={2}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText tone="muted" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </View>
  );

  const body = (
    <View style={[styles.content, { maxWidth, gap: spacing.lg }]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      testID={testID}
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header}
      {scroll ? (
        <ScrollView
          style={styles.root}
          contentContainerStyle={{ padding, paddingBottom: padding + (footer ? 0 : insets.bottom) }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.root, { padding }]}>{body}</View>
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            { borderTopColor: colors.border, backgroundColor: colors.surface, padding, paddingBottom: padding + insets.bottom },
          ]}
        >
          <View style={[styles.content, { maxWidth }]}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: 'center', paddingBottom: 4 },
  headerInner: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  content: { width: '100%', alignSelf: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
