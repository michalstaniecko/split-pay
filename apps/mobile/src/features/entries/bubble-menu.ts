import { useLingui } from '@lingui/react/macro';
import type { Entry } from '@split-pay/shared';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Alert, type AlertButton } from 'react-native';
import { type BubbleAction, bubbleActions } from '@/features/groups/group-lifecycle';
import { useFormatters } from '@/i18n/use-formatters';

/**
 * A bubble's long-press menu (SPEC "Conversation"), filtered by
 * `bubbleActions` — an archived group offers only Historia and Kopiuj kwotę.
 * Edytuj / Usuń are wired by #11 (TODO(#11)); Historia opens the entry
 * detail until the change history exists (TODO(#20)).
 */
export function useBubbleMenu(group: { id: string; archivedAt: string | null }) {
  const { t } = useLingui();
  const format = useFormatters();

  return (entry: Entry) => {
    const button = (action: BubbleAction): AlertButton | null => {
      switch (action) {
        case 'history':
          return {
            text: t`Historia`,
            onPress: () =>
              router.push({
                pathname: '/groups/[groupId]/entries/[entryId]',
                params: { groupId: group.id, entryId: entry.id },
              }),
          };
        case 'copyAmount':
          return {
            text: t`Kopiuj kwotę`,
            onPress: () => void Clipboard.setStringAsync(format.amount(entry.amount, entry.currency)),
          };
        case 'edit':
        case 'delete':
          return null; // TODO(#11)
      }
    };
    const buttons = bubbleActions({ archived: group.archivedAt !== null })
      .map(button)
      .filter((b): b is AlertButton => b !== null);
    Alert.alert(entry.kind === 'settlement' ? t`Spłata` : entry.title, undefined, [
      ...buttons,
      { text: t`Anuluj`, style: 'cancel' },
    ]);
  };
}
