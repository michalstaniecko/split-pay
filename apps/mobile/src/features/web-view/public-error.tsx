import { useLingui } from '@lingui/react/macro';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { isInvalidLink } from './public-view-query';
import { WebFooter } from './web-footer';

/**
 * Error state of a view-only web page. An unknown or revoked link gets a
 * friendly "link no longer valid" page; anything else can be retried.
 */
export function PublicError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useLingui();
  const invalid = isInvalidLink(error);
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: invalid ? t`Link nieważny` : t`Błąd` }} />
      <View style={styles.center}>
        <Text style={styles.icon}>{invalid ? '🔗' : '⚠️'}</Text>
        <Text style={styles.title}>
          {invalid ? t`Ten link grupy jest już nieważny` : t`Nie udało się wczytać grupy.`}
        </Text>
        {invalid ? (
          <Text style={styles.text}>{t`Grupa ma już nowy link. Poproś kogoś z grupy o aktualny.`}</Text>
        ) : (
          <Button variant="secondary" label={t`Spróbuj ponownie`} onPress={onRetry} />
        )}
      </View>
      <WebFooter />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(3),
    padding: theme.space(6),
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  text: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
}));
