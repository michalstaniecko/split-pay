import { useLingui } from '@lingui/react/macro';
import { type Entry, resolveSplit } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupNotFound } from '@/components/group-not-found';
import { CATEGORY_ICONS, entriesQuery } from '@/features/entries/entries-query';
import { useEntryLabels } from '@/features/entries/use-entry-labels';
import { type GroupDetail, groupQuery } from '@/features/groups/groups-query';
import { useFormatters } from '@/i18n/use-formatters';
import { closeSheet } from '@/lib/close-sheet';

/**
 * Entry detail — a read-only sheet opened from a bubble. Later slices add:
 * the entry currency with base amount and rate (#14), the receipt photo
 * (#26), "edytowano" + history link (#11, #20) and "Edytuj" (#11).
 */
export default function EntryDetailSheet() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId: string }>();
  const group = useQuery(groupQuery(groupId));
  const entries = useQuery(entriesQuery(groupId));

  if (group.isPending || entries.isPending) {
    return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  }
  if (group.isError) return <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />;
  const entry = entries.data?.find((e) => e.id === entryId);
  if (!entry) {
    return (
      <View style={styles.content}>
        <Text style={styles.value}>{t`Tego wpisu już nie ma.`}</Text>
        <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
      </View>
    );
  }
  return <EntryDetail group={group.data} entry={entry} />;
}

function EntryDetail({ group, entry }: { group: GroupDetail; entry: Entry }) {
  const { t } = useLingui();
  const labels = useEntryLabels();
  const format = useFormatters();
  const name = (memberId: string) => group.members.find((m) => m.id === memberId)?.displayName ?? '?';
  const addedBy = group.members.find((m) => m.userId === entry.createdBy)?.displayName ?? t`nieznana osoba`;
  const amount = (minor: number) => format.amount(minor, entry.currency);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {entry.kind === 'settlement' ? (
        <>
          <Text style={styles.heading}>💸 {t`Spłata`}</Text>
          <Row label={t`Kwota`}>{amount(entry.amount)}</Row>
          <Row label={t`Data`}>{format.date(entry.date)}</Row>
          <Row label={t`Od`}>{name(entry.from)}</Row>
          <Row label={t`Do`}>{name(entry.to)}</Row>
        </>
      ) : (
        <>
          <Text style={styles.heading}>
            {CATEGORY_ICONS[entry.category]} {entry.title}
          </Text>
          <Text style={styles.amount}>{amount(entry.amount)}</Text>
          <Row label={t`Kategoria`}>{labels.category[entry.category]}</Row>
          <Row label={t`Data`}>{format.date(entry.date)}</Row>
          <Section title={entry.kind === 'expense' ? t`Zapłacili` : t`Otrzymali`}>
            {(entry.kind === 'expense' ? entry.payers : entry.recipients).map((h) => (
              <Row key={h.memberId} label={name(h.memberId)}>
                {amount(h.amount)}
              </Row>
            ))}
          </Section>
          <Section title={t`Udziały · ${labels.splitMode[entry.split.mode]}`}>
            {resolveSplit(entry.split, entry.amount).map((share) => (
              <Row key={share.memberId} label={name(share.memberId)}>
                {amount(share.amount)}
              </Row>
            ))}
          </Section>
        </>
      )}
      <Text style={styles.meta}>{t`Dodał(a) ${addedBy}, ${format.dateTime(entry.createdAt)}`}</Text>
      <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row} accessible>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    padding: theme.space(6),
  },
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
  amount: {
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  section: {
    gap: theme.space(2),
    paddingTop: theme.space(2),
  },
  sectionTitle: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space(3),
  },
  label: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
  },
  value: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  meta: {
    paddingTop: theme.space(2),
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
