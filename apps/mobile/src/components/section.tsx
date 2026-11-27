import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/**
 * A card on a screen (Group info, Stats…): an optional header row — the
 * title, announced as a header, and a trailing element at its end — then
 * the content. `plain` drops the card and uses a small muted title, for
 * sections inside a sheet (entry detail).
 */
type SectionProps = {
  variant?: 'card' | 'plain';
  children?: ReactNode;
} & (
  | {
      title: string;
      /** At the end of the header row, e.g. a count or a link. */
      trailing?: ReactNode;
    }
  | { title?: undefined; trailing?: never }
);

export function Section({ title, trailing, variant = 'card', children }: SectionProps) {
  const plain = variant === 'plain';
  return (
    <View style={plain ? styles.plain : styles.card}>
      {title ? (
        <View style={styles.header}>
          <Text style={[styles.title, plain && styles.plainTitle]} accessibilityRole="header">
            {title}
          </Text>
          {trailing}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.space(2),
    padding: theme.space(4),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  plain: {
    gap: theme.space(2),
    paddingTop: theme.space(2),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space(2),
  },
  title: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  plainTitle: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
