import { useLingui } from '@lingui/react/macro';
import { availableGroupActions, type Entry, isEdited } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Button } from '@/components/button';
import { GroupNotFound } from '@/components/group-not-found';
import { entriesQuery } from '@/features/entries/entries-query';
import { EntryDetailBody } from '@/features/entries/entry-detail-body';
import { editScreen, lockedOffline } from '@/features/entries/entry-edit';
import { type GroupDetail, useGroup } from '@/features/groups/groups-query';
import { addedBy as addedByName } from '@/features/groups/member-name';
import { useIsOnline } from '@/features/offline/use-offline-sync';
import { ReceiptPhoto } from '@/features/photos/receipt-photo';
import { useFormatters } from '@/i18n/use-formatters';
import { authClient } from '@/lib/auth-client';
import { closeSheet } from '@/lib/close-sheet';

/**
 * Entry detail — a read-only sheet opened from a bubble. A foreign-currency
 * entry shows its amount, the base amount and the frozen rate. "Edytuj" (#11)
 * replaces the sheet with the full form in edit mode (the settle sheet for a
 * settlement).
 * "edytowano" opens the entry's change history (#20).
 * The receipt photo (#26) opens a full-screen viewer.
 * A local group (ADR-0021) has neither: "edytowano" is plain text there.
 */
export default function EntryDetailSheet() {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId: string }>();
  const group = useGroup(groupId);
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
  const format = useFormatters();
  const name = (memberId: string) => group.members.find((m) => m.id === memberId)?.displayName ?? '?';
  const addedBy = addedByName(entry, group.members) ?? t`nieznana osoba`;
  const online = useIsOnline();
  const userId = authClient.useSession().data?.user.id;
  // Offline, only entries I added can be edited (ADR-0005).
  const locked = lockedOffline(entry, { offline: !online, userId });
  const actions = availableGroupActions(group);
  const edited = t`edytowano ${format.dateTime(entry.updatedAt)}`;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <EntryDetailBody
        entry={entry}
        baseCurrency={group.baseCurrency}
        memberName={name}
        receiptPhoto={
          actions.receiptPhotos && entry.kind !== 'settlement' && entry.receiptPhotoId !== null ? (
            <ReceiptPhoto groupId={group.id} entryId={entry.id} />
          ) : null
        }
      />
      <Text style={styles.meta}>{t`Dodano: ${addedBy}, ${format.dateTime(entry.createdAt)}`}</Text>
      {isEdited(entry) && !actions.changeHistory ? <Text style={styles.meta}>{edited}</Text> : null}
      {isEdited(entry) && actions.changeHistory ? (
        <Pressable
          accessibilityRole="link"
          accessibilityHint={t`Otwiera historię wpisu`}
          onPress={() =>
            router.replace({ pathname: '/groups/[groupId]/history', params: { groupId: group.id, entryId: entry.id } })
          }
          style={({ pressed }) => pressed && styles.pressed}>
          <Text style={[styles.meta, styles.link]}>{edited}</Text>
        </Pressable>
      ) : null}
      {group.archivedAt === null && locked ? (
        <Text style={styles.meta}>{t`Bez internetu możesz edytować tylko wpisy dodane przez siebie.`}</Text>
      ) : null}
      {group.archivedAt === null && !locked ? (
        <Button
          label={t`Edytuj`}
          onPress={() => router.replace({ pathname: editScreen(entry), params: { groupId: group.id, entryId: entry.id } })}
        />
      ) : null}
      <Button variant="secondary" label={t`Zamknij`} onPress={closeSheet} />
    </ScrollView>
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
  value: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  meta: {
    paddingTop: theme.space(2),
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  link: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.6,
  },
}));
