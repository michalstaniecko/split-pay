import { useLingui } from '@lingui/react/macro';
import { availableGroupActions } from '@split-pay/shared';
import { Switch, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useUpdateGroupSettings } from '@/features/balances/balances-query';
import { GroupNotificationsSwitch } from '@/features/notifications/notification-switches';
import type { GroupDetail } from './groups-query';

/**
 * Group info → settings: debt simplification, then the group's push
 * notifications (not in a local group, ADR-0021).
 */
export function GroupSettingsSection({ group }: { group: GroupDetail }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const update = useUpdateGroupSettings(group.id);
  // Optimistic: show the requested value while saving.
  const simplifyDebts = update.isPending ? (update.variables.simplifyDebts ?? group.simplifyDebts) : group.simplifyDebts;
  const label = t`Upraszczaj długi`;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.hint}>{t`Najmniej przelewów przy rozliczeniu. Wyłączone: zwroty trafiają prosto do osób, które płaciły.`}</Text>
        </View>
        <Switch
          accessibilityLabel={label}
          value={simplifyDebts}
          disabled={update.isPending || group.archivedAt !== null}
          onValueChange={(value) => update.mutate({ simplifyDebts: value })}
          trackColor={{ true: theme.colors.primary }}
        />
      </View>
      {update.isError ? <Text style={styles.error}>{t`Nie udało się zapisać. Spróbuj ponownie.`}</Text> : null}
      {availableGroupActions(group).pushSettings ? <GroupNotificationsSwitch groupId={group.id} /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.space(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    minHeight: 44,
  },
  text: {
    flex: 1,
    gap: theme.space(0.5),
  },
  label: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  hint: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
