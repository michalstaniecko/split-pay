import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { SettingSwitch } from '@/components/setting-switch';
import {
  groupNotificationSettingQuery,
  notificationSettingQuery,
  useSetGroupNotificationsEnabled,
  useSetNotificationsEnabled,
} from './notifications-query';

/** Profile: notifications on/off for every group. */
export function NotificationsSection() {
  const { t } = useLingui();
  const setting = useQuery(notificationSettingQuery());
  const update = useSetNotificationsEnabled();
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t`Powiadomienia`}</Text>
      <NotificationSwitch
        label={t`Powiadomienia push`}
        hint={t`Nowe i zmienione wydatki z Twoim udziałem, spłaty dla Ciebie, przypomnienia.`}
        value={update.isPending ? update.variables : setting.data?.enabled}
        onChange={(enabled) => update.mutate(enabled)}
        failed={update.isError || setting.isError}
      />
    </View>
  );
}

/** Group info → settings: notifications on/off for this group. */
export function GroupNotificationsSwitch({ groupId }: { groupId: string }) {
  const { t } = useLingui();
  const setting = useQuery(groupNotificationSettingQuery(groupId));
  const update = useSetGroupNotificationsEnabled(groupId);
  return (
    <NotificationSwitch
      label={t`Powiadomienia z tej grupy`}
      hint={t`Wyłączone: grupa odświeża się w tle, ale bez powiadomień.`}
      value={update.isPending ? update.variables : setting.data?.enabled}
      onChange={(enabled) => update.mutate(enabled)}
      failed={update.isError || setting.isError}
    />
  );
}

/** A notifications switch, with the save error under it; disabled while loading. */
function NotificationSwitch({
  label,
  hint,
  value,
  onChange,
  failed,
}: {
  label: string;
  hint: string;
  /** `undefined` while loading. */
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  failed: boolean;
}) {
  const { t } = useLingui();
  return (
    <View style={styles.container}>
      <SettingSwitch label={label} hint={hint} value={value ?? true} disabled={value === undefined} onValueChange={onChange} />
      {failed ? <Text style={styles.error}>{t`Nie udało się zapisać. Spróbuj ponownie.`}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    alignSelf: 'stretch',
    gap: theme.space(2),
  },
  title: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  container: {
    gap: theme.space(1),
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
