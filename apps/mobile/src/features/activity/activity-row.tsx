import { useLingui } from '@lingui/react/macro';
import type { ActivityItem } from '@split-pay/shared';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { useEntryLabels } from '@/features/entries/use-entry-labels';
import { describeChange } from '@/features/history/describe-change';
import { useLocale } from '@/i18n/locale-provider';
import { useFormatters } from '@/i18n/use-formatters';
import { activityTarget } from './activity';

/**
 * One Activity item: the group (emoji + name), what changed (the change
 * history's wording, #20), who and when. Tapping opens the group's
 * Conversation, scrolled to the entry's bubble when there is one.
 */
export function ActivityRow({ item, memberNames }: { item: ActivityItem; memberNames: Record<string, string> }) {
  const { t } = useLingui();
  const { locale } = useLocale();
  const format = useFormatters();
  const labels = useEntryLabels();

  const memberName = (memberId: string) => memberNames[memberId] ?? t`nieznana osoba`;
  const { title } = describeChange(item, {
    locale,
    memberName,
    categoryName: (category) => labels.category[category],
    splitModeName: (mode) => labels.splitMode[mode],
  });
  const who = item.byMe ? t`Ty` : item.actorMemberId ? memberName(item.actorMemberId) : t`nieznana osoba`;
  const meta = [
    who,
    format.dateTime(item.createdAt),
    item.undoesChangeId !== null ? t`cofnięcie` : null,
    item.undoneByChangeId !== null ? t`cofnięto` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  const open = () => {
    const { groupId, entryId } = activityTarget(item);
    router.push({ pathname: '/groups/[groupId]', params: entryId ? { groupId, entryId } : { groupId } });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[item.group.name, title, meta].join('. ')}
      onPress={open}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <GroupAvatar emoji={item.group.emoji} color={item.group.color} size={40} />
      <View style={styles.text}>
        <Text style={styles.group} numberOfLines={1}>
          {item.group.name}
        </Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space(3),
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(4),
  },
  text: {
    flex: 1,
    gap: theme.space(0.5),
  },
  group: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  title: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  meta: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  pressed: {
    opacity: 0.6,
  },
}));
