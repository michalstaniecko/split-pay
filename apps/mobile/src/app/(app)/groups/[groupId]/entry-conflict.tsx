import { useLingui } from '@lingui/react/macro';
import type { Entry, NewEntry } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { editScreen } from '@/features/entries/entry-edit';
import { conflictQuery, useKeepMine, useKeepTheirs } from '@/features/offline/conflict-query';
import type { ConflictVersions } from '@/features/offline/offline-changes';
import { useFormatters } from '@/i18n/use-formatters';
import { closeSheet } from '@/lib/close-sheet';

/**
 * Opened from a bubble's red "!" when someone changed the entry before my
 * change reached the server (ADR-0005, #11 online / #23 offline). Shows both
 * versions; "Zachowaj moją wersję" resubmits mine against the current version,
 * "Zachowaj ich wersję" drops mine ("…i edytuj" then opens the form on theirs).
 * The conflict is outbox state on the device (#22).
 */
export default function EntryConflictSheet() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId: string }>();
  const query = useQuery(conflictQuery(groupId, entryId));
  const keepMine = useKeepMine(groupId);
  const keepTheirs = useKeepTheirs(groupId);
  // Kept once seen: resolving the conflict below must not blank the sheet while it closes.
  const [seen, setSeen] = useState<ConflictVersions | undefined>();
  const conflict = seen ?? query.data ?? undefined;
  if (conflict && !seen) setSeen(conflict);
  const busy = keepMine.isPending || keepTheirs.isPending;

  if (!conflict && query.isPending) {
    return <ActivityIndicator style={styles.content} color={theme.colors.primary} />;
  }
  if (!conflict) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>{t`Ten konflikt jest już rozwiązany.`}</Text>
        <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
      </ScrollView>
    );
  }

  const { current, change, mine } = conflict;
  const theirsDeleted = current.deletedAt !== null;
  const notSaved = {
    create: t`Wpis nie został dodany.`,
    edit: t`Twoje zmiany nie zostały zapisane.`,
    delete: t`Wpis nie został usunięty.`,
    restore: t`Wpis nie został przywrócony.`,
  }[change];
  const myChange =
    change === 'delete' ? t`Usunięcie wpisu` : change === 'restore' ? t`Przywrócenie wpisu` : null;

  const resolveTheirs = (thenEdit: boolean) =>
    keepTheirs.mutate(entryId, {
      onSuccess: () => {
        if (thenEdit) router.replace({ pathname: editScreen(current), params: { groupId, entryId } });
        else closeSheet();
      },
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">
        {t`Ten wpis zmienił się w międzyczasie`}
      </Text>
      <Text style={styles.body}>
        {t`Zanim Twoja zmiana dotarła na serwer, ten wpis został zmieniony.`} {notSaved}{' '}
        {t`Wybierz, która wersja zostaje.`}
      </Text>
      <View style={styles.version} accessible>
        <Text style={styles.label}>{t`Twoja wersja`}</Text>
        <Text style={styles.body}>{myChange ?? (mine ? <Summary entry={mine} /> : null)}</Text>
      </View>
      <View style={styles.version} accessible>
        <Text style={styles.label}>{t`Ich wersja`}</Text>
        <Text style={styles.body}>
          <Summary entry={current} />
          {theirsDeleted ? ` — ${t`usunięty`}` : ''}
        </Text>
        <ChangedAt entry={current} />
      </View>
      <Button
        label={t`Zachowaj moją wersję`}
        onPress={() => keepMine.mutate(entryId, { onSuccess: closeSheet })}
        loading={keepMine.isPending}
        disabled={busy}
      />
      <Button
        variant="secondary"
        label={t`Zachowaj ich wersję`}
        onPress={() => resolveTheirs(false)}
        loading={keepTheirs.isPending}
        disabled={busy}
      />
      {!theirsDeleted ? (
        <Button variant="secondary" label={t`Zachowaj ich wersję i edytuj`} onPress={() => resolveTheirs(true)} disabled={busy} />
      ) : null}
    </ScrollView>
  );
}

/** "Pizza · 120,00 zł · 12 lip 2026" (a settlement: "Spłata · …"). */
function Summary({ entry }: { entry: NewEntry | Entry }) {
  const { t } = useLingui();
  const format = useFormatters();
  const title = entry.kind === 'settlement' ? t`Spłata` : entry.title;
  return <>{`${title} · ${format.amount(entry.amount, entry.currency)} · ${format.date(entry.date)}`}</>;
}

function ChangedAt({ entry }: { entry: Entry }) {
  const { t } = useLingui();
  const format = useFormatters();
  return <Text style={styles.muted}>{t`Zmieniono ${format.dateTime(entry.updatedAt)}`}</Text>;
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
  version: {
    gap: theme.space(1),
    padding: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  label: {
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
