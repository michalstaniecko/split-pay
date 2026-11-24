import { useLingui } from '@lingui/react/macro';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupAvatar } from '@/components/group-avatar';
import { useCreateGroup } from '@/features/groups/groups-query';
import {
  BASE_CURRENCIES,
  GROUP_COLORS,
  GROUP_EMOJIS,
  initialNewGroupDraft,
  type NewGroupDraft,
  type NewGroupField,
  parseNewGroupDraft,
} from '@/features/groups/new-group-form';
import { closeSheet } from '@/lib/close-sheet';

/** Create-group form: name, emoji/colour, base currency, optional dates (a trip). */
export default function NewGroupScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  // One id per form: a retry after a lost response cannot create a second group.
  const [id] = useState(() => randomUUID());
  const [draft, setDraft] = useState<NewGroupDraft>(initialNewGroupDraft);
  const [errors, setErrors] = useState<NewGroupField[]>([]);
  const createGroup = useCreateGroup();

  const update = (patch: Partial<NewGroupDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((current) => current.filter((field) => !(field in patch)));
  };

  const submit = () => {
    const parsed = parseNewGroupDraft(draft, id);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    createGroup.mutate(parsed.value, {
      onSuccess: (group) => {
        closeSheet();
        router.push({ pathname: '/groups/[groupId]', params: { groupId: group.id } });
      },
    });
  };

  const fieldError: Record<NewGroupField, string> = {
    name: t`Podaj nazwę grupy.`,
    emoji: t`Wybierz emoji.`,
    color: t`Wybierz kolor.`,
    baseCurrency: t`Wybierz walutę.`,
    startDate: t`Podaj datę początku w formacie RRRR-MM-DD.`,
    endDate: t`Podaj datę końca (RRRR-MM-DD), nie wcześniejszą niż początek.`,
  };
  const errorFor = (field: NewGroupField) =>
    errors.includes(field) ? <Text style={styles.error}>{fieldError[field]}</Text> : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          <GroupAvatar emoji={draft.emoji} color={draft.color} size={64} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t`Nazwa`}</Text>
          <TextInput
            value={draft.name}
            onChangeText={(name) => update({ name })}
            placeholder={t`np. Mazury 2026`}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={80}
            autoFocus
            returnKeyType="done"
            style={[styles.input, errors.includes('name') && styles.inputInvalid]}
          />
          {errorFor('name')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t`Emoji`}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {GROUP_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="radio"
                accessibilityLabel={emoji}
                accessibilityState={{ checked: draft.emoji === emoji }}
                onPress={() => update({ emoji })}
                style={[styles.emojiChip, draft.emoji === emoji && styles.chipSelected]}>
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t`Kolor`}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {GROUP_COLORS.map((color) => (
              <Pressable
                key={color}
                accessibilityRole="radio"
                accessibilityLabel={color}
                accessibilityState={{ checked: draft.color === color }}
                onPress={() => update({ color })}
                style={[styles.colorChip, { backgroundColor: color }, draft.color === color && styles.colorSelected]}
              />
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t`Waluta bazowa`}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {BASE_CURRENCIES.map((currency) => (
              <Pressable
                key={currency}
                accessibilityRole="radio"
                accessibilityState={{ checked: draft.baseCurrency === currency }}
                onPress={() => update({ baseCurrency: currency })}
                style={[styles.textChip, draft.baseCurrency === currency && styles.chipSelected]}>
                <Text style={styles.chipLabel}>{currency}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.switchLabel}>{t`Wyjazd z datami`}</Text>
            <Text style={styles.hint}>{t`Daty pozwalają dzielić koszty według obecności.`}</Text>
          </View>
          <Switch
            value={draft.hasDates}
            onValueChange={(hasDates) => update({ hasDates, startDate: draft.startDate, endDate: draft.endDate })}
            accessibilityLabel={t`Wyjazd z datami`}
          />
        </View>

        {draft.hasDates ? (
          // TODO: native date pickers; typed ISO dates keep the form working on every platform for now.
          <View style={styles.dates}>
            <View style={[styles.field, styles.flex]}>
              <Text style={styles.label}>{t`Od`}</Text>
              <TextInput
                value={draft.startDate}
                onChangeText={(startDate) => update({ startDate })}
                placeholder={t`RRRR-MM-DD`}
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                style={[styles.input, errors.includes('startDate') && styles.inputInvalid]}
              />
              {errorFor('startDate')}
            </View>
            <View style={[styles.field, styles.flex]}>
              <Text style={styles.label}>{t`Do`}</Text>
              <TextInput
                value={draft.endDate}
                onChangeText={(endDate) => update({ endDate })}
                placeholder={t`RRRR-MM-DD`}
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                style={[styles.input, errors.includes('endDate') && styles.inputInvalid]}
              />
              {errorFor('endDate')}
            </View>
          </View>
        ) : null}

        {createGroup.isError ? <Text style={styles.error}>{t`Nie udało się utworzyć grupy. Spróbuj ponownie.`}</Text> : null}

        <Button label={t`Utwórz grupę`} onPress={submit} loading={createGroup.isPending} />
        <Button variant="secondary" label={t`Anuluj`} onPress={closeSheet} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: {
    flex: 1,
  },
  content: {
    gap: theme.space(5),
    padding: theme.space(4),
    paddingBottom: theme.space(10),
    backgroundColor: theme.colors.background,
  },
  preview: {
    alignItems: 'center',
  },
  field: {
    gap: theme.space(2),
  },
  label: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontSize: theme.font.sizeMd,
    textAlign: 'auto',
  },
  inputInvalid: {
    borderColor: theme.colors.negative,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space(2),
  },
  emojiChip: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: theme.colors.surface,
  },
  emoji: {
    fontSize: theme.font.sizeLg,
  },
  colorChip: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.pill,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: theme.colors.text,
  },
  textChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
  },
  chipLabel: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
  },
  switchLabel: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  hint: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  dates: {
    flexDirection: 'row',
    gap: theme.space(3),
  },
}));
