import { useLingui } from '@lingui/react/macro';
import { AVATAR_MAX_DIMENSION } from '@split-pay/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { authClient } from '@/lib/auth-client';
import { MemberAvatar } from './member-avatar';
import { type PhotoProblem, photoProblem } from './photo-draft';
import { usePhotoProblemMessages } from './photo-messages';
import { myAvatarQuery, useRemoveAvatar, useSetAvatar } from './photos-query';
import { type PhotoSource, pickPhoto } from './pick-photo';

/**
 * Profile: my avatar (#26), shown next to my member in every group. Picked
 * or taken, cropped square, downscaled to 512 px and re-encoded without
 * EXIF on the phone, then uploaded straight to the bucket.
 */
export function AvatarSection() {
  const { t } = useLingui();
  const messages = usePhotoProblemMessages();
  const { data: session } = authClient.useSession();
  const avatar = useQuery(myAvatarQuery());
  const setAvatar = useSetAvatar();
  const removeAvatar = useRemoveAvatar();
  const [problem, setProblem] = useState<PhotoProblem | 'denied' | null>(null);
  const name = session?.user.name.trim() || session?.user.email || '?';
  const busy = setAvatar.isPending || removeAvatar.isPending;
  const hasAvatar = !!avatar.data;

  const choose = async (source: PhotoSource) => {
    setProblem(null);
    try {
      const result = await pickPhoto(source, { maxDimension: AVATAR_MAX_DIMENSION, square: true });
      if (result.status === 'denied') setProblem('denied');
      if (result.status !== 'picked') return;
      setAvatar.mutate(result.photo, { onError: (error) => setProblem(photoProblem(error)) });
    } catch {
      setProblem('upload_failed');
    }
  };

  return (
    <View style={styles.container}>
      <MemberAvatar name={name} url={avatar.data?.url} size={72} />
      <View style={styles.actions}>
        <Action label={hasAvatar ? t`Zmień zdjęcie` : t`Dodaj zdjęcie`} disabled={busy} onPress={() => void choose('library')} />
        <Action label={t`Zrób zdjęcie`} disabled={busy} onPress={() => void choose('camera')} />
        {hasAvatar ? (
          <Action
            label={t`Usuń zdjęcie`}
            disabled={busy}
            onPress={() => removeAvatar.mutate(undefined, { onError: () => setProblem('upload_failed') })}
          />
        ) : null}
      </View>
      {busy ? <Text style={styles.muted}>{t`Zapisuję…`}</Text> : null}
      {problem ? (
        <Text style={styles.error}>
          {problem === 'denied' ? t`Brak dostępu do aparatu. Wybierz zdjęcie z galerii.` : messages[problem]}
        </Text>
      ) : null}
    </View>
  );
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, (pressed || disabled) && styles.dimmed]}>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: theme.space(2),
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
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
  actionLabel: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
  },
  dimmed: {
    opacity: 0.6,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
    textAlign: 'center',
  },
}));
