import { useLingui } from '@lingui/react/macro';
import { openURL } from 'expo-linking';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** The project's GitHub Sponsors page (ADR-0011: web and README only). */
const sponsorsUrl = 'https://github.com/sponsors/michalstaniecko';

/** Web footer link to GitHub Sponsors. The native build renders nothing (`sponsor-link.tsx`). */
export function SponsorLink() {
  const { t } = useLingui();
  return (
    <Text style={styles.link} accessibilityRole="link" onPress={() => void openURL(sponsorsUrl)}>
      {t`Wesprzyj Kwitz na GitHub Sponsors`}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  link: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.primary,
    textDecorationLine: 'underline',
    textAlign: 'center',
    paddingVertical: theme.space(1),
  },
}));
