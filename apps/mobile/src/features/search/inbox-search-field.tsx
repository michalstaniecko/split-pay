import { useLingui } from '@lingui/react/macro';
import { Pressable, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/** The inbox's search field ("Szukaj grup i wydatków", SPEC "Inbox"). */
export function InboxSearchField({ value, onChange }: { value: string; onChange: (query: string) => void }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  return (
    <View style={styles.container}>
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

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
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
