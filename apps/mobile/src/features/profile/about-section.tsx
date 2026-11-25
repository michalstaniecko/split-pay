import { useLingui } from '@lingui/react/macro';
import Constants from 'expo-constants';
import { openURL } from 'expo-linking';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export const sourceRepositoryUrl = 'https://github.com/michalstaniecko/split-pay';

/**
 * Profile → About: version, licence, source code. Deliberately no sponsor or
 * payment link — those live only on the web and in the README (ADR-0011).
 */
export function AboutSection() {
  const { t } = useLingui();
  const version = Constants.expoConfig?.version ?? '–';

  return (
    <View style={styles.container}>
      <Text style={styles.heading} accessibilityRole="header">{t`O aplikacji`}</Text>
      <Text style={styles.text}>{t`Kwitz, wersja ${version}`}</Text>
      <Text style={styles.text}>{t`Licencja: GNU AGPL v3`}</Text>
      <Text style={styles.link} accessibilityRole="link" onPress={() => void openURL(sourceRepositoryUrl)}>
        {t`Kod źródłowy na GitHubie`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: 'stretch',
    gap: theme.space(1),
  },
  heading: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  text: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  link: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.primary,
    textDecorationLine: 'underline',
    paddingVertical: theme.space(1),
  },
}));
