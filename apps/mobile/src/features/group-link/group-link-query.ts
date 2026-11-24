import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { groupKeys } from '@/features/groups/groups-query';
import { api } from '@/lib/api';

/** The current group link token of one of my groups (GET /groups/:groupId/link). */
export const groupLinkQuery = (groupId: string) =>
  queryOptions({
    queryKey: [...groupKeys.detail(groupId), 'link'] as const,
    queryFn: () => parseResponse(api.groups[':groupId'].link.$get({ param: { groupId } })),
  });

/** Revokes the group link and generates a new one; the old link stops working. */
export function useRevokeGroupLink(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => parseResponse(api.groups[':groupId'].link.revoke.$post({ param: { groupId } })),
    onSuccess: (link) => {
      queryClient.setQueryData(groupLinkQuery(groupId).queryKey, link);
    },
  });
}

/** What the join screen shows for a group link token (GET /links/:token). 404 = unknown or revoked. */
export const linkPreviewQuery = (token: string) =>
  queryOptions({
    queryKey: ['links', token] as const,
    queryFn: () => parseResponse(api.links[':token'].$get({ param: { token } })),
    retry: false,
  });

/** Joins the group behind a group link as a new person (POST /links/:token/join). */
export function useJoinGroup(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => parseResponse(api.links[':token'].join.$post({ param: { token } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: groupKeys.list() });
      await queryClient.invalidateQueries({ queryKey: ['links', token] });
    },
  });
}
