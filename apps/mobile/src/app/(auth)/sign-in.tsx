import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { cleanOtp, isOtpComplete, OTP_LENGTH, parseEmail } from '@/features/auth/sign-in-input';
import { isAccountBlockedError } from '@/features/moderation/moderation';
import { authClient } from '@/lib/auth-client';

type Step = { name: 'email' } | { name: 'code'; email: string };

/**
 * Email one-time code sign-in: email → code. A first sign-in creates the
 * account. On success the session changes and the root layout shows the app.
 */
export default function SignInScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const [step, setStep] = useState<Step>({ name: 'email' });
  const [emailInput, setEmailInput] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async (email: string) => {
    setBusy(true);
    setError(null);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
    setBusy(false);
    if (sendError) {
      setError(t`Nie udało się wysłać kodu. Spróbuj ponownie.`);
      return;
    }
    setOtp('');
    setStep({ name: 'code', email });
  };

  const submitEmail = () => {
    const email = parseEmail(emailInput);
    if (!email) {
      setError(t`Podaj poprawny adres e-mail.`);
      return;
    }
    void sendCode(email);
  };

  const submitCode = async (email: string, code: string) => {
    if (!isOtpComplete(code)) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.emailOtp({ email, otp: code });
    setBusy(false);
    if (signInError) {
      setError(
        isAccountBlockedError(signInError)
          ? t`To konto zostało zablokowane przez administratora.`
          : t`Nieprawidłowy lub wygasły kod.`,
      );
    }
  };

  const codeSentHint = (email: string) => t`Wpisz kod wysłany na ${email}.`;

  const changeOtp = (input: string) => {
    const code = cleanOtp(input);
    setOtp(code);
    if (step.name === 'code' && isOtpComplete(code)) void submitCode(step.email, code);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {t`Zaloguj się`}
        </Text>

        {step.name === 'email' ? (
          <>
            <Text style={styles.hint}>{t`Wyślemy Ci jednorazowy kod na e-mail. Bez haseł.`}</Text>
            <TextInput
              style={styles.input}
              value={emailInput}
              onChangeText={setEmailInput}
              onSubmitEditing={submitEmail}
              placeholder={t`Adres e-mail`}
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel={t`Adres e-mail`}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label={t`Wyślij kod`} onPress={submitEmail} loading={busy} />
          </>
        ) : (
          <>
            <Text style={styles.hint}>{codeSentHint(step.email)}</Text>
            <TextInput
              style={[styles.input, styles.code]}
              value={otp}
              onChangeText={changeOtp}
              placeholder={'0'.repeat(OTP_LENGTH)}
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel={t`Kod jednorazowy`}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={t`Zaloguj`}
              onPress={() => void submitCode(step.email, otp)}
              disabled={!isOtpComplete(otp)}
              loading={busy}
            />
            <Button
              variant="secondary"
              label={t`Wyślij kod ponownie`}
              onPress={() => void sendCode(step.email)}
              disabled={busy}
            />
            <Button
              variant="secondary"
              label={t`Zmień adres e-mail`}
              onPress={() => {
                setError(null);
                setStep({ name: 'email' });
              }}
              disabled={busy}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.space(3),
    paddingTop: rt.insets.top,
    paddingHorizontal: theme.space(6),
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  hint: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: theme.space(4),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontSize: theme.font.sizeMd,
  },
  code: {
    fontSize: theme.font.sizeLg,
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
