import { useLingui } from '@lingui/react/macro';
import type { Change } from '@split-pay/shared';
import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { myMemberId } from '@/features/entries/conversation';
import { useEntryLabels } from '@/features/entries/use-entry-labels';
import type { GroupDetail } from '@/features/groups/groups-query';
import { useLocale } from '@/i18n/locale-provider';
import { useFormatters } from '@/i18n/use-formatters';
import { authClient } from '@/lib/auth-client';
import { describeChange } from './describe-change';
import { canUndo, type UndoFailure, undoFailure, undoLosesAccess } from './history';
import { useUndoChange } from './history-query';

/**
 * One change in the change history (#20): what happened (with "before →
 * after" lines for edits), who and when, and "Cofnij" while it can be undone
 * (confirmed first; the undo is itself a new row on top).
 */
export function ChangeRow({ group, change }: { group: GroupDetail; change: Change }) {
  const { t } = useLingui();
  const { locale } = useLocale();
  const format = useFormatters();
  const labels = useEntryLabels();
  const undo = useUndoChange(group.id);
  const { data: session } = authClient.useSession();

  const memberName = (memberId: string) =>
    group.members.find((m) => m.id === memberId)?.displayName ?? t`nieznana osoba`;
  const { title, details } = describeChange(change, {
    locale,
    memberName,
    categoryName: (category) => labels.category[category],
    splitModeName: (mode) => labels.splitMode[mode],
  });
  const who = change.actorMemberId ? memberName(change.actorMemberId) : t`nieznana osoba`;
  const meta = `${who} · ${format.dateTime(change.createdAt)}`;
  const badges = [
    change.undoesChangeId !== null ? t`cofnięcie` : null,
    change.undoneByChangeId !== null ? t`cofnięto` : null,
  ].filter((b): b is string => b !== null);
  const undoable = canUndo(change, group);

  const failureMessage = (failure: UndoFailure) => {
    switch (failure) {
      case 'changedSince':
        return t`Nie można cofnąć: później były tu kolejne zmiany. Cofnij najpierw nowsze.`;
      case 'forbidden':
        return t`Tylko ta osoba może zmienić swoje imię.`;
      case 'notUndoable':
        return t`Tej zmiany nie można cofnąć.`;
      case 'invalid':
        return t`Nie można cofnąć tej zmiany w tej grupie.`;
      case 'unknown':
        return t`Nie udało się cofnąć zmiany. Spróbuj ponownie.`;
    }
  };
  const runUndo = () =>
    undo.mutate(change.id, {
      onSuccess: () => {
        if (undoLosesAccess(change, myMemberId(group.members, session?.user.id))) router.replace('/');
      },
      onError: (error) => Alert.alert(failureMessage(undoFailure(error))),
    });
  const undoLabel = t`Cofnij`;
  const confirmUndo = () =>
    Alert.alert(t`Cofnąć tę zmianę?`, title, [
      { text: t`Anuluj`, style: 'cancel' },
      { text: undoLabel, style: 'destructive', onPress: runUndo },
    ]);

  return (
    <View style={styles.row}>
      <View
        style={styles.text}
        accessible
        accessibilityLabel={[title, ...details, meta, ...badges].join('. ')}>
        <Text style={styles.title}>{title}</Text>
        {details.map((line) => (
          <Text key={line} style={styles.detail}>
            {line}
          </Text>
        ))}
        <Text style={styles.meta}>{[meta, ...badges].join(' · ')}</Text>
      </View>
      {undoable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={undoLabel}
          accessibilityHint={title}
          accessibilityState={{ busy: undo.isPending }}
          disabled={undo.isPending}
          onPress={confirmUndo}
          style={({ pressed }) => [styles.undo, (pressed || undo.isPending) && styles.pressed]}>
          <Text style={styles.undoLabel}>{undoLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space(2),
    paddingVertical: theme.space(2),
  },
  text: {
    flex: 1,
    gap: theme.space(0.5),
  },
  title: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  detail: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
  },
  meta: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  undo: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.space(2),
  },
  undoLabel: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
}));
