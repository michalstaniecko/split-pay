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
  type LocalGroupField,
  type NewGroupDraft,
  type NewGroupField,
  type PersonDraft,
  parseLocalGroupDraft,
  parseNewGroupDraft,
} from '@/features/groups/new-group-form';
import { deviceMemberName } from '@/features/offline/device-member-name';
import { LocalDataNotice } from '@/features/offline/local-data-notice';
import { authClient } from '@/lib/auth-client';
import { closeSheet } from '@/lib/close-sheet';

const newPerson = (): PersonDraft => ({ id: randomUUID(), name: '' });

/**
 * Create-group form: name, emoji/colour, base currency, optional dates (a trip).
 * Signed out it creates a local group (ADR-0021): no dates, but the device
 * member ("Ja": asked on the first local group on this device, then reused)
 * and the other people typed in by hand.
 */
export default function NewGroupScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const local = !authClient.useSession().data;
  // One id per form: a retry after a lost response cannot create a second group.
  const [id] = useState(() => randomUUID());
  const [draft, setDraft] = useState<NewGroupDraft>(initialNewGroupDraft);
  const [errors, setErrors] = useState<(NewGroupField | LocalGroupField)[]>([]);
  // Local group: only the first one on this device asks for my name and shows the data notice.
  const [storedName] = useState(deviceMemberName.get);
  const [me, setMe] = useState<PersonDraft>(() => ({ id: randomUUID(), name: storedName ?? '' }));
  const [people, setPeople] = useState<PersonDraft[]>(() => [newPerson()]);
  const createGroup = useCreateGroup();

  const update = (patch: Partial<NewGroupDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((current) => current.filter((field) => !(field in patch)));
  };
  const updatePerson = (personId: string, name: string) => {
    setPeople((current) => current.map((p) => (p.id === personId ? { ...p, name } : p)));
    setErrors((current) => current.filter((field) => field !== 'people'));
  };

  const opened = () => {
    closeSheet();
    router.push({ pathname: '/groups/[groupId]', params: { groupId: id } });
  };

  const submit = () => {
    if (local) {
      const parsed = parseLocalGroupDraft(draft, id, me, people);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      createGroup.mutate(parsed.value, {
        onSuccess: () => {
          if (storedName === null) deviceMemberName.remember(parsed.value.deviceMember.displayName);
          opened();
        },
      });
      return;
    }
    const parsed = parseNewGroupDraft(draft, id);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    createGroup.mutate(parsed.value, { onSuccess: opened });
  };

  const fieldError: Record<NewGroupField | LocalGroupField, string> = {
    name: t`Podaj nazwę grupy.`,
    emoji: t`Wybierz emoji.`,
    color: t`Wybierz kolor.`,
    baseCurrency: t`Wybierz walutę.`,
    startDate: t`Podaj datę początku w formacie RRRR-MM-DD.`,
    endDate: t`Podaj datę końca (RRRR-MM-DD), nie wcześniejszą niż początek.`,
    deviceMember: t`Podaj swoje imię.`,
    people: t`Imię może mieć najwyżej 60 znaków.`,
  };
  const errorFor = (field: NewGroupField | LocalGroupField) =>
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

        {local ? (
          <>
            {/* My name is asked once per device; later local groups use the stored one. */}
            {storedName === null ? (
              <View style={styles.field}>
                <Text style={styles.label}>{t`Twoje imię`}</Text>
                <TextInput
                  value={me.name}
                  onChangeText={(name) => {
                    setMe((m) => ({ ...m, name }));
                    setErrors((current) => current.filter((field) => field !== 'deviceMember'));
                  }}
                  placeholder={t`np. Kasia`}
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={60}
                  accessibilityLabel={t`Twoje imię`}
                  style={[styles.input, errors.includes('deviceMember') && styles.inputInvalid]}
                />
                {errorFor('deviceMember')}
              </View>
            ) : null}
            <View style={styles.field}>
              <Text style={styles.label}>{t`Pozostałe osoby`}</Text>
              {people.map((person, index) => (
                <TextInput
                  key={person.id}
                  value={person.name}
                  onChangeText={(name) => updatePerson(person.id, name)}
                  placeholder={t`Imię`}
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={60}
                  accessibilityLabel={t`Osoba ${index + 1}`}
                  style={styles.input}
                />
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => setPeople((current) => [...current, newPerson()])}
                style={styles.addPerson}>
                <Text style={styles.addPersonLabel}>{t`+ Dodaj osobę`}</Text>
              </Pressable>
              {errorFor('people')}
            </View>
            {storedName === null ? <LocalDataNotice /> : null}
          </>
        ) : (
          <>
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
          </>
        )}

        {createGroup.isError ? (
          <Text style={styles.error}>{t`Nie udało się utworzyć grupy. Spróbuj ponownie.`}</Text>
        ) : null}

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
  addPerson: {
    minHeight: 44,
    justifyContent: 'center',
  },
  addPersonLabel: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
}));
