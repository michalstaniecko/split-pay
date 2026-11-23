import { useLingui } from '@lingui/react/macro';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { Alert, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useLocale } from '@/i18n/locale-provider';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

/**
 * "Usuń konto" in Profile (ADR-0010, Apple requirement). After a confirmation
 * the API removes the account; the user's members stay in their groups as
 * "Usunięty użytkownik", named in the current UI language. Then the device
 * forgets the session and the auth guard shows sign-in.
 */
export function DeleteAccountSection() {
  const { t } = useLingui();
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const deleteAccount = useMutation({
    mutationFn: () => parseResponse(api.me.$delete({ json: { locale } })),
    onSuccess: async () => {
      // The server session is gone already; this clears the stored cookie and session.
      await authClient.signOut().catch(() => undefined);
      queryClient.clear();
    },
    onError: () => Alert.alert(t`Nie udało się usunąć konta. Spróbuj ponownie.`),
  });

  const label = t`Usuń konto`;
  const confirm = () =>
    Alert.alert(
      t`Usunąć konto?`,
      t`Twój e-mail i dane konta zostaną usunięte. W grupach zostaniesz osobą bez konta „Usunięty użytkownik”, a wydatki i salda się nie zmienią. Tego nie można cofnąć.`,
      [
        { text: t`Anuluj`, style: 'cancel' },
        { text: label, style: 'destructive', onPress: () => deleteAccount.mutate() },
      ],
    );

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: deleteAccount.isPending, busy: deleteAccount.isPending }}
        disabled={deleteAccount.isPending}
        onPress={confirm}
        style={({ pressed }) => [styles.button, (pressed || deleteAccount.isPending) && styles.dimmed]}>
        <Text style={styles.label}>{deleteAccount.isPending ? t`Usuwanie konta…` : label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    alignSelf: 'stretch',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: theme.space(4),
    borderRadius: theme.radius.md,
  },
  dimmed: {
    opacity: 0.6,
  },
  label: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.negative,
  },
}));
