import { useLingui } from '@lingui/react/macro';
import { Modal, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { EntryAction } from './entry-edit';

/** Translated labels of the entry actions (also the bubble's accessibility actions). */
export function useEntryActionLabels(): Record<EntryAction, string> {
  const { t } = useLingui();
  return { edit: t`Edytuj`, delete: t`Usuń`, history: t`Historia`, copyAmount: t`Kopiuj kwotę` };
}

/**
 * Long-press menu of a bubble (ADR-0017): a small sheet over the
 * Conversation, the same on every platform (`Alert` allows only 3 buttons on
 * Android). `disabled` actions are shown greyed out ("wkrótce").
 */
export function EntryActionsMenu({
  title,
  actions,
  disabled = [],
  onSelect,
  onClose,
}: {
  /** What the menu is about, e.g. the entry's title; `null` hides the menu. */
  title: string | null;
  actions: readonly EntryAction[];
  disabled?: readonly EntryAction[];
  onSelect: (action: EntryAction) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const labels = useEntryActionLabels();
  return (
    <Modal visible={title !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t`Zamknij`}>
        <View style={styles.menu} accessibilityViewIsModal>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {actions.map((action) => {
            const off = disabled.includes(action);
            return (
              <Pressable
                key={action}
                accessibilityRole="button"
                accessibilityState={{ disabled: off }}
                disabled={off}
                onPress={() => {
                  onClose();
                  onSelect(action);
                }}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                <Text style={[styles.label, action === 'delete' && styles.destructive, off && styles.disabled]}>
                  {off ? t`${labels[action]} (wkrótce)` : labels[action]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: theme.space(4),
    paddingBottom: theme.space(10),
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  menu: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.space(2),
  },
  title: {
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2),
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  item: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: theme.space(4),
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  destructive: {
    color: theme.colors.negative,
  },
  disabled: {
    color: theme.colors.textMuted,
  },
}));
