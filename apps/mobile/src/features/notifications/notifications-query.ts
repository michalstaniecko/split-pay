import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { groupKeys } from '@/features/groups/groups-query';
import { api } from '@/lib/api';

export const notificationKeys = {
  global: () => ['me', 'notifications'] as const,
  group: (groupId: string) => [...groupKeys.detail(groupId), 'notifications'] as const,
  nudges: (groupId: string) => [...groupKeys.detail(groupId), 'nudges'] as const,
};

/** The global notifications switch (Profile). */
export const notificationSettingQuery = () =>
  queryOptions({
    queryKey: notificationKeys.global(),
    queryFn: () => parseResponse(api.me.notifications.$get()),
  });

export function useSetNotificationsEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => parseResponse(api.me.notifications.$put({ json: { enabled } })),
    onSuccess: (data) => queryClient.setQueryData(notificationKeys.global(), data),
  });
}

/** My notifications switch for one group (Group info → settings). */
export const groupNotificationSettingQuery = (groupId: string) =>
  queryOptions({
    queryKey: notificationKeys.group(groupId),
    queryFn: () => parseResponse(api.groups[':groupId'].notifications.$get({ param: { groupId } })),
  });

export function useSetGroupNotificationsEnabled(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      parseResponse(api.groups[':groupId'].notifications.$put({ param: { groupId }, json: { enabled } })),
    onSuccess: (data) => queryClient.setQueryData(notificationKeys.group(groupId), data),
  });
}

/** Members nudged in the last 24 h ("przypomniano dziś" in the balance drawer). */
export const nudgesQuery = (groupId: string) =>
  queryOptions({
    queryKey: notificationKeys.nudges(groupId),
    queryFn: () => parseResponse(api.groups[':groupId'].nudges.$get({ param: { groupId } })),
  });

/** "Przypomnij": pushes a reminder to the member who owes me. */
export function useNudge(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      parseResponse(api.groups[':groupId'].nudges.$post({ param: { groupId }, json: { memberId } })),
    // Also after a 429 (someone else nudged first): the list shows who was reminded.
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.nudges(groupId) }),
  });
}
