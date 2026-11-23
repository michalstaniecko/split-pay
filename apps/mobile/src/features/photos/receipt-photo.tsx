import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { photoCacheKey } from './member-avatar';
import { receiptsQuery } from './photos-query';

/**
 * The receipt photo in the entry detail sheet; tap opens the full-screen
 * viewer. Renders nothing for an entry without a receipt.
 */
export function ReceiptPhoto({ groupId, entryId }: { groupId: string; entryId: string }) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const receipts = useQuery(receiptsQuery(groupId));
  const receipt = receipts.data?.get(entryId);

  if (receipts.isPending) return <ActivityIndicator color={theme.colors.primary} />;
  if (receipts.isError) return <Text style={styles.muted}>{t`Nie udało się wczytać zdjęcia paragonu.`}</Text>;
  if (!receipt) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t`Paragon`}</Text>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={t`Zdjęcie paragonu`}
        accessibilityHint={t`Otwiera zdjęcie na pełnym ekranie`}
        onPress={() => router.push({ pathname: '/groups/[groupId]/receipt', params: { groupId, entryId } })}
        style={({ pressed }) => pressed && styles.pressed}>
        <Image
          source={{ uri: receipt.url, cacheKey: photoCacheKey(receipt.url) }}
          style={styles.photo}
          contentFit="cover"
          transition={150}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space(2),
  },
  title: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    opacity: 0.8,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
