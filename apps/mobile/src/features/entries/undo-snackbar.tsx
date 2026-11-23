import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** How long the "Cofnij" snackbar stays (longer when a screen reader is on). */
const VISIBLE_MS = 6000;
const VISIBLE_MS_SCREEN_READER = 12000;

/**
 * "Usunięto … · Cofnij" after deleting an entry (#11). Disappears by itself;
 * only the just-deleted entry is undone here — older changes from the change
 * history (#20). Announced to screen readers.
 */
export function UndoSnackbar({
  message,
  onUndo,
  onHide,
  busy,
}: {
  message: string;
  onUndo: () => void;
  onHide: () => void;
  busy: boolean;
}) {
  const { t } = useLingui();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    AccessibilityInfo.announceForAccessibility(message);
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (!cancelled) timer = setTimeout(onHide, on ? VISIBLE_MS_SCREEN_READER : VISIBLE_MS);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [message, onHide]);

  return (
    <View style={styles.bar} accessibilityLiveRegion="polite">
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onUndo} hitSlop={8} style={styles.action}>
        <Text style={styles.actionText}>{t`Cofnij`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    marginHorizontal: theme.space(3),
    marginBottom: theme.space(2),
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(4),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.text,
  },
  message: {
    flex: 1,
    fontSize: theme.font.sizeSm,
    color: theme.colors.background,
  },
  action: {
    minHeight: 32,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    // Inverted bar: the background colour keeps the contrast in every theme.
    color: theme.colors.background,
    textDecorationLine: 'underline',
  },
}));
