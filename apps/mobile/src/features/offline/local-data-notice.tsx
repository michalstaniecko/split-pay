import { useLingui } from '@lingui/react/macro';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/**
 * "Dane są tylko na tym telefonie" (ADR-0021): a local group is lost with the
 * app or the phone. Shown when the first local group is created and in Group info.
 */
export function LocalDataNotice() {
  const { t } = useLingui();
  return (
    <View style={styles.notice} accessible accessibilityRole="text">
      <Text style={styles.title}>{t`Dane są tylko na tym telefonie`}</Text>
      <Text style={styles.body}>
        {t`Grupa lokalna nie trafia na serwer. Odinstalowanie aplikacji albo zmiana telefonu usuwa jej dane.`}
      </Text>
    </View>
  );
}

/** The inbox badge of a local group. */
export function LocalGroupBadge() {
  const { t } = useLingui();
  return <Text style={styles.badge}>{t`Tylko na tym telefonie`}</Text>;
}

const styles = StyleSheet.create((theme) => ({
  notice: {
    gap: theme.space(1),
    padding: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  title: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  body: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.space(2),
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    backgroundColor: theme.colors.surface,
  },
}));
