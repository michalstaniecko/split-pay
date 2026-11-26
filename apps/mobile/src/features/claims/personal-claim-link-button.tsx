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
      void Share.share({ message: t`${name}, to Twój link do grupy „${groupName}” w Kwitz: ${url}` }).catch(
        () => undefined,
      );
    },
    onError: () => Alert.alert(t`Nie udało się utworzyć linku.`),
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t`Wyślij osobisty link: ${name}`}
      disabled={send.isPending}
      hitSlop={4}
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
  // An outlined pill, 36 high; hitSlop 4 makes the target 44.
  button: {
    minHeight: 36,
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: theme.space(3),
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
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
