import { useLocalSearchParams } from 'expo-router';

import { MealAttachments } from '@/features/media/MealAttachments';
import { MealEditorScreen } from '@/features/nutrition/MealEditor';

export default function MealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MealEditorScreen id={id} attachments={MealAttachments} />;
}
