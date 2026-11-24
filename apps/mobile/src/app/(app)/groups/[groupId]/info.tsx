import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { GroupNotFound } from '@/components/group-not-found';
import { PersonalClaimLinkButton } from '@/features/claims/personal-claim-link-button';
import { canShareLinks } from '@/features/group-link/group-link';
import { GroupLinkSection } from '@/features/group-link/group-link-section';
import { AttendanceGridView } from '@/features/groups/attendance-grid-view';
import { GroupLifecycleSection } from '@/features/groups/group-lifecycle-section';
import { GroupSettingsSection } from '@/features/groups/group-settings-section';
import { type GroupDetail, useGroup } from '@/features/groups/groups-query';
import { type MemberRow, memberRows } from '@/features/groups/member-form';
import { HistorySection } from '@/features/history/history-section';
import { ReportableMemberAvatar } from '@/features/moderation/reportable-member-avatar';
import { groupAvatarsQuery } from '@/features/photos/photos-query';
import { useFormatters } from '@/i18n/use-formatters';
import { authClient } from '@/lib/auth-client';

/**
 * Group info (GLOSSARY): members, group link (not when archived), Stats, change history,
 * settings, then leave / archive / delete at the bottom.
 */
export default function GroupInfoScreen() {
  const { theme } = useUnistyles();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useGroup(groupId);

  if (group.isPending) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  if (group.isError) return <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />;
  return <GroupInfo group={group.data} />;
}

function GroupInfo({ group }: { group: GroupDetail }) {
  const { t } = useLingui();
  const format = useFormatters();
  const { data: session } = authClient.useSession();
  const archived = group.archivedAt !== null;
  const shareLinks = canShareLinks(group);
  // Archived group: read-only, so no adding or renaming members.
  const rows = memberRows(group, session?.user.id).map((row) => (archived ? { ...row, canRename: false } : row));
  const openMemberSheet = (memberId?: string) =>
    router.push({
      pathname: '/groups/[groupId]/member',
      params: memberId ? { groupId: group.id, memberId } : { groupId: group.id },
    });
  const count = group.members.length;
  const dates = group.startDate && group.endDate ? `${format.date(group.startDate)} – ${format.date(group.endDate)}` : null;
  const soon = t`Wkrótce`;
  const avatars = useQuery(groupAvatarsQuery(group.id)).data;
  // Gender-neutral: the owner's name follows a colon, never "założyciel".
  const owner = rows.find((row) => row.isOwner)?.displayName;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <GroupAvatar emoji={group.emoji} color={group.color} size={72} />
        <Text style={styles.name}>{group.name}</Text>
        <Text style={styles.muted}>{dates ? `${dates} · ${group.baseCurrency}` : group.baseCurrency}</Text>
      </View>

      <Section
        title={t`Członkowie`}
        subtitle={t`${plural(count, { one: '# osoba', few: '# osoby', many: '# osób', other: '# osoby' })}`}>
        {rows.map((row) => (
          <View key={row.id} style={styles.memberLine}>
            <ReportableMemberAvatar groupId={group.id} member={row} url={avatars?.get(row.id)} size={32} />
            <MemberItem row={row} onPress={() => openMemberSheet(row.id)} />
            {shareLinks && row.withoutAccount ? <PersonalClaimLinkButton groupId={group.id} groupName={group.name} member={row} /> : null}
          </View>
        ))}
        {owner ? <Text style={styles.muted}>{t`Grupę założono: ${owner}`}</Text> : null}
        {archived ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={() => openMemberSheet()}
            style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}>
            <Text style={styles.addLabel}>{t`+ Dodaj osobę bez konta`}</Text>
          </Pressable>
        )}
        <AttendanceGridView group={group} />
      </Section>
      {shareLinks ? (
        <Section title={t`Link grupy`}>
          <GroupLinkSection groupId={group.id} groupName={group.name} />
        </Section>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t`Dni × osoby i kategorie`}
        onPress={() => router.push({ pathname: '/groups/[groupId]/stats', params: { groupId: group.id } })}
        style={({ pressed }) => [styles.section, styles.sectionHeader, pressed && styles.pressed]}>
        <Text style={styles.sectionTitle}>{t`Statystyki`}</Text>
        <Text style={styles.chevron}>{t`Pokaż`}</Text>
      </Pressable>
      <Section title={t`Historia zmian`}>
        <HistorySection group={group} />
      </Section>
      <Section title={t`Ustawienia`}>
        <GroupSettingsSection group={group} />
      </Section>
      <GroupLifecycleSection group={group} />
    </ScrollView>
  );
}

/** A member: name, badges (me, without account); tappable when I may rename them. */
function MemberItem({ row, onPress }: { row: MemberRow; onPress: () => void }) {
  const { t } = useLingui();
  const badges = [
    row.isMe ? t`Ty` : null,
    row.withoutAccount ? t`bez konta` : null,
  ].filter((badge): badge is string => badge !== null);
  const content = (
    <>
      <Text style={styles.memberName} numberOfLines={1}>
        {row.displayName}
      </Text>
      {badges.map((badge) => (
        <Text key={badge} style={styles.badge}>
          {badge}
        </Text>
      ))}
      {row.canRename ? <Text style={styles.chevron}>{t`Zmień`}</Text> : null}
    </>
  );
  const label = [row.displayName, ...badges].join(', ');
  if (!row.canRename) {
    return (
      <View style={styles.memberRow} accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t`Zmień imię`}
      onPress={onPress}
      style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <View style={styles.section} accessibilityRole="summary">
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space(3),
    padding: theme.space(4),
    paddingBottom: theme.space(10),
  },
  header: {
    alignItems: 'center',
    gap: theme.space(2),
    paddingVertical: theme.space(4),
  },
  name: {
    fontSize: theme.font.sizeXl,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  section: {
    gap: theme.space(2),
    padding: theme.space(4),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space(2),
  },
  sectionTitle: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
  memberLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
  },
  memberRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    minHeight: 44,
  },
  memberName: {
    flexShrink: 1,
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  badge: {
    paddingHorizontal: theme.space(2),
    paddingVertical: theme.space(0.5),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  chevron: {
    marginStart: 'auto',
    fontSize: theme.font.sizeSm,
    color: theme.colors.primary,
  },
  addRow: {
    justifyContent: 'center',
    minHeight: 44,
  },
  addLabel: {
    fontSize: theme.font.sizeMd,
    fontWeight: theme.font.weightBold,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
