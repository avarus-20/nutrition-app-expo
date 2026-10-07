import { Stack } from 'expo-router';
import { ActivityIndicator, Button, Text, View } from 'react-native';

import { I18nProvider } from '@/lib/i18n';
import { ServicesProvider, useBoot } from '@/providers/ServicesProvider';

export default function RootLayout() {
  const [boot, retry] = useBoot();

  if (boot.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (boot.status === 'error') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text>{boot.error.message}</Text>
        <Button title="Retry" onPress={retry} />
      </View>
    );
  }
  return (
    <ServicesProvider services={boot.services}>
      <I18nProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </I18nProvider>
    </ServicesProvider>
  );
}
