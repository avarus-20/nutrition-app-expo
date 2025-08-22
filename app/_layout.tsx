import { Slot } from 'expo-router';

export default function RootLayout() {
  return <Slot />; // отдаём управление вложенным лэйаутам (в т.ч. (tabs))
}
