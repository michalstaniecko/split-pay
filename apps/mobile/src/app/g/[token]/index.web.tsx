import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ClaimBanner } from '@/features/web-view/claim-banner';
import { groupPreview } from '@/features/web-view/group-preview';
import { PreviewEntries, PreviewHeader, PreviewSettleUp } from '@/features/web-view/group-preview-view';
import { PublicError } from '@/features/web-view/public-error';
import {
  type PublicGroup,
  publicBalancesQuery,
  publicEntriesQuery,
  usePublicGroup,
} from '@/features/web-view/public-view-query';
import { useThisIsMe } from '@/features/web-view/this-is-me';
import { WebFooter } from '@/features/web-view/web-footer';
import { claimBannerMember } from '@/features/web-view/web-view';

/**
 * The group preview for a group link on the web (SPEC "Web interface"): a
 * formal, read-only statement in one centred column of limited width — the
 * header, the settle-up on the page and the entries table by entry date.
 * "This is me" is optional and only highlights; it is chosen from the
 * balances and remembered in the browser. A personal claim link highlights its
 * member the same way and adds the claim banner. Native: `index.tsx` (join screen).
 */
export default function GroupPreviewScreen() {
  const { theme } = useUnistyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const group = usePublicGroup(token);

  if (group.isPending) return <ActivityIndicator style={styles.center} color={theme.colors.primary} />;
  if (group.isError) return <PublicError error={group.error} onRetry={() => void group.refetch()} />;
  return <GroupPreview token={token} data={group.data} />;
}

function GroupPreview({ token, data }: { token: string; data: PublicGroup }) {
  const { theme } = useUnistyles();
  const { group, members } = data;
  const entries = useQuery(publicEntriesQuery(token));
  const balances = useQuery(publicBalancesQuery(token));
  const { me, setMe } = useThisIsMe(data);
  const claimMember = claimBannerMember({ claimFor: data.claimFor, members });
  const preview = useMemo(
    () => groupPreview(entries.data ?? [], { members, myMemberId: me, baseCurrency: group.baseCurrency }),
    [entries.data, members, me, group.baseCurrency],
  );

  const failed = entries.isError ? entries : balances.isError ? balances : null;
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: group.name, headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          {claimMember ? <ClaimBanner displayName={claimMember.displayName} token={token} /> : null}
          {failed ? (
            <PublicError error={failed.error} onRetry={() => void failed.refetch()} />
          ) : !entries.data || !balances.data ? (
            <ActivityIndicator style={styles.center} color={theme.colors.primary} />
          ) : (
            <>
              <PreviewHeader
                data={data}
                total={preview.total}
                onOpenStats={() => router.push({ pathname: '/g/[token]/stats', params: { token } })}
              />
              <PreviewSettleUp balances={balances.data} members={members} me={me} onChooseMe={setMe} />
              <PreviewEntries
                days={preview.days}
                baseCurrency={group.baseCurrency}
                showShare={me !== null}
                onOpenEntry={(entryId) =>
                  router.push({ pathname: '/g/[token]/entries/[entryId]', params: { token, entryId } })
                }
              />
            </>
          )}
        </View>
      </ScrollView>
      <WebFooter token={token} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(6),
  },
  // The same layout at every width: one centred column, never wider than this.
  column: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: theme.space(6),
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space(6),
  },
}));
