import { useLingui } from '@lingui/react/macro';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { forgetLocalUser } from '@/features/offline/local-session';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

type Choice = 'keepName' | 'removeName';

/**
 * Account deletion in Profile (ADR-0010, ADR-0019; Apple requirement, GDPR).
 * Two choices, keeping the name preselected: "Usuń konto" leaves the user's
 * members in their groups without an account under their last name; "Usuń
 * konto i moją nazwę z grup" clears the name too, so every viewer sees
 * "Usunięty użytkownik" in their own language. After a confirmation the API
 * removes the account; the device forgets the session and the auth guard
 * shows sign-in.
 */
export function DeleteAccountSection() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const userId = authClient.useSession().data?.user.id;
  const [choice, setChoice] = useState<Choice>('keepName');
  const deleteAccount = useMutation({
    mutationFn: (removeName: boolean) => parseResponse(api.me.$delete({ json: { removeName } })),
    onSuccess: async () => {
      // The server session is gone already; this clears the stored cookie and session.
      await authClient.signOut().catch(() => undefined);
      queryClient.clear();
      // The deleted account's offline cache and outbox leave the device too.
      if (userId) await forgetLocalUser(userId).catch(() => undefined);
    },
    onError: () => Alert.alert(t`Nie udało się usunąć konta. Spróbuj ponownie.`),
  });

  const options: { value: Choice; label: string; description: string }[] = [
    {
      value: 'keepName',
      label: t`Usuń konto`,
      description: t`W grupach zostaniesz osobą bez konta pod swoją ostatnią nazwą, więc znajomi nadal będą wiedzieć, kto to.`,
    },
    {
      value: 'removeName',
      label: t`Usuń konto i moją nazwę z grup`,
      description: t`W grupach zostaniesz osobą bez konta, a każdy zobaczy zamiast nazwy „Usunięty użytkownik”.`,
    },
  ];
  const selected = options.find((o) => o.value === choice) ?? options[0]!;

  const confirm = () =>
    Alert.alert(
      t`Usunąć konto?`,
      choice === 'keepName'
        ? t`Twój e-mail, sposoby logowania, zdjęcie profilowe i dane do przelewu zostaną usunięte. W grupach zostaniesz osobą bez konta pod obecną nazwą, a wydatki i salda się nie zmienią. Tego nie można cofnąć.`
        : t`Twój e-mail, sposoby logowania, zdjęcie profilowe i dane do przelewu zostaną usunięte. W grupach zostaniesz osobą bez konta „Usunięty użytkownik”, a wydatki i salda się nie zmienią. Tego nie można cofnąć.`,
      [
        { text: t`Anuluj`, style: 'cancel' },
        { text: selected.label, style: 'destructive', onPress: () => deleteAccount.mutate(choice === 'removeName') },
      ],
    );

  return (
    <View style={styles.section}>
      <Text style={styles.intro}>
        {t`Usunięcie konta usuwa Twój e-mail, sposoby logowania, zdjęcie profilowe i dane do przelewu. Wydatki i salda w grupach się nie zmienią.`}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t`Jak usunąć konto`} style={styles.options}>
        {options.map((option) => {
          const isSelected = option.value === choice;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: deleteAccount.isPending }}
              accessibilityHint={option.description}
              disabled={deleteAccount.isPending}
              onPress={() => setChoice(option.value)}
              style={[styles.option, isSelected && styles.optionSelected]}>
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>{option.label}</Text>
              <Text style={styles.optionDescription}>{option.description}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: deleteAccount.isPending, busy: deleteAccount.isPending }}
        disabled={deleteAccount.isPending}
        onPress={confirm}
        style={({ pressed }) => [styles.button, (pressed || deleteAccount.isPending) && styles.dimmed]}>
        <Text style={styles.label}>{deleteAccount.isPending ? t`Usuwanie konta…` : selected.label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    alignSelf: 'stretch',
    gap: theme.space(3),
  },
  intro: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  options: {
    gap: theme.space(2),
  },
  option: {
    minHeight: 44,
    gap: theme.space(1),
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  optionSelected: {
    borderColor: theme.colors.negative,
  },
  optionLabel: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  optionLabelSelected: {
    fontWeight: theme.font.weightBold,
  },
  optionDescription: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
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
