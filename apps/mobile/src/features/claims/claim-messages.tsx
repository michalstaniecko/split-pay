import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { authClient } from '@/lib/auth-client';
import { activeClaims } from './claims';
import { type Claim, claimsQuery, useUndoClaim } from './claims-query';

/**
 * Claims as system messages in the Conversation (ADR-0017): "Tomek przejął
 * profil Tomek". Long-press (or the accessibility action) → undo, open to any
 * member. Undone claims disappear (the Conversation shows the current state).
 * TODO(#8): interleave with the entry bubbles by time once the list exists.
 */
export function ClaimMessages({ groupId }: { groupId: string }) {
  const claims = useQuery(claimsQuery(groupId));
  const active = activeClaims(claims.data ?? []);
  if (active.length === 0) return null;
  return (
    <View style={styles.list}>
      {active.map((claim) => (
        <ClaimMessage key={claim.id} groupId={groupId} claim={claim} />
      ))}
    </View>
  );
}

export function ClaimMessage({ groupId, claim }: { groupId: string; claim: Claim }) {
  const { t } = useLingui();
  const undo = useUndoClaim(groupId);
  const { data: session } = authClient.useSession();
  const { claimerName, memberName } = claim;
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
      accessibilityActions={[{ name: 'undo', label: undoLabel }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'undo') confirmUndo();
      }}
      onLongPress={confirmUndo}
      disabled={undo.isPending}
      style={({ pressed }) => [styles.message, (pressed || undo.isPending) && styles.pressed]}>
      <Text style={styles.text}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space(2),
    paddingVertical: theme.space(2),
    alignItems: 'center',
  },
  message: {
    alignSelf: 'center',
    maxWidth: '90%',
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
