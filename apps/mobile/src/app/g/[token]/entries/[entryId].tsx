import { useLingui } from '@lingui/react/macro';
import { isEdited } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { EntryDetailBody } from '@/features/entries/entry-detail-body';
import { addedBy as addedByName } from '@/features/groups/member-name';
import { closePublicPage } from '@/features/web-view/navigation';
import { PublicError } from '@/features/web-view/public-error';
import {
  type PublicEntry,
  type PublicGroup,
  publicEntriesQuery,
  usePublicGroup,
} from '@/features/web-view/public-view-query';
import { useFormatters } from '@/i18n/use-formatters';

/**
 * Entry detail of the view-only web: the app's entry sheet without the
 * receipt photo, the change history link and "Edytuj" (SPEC "Web interface").
 */
export default function PublicEntryDetailScreen() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { token, entryId } = useLocalSearchParams<{ token: string; entryId: string }>();
  const group = usePublicGroup(token);
  const entries = useQuery(publicEntriesQuery(token));

  if (group.isError) return <PublicError error={group.error} onRetry={() => void group.refetch()} />;
  if (entries.isError) return <PublicError error={entries.error} onRetry={() => void entries.refetch()} />;
  if (group.isPending || entries.isPending) {
    return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  }
  const entry = entries.data.find((e) => e.id === entryId);
  if (!entry) {
    return (
      <View style={styles.content}>
        <Text style={styles.value}>{t`Tego wpisu już nie ma.`}</Text>
        <Button variant="secondary" label={t`Zamknij`} onPress={() => closePublicPage(token)} />
      </View>
    );
  }
  return <EntryDetail token={token} data={group.data} entry={entry} />;
}

function EntryDetail({ token, data, entry }: { token: string; data: PublicGroup; entry: PublicEntry }) {
  const { t } = useLingui();
  const format = useFormatters();
  const name = (memberId: string | null) => data.members.find((m) => m.id === memberId)?.displayName;
  const addedBy = addedByName(entry, data.members) ?? t`nieznana osoba`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <EntryDetailBody entry={entry} baseCurrency={data.group.baseCurrency} memberName={(id) => name(id) ?? '?'} />
      <Text style={styles.meta}>{t`Dodał(a) ${addedBy}, ${format.dateTime(entry.createdAt)}`}</Text>
      {isEdited(entry) ? <Text style={styles.meta}>{t`edytowano ${format.dateTime(entry.updatedAt)}`}</Text> : null}
      <Button variant="secondary" label={t`Zamknij`} onPress={() => closePublicPage(token)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    padding: theme.space(6),
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space(3),
    padding: theme.space(4),
    paddingTop: theme.space(6),
    paddingBottom: theme.space(10),
    backgroundColor: theme.colors.background,
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
