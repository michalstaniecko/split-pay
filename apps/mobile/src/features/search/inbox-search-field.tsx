import { useLingui } from '@lingui/react/macro';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/** The inbox's search field ("Szukaj grup i wydatków", SPEC "Inbox"). */
export function InboxSearchField({ value, onChange }: { value: string; onChange: (query: string) => void }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  return (
    <View style={styles.container}>
      <SearchIcon color={theme.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t`Szukaj grup i wydatków`}
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel={t`Szukaj grup i wydatków`}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        style={styles.input}
      />
      {value !== '' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t`Wyczyść wyszukiwanie`}
          hitSlop={8}
          onPress={() => onChange('')}
          style={styles.clear}>
          <Text style={styles.clearText}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Magnifier at the start of the field; decorative, the input carries the label. */
function SearchIcon({ color }: { color: string }) {
  return (
    <Svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    marginHorizontal: theme.space(4),
    marginVertical: theme.space(2),
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    color: theme.colors.text,
    fontSize: theme.font.sizeMd,
    textAlign: 'auto',
  },
  clear: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
  },
}));
