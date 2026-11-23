import { useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { ActivityIndicator, Alert, Pressable, Share, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { groupLinkUrl } from '@/features/group-link/group-link';
import { webUrl } from '@/lib/web-url';
import { fetchClaimLink } from './claims-query';

/**
 * "Wyślij link" on a member without an account in Group info: shares their
 * personal claim link (GLOSSARY), which opens the join screen straight on
 * claiming this member. Same URL shape as the group link (`…/g/<token>`).
 */
export function PersonalClaimLinkButton({
  groupId,
  groupName,
  member,
}: {
  groupId: string;
  groupName: string;
  member: { id: string; displayName: string };
}) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const name = member.displayName;
  const send = useMutation({
    mutationFn: () => fetchClaimLink(groupId, member.id),
    onSuccess: ({ token }) => {
      const url = groupLinkUrl(token, webUrl);
      void Share.share({ message: t`${name}, to Twój link do grupy „${groupName}” w split-pay: ${url}` }).catch(
        () => undefined,
      );
    },
    onError: () => Alert.alert(t`Nie udało się utworzyć linku.`),
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t`Wyślij ${name} osobisty link`}
      disabled={send.isPending}
      hitSlop={8}
      onPress={() => send.mutate()}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {send.isPending ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <Text style={styles.label}>{t`Wyślij link`}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space(2),
  },
  label: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
}));
