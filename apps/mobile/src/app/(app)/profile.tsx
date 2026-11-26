import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { LanguagePicker } from '@/components/language-picker';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { AvatarSection } from '@/features/photos/avatar-section';
import { NotificationsSection } from '@/features/notifications/notification-switches';
import { unregisterFromPush } from '@/features/notifications/push';
import { localDatabases } from '@/features/offline/local-session';
import { countUnsentChanges } from '@/features/offline/outbox';
import { mayDeleteCache } from '@/features/offline/sign-out';
import { flushNow } from '@/features/offline/sync';
import { AboutSection } from '@/features/profile/about-section';
import { DeleteAccountSection } from '@/features/profile/delete-account-section';
import { meQuery } from '@/features/profile/me-query';
import { PayoutDetailsSection } from '@/features/profile/payout-details-section';
import { ThemePicker } from '@/features/theme/theme-picker';
import { authClient } from '@/lib/auth-client';

export default function ProfileScreen() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const me = useQuery(meQuery());
  const [signingOut, setSigningOut] = useState(false);
  // The stored session shows the email at once (also offline); the API confirms it.
  const email = me.data?.email ?? session?.user.email;

  // Signing out deletes the account's cache and outbox (local groups stay, ADR-0021):
  // unsent changes are sent first, and only lost after a confirmation.
  const confirmDiscard = (count: number) =>
    new Promise<boolean>((resolve) =>
      Alert.alert(
        t`Wylogować się?`,
        t`${plural(count, {
          one: '# zmiana z tego telefonu nie została jeszcze wysłana i po wylogowaniu przepadnie.',
          few: '# zmiany z tego telefonu nie zostały jeszcze wysłane i po wylogowaniu przepadną.',
          many: '# zmian z tego telefonu nie zostało jeszcze wysłanych i po wylogowaniu przepadną.',
          other: '# zmiany z tego telefonu nie zostały jeszcze wysłane i po wylogowaniu przepadną.',
        })}`,
        [
          { text: t`Anuluj`, style: 'cancel', onPress: () => resolve(false) },
          { text: t`Wyloguj się`, style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      ),
    );

  const signOut = async () => {
    setSigningOut(true);
    try {
      const db = await localDatabases.userDb().catch(() => null);
      const proceed =
        !db || (await mayDeleteCache({ unsentChanges: () => countUnsentChanges(db), sync: flushNow, confirmDiscard }));
      if (!proceed) return;
      // This phone stops getting the account's pushes (the API also drops the token with the session).
      await unregisterFromPush();
      await authClient.signOut();
      // Nothing from this account may leak into the next one.
      queryClient.clear();
      if (userId) await localDatabases.forgetUser(userId).catch(() => undefined);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    // Scrolls: Profile is taller than a small phone screen ("Usuń konto" is last).
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <PlaceholderScreen title={t`Profil`} paddingBottom={56}>
        <AvatarSection />
        <View style={styles.account}>
          <Text style={styles.label}>{t`Zalogowano jako`}</Text>
          <Text style={styles.email} selectable>
            {email}
          </Text>
        </View>
        <PayoutDetailsSection />
        <NotificationsSection />
        <LanguagePicker />
        <ThemePicker />
        <Button variant="secondary" label={t`Wyloguj się`} onPress={() => void signOut()} loading={signingOut} />
        {/* Admins only (ADMIN_EMAILS on the API, #27). */}
        {me.data?.isAdmin ? (
          <Button variant="secondary" label={t`Panel administratora`} onPress={() => router.push('/admin')} />
        ) : null}
        <AboutSection />
        <DeleteAccountSection />
      </PlaceholderScreen>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flexGrow: 1,
  },
  account: {
    alignSelf: 'stretch',
    gap: theme.space(1),
  },
  label: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  email: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
}));
