import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { closePublicPage } from '@/features/web-view/navigation';
import { PublicError } from '@/features/web-view/public-error';
import { type PublicGroup, usePublicGroup } from '@/features/web-view/public-view-query';
import { useThisIsMe } from '@/features/web-view/this-is-me';

/** "This is me" (view-only web): pick which member I am; remembered in this browser. */
export default function ThisIsMeScreen() {
  const { theme } = useUnistyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const group = usePublicGroup(token);

  if (group.isPending) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  if (group.isError) return <PublicError error={group.error} onRetry={() => void group.refetch()} />;
  return <Picker token={token} data={group.data} />;
}

function Picker({ token, data }: { token: string; data: PublicGroup }) {
  const { t } = useLingui();
  const { me, setMe } = useThisIsMe(data);
  const choose = (memberId: string | null) => {
    setMe(memberId);
    closePublicPage(token);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.text}>
        {t`Wybierz siebie, żeby zobaczyć, ile masz do oddania. Zapamiętamy to w tej przeglądarce.`}
      </Text>
      <View style={styles.list} accessibilityRole="radiogroup">
        {data.members.map((member) => {
          const selected = member.id === me;
          return (
            <Pressable
              key={member.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => choose(member.id)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={[styles.name, selected && styles.bold]}>{member.displayName}</Text>
              {selected ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => choose(null)}
        style={({ pressed }) => [styles.none, pressed && styles.pressed]}>
        <Text style={styles.link}>{t`Nie ma mnie na liście`}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    padding: theme.space(6),
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
  text: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.textMuted,
  },
  list: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.space(4),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: theme.space(2),
  },
  name: {
    flex: 1,
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  bold: {
    fontWeight: theme.font.weightBold,
  },
  check: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.primary,
  },
  none: {
    minHeight: 44,
    justifyContent: 'center',
  },
  link: {
    fontSize: theme.font.sizeMd,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: 0.6,
  },
}));
