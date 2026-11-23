import { useLingui } from '@lingui/react/macro';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useIsOnline } from './use-offline-sync';

/** Offline indicator (ADR-0005): a strip saying what still works; nothing while online. */
export function OfflineBanner() {
  const { t } = useLingui();
  const online = useIsOnline();
  if (online) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text}>{t`Jesteś offline. Nowe wpisy wyślemy po połączeniu.`}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  banner: {
    paddingVertical: theme.space(1),
    paddingHorizontal: theme.space(4),
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  text: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
}));
