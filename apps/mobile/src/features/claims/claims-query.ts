import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { type InferResponseType, parseResponse } from 'hono/client';
import { groupKeys } from '@/features/groups/groups-query';
import { isLocalGroup } from '@/features/offline/local-groups';
import { api } from '@/lib/api';

/** Claims of a group, undone ones included (GET /groups/:groupId/claims); none in a local group (ADR-0021). */
export const claimsQuery = (groupId: string) =>
  queryOptions({
    queryKey: [...groupKeys.detail(groupId), 'claims'] as const,
    queryFn: async () =>
      (await isLocalGroup(groupId)) ? [] : parseResponse(api.groups[':groupId'].claims.$get({ param: { groupId } })),
  });
export type Claim = InferResponseType<(typeof api.groups)[':groupId']['claims']['$get'], 200>[number];

/**
 * Undoes a claim (any member): the member is without an account again. Undoing
 * my own claim removes me from the group, so the group list refreshes too.
 */
export function useUndoClaim(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (claimId: string) =>
      parseResponse(api.groups[':groupId'].claims[':claimId'].undo.$post({ param: { groupId, claimId } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: groupKeys.list() });
      await queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    },
  });
}

/** The personal claim link token of a member without an account (created on first request). */
export const fetchClaimLink = (groupId: string, memberId: string) =>
  parseResponse(api.groups[':groupId'].members[':memberId']['claim-link'].$get({ param: { groupId, memberId } }));

/** Claims a member without an account through a group or personal claim link (POST /links/:token/claim). */
export function useClaimMember(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => parseResponse(api.links[':token'].claim.$post({ param: { token }, json: { memberId } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: groupKeys.list() });
      await queryClient.invalidateQueries({ queryKey: ['links', token] });
    },
  });
}
