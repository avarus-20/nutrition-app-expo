import { useLocalSearchParams } from 'expo-router';

import { FoodEditorScreen } from '@/features/foods/FoodsScreens';

export default function FoodScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FoodEditorScreen id={id} />;
}
