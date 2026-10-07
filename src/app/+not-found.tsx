import { router } from 'expo-router';

import { useI18n } from '@/providers/PreferencesProvider';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { EmptyState } from '@/ui/Surfaces';

export default function NotFoundScreen() {
  const { m } = useI18n();
  return (
    <Screen title={m.errors.notFoundTitle}>
      <EmptyState
        icon="compass-outline"
        title={m.errors.notFoundTitle}
        action={<Button label={m.errors.goHome} onPress={() => router.replace('/')} />}
      />
    </Screen>
  );
}
