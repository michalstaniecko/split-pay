import { useLingui } from '@lingui/react/macro';
import type { ThemeFamily } from '@split-pay/ui';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { ThemeSchemePreference } from './theme-preference';
import { setThemePreference, useThemePreference } from './theme-store';

// Theme family names are product names, so they are not translated.
const families: { value: ThemeFamily; label: string }[] = [
  { value: 'fresh', label: 'Fresh' },
  { value: 'classic', label: 'Classic' },
];

/** Profile: theme family (Fresh/Classic) and light/dark/system. */
export function ThemePicker() {
  const { t } = useLingui();
  const preference = useThemePreference();
  const schemes: { value: ThemeSchemePreference; label: string }[] = [
    { value: 'system', label: t`Systemowy` },
    { value: 'light', label: t`Jasny` },
    { value: 'dark', label: t`Ciemny` },
  ];

  return (
    <View style={styles.container}>
      <Options
        label={t`Motyw`}
        options={families}
        selected={preference.family}
        onSelect={(family) => setThemePreference({ ...preference, family })}
      />
      <Options
        label={t`Tryb jasny/ciemny`}
        options={schemes}
        selected={preference.scheme}
        onSelect={(scheme) => setThemePreference({ ...preference, scheme })}
      />
    </View>
  );
}

function Options<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.heading}>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              onPress={() => onSelect(option.value)}
              style={[styles.option, isSelected && styles.optionSelected]}>
              <Text style={[styles.label, isSelected && styles.labelSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: 'stretch',
    gap: theme.space(3),
  },
  group: {
    gap: theme.space(2),
  },
  heading: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space(2),
  },
  option: {
    flexGrow: 1,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
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
