import { useLocalSearchParams } from 'expo-router';

import { ItemEditorScreen } from '@/features/nutrition/ItemEditor';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ItemEditorScreen id={id} />;
}
