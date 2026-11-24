import { useLingui } from '@lingui/react/macro';
import { memberName as nameOf } from '@split-pay/shared';
import { router } from 'expo-router';
import { Alert, Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useLocale } from '@/i18n/locale-provider';
import { authClient } from '@/lib/auth-client';
import { canUndoClaim } from './claims';
import { type Claim, useUndoClaim } from './claims-query';

/**
 * A claim as a system message in the Conversation (ADR-0017): "Tomek przejął
 * profil Tomek", placed among the entries by claim time (`conversationItems`).
 * Long-press (or the accessibility action) → undo, open to any member, except
 * in an archived group (`canUndoClaim`). Undone claims disappear (the
 * Conversation shows the current state).
 */
export function ClaimMessage({
  group,
  claim,
}: {
  group: { id: string; archivedAt: string | null };
  claim: Claim;
}) {
  const { t } = useLingui();
  const undo = useUndoClaim(group.id);
  const undoable = canUndoClaim(group);
  const { data: session } = authClient.useSession();
  const { locale } = useLocale();
  // Names removed on account deletion (ADR-0019) read "Deleted user" in my language.
  const claimerName = nameOf({ displayName: claim.claimerName }, locale);
  const memberName = nameOf({ displayName: claim.memberName }, locale);
  const text = t`${claimerName} przejął profil ${memberName}`;
  const undoLabel = t`Cofnij przejęcie`;

  const runUndo = () =>
    undo.mutate(claim.id, {
      onSuccess: () => {
        // Undoing my own claim takes me out of the group.
        if (claim.userId !== null && claim.userId === session?.user.id) router.replace('/');
      },
      onError: () => Alert.alert(t`Nie udało się cofnąć przejęcia.`),
    });
  const confirmUndo = () =>
    Alert.alert(undoLabel, t`${memberName} znowu będzie osobą bez konta.`, [
      { text: t`Anuluj`, style: 'cancel' },
      { text: undoLabel, style: 'destructive', onPress: runUndo },
    ]);

  return (
    <Pressable
      accessibilityRole="text"
      accessibilityLabel={text}
      accessibilityActions={undoable ? [{ name: 'undo', label: undoLabel }] : []}
      onAccessibilityAction={(event) => {
        if (undoable && event.nativeEvent.actionName === 'undo') confirmUndo();
      }}
      onLongPress={undoable ? confirmUndo : undefined}
      disabled={!undoable || undo.isPending}
      style={({ pressed }) => [styles.message, (pressed || undo.isPending) && styles.pressed]}>
      <Text style={styles.text}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  message: {
    alignSelf: 'center',
    maxWidth: '90%',
    marginVertical: theme.space(1),
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1.5),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
  },
  text: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
}));
