import React, { useState } from 'react';

import { errorText } from '@/i18n';
import { pickTextFile, saveTextFile } from '@/media/fileTransfer';
import { useI18n } from '@/providers/PreferencesProvider';
import { useServices } from '@/providers/ServicesProvider';
import { backupRecordCount, MAX_BACKUP_BYTES, parseBackup, type RestoreResult } from '@/services/backupService';
import { Button } from '@/ui/Button';
import { confirmAction } from '@/ui/dialogs';
import { Screen } from '@/ui/Screen';
import { Banner, Card } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { todayLocalDate } from '@/utils/dates';
import { toAppError } from '@/utils/errors';

type Busy = 'json' | 'csv' | 'restore' | null;

export function BackupScreen() {
  const services = useServices();
  const { m, t } = useI18n();
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const describeError = (error: unknown): string => {
    const e = toAppError(error);
    if (e.code === 'invalid_import') return m.backup.invalidFile;
    if (e.code === 'unsupported_version') {
      const version = (e.details as { version?: unknown } | undefined)?.version;
      return t(m.backup.wrongVersion, { version: String(version ?? '?') });
    }
    return errorText(m, e.code);
  };

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<string | null>) => {
    setBusy(kind);
    setMessage(null);
    try {
      const done = await action();
      if (done) setMessage({ tone: 'success', text: done });
    } catch (error) {
      setMessage({ tone: 'error', text: describeError(error) });
    } finally {
      setBusy(null);
    }
  };

  const exportJson = () =>
    run('json', async () => {
      const json = await services.backup.exportJson();
      await saveTextFile(`nutrition-backup-${todayLocalDate()}.json`, json, 'application/json');
      return m.backup.exported;
    });

  const exportCsv = () =>
    run('csv', async () => {
      const csv = await services.backup.exportCsv();
      await saveTextFile(`nutrition-entries-${todayLocalDate()}.csv`, csv, 'text/csv');
      return m.backup.exported;
    });

  const restore = () =>
    run('restore', async () => {
      const text = await pickTextFile(MAX_BACKUP_BYTES);
      if (text === null) return null;
      const backup = parseBackup(text);
      const ok = await confirmAction({
        title: m.backup.importJson,
        message: t(m.backup.restoreConfirm, { count: backupRecordCount(backup) }),
        confirmLabel: m.common.confirm,
        cancelLabel: m.common.cancel,
      });
      if (!ok) return null;
      const result: RestoreResult = await services.backup.restore(backup);
      return t(m.backup.restoreResult, { ...result });
    });

  return (
    <Screen title={m.backup.title} back backHref="/settings" maxWidth={760} testID="backup-screen">
      {message ? <Banner tone={message.tone} message={message.text} /> : null}
      <Card title={m.backup.exportJson}>
        <AppText tone="muted">{m.backup.exportJsonHint}</AppText>
        <Button
          label={m.backup.exportJson}
          icon="download-outline"
          onPress={exportJson}
          loading={busy === 'json'}
          disabled={busy !== null}
          testID="backup-export-json"
        />
      </Card>
      <Card title={m.backup.exportCsv}>
        <AppText tone="muted">{m.backup.exportCsvHint}</AppText>
        <Button
          variant="secondary"
          label={m.backup.exportCsv}
          icon="grid-outline"
          onPress={exportCsv}
          loading={busy === 'csv'}
          disabled={busy !== null}
          testID="backup-export-csv"
        />
      </Card>
      <Card title={m.backup.importJson}>
        <AppText tone="muted">{m.backup.importJsonHint}</AppText>
        <Button
          variant="secondary"
          label={m.backup.importJson}
          icon="cloud-upload-outline"
          onPress={restore}
          loading={busy === 'restore'}
          disabled={busy !== null}
          testID="backup-restore"
        />
      </Card>
    </Screen>
  );
}
