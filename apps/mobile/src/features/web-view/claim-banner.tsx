import { useLingui } from '@lingui/react/macro';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { openDownloadApp } from './web-footer';

/**
 * Top of the view-only web opened from a personal claim link (SPEC "Members
 * without an account, invitations, sharing"): names the member the link was
 * made for and asks them to claim the profile in the app.
 */
export function ClaimBanner({ displayName }: { displayName: string }) {
  const { t } = useLingui();
  return (
    <View style={styles.banner} accessibilityRole="summary">
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.prompt}>{t`To Twój profil — przejmij go w aplikacji`}</Text>
      </View>
      <Button label={t`Pobierz aplikację`} onPress={openDownloadApp} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  banner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space(3),
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  text: {
    flex: 1,
    minWidth: 180,
    gap: theme.space(1),
  },
  name: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  prompt: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
}));
