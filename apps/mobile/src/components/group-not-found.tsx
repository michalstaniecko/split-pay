import { useLingui } from '@lingui/react/macro';
import { DetailedError } from 'hono/client';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from './button';

/** Error state of a group screen: 404 = not a member (or no such group), anything else = retry. */
export function GroupNotFound({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useLingui();
  const notFound = error instanceof DetailedError && error.statusCode === 404;
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {notFound ? t`Ta grupa nie istnieje albo nie masz do niej dostępu.` : t`Nie udało się wczytać grupy.`}
      </Text>
      {notFound ? null : <Button variant="secondary" label={t`Spróbuj ponownie`} onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(3),
    padding: theme.space(6),
  },
  text: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
}));
