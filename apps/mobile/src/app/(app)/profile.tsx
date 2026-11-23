import { useLingui } from '@lingui/react/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { LanguagePicker } from '@/components/language-picker';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { meQuery } from '@/features/profile/me-query';
import { authClient } from '@/lib/auth-client';

export default function ProfileScreen() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const me = useQuery(meQuery());
  const [signingOut, setSigningOut] = useState(false);
  // The stored session shows the email at once (also offline); the API confirms it.
  const email = me.data?.email ?? session?.user.email;

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    // Nothing from this account may leak into the next one.
    queryClient.clear();
  };

  return (
    <PlaceholderScreen title={t`Profil`}>
      <View style={styles.account}>
        <Text style={styles.label}>{t`Zalogowano jako`}</Text>
        <Text style={styles.email} selectable>
          {email}
        </Text>
      </View>
      <LanguagePicker />
      <Button variant="secondary" label={t`Wyloguj się`} onPress={() => void signOut()} loading={signingOut} />
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create((theme) => ({
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
