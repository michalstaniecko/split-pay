import { useLingui } from '@lingui/react/macro';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { entryKeys } from '@/features/entries/entries-query';
import { entryConflicts } from '@/features/entries/entry-conflicts';
import { isEditableInForm } from '@/features/entries/entry-edit';
import { useFormatters } from '@/i18n/use-formatters';
import { closeSheet } from '@/lib/close-sheet';

/**
 * Opened from a bubble's red "!" (#11): someone changed the entry before my
 * change reached the server, so mine was not saved (ADR-0005). Explains it,
 * shows the current version and reloads the entry; "Wczytaj i edytuj" reopens
 * the form on the current version. Full "keep my / their version" comes with
 * offline (#23).
 */
export default function EntryConflictSheet() {
  const { t } = useLingui();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId: string }>();
  // Read once: resolving the conflict below must not blank the sheet while it closes.
  const [conflict] = useState(() => entryConflicts.get(groupId, entryId));
  const [reloading, setReloading] = useState(false);

  const reload = async (thenEdit: boolean) => {
    setReloading(true);
    try {
      await queryClient.invalidateQueries({ queryKey: entryKeys.list(groupId) });
    } finally {
      setReloading(false);
    }
    entryConflicts.resolve(groupId, entryId);
    if (thenEdit) router.replace({ pathname: '/groups/[groupId]/expense-form', params: { groupId, entryId } });
    else closeSheet();
  };

  if (!conflict) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>{t`Ten konflikt jest już rozwiązany.`}</Text>
        <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
      </ScrollView>
    );
  }

  const { current, change } = conflict;
  const deleted = current.deletedAt !== null;
  const title = current.kind === 'settlement' ? t`Spłata` : current.title;
  const notSaved = {
    edit: t`Twoje zmiany nie zostały zapisane.`,
    delete: t`Wpis nie został usunięty.`,
    restore: t`Wpis nie został przywrócony.`,
  }[change];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">
        {t`Ktoś zmienił ten wpis w międzyczasie`}
      </Text>
      <Text style={styles.body}>
        {t`Zanim twoja zmiana dotarła na serwer, ktoś inny zmienił ten wpis.`} {notSaved}
      </Text>
      <Text style={styles.label}>{t`Aktualna wersja`}</Text>
      <Text style={styles.body}>
        {deleted
          ? t`${title} — usunięty`
          : `${title} · ${format.amount(current.amount, current.currency)} · ${format.date(current.date)}`}
      </Text>
      <Text style={styles.muted}>{t`Zmieniono ${format.dateTime(current.updatedAt)}`}</Text>
      <Button label={t`Wczytaj ponownie`} onPress={() => void reload(false)} loading={reloading} />
      {!deleted && isEditableInForm(current) ? (
        <Button variant="secondary" label={t`Wczytaj i edytuj`} onPress={() => void reload(true)} disabled={reloading} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.space(3),
    padding: theme.space(4),
    paddingTop: theme.space(6),
    paddingBottom: theme.space(10),
    backgroundColor: theme.colors.background,
  },
  heading: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  label: {
    paddingTop: theme.space(2),
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  body: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
