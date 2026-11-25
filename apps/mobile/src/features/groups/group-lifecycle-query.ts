import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { deleteLocalGroup } from '@/features/offline/local-group-store';
import { isLocalGroup, localGroupsDb } from '@/features/offline/local-groups';
import { api } from '@/lib/api';
import { groupKeys } from './groups-query';

/** Archives (`archived: true`) or unarchives the group; refreshes it and the inbox. */
export function useSetGroupArchived(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) => {
      const param = { param: { groupId } };
      return parseResponse(
        archived ? api.groups[':groupId'].archive.$put(param) : api.groups[':groupId'].archive.$delete(param),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
        queryClient.invalidateQueries({ queryKey: groupKeys.list() }),
      ]);
    },
  });
}

/**
 * Takes the group out of my inbox after leaving or deleting it: drops its
 * cached data (I no longer have access) and refreshes the list.
 */
async function forgetGroup(queryClient: ReturnType<typeof useQueryClient>, groupId: string) {
  queryClient.removeQueries({ queryKey: groupKeys.detail(groupId) });
  await queryClient.invalidateQueries({ queryKey: groupKeys.list() });
}

/** Leaves the group (POST /groups/:groupId/leave); the API answers 409 with a non-zero balance. */
export function useLeaveGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => parseResponse(api.groups[':groupId'].leave.$post({ param: { groupId } })),
    onSuccess: () => forgetGroup(queryClient, groupId),
  });
}

/**
 * Permanently deletes the group (DELETE /groups/:groupId) — owner only. A
 * local group is deleted from the device database at once (ADR-0021).
 */
export function useDeleteGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (await isLocalGroup(groupId)) await deleteLocalGroup(await localGroupsDb(), groupId);
      else await parseResponse(api.groups[':groupId'].$delete({ param: { groupId } }));
    },
    onSuccess: () => forgetGroup(queryClient, groupId),
  });
}
