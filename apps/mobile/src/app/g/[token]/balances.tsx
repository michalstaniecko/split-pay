import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { BalancesView } from '@/features/balances/balances-view';
import { PublicError } from '@/features/web-view/public-error';
import {
  type PublicBalances,
  type PublicGroup,
  publicBalancesQuery,
  usePublicGroup,
} from '@/features/web-view/public-view-query';
import { useThisIsMe } from '@/features/web-view/this-is-me';

/**
 * The balance drawer of the view-only web: every member's balance and who
 * pays whom, read-only — no "Oddaj", "Przypomnij" or "Inna spłata" (SPEC).
 */
export default function PublicBalancesScreen() {
  const { theme } = useUnistyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const group = usePublicGroup(token);
  const balances = useQuery(publicBalancesQuery(token));

  if (group.isError) return <PublicError error={group.error} onRetry={() => void group.refetch()} />;
  if (balances.isError) return <PublicError error={balances.error} onRetry={() => void balances.refetch()} />;
  if (!group.data || !balances.data) return <ActivityIndicator style={styles.loading} color={theme.colors.primary} />;
  return <Drawer data={group.data} balances={balances.data} />;
}

function Drawer({ data, balances }: { data: PublicGroup; balances: PublicBalances }) {
  const { me } = useThisIsMe(data);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BalancesView balances={balances} members={data.members} me={me} />
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
}));
