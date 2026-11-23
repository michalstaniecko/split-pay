import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { GroupAvatar } from '@/components/group-avatar';
import { PublicError } from '@/features/web-view/public-error';
import { type PublicGroup, publicGroupQuery } from '@/features/web-view/public-view-query';
import { SponsorLink } from '@/features/web-view/sponsor-link';
import { useThisIsMe } from '@/features/web-view/this-is-me';
import { useFormatters } from '@/i18n/use-formatters';

/**
 * Limited Group info of the view-only web: members and Stats only — no group
 * link, settings or change history (SPEC "Web interface").
 */
export default function PublicGroupInfoScreen() {
  const { theme } = useUnistyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const group = useQuery(publicGroupQuery(token));

  if (group.isPending) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  if (group.isError) return <PublicError error={group.error} onRetry={() => void group.refetch()} />;
  return <GroupInfo token={token} data={group.data} />;
}

function GroupInfo({ token, data }: { token: string; data: PublicGroup }) {
  const { t } = useLingui();
  const format = useFormatters();
  const { me } = useThisIsMe(data);
  const { group, members } = data;
  const count = members.length;
  const dates = group.startDate && group.endDate ? `${format.date(group.startDate)} – ${format.date(group.endDate)}` : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <GroupAvatar emoji={group.emoji} color={group.color} size={72} />
        <Text style={styles.name}>{group.name}</Text>
        <Text style={styles.muted}>{dates ? `${dates} · ${group.baseCurrency}` : group.baseCurrency}</Text>
      </View>

      <View style={styles.section} accessibilityRole="summary">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t`Członkowie`}</Text>
          <Text style={styles.muted}>
            {t`${plural(count, { one: '# osoba', few: '# osoby', many: '# osób', other: '# osoby' })}`}
          </Text>
        </View>
        {members.map((member) => {
          const badges = [member.id === me ? t`Ty` : null, member.hasAccount ? null : t`bez konta`].filter(
            (badge): badge is string => badge !== null,
          );
          return (
            <View
              key={member.id}
              style={styles.memberRow}
              accessible
              accessibilityLabel={[member.displayName, ...badges].join(', ')}>
              <Text style={styles.memberName} numberOfLines={1}>
                {member.displayName}
              </Text>
              {badges.map((badge) => (
                <Text key={badge} style={styles.badge}>
                  {badge}
                </Text>
              ))}
            </View>
          );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/g/[token]/me', params: { token } })}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{me === null ? t`To ja… (wybierz siebie)` : t`Zmień, kim jestem`}</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityHint={t`Dni × osoby i kategorie`}
        onPress={() => router.push({ pathname: '/g/[token]/stats', params: { token } })}
        style={({ pressed }) => [styles.section, styles.sectionHeader, pressed && styles.pressed]}>
        <Text style={styles.sectionTitle}>{t`Statystyki`}</Text>
        <Text style={styles.chevron}>{t`Pokaż`}</Text>
      </Pressable>
      <SponsorLink />
    </ScrollView>
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
  memberRow: {
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
  action: {
    justifyContent: 'center',
    minHeight: 44,
  },
  actionLabel: {
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
