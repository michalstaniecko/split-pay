import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { groupKeys } from '@/features/groups/groups-query';
import { deviceDbIfAny, hasCacheUser, cacheDb } from '@/features/offline/local-session';
import { type InboxSearchResults, searchInbox } from './inbox-search';

/**
 * Inbox search ("Szukaj grup i wydatków") over the device cache only — no
 * sync, no API: it works offline (SPEC "Inbox"). Lives under `groupKeys.all`,
 * so whatever refreshes the inbox refreshes the results too. Local groups
 * (ADR-0021) are searched too — signed out, only them.
 */
export const inboxSearchQuery = (query: string) =>
  queryOptions({
    queryKey: [...groupKeys.all, 'search', query.trim()] as const,
    queryFn: async (): Promise<InboxSearchResults> => {
      const device = await deviceDbIfAny();
      const user = hasCacheUser() ? await cacheDb() : null;
      return searchInbox([user, device].filter((db) => db !== null), query);
    },
    // Keep the last results on screen while the next keystroke is searched.
    placeholderData: keepPreviousData,
    networkMode: 'always',
  });
