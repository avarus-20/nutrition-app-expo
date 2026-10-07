import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { errorText, LANGUAGE_NAMES, LANGUAGES } from '@/i18n';
import { useI18n, usePreferences, useTheme } from '@/providers/PreferencesProvider';
import type { LanguagePreference, ThemePreference } from '@/services/settingsService';
import { useSync } from '@/sync/SyncProvider';
import { Button } from '@/ui/Button';
import { SegmentedControl } from '@/ui/Controls';
import { confirmAction } from '@/ui/dialogs';
import { Column, Columns } from '@/ui/Columns';
import { Screen } from '@/ui/Screen';
import { Banner, Card, Divider, ListRow } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { useToast } from '@/ui/Toast';
import { toAppError } from '@/utils/errors';

function AccountCard() {
  const { state, signOut, deleteAccount } = useAuth();
  const { status, syncNow } = useSync();
  const i18n = useI18n();
  const { m, t } = i18n;
  const toast = useToast();
  const [busy, setBusy] = useState<'sync' | 'signOut' | 'delete' | null>(null);

  const run = async (kind: 'sync' | 'signOut' | 'delete', action: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      toast.show(errorText(m, toAppError(error).code), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (state.status === 'disabled') {
    return (
      <Card title={m.settings.account}>
        <Banner message={m.settings.backendDisabled} />
      </Card>
    );
  }
  if (state.status !== 'signedIn') {
    return (
      <Card title={m.settings.account}>
        <AppText tone="muted">{m.settings.localOnly}</AppText>
        <Button label={m.settings.signIn} icon="person-circle-outline" onPress={() => router.push('/auth/sign-in')} />
      </Card>
    );
  }

  const syncLine =
    status.phase === 'syncing'
      ? m.sync.syncing
      : status.lastSyncedAt
        ? t(m.settings.lastSynced, { time: i18n.dateTime(status.lastSyncedAt) })
        : m.settings.neverSynced;

  return (
    <>
      <Card title={m.settings.account}>
        <AppText>{t(m.settings.signedInAs, { email: state.user.email ?? '—' })}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            variant="secondary"
            label={m.settings.signOut}
            icon="log-out-outline"
            loading={busy === 'signOut'}
            onPress={async () => {
              const ok = await confirmAction({
                title: m.settings.signOut,
                message: m.settings.signOutConfirm,
                confirmLabel: m.settings.signOut,
                cancelLabel: m.common.cancel,
              });
              if (ok) await run('signOut', signOut);
            }}
          />
          <Button
            variant="danger"
            label={m.settings.deleteAccount}
            icon="trash-outline"
            loading={busy === 'delete'}
            onPress={async () => {
              const ok = await confirmAction({
                title: m.settings.deleteAccount,
                message: m.settings.deleteAccountConfirm,
                confirmLabel: m.common.delete,
                cancelLabel: m.common.cancel,
                destructive: true,
              });
              if (ok)
                await run('delete', async () => {
                  await deleteAccount();
                  toast.show(m.settings.deleteAccountDone);
                });
            }}
          />
        </View>
      </Card>
      <Card title={m.settings.sync}>
        <AppText accessibilityLiveRegion="polite">{m.sync[status.phase]}</AppText>
        <AppText tone="muted">{syncLine}</AppText>
        {status.pending > 0 ? <AppText tone="muted">{t(m.settings.pending, { count: status.pending })}</AppText> : null}
        {status.phase === 'error' && status.lastError ? <Banner tone="warning" message={m.errors.sync} /> : null}
        <Button
          variant="secondary"
          icon="sync-outline"
          label={m.settings.syncNow}
          loading={busy === 'sync' || status.phase === 'syncing'}
          onPress={() => run('sync', syncNow)}
        />
      </Card>
    </>
  );
}

export default function SettingsScreen() {
  const { m, t } = useI18n();
  const { preferences, setLanguage, setTheme } = usePreferences();
  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: m.settings.languageSystem },
    ...LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
  ];
  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: m.settings.themeSystem },
    { value: 'light', label: m.settings.themeLight },
    { value: 'dark', label: m.settings.themeDark },
  ];

  return (
    <Screen title={m.settings.title}>
      <Columns>
        <Column>
          <Card title={m.settings.language}>
            <SegmentedControl
              testID="language-control"
              label={m.settings.language}
              options={languageOptions}
              value={preferences.language}
              onChange={setLanguage}
            />
          </Card>
          <Card title={m.settings.theme}>
            <SegmentedControl label={m.settings.theme} options={themeOptions} value={preferences.theme} onChange={setTheme} />
          </Card>
          <Card title={m.settings.data} padded>
            <ListRow title={m.settings.goals} onPress={() => router.push('/goals')} right={<Chevron />} />
            <Divider />
            <ListRow title={m.settings.foods} onPress={() => router.push('/foods')} right={<Chevron />} />
            <Divider />
            <ListRow title={m.settings.backup} onPress={() => router.push('/backup')} right={<Chevron />} />
          </Card>
        </Column>
        <Column>
          <AccountCard />
          <Card title={m.settings.about}>
            <AppText tone="muted">{t(m.settings.version, { version: Constants.expoConfig?.version ?? '—' })}</AppText>
            <AppText tone="muted">{m.settings.privacy}</AppText>
          </Card>
        </Column>
      </Columns>
    </Screen>
  );
}

function Chevron() {
  const { colors } = useTheme();
  return <AppText style={{ color: colors.textMuted, fontSize: 20 }}>›</AppText>;
}
