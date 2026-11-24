import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { activityLatestQuery, useActivityUnread } from '@/features/activity/activity-query';
import { MemberAvatar } from '@/features/photos/member-avatar';
import { myAvatarQuery } from '@/features/photos/photos-query';
import { authClient } from '@/lib/auth-client';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/**
 * Inbox header: bell → Activity (with a dot when others changed something
 * since Activity was last opened on this device), the user's avatar →
 * Profile (ADR-0017).
 */
export function InboxHeaderButtons() {
  const { t } = useLingui();
  const { data: session } = authClient.useSession();
  const name = session?.user.name.trim() || session?.user.email || '?';
  const avatar = useQuery(myAvatarQuery());
  const latest = useQuery(activityLatestQuery());
  useRefreshOnFocus(latest.refetch);
  const unread = useActivityUnread(latest.data?.latestByOthersAt);
  return (
    <View style={styles.row}>
      <Link href="/activity" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? t`Aktywność, nowe zmiany` : t`Aktywność`}
          hitSlop={8}
          style={styles.button}>
          <Text style={styles.bell}>🔔</Text>
          {unread ? <View style={styles.dot} /> : null}
        </Pressable>
      </Link>
      <Link href="/profile" asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={t`Profil`} hitSlop={8} style={styles.avatar}>
          {avatar.data ? (
            <MemberAvatar name={name} url={avatar.data.url} size={32} />
          ) : (
            <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>
          )}
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
  },
  button: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bell: {
    fontSize: theme.font.sizeLg,
  },
  dot: {
    position: 'absolute',
    top: 2,
    end: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.negative,
    borderWidth: 1.5,
    borderColor: theme.colors.background,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  initial: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.onPrimary,
  },
}));
