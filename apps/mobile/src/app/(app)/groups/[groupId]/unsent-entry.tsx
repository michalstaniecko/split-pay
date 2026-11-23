import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { entriesQuery } from '@/features/entries/entries-query';
import type { OutboxEntryState } from '@/features/offline/outbox';
import { outboxQuery, useDiscardOutbox, useRetryOutbox } from '@/features/offline/outbox-query';
import { useFormatters } from '@/i18n/use-formatters';
import { closeSheet } from '@/lib/close-sheet';

/**
 * Opened from a bubble's red "!" when the server refused a change from the
 * outbox for good (ADR-0005): says why and offers "Spróbuj ponownie" (send
 * again) or dropping it — an unsent new entry then leaves this device.
 */
export default function UnsentEntrySheet() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const format = useFormatters();
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId: string }>();
  const outbox = useQuery(outboxQuery(groupId));
  const entries = useQuery(entriesQuery(groupId));
  const retry = useRetryOutbox(groupId);
  const discard = useDiscardOutbox(groupId);
  // Kept once seen: retrying or discarding must not blank the sheet while it closes.
  const [seen, setSeen] = useState<OutboxEntryState | undefined>();
  const state = seen ?? outbox.data?.get(entryId);
  if (state && !seen) setSeen(state);

  if (outbox.isPending) return <ActivityIndicator style={styles.content} color={theme.colors.primary} />;
  if (!state || state.status !== 'failed') {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>{t`Ten wpis nie czeka już na wysłanie.`}</Text>
        <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
      </ScrollView>
    );
  }

  const entry = entries.data?.find((e) => e.id === entryId);
  const title = entry ? (entry.kind === 'settlement' ? t`Spłata` : entry.title) : null;
  const reason =
    state.error === 'archived'
      ? t`Grupa została zarchiwizowana — nie można już w niej nic zmieniać.`
      : state.error === 'invalid_entry'
      ? t`Serwer odrzucił wpis jako niepoprawny — na przykład ktoś z uczestników opuścił grupę.`
      : state.error === 'not_found'
        ? t`Grupa albo wpis już nie istnieje lub nie masz do nich dostępu.`
        : state.error === 'conflict'
          ? t`Wpis o tym identyfikatorze już istnieje w innej grupie.`
          : t`Serwer odrzucił wpis.`;
  const created = state.change === 'create';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">
        {created ? t`Nie udało się dodać wpisu` : t`Nie udało się zapisać zmiany`}
      </Text>
      {entry ? (
        <Text style={styles.body}>{`${title} · ${format.amount(entry.amount, entry.currency)} · ${format.date(entry.date)}`}</Text>
      ) : null}
      <Text style={styles.muted}>{reason}</Text>
      <Button
        label={t`Spróbuj ponownie`}
        loading={retry.isPending}
        disabled={discard.isPending}
        onPress={() => retry.mutate(entryId, { onSettled: closeSheet })}
      />
      <Button
        variant="secondary"
        label={created ? t`Usuń wpis` : t`Odrzuć zmianę`}
        loading={discard.isPending}
        disabled={retry.isPending}
        onPress={() => discard.mutate(entryId, { onSuccess: closeSheet })}
      />
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
  body: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
