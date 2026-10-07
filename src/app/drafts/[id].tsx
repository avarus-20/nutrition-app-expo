import { useLocalSearchParams } from 'expo-router';

import { DraftReviewScreen } from '@/features/drafts/DraftScreens';

export default function DraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DraftReviewScreen id={id} />;
}
