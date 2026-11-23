import { useLingui } from '@lingui/react/macro';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { authClient } from '@/lib/auth-client';

/** Inbox header: bell → Activity, the user's avatar → Profile (ADR-0017). */
export function InboxHeaderButtons() {
  const { t } = useLingui();
  const { data: session } = authClient.useSession();
  const initial = (session?.user.name.trim() || session?.user.email || '?').charAt(0).toUpperCase();
  return (
    <View style={styles.row}>
      <Link href="/activity" asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={t`Aktywność`} hitSlop={8} style={styles.button}>
          <Text style={styles.bell}>🔔</Text>
        </Pressable>
      </Link>
      <Link href="/profile" asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={t`Profil`} hitSlop={8} style={styles.avatar}>
          <Text style={styles.initial}>{initial}</Text>
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
