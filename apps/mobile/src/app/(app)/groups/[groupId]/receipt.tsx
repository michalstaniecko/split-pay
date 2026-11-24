import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';
import { photoCacheKey } from '@/features/photos/member-avatar';
import { receiptsQuery } from '@/features/photos/photos-query';
import { closeSheet } from '@/lib/close-sheet';

/**
 * Full-screen receipt viewer (from the entry detail sheet): the whole photo
 * on black, pinch to zoom (iOS scroll view zoom), "Zamknij", "Zgłoś" (#27).
 */
export default function ReceiptViewer() {
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const { groupId, entryId } = useLocalSearchParams<{ groupId: string; entryId: string }>();
  const receipts = useQuery(receiptsQuery(groupId));
  const receipt = receipts.data?.get(entryId);

  return (
    <View style={styles.container}>
      {receipts.isPending ? (
        <ActivityIndicator style={styles.center} color="#FFFFFF" />
      ) : receipt ? (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.zoom}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}>
          <Image
            source={{ uri: receipt.url, cacheKey: photoCacheKey(receipt.url) }}
            style={styles.photo}
            contentFit="contain"
            accessibilityLabel={t`Zdjęcie paragonu`}
          />
        </ScrollView>
      ) : (
        <Text style={[styles.center, styles.text]}>{t`Nie udało się wczytać zdjęcia paragonu.`}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={closeSheet}
        hitSlop={12}
        style={[styles.close, { top: insets.top + 12 }]}>
        <Text style={styles.text}>{t`Zamknij`}</Text>
      </Pressable>
      {/* DSA reporting (#27). */}
      {receipt ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/report-photo', params: { photoId: receipt.photoId } })}
          hitSlop={12}
          style={[styles.report, { top: insets.top + 12 }]}>
          <Text style={styles.text}>{t`Zgłoś`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// The viewer is black in every theme, like the system photo viewers.
const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  zoom: {
    flexGrow: 1,
  },
  photo: {
    flex: 1,
    width: '100%',
  },
  center: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  close: {
    position: 'absolute',
    end: theme.space(4),
    paddingVertical: theme.space(2),
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  report: {
    position: 'absolute',
    start: theme.space(4),
    paddingVertical: theme.space(2),
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  text: {
    fontSize: theme.font.sizeMd,
    color: '#FFFFFF',
  },
}));
