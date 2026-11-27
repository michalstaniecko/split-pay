import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export function PlaceholderScreen({
  title,
  subtitle,
  children,
  paddingBottom,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Overrides the bottom padding only (Profile ends with 56); sides and top stay 24. */
  paddingBottom?: number;
}) {
  return (
    <View style={[styles.container, paddingBottom !== undefined && { paddingBottom }]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    padding: theme.space(6),
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
}));
