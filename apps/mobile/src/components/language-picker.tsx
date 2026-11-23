import { useLingui } from '@lingui/react/macro';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useLocale } from '@/i18n/locale-provider';
import type { AppLocale } from '@/i18n/locale';

// Language names are shown in their own language, so they are not translated.
const languages: { value: AppLocale; label: string }[] = [
  { value: 'pl', label: 'Polski' },
  { value: 'en', label: 'English' },
];

export function LanguagePicker() {
  const { t } = useLingui();
  const { preference, setPreference } = useLocale();
  const options: { value: AppLocale | null; label: string }[] = [
    { value: null, label: t`Język systemu` },
    ...languages,
  ];

  return (
    <View style={styles.container} accessibilityRole="radiogroup" accessibilityLabel={t`Język`}>
      <Text style={styles.heading}>{t`Język`}</Text>
      {options.map((option) => {
        const selected = option.value === preference;
        return (
          <Pressable
            key={option.value ?? 'system'}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => setPreference(option.value)}
            style={[styles.option, selected && styles.optionSelected]}>
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: 'stretch',
    gap: theme.space(2),
  },
  heading: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  option: {
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(4),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  optionSelected: {
    borderColor: theme.colors.primary,
  },
  label: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  labelSelected: {
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
}));
