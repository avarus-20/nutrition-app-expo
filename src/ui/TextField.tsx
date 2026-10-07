import React, { useId, useState } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';

import { useTheme } from '@/providers/PreferencesProvider';
import { MIN_TOUCH } from '@/theme/tokens';
import { AppText } from './Text';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  hint?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  secureTextEntry?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  inputMode?: TextInputProps['inputMode'];
  suffix?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  autoFocus?: boolean;
  testID?: string;
  maxLength?: number;
  compact?: boolean;
  editable?: boolean;
}

export function TextField({
  label,
  value,
  onChangeText,
  error,
  hint,
  suffix,
  multiline,
  compact,
  testID,
  editable = true,
  ...input
}: TextFieldProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const id = useId();
  const describedBy = error ?? hint;

  return (
    <View style={{ gap: spacing.xs, flexGrow: 1, flexBasis: compact ? 100 : undefined }}>
      <AppText variant="small" tone="muted" nativeID={`${id}-label`}>
        {label}
      </AppText>
      <View
        style={[
          styles.box,
          {
            borderColor: error ? colors.danger : focused ? colors.focus : colors.border,
            borderWidth: focused || error ? 2 : 1,
            borderRadius: radius.md,
            backgroundColor: editable ? colors.surface : colors.surfaceAlt,
            minHeight: multiline ? 88 : MIN_TOUCH,
          },
        ]}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          multiline={multiline}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${id}-label`}
          accessibilityHint={describedBy ?? undefined}
          aria-invalid={!!error}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            typography.body,
            styles.input,
            { color: colors.text, paddingHorizontal: spacing.md, textAlignVertical: multiline ? 'top' : 'center' },
          ]}
          {...input}
        />
        {suffix ? (
          <AppText tone="muted" style={{ paddingRight: spacing.md }}>
            {suffix}
          </AppText>
        ) : null}
      </View>
      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

/** Decimal input that accepts both "1.5" and "1,5". */
export function NumberField(props: Omit<TextFieldProps, 'keyboardType' | 'inputMode'> & { integer?: boolean }) {
  const { integer, ...rest } = props;
  return <TextField {...rest} keyboardType={integer ? 'number-pad' : 'decimal-pad'} inputMode={integer ? 'numeric' : 'decimal'} />;
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, paddingVertical: 10, minWidth: 0, outlineStyle: 'none' } as never,
});
