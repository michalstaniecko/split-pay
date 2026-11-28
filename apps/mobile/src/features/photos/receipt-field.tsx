import { useLingui } from '@lingui/react/macro';
import { RECEIPT_MAX_DIMENSION } from '@split-pay/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Icon } from '@/components/icon';
import { askPhotoSource } from './ask-photo-source';
import { photoCacheKey } from './member-avatar';
import { noReceipt, type PhotoProblem, type ReceiptDraft, receiptPreviewUri } from './photo-draft';
import { usePhotoProblemMessages } from './photo-messages';
import { type PhotoSource, pickPhoto } from './pick-photo';

/**
 * The receipt field of the full expense form (add and edit). With no photo,
 * one "Dodaj zdjęcie" button; with one, a preview with "Usuń zdjęcie" and
 * "Zmień zdjęcie". Both ask for the camera or the gallery. The photo is only
 * prepared here (downscaled, EXIF dropped); the form uploads it on save.
 */
export function ReceiptField({
  draft,
  storedUrl,
  problem,
  onChange,
}: {
  draft: ReceiptDraft;
  /** Signed URL of the entry's stored receipt (edit mode). */
  storedUrl: string | undefined;
  /** Why the last upload failed. */
  problem: PhotoProblem | null;
  onChange: (draft: ReceiptDraft) => void;
}) {
  const { t } = useLingui();
  const { theme } = useUnistyles();
  const messages = usePhotoProblemMessages();
  const [denied, setDenied] = useState(false);
  const preview = receiptPreviewUri(draft, storedUrl);

  const pick = async (source: PhotoSource) => {
    setDenied(false);
    try {
      const result = await pickPhoto(source, { maxDimension: RECEIPT_MAX_DIMENSION });
      if (result.status === 'picked') onChange({ kind: 'local', photo: result.photo });
      else if (result.status === 'denied') setDenied(true);
    } catch {
      setDenied(true);
    }
  };

  /** Asks for the camera or the gallery, then takes or picks the photo. */
  const choose = async () => {
    const source = await askPhotoSource({
      title: t`Zdjęcie paragonu`,
      camera: t`Zrób zdjęcie`,
      library: t`Z galerii`,
      cancel: t`Anuluj`,
    });
    if (source) await pick(source);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{t`Zdjęcie paragonu`}</Text>
      {draft.kind !== 'none' ? (
        <View style={styles.previewRow}>
          {preview ? (
            <Image
              source={{ uri: preview, cacheKey: photoCacheKey(preview) }}
              style={styles.preview}
              contentFit="cover"
              accessibilityLabel={t`Zdjęcie paragonu`}
            />
          ) : (
            <View style={[styles.preview, styles.placeholder]}>
              <Text style={styles.placeholderIcon}>🧾</Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange(noReceipt)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Text style={styles.actionLabel}>{t`Usuń zdjęcie`}</Text>
          </Pressable>
        </View>
      ) : null}
      {draft.kind === 'none' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void choose()}
          style={({ pressed }) => [styles.add, styles.actionWithIcon, pressed && styles.pressed]}>
          <Icon name="Camera" size={theme.font.sizeMd} color={theme.colors.primary} />
          <Text style={styles.addLabel}>{t`Dodaj zdjęcie`}</Text>
        </Pressable>
      ) : (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void choose()}
            style={({ pressed }) => [styles.action, styles.actionWithIcon, pressed && styles.pressed]}>
            <Icon name="Camera" size={theme.font.sizeSm} />
            <Text style={styles.actionLabel}>{t`Zmień zdjęcie`}</Text>
          </Pressable>
        </View>
      )}
      {denied ? <Text style={styles.error}>{t`Brak dostępu do aparatu. Wybierz zdjęcie z galerii.`}</Text> : null}
      {problem ? <Text style={styles.error}>{messages[problem]}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  field: {
    gap: theme.space(2),
  },
  label: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
  },
  preview: {
    width: 96,
    height: 128,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  placeholderIcon: {
    fontSize: theme.font.sizeXl,
  },
  add: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  addLabel: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.primary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space(2),
  },
  action: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  actionWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
  },
  actionLabel: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
  },
  pressed: {
    opacity: 0.6,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
}));
