import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/**
 * A person's avatar: their photo when they set one (signed URL, cached by
 * URL path so refreshed signatures don't download it again), otherwise the
 * initial of their name. Decorative — the name is always shown next to it.
 */
export function MemberAvatar({
  name,
  url,
  size = 28,
  inverted = false,
}: {
  name: string;
  url?: string | null | undefined;
  size?: number;
  /** On a primary-coloured background (my own bubbles, header button). */
  inverted?: boolean;
}) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return (
      <Image
        source={{ uri: url, cacheKey: photoCacheKey(url) }}
        style={round}
        contentFit="cover"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }
  return (
    <View style={[styles.initialBox, round, inverted && styles.invertedBox]} importantForAccessibility="no-hide-descendants">
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.5) }, inverted && styles.invertedText]}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

/** The object's path without the signature: stable for one photo across URL refreshes. */
export function photoCacheKey(url: string): string {
  return url.split('?')[0] ?? url;
}

const styles = StyleSheet.create((theme) => ({
  initialBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.border,
  },
  invertedBox: {
    backgroundColor: theme.colors.onPrimary,
  },
  initial: {
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  invertedText: {
    color: theme.colors.primary,
  },
}));
