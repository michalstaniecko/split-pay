import { useLingui } from '@lingui/react/macro';
import type { LocalDate } from '@split-pay/shared';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';
import { useFormatters } from '@/i18n/use-formatters';
import type { StripDay } from './day-strip';

const CHIP_WIDTH = 56;
const CHIP_GAP = 8;

/**
 * The day strip (#38): opened from a sticky day separator, a horizontal row
 * of days over the top of the Conversation. Picking a day closes it and
 * jumps to that day; days without entries are greyed out and not pressable.
 * The current day (the tapped separator's) is marked and scrolled into view.
 * A horizontal list follows the layout direction, so RTL mirrors it.
 */
export function DayStrip({
  days,
  current,
  onPick,
  onClose,
}: {
  days: readonly StripDay[];
  /** The tapped separator's day; `null` hides the strip. */
  current: LocalDate | null;
  /** A day with entries was picked: its separator's index in the Conversation. */
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const format = useFormatters();
  const insets = useSafeAreaInsets();
  const currentIndex = Math.max(0, days.findIndex((d) => d.date === current));
  return (
    <Modal visible={current !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { paddingTop: insets.top + 56 }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t`Zamknij`}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title}>{t`Wybór dnia`}</Text>
          <FlatList
            horizontal
            data={days}
            keyExtractor={(d) => d.date}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            getItemLayout={(_, index) => ({ length: CHIP_WIDTH + CHIP_GAP, offset: (CHIP_WIDTH + CHIP_GAP) * index, index })}
            initialScrollIndex={currentIndex}
            renderItem={({ item }) => {
              const parts = format.dayParts(item.date);
              const label = format.date(item.date);
              const empty = item.index === null;
              const selected = item.date === current;
              return (
                <Pressable
                  disabled={empty}
                  onPress={() => {
                    if (item.index === null) return;
                    onClose();
                    onPick(item.index);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={empty ? t`${label}, brak wpisów` : label}
                  accessibilityState={{ disabled: empty, selected }}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    empty && styles.chipEmpty,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.small, empty && styles.textEmpty]}>{parts.weekday}</Text>
                  <Text style={[styles.day, empty && styles.textEmpty]}>{parts.day}</Text>
                  <Text style={[styles.small, empty && styles.textEmpty]}>{parts.month}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  backdrop: {
    flex: 1,
    paddingHorizontal: theme.space(2),
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.space(2),
  },
  title: {
    paddingHorizontal: theme.space(4),
    paddingBottom: theme.space(2),
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  chips: {
    paddingHorizontal: theme.space(2),
  },
  chip: {
    width: CHIP_WIDTH,
    marginEnd: CHIP_GAP,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  chipEmpty: {
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.6,
  },
  small: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  day: {
    fontSize: theme.font.sizeLg,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  textEmpty: {
    color: theme.colors.textMuted,
    opacity: 0.5,
  },
}));
