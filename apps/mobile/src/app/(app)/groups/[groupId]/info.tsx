import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { GroupNotFound } from '@/components/group-not-found';
import { type GroupDetail, groupQuery } from '@/features/groups/groups-query';
import { useFormatters } from '@/i18n/use-formatters';

/**
 * Group info (GLOSSARY): members, group link, Stats, change history,
 * settings, leave/archive/delete. Skeleton — the sections fill in with later slices.
 */
export default function GroupInfoScreen() {
  const { theme } = useUnistyles();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useQuery(groupQuery(groupId));

  if (group.isPending) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  if (group.isError) return <GroupNotFound error={group.error} onRetry={() => void group.refetch()} />;
  return <GroupInfo group={group.data} />;
}

function GroupInfo({ group }: { group: GroupDetail }) {
  const { t } = useLingui();
  const format = useFormatters();
  const count = group.members.length;
  const dates = group.startDate && group.endDate ? `${format.date(group.startDate)} – ${format.date(group.endDate)}` : null;
  const soon = t`Wkrótce`;

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
        {group.members.map((member) => (
          <Text key={member.id} style={styles.row}>
            {member.id === group.ownerMemberId ? t`${member.displayName} (założyciel)` : member.displayName}
          </Text>
        ))}
      </Section>
      {/* TODO(#7): group link + QR, members without an account, attendance. */}
      <Section title={t`Link grupy`} subtitle={soon} />
      <Section title={t`Statystyki`} subtitle={soon} />
      <Section title={t`Historia zmian`} subtitle={soon} />
      <Section title={t`Ustawienia`} subtitle={soon} />
      <Section title={t`Opuść, archiwizuj lub usuń grupę`} subtitle={soon} />
    </ScrollView>
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
  row: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  muted: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
}));
