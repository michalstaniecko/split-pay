import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { TransferRow } from '@/features/balances/balances';
import type { GroupDetail } from '@/features/groups/groups-query';
import { nudgeButton } from './notifications';
import { nudgesQuery, useNudge } from './notifications-query';

/**
 * "Przypomnij" on a transfer owed to me in the balance drawer: pushes a
 * reminder to the member who owes it. Hidden for members without an account
 * and in archived groups; disabled with "przypomniano dziś" for 24 h after a
 * nudge by anyone.
 */
export function NudgeButton({ group, transfer }: { group: GroupDetail; transfer: TransferRow }) {
  const { t } = useLingui();
  const nudges = useQuery(nudgesQuery(group.id));
  const nudge = useNudge(group.id);
  const state = nudgeButton(transfer, {
    archived: group.archivedAt !== null,
    members: group.members,
    nudges: nudges.data ?? [],
    now: new Date().toISOString(),
  });
  if (state === 'hidden') return null;

  const reminded = state === 'remindedToday' || nudge.isSuccess;
  const disabled = reminded || nudge.isPending || nudges.isPending;
  const label = reminded ? t`przypomniano dziś` : nudge.isError ? t`Spróbuj ponownie` : t`Przypomnij`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={reminded ? t`${transfer.fromName}: przypomniano dziś` : t`Przypomnij: ${transfer.fromName}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => nudge.mutate(transfer.from)}
      style={({ pressed }) => [
        styles.button,
        reminded && styles.reminded,
        (pressed || nudge.isPending) && styles.pressed,
      ]}>
      <Text style={[styles.label, reminded && styles.remindedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  label: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
  reminded: {
    borderColor: theme.colors.border,
  },
  remindedLabel: {
    fontWeight: 'normal',
    color: theme.colors.textMuted,
  },
}));
