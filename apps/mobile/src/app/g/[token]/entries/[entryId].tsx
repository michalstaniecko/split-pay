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
import { WebFooter } from '@/features/web-view/web-footer';
import { useFormatters } from '@/i18n/use-formatters';

/**
 * Entry detail of the view-only web: the app's entry sheet without the
 * receipt photo, the change history link and "Edytuj" (SPEC "Web interface"),
 * in the group preview's centred column.
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
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          {entry ? (
            <EntryDetail data={group.data} entry={entry} />
          ) : (
            <Text style={styles.value}>{t`Tego wpisu już nie ma.`}</Text>
          )}
          <Button variant="secondary" label={t`Zamknij`} onPress={() => closePublicPage(token)} />
        </View>
      </ScrollView>
      <WebFooter token={token} />
    </View>
  );
}

function EntryDetail({ data, entry }: { data: PublicGroup; entry: PublicEntry }) {
  const { t } = useLingui();
  const format = useFormatters();
  const name = (memberId: string | null) => data.members.find((m) => m.id === memberId)?.displayName;
  const addedBy = addedByName(entry, data.members) ?? t`nieznana osoba`;

  return (
    <>
      <View style={styles.card}>
        <EntryDetailBody entry={entry} baseCurrency={data.group.baseCurrency} memberName={(id) => name(id) ?? '?'} />
      </View>
      <View style={styles.metaBlock}>
        <Text style={styles.meta}>{t`Dodano: ${addedBy}, ${format.dateTime(entry.createdAt)}`}</Text>
        {isEdited(entry) ? <Text style={styles.meta}>{t`edytowano ${format.dateTime(entry.updatedAt)}`}</Text> : null}
      </View>
    </>
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
  scroll: {
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(6),
  },
  // Narrower than the group preview's column: label and amount stay close enough to read as a pair.
  column: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: theme.space(4),
  },
  card: {
    gap: theme.space(3),
    padding: theme.space(5),
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  metaBlock: {
    gap: theme.space(1),
    paddingHorizontal: theme.space(1),
  },
  value: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  meta: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
