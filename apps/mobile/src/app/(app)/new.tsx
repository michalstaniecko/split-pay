import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { closeSheet } from '@/lib/close-sheet';

/**
 * "Nowy" sheet from the inbox: a quick bill or a new group (SPEC "Navigation and screens").
 * Signed out both forms create a local group (ADR-0021), so the sheet is the same.
 */
export default function NewSheet() {
  const { t } = useLingui();
  // The sheet gives way to the chosen form instead of stacking under it.
  const open = (href: Href) => router.replace(href);
  return (
    <View style={styles.container}>
      <Option
        emoji="🧾"
        title={t`Szybki rachunek`}
        description={t`Jeden wydatek z kilkoma osobami`}
        onPress={() => open('/quick-bill')}
      />
      <Option
        emoji="👥"
        title={t`Nowa grupa`}
        description={t`Wyjazd, mieszkanie albo inne wspólne wydatki`}
        onPress={() => open('/new-group')}
      />
      <Button variant="secondary" label={t`Anuluj`} onPress={closeSheet} />
    </View>
  );
}

function Option({
  emoji,
  title,
  description,
  onPress,
}: {
  emoji: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.optionText}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    gap: theme.space(3),
    padding: theme.space(4),
    paddingTop: theme.space(6),
    // Clears the home indicator by 8.
    paddingBottom: rt.insets.bottom + theme.space(2),
    backgroundColor: theme.colors.background,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    padding: theme.space(4),
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    opacity: 0.6,
  },
  emoji: {
    fontSize: theme.font.sizeXl,
    lineHeight: theme.font.sizeXl,
  },
  optionText: {
    flex: 1,
    gap: theme.space(1),
  },
  title: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  description: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
