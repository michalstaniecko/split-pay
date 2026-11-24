import type { GroupSettingsUpdate } from '@split-pay/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { type InferResponseType, parseResponse } from 'hono/client';
import { entryKeys } from '@/features/entries/entries-query';
import { groupKeys } from '@/features/groups/groups-query';
import { api } from '@/lib/api';

export const balanceKeys = {
  /**
   * Under the entries key on purpose: every mutation that refreshes the
   * entries (create, edit, delete, settlement…) refreshes the balances too.
   */
  summary: (groupId: string) => [...entryKeys.list(groupId), 'balances'] as const,
  payoutDetails: (groupId: string, memberId: string) =>
    [...groupKeys.detail(groupId), 'payout-details', memberId] as const,
};

/** Balances and suggested transfers, computed by the API (GET /groups/:groupId/balances). */
export const balancesQuery = (groupId: string) =>
  queryOptions({
    queryKey: balanceKeys.summary(groupId),
    queryFn: () => parseResponse(api.groups[':groupId'].balances.$get({ param: { groupId } })),
  });
export type GroupBalances = InferResponseType<(typeof api.groups)[':groupId']['balances']['$get'], 200>;

/** Changes group settings (PATCH /groups/:groupId/settings); refreshes the group and its balances. */
export function useUpdateGroupSettings(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupSettingsUpdate) =>
      parseResponse(api.groups[':groupId'].settings.$patch({ param: { groupId }, json: input })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    },
  });
}

/** A member's payout details for the "Oddaj" sheet (only members of a shared group may read them). */
export const memberPayoutDetailsQuery = (groupId: string, memberId: string) =>
  queryOptions({
    queryKey: balanceKeys.payoutDetails(groupId, memberId),
    queryFn: () =>
      parseResponse(
        api.groups[':groupId'].members[':memberId']['payout-details'].$get({ param: { groupId, memberId } }),
      ),
  });
