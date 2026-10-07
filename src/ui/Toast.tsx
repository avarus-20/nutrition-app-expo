import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/providers/PreferencesProvider';
import { AppText } from './Text';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

interface ToastApi {
  show(text: string, tone?: 'info' | 'error'): void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

const DURATION_MS = 3500;

/** Short, non-blocking status messages, also announced to screen readers. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const counter = useRef(0);
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const show = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    counter.current += 1;
    setMessage({ id: counter.current, text, tone });
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage((m) => (m?.id === message.id ? null : m)), DURATION_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {message ? (
        <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 88 }]}>
          <View
            accessibilityLiveRegion="polite"
            style={{
              backgroundColor: message.tone === 'error' ? colors.danger : colors.text,
              borderRadius: radius.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              maxWidth: 520,
            }}
          >
            <AppText style={{ color: colors.background }}>{message.text}</AppText>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
});
