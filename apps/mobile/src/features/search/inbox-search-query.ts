import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { groupKeys } from '@/features/groups/groups-query';
import { deviceDbIfAny, hasLocalUser, localDb } from '@/features/offline/local-session';
import { type InboxSearchResults, searchInbox } from './inbox-search';

/**
 * Inbox search ("Szukaj grup i wydatków") over the device cache only — no
 * sync, no API: it works offline (SPEC "Inbox"). Lives under `groupKeys.all`,
 * so whatever refreshes the inbox refreshes the results too. Signed out, it
 * searches the local groups (ADR-0021).
 */
export const inboxSearchQuery = (query: string) =>
  queryOptions({
    queryKey: [...groupKeys.all, 'search', query.trim()] as const,
    queryFn: async (): Promise<InboxSearchResults> => {
      if (hasLocalUser()) return searchInbox(await localDb(), query);
      const device = await deviceDbIfAny();
      return device ? searchInbox(device, query) : { groups: [], entries: [] };
    },
    // Keep the last results on screen while the next keystroke is searched.
    placeholderData: keepPreviousData,
    networkMode: 'always',
  });
