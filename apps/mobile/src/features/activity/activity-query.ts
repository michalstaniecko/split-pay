import type { ActivityPage } from '@split-pay/shared';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { deviceStorage } from '@/lib/device-storage';
import { createActivitySeenStore, hasUnreadActivity } from './activity';

export const activityKeys = {
  all: ['activity'] as const,
  feed: () => [...activityKeys.all, 'feed'] as const,
  latest: () => [...activityKeys.all, 'latest'] as const,
};

/** Activity (#21): changes from all my groups, newest first, page by page. */
export const activityQuery = () =>
  infiniteQueryOptions({
    queryKey: activityKeys.feed(),
    queryFn: async ({ pageParam }) =>
      (await parseResponse(api.activity.$get({ query: pageParam ? { cursor: pageParam } : {} }))) as ActivityPage,
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

/** When someone else last changed something in my groups (the bell's dot). */
export const activityLatestQuery = () =>
  queryOptions({
    queryKey: activityKeys.latest(),
    queryFn: () => parseResponse(api.activity.latest.$get()),
  });

/** When Activity was last opened on this device. */
export const activitySeen = createActivitySeenStore(deviceStorage);

export function useActivityLastOpened(): string | null {
  return useSyncExternalStore(activitySeen.subscribe, activitySeen.get);
}

/** Whether the bell shows the unread dot, given the latest change by others. */
export function useActivityUnread(latestByOthersAt: string | null | undefined): boolean {
  return hasUnreadActivity(latestByOthersAt ?? null, useActivityLastOpened());
}
