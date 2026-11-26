import { useLingui } from '@lingui/react/macro';
import { availableGroupActions } from '@split-pay/shared';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { SettingSwitch } from '@/components/setting-switch';
import { useUpdateGroupSettings } from '@/features/balances/balances-query';
import { GroupNotificationsSwitch } from '@/features/notifications/notification-switches';
import type { GroupDetail } from './groups-query';

/**
 * Group info → settings: debt simplification, then the group's push
 * notifications (not in a local group, ADR-0021).
 */
export function GroupSettingsSection({ group }: { group: GroupDetail }) {
  const { t } = useLingui();
  const update = useUpdateGroupSettings(group.id);
  // Optimistic: show the requested value while saving.
  const simplifyDebts = update.isPending ? (update.variables.simplifyDebts ?? group.simplifyDebts) : group.simplifyDebts;

  return (
    <View style={styles.container}>
      <SettingSwitch
        label={t`Upraszczaj długi`}
        hint={t`Najmniej przelewów przy rozliczeniu. Wyłączone: zwroty trafiają prosto do osób, które płaciły.`}
        value={simplifyDebts}
        disabled={update.isPending || group.archivedAt !== null}
        onValueChange={(value) => update.mutate({ simplifyDebts: value })}
      />
      {update.isError ? <Text style={styles.error}>{t`Nie udało się zapisać. Spróbuj ponownie.`}</Text> : null}
      {availableGroupActions(group).pushSettings ? <GroupNotificationsSwitch groupId={group.id} /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.space(1),
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
