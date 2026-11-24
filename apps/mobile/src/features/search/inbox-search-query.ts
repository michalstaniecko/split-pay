import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { groupKeys } from '@/features/groups/groups-query';
import { localDb } from '@/features/offline/local-session';
import { searchInbox } from './inbox-search';

/**
 * Inbox search ("Szukaj grup i wydatków") over the device cache only — no
 * sync, no API: it works offline (SPEC "Inbox"). Lives under `groupKeys.all`,
 * so whatever refreshes the inbox refreshes the results too.
 */
export const inboxSearchQuery = (query: string) =>
  queryOptions({
    queryKey: [...groupKeys.all, 'search', query.trim()] as const,
    queryFn: async () => searchInbox(await localDb(), query),
    // Keep the last results on screen while the next keystroke is searched.
    placeholderData: keepPreviousData,
    networkMode: 'always',
  });
