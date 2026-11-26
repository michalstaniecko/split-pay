import { useLingui } from '@lingui/react/macro';
import { availableGroupActions, canDeleteGroup } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { balancesQuery } from '../balances/balances-query';
import { myMemberId } from '../entries/conversation';
import { useFormatters } from '../../i18n/use-formatters';
import { authClient } from '../../lib/auth-client';
import { leaveState } from './group-lifecycle';
import { useDeleteGroup, useLeaveGroup, useSetGroupArchived } from './group-lifecycle-query';
import type { GroupDetail } from './groups-query';

/** Back to the inbox after leaving or deleting the group. */
function goToInbox() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

/**
 * The bottom of Group info (SPEC "Group and account lifecycle"): "Opuść
 * grupę" (blocked with a warning while my balance isn't zero), then archive /
 * unarchive (any member) and permanent deletion (owner only, with confirmation).
 * A local group (ADR-0021) can only be deleted — by anyone holding the phone,
 * at once and without undo.
 */
export function GroupLifecycleSection({ group }: { group: GroupDetail }) {
  const { t } = useLingui();
  const format = useFormatters();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const me = myMemberId(group, userId);
  const balances = useQuery(balancesQuery(group.id));
  const { canLeave, balance } = leaveState(balances.data, me);
  const leave = useLeaveGroup(group.id);
  const archive = useSetGroupArchived(group.id);
  const remove = useDeleteGroup(group.id);
  const archived = group.archivedAt !== null;
  const actions = availableGroupActions(group);
  // A local group has no owner: whoever holds the phone may delete it.
  const mayDelete = group.local || (userId !== undefined && canDeleteGroup(group, group.members, userId));
  const { name } = group;

  const confirmLeave = () =>
    Alert.alert(t`Opuścić grupę „${name}”?`, t`Grupa zniknie z Twojej listy. Twoje wpisy zostaną w grupie.`, [
      { text: t`Anuluj`, style: 'cancel' },
      {
        text: t`Opuść grupę`,
        style: 'destructive',
        onPress: () =>
          leave.mutate(undefined, {
            onSuccess: goToInbox,
            onError: () => Alert.alert(t`Nie udało się opuścić grupy.`),
          }),
      },
    ]);
  const confirmDelete = () =>
    Alert.alert(
      group.local ? t`Usunąć grupę „${name}”?` : t`Usunąć grupę „${name}” na zawsze?`,
      group.local
        ? t`Grupa, jej członkowie i wszystkie wpisy znikną z tego telefonu. Tego nie da się cofnąć.`
        : t`Wszystkie wpisy i salda znikną dla wszystkich członków. Tego nie da się cofnąć.`,
      [
        { text: t`Anuluj`, style: 'cancel' },
        {
          text: group.local ? t`Usuń grupę` : t`Usuń na zawsze`,
          style: 'destructive',
          onPress: () =>
            remove.mutate(undefined, {
              onSuccess: goToInbox,
              onError: () => Alert.alert(t`Nie udało się usunąć grupy.`),
            }),
        },
      ],
    );

  const balanceText = balance === null ? '' : format.amount(balance, group.baseCurrency);
  const leaveWarning =
    balances.isPending || canLeave ? null : t`Nie możesz opuścić grupy, dopóki Twoje saldo nie wynosi zero (teraz ${balanceText}). Najpierw się rozlicz.`;

  return (
    <View style={styles.container}>
      {actions.leaving ? (
        <View style={styles.block}>
          <Action
            label={t`Opuść grupę`}
            disabled={!canLeave || leave.isPending}
            onPress={confirmLeave}
          />
          {leaveWarning ? <Text style={styles.warning}>{leaveWarning}</Text> : null}
        </View>
      ) : null}
      {actions.archiving ? (
        <View style={styles.block}>
          <Action
            label={archived ? t`Przywróć z archiwum` : t`Archiwizuj grupę`}
            disabled={archive.isPending}
            onPress={() => archive.mutate(!archived)}
          />
          <Text style={styles.hint}>
            {archived
              ? t`Grupa jest tylko do odczytu. Przywróć ją, żeby coś zmienić.`
              : t`Grupa stanie się tylko do odczytu: nikt nie doda, nie zmieni ani nie usunie wpisów.`}
          </Text>
          {archive.isError ? <Text style={styles.warning}>{t`Nie udało się zapisać. Spróbuj ponownie.`}</Text> : null}
        </View>
      ) : null}
      {mayDelete ? (
        <View style={styles.block}>
          <Action label={group.local ? t`Usuń grupę` : t`Usuń grupę na zawsze`} destructive disabled={remove.isPending} onPress={confirmDelete} />
        </View>
      ) : null}
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, (pressed || disabled) && styles.dimmed]}>
      <Text style={[styles.actionLabel, destructive && styles.destructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.space(3),
  },
  block: {
    gap: theme.space(1),
    padding: theme.space(4),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  action: {
    justifyContent: 'center',
    minHeight: 44,
  },
  actionLabel: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
  destructive: {
    color: theme.colors.negative,
  },
  dimmed: {
    opacity: 0.5,
  },
  hint: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  warning: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
