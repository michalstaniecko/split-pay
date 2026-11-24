import { useLingui } from '@lingui/react/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { DeleteAccountSection } from '@/features/profile/delete-account-section';
import { meQuery } from '@/features/profile/me-query';
import { authClient } from '@/lib/auth-client';

/**
 * "Konto zablokowane" (#48, ADR-0019): the only screen of a blocked account.
 * Moderation sends no notifications, so this is how the user learns about the
 * block. The single action is account deletion (both choices), plus signing out.
 */
export default function BlockedAccountScreen() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const me = useQuery(meQuery());
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    queryClient.clear();
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {t`Konto zablokowane`}
        </Text>
        <Text style={styles.body}>
          {t`To konto zostało zablokowane za naruszenie zasad. Nie masz już dostępu do grup, ale możesz usunąć konto.`}
        </Text>
        {me.data?.email ? (
          <Text style={styles.email} selectable>
            {me.data.email}
          </Text>
        ) : null}
        <DeleteAccountSection />
        <Button variant="secondary" label={t`Wyloguj się`} onPress={() => void signOut()} loading={signingOut} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flexGrow: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.space(3),
    paddingTop: rt.insets.top + theme.space(6),
    paddingBottom: rt.insets.bottom + theme.space(6),
    paddingHorizontal: theme.space(6),
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  body: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  email: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
