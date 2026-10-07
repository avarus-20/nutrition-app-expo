import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation. `Alert.alert` with buttons is not supported
 * by react-native-web, so the browser's native dialog is used there.
 */
export function confirmAction(options: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = options.message ? `${options.title}\n\n${options.message}` : options.title;
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(text));
  }
  return new Promise((resolve) => {
    Alert.alert(
      options.title,
      options.message,
      [
        { text: options.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: options.confirmLabel,
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
