import { useI18n } from '@/providers/PreferencesProvider';
import { Screen } from '@/ui/Screen';
import { EmptyState } from '@/ui/Surfaces';

export default function BodyScreen() {
  const { m } = useI18n();
  return (
    <Screen title={m.nav.body}>
      <EmptyState title={m.common.loading} />
    </Screen>
  );
}
