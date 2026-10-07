import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { validateCredentials } from '@/auth/authGateway';
import { errorText } from '@/i18n';
import { useI18n, useTheme } from '@/providers/PreferencesProvider';
import { Button } from '@/ui/Button';
import { goBack, Screen } from '@/ui/Screen';
import { Banner, Card } from '@/ui/Surfaces';
import { AppText } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toAppError } from '@/utils/errors';

export type AuthMode = 'signIn' | 'signUp' | 'reset';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { state, signIn, signUp, resetPassword } = useAuth();
  const { m } = useI18n();
  const { spacing } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const title = mode === 'signIn' ? m.auth.signInTitle : mode === 'signUp' ? m.auth.signUpTitle : m.auth.resetTitle;

  if (state.status === 'disabled') {
    return (
      <Screen title={title} back backHref="/settings">
        <Banner message={m.settings.backendDisabled} />
      </Screen>
    );
  }

  const submit = async () => {
    const found = validateCredentials(email, mode === 'reset' ? 'xxxxxxxx' : password);
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signIn(email, password);
        goBack('/');
      } else if (mode === 'signUp') {
        const result = await signUp(email, password);
        if (result.needsConfirmation) setMessage({ tone: 'success', text: m.auth.confirmEmail });
        else goBack('/');
      } else {
        await resetPassword(email);
        setMessage({ tone: 'success', text: m.auth.resetSent });
      }
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(m, toAppError(error).code) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={title} back backHref="/settings" maxWidth={480}>
      <Card>
        <TextField
          label={m.auth.email}
          value={email}
          onChangeText={setEmail}
          error={errors.email ? m.auth.invalidEmail : null}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          testID="auth-email"
          returnKeyType="next"
        />
        {mode !== 'reset' ? (
          <TextField
            label={m.auth.password}
            value={password}
            onChangeText={setPassword}
            error={errors.password ? m.auth.passwordTooShort : null}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            testID="auth-password"
            onSubmitEditing={submit}
            returnKeyType="go"
          />
        ) : null}
        {message ? <Banner tone={message.tone} message={message.text} /> : null}
        <Button
          label={mode === 'signIn' ? m.auth.signIn : mode === 'signUp' ? m.auth.signUp : m.auth.sendReset}
          onPress={submit}
          loading={busy}
          testID="auth-submit"
        />
        {mode !== 'reset' ? <AppText tone="muted" variant="small">{m.auth.localDataNote}</AppText> : null}
      </Card>
      <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
        {mode === 'signIn' ? (
          <>
            <Button variant="ghost" label={m.auth.noAccount} onPress={() => router.replace('/auth/sign-up')} />
            <Button variant="ghost" label={m.auth.forgot} onPress={() => router.push('/auth/reset')} />
          </>
        ) : (
          <Button variant="ghost" label={m.auth.haveAccount} onPress={() => router.replace('/auth/sign-in')} />
        )}
        <Button variant="ghost" label={m.auth.continueLocal} onPress={() => goBack('/')} />
        <AppText variant="small" tone="muted">
          {m.auth.comingSoon}
        </AppText>
      </View>
    </Screen>
  );
}
