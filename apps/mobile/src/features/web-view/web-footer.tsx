import { useLingui } from '@lingui/react/macro';
import { openURL } from 'expo-linking';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { sourceRepositoryUrl } from '@/features/profile/about-section';
import { SponsorLink } from './sponsor-link';
import { downloadAppUrl, openInAppUrl } from './web-view';

/** Store listings, inlined at build time; unset until the app is published. */
const storeLinks = {
  appStore: process.env.EXPO_PUBLIC_APP_STORE_URL,
  playStore: process.env.EXPO_PUBLIC_PLAY_STORE_URL,
  fallback: sourceRepositoryUrl,
};

/** Opens the store of the visitor's phone (or the fallback page). */
export function openDownloadApp() {
  void openURL(downloadAppUrl(globalThis.navigator?.userAgent ?? '', storeLinks));
}

/**
 * Bottom of the view-only web (where the app has its composer): "download the
 * app", "open in the app" for this link, and the GitHub Sponsors link.
 */
export function WebFooter({ token }: { token?: string }) {
  const { t } = useLingui();
  return (
    <View style={styles.footer}>
      <Text style={styles.text}>{t`To podgląd tylko do odczytu. Dodawaj wydatki w aplikacji.`}</Text>
      <View style={styles.actions}>
        <Button label={t`Pobierz aplikację`} onPress={openDownloadApp} />
        {token ? (
          <Button
            variant="secondary"
            label={t`Otwórz w aplikacji`}
            onPress={() => void openURL(openInAppUrl(token))}
          />
        ) : null}
      </View>
      <SponsorLink />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: {
    gap: theme.space(2),
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  text: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.space(2),
  },
}));
