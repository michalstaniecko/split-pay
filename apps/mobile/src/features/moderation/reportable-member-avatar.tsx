import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Pressable } from 'react-native';
import { MemberAvatar } from '@/features/photos/member-avatar';
import { groupAvatarPhotosQuery } from './moderation-query';
import { reportablePhoto } from './moderation';

/**
 * A member's avatar in Group info. Someone else's photo is tappable and
 * offers "Zgłoś zdjęcie profilowe" (#27, DSA).
 */
export function ReportableMemberAvatar({
  groupId,
  member,
  url,
  size,
  filled,
  initialSize,
}: {
  groupId: string;
  member: { id: string; displayName: string; isMe: boolean };
  url: string | undefined;
  size: number;
  filled?: boolean;
  initialSize?: number;
}) {
  const { t } = useLingui();
  const avatars = useQuery(groupAvatarPhotosQuery(groupId)).data;
  const photoId = reportablePhoto(avatars, member);
  const avatar = <MemberAvatar name={member.displayName} url={url} size={size} filled={filled} initialSize={initialSize} />;
  if (!photoId) return avatar;

  const report = () => router.push({ pathname: '/report-photo', params: { photoId } });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t`Zdjęcie profilowe: ${member.displayName}`}
      accessibilityHint={t`Pozwala zgłosić zdjęcie`}
      accessibilityActions={[{ name: 'report', label: t`Zgłoś zdjęcie profilowe` }]}
      onAccessibilityAction={report}
      onPress={() =>
        Alert.alert(member.displayName, undefined, [
          { text: t`Zgłoś zdjęcie profilowe`, style: 'destructive', onPress: report },
          { text: t`Anuluj`, style: 'cancel' },
        ])
      }
      hitSlop={6}>
      {avatar}
    </Pressable>
  );
}
