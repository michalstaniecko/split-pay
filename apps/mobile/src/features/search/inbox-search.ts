import type { CurrencyCode, Entry, Id, LocalDate, MinorAmount } from '@split-pay/shared';
import { and, isNotNull, isNull } from 'drizzle-orm';
import type { LocalDb } from '../offline/local-db';
import { type CachedGroup, localEntries, localGroups } from '../offline/local-schema';
import { byLastActivity } from '../offline/local-store';

/** An entry whose title matched; opening it scrolls its group's Conversation to the bubble. */
export interface EntrySearchHit {
  entryId: Id;
  groupId: Id;
  title: string;
  kind: Entry['kind'];
  amount: MinorAmount;
  currency: CurrencyCode;
  date: LocalDate;
  /** The group it belongs to, for the result row. */
  group: Pick<CachedGroup, 'name' | 'emoji' | 'color'>;
}

/** What the inbox search found (SPEC "Inbox": "Szukaj grup i wydatków"). */
export interface InboxSearchResults {
  groups: CachedGroup[];
  entries: EntrySearchHit[];
}

/**
 * Lower-cased and stripped of diacritics, so matching ignores both ("lodz"
 * finds "Łódź"). `ł` has no decomposition, so it is mapped by hand.
 */
const fold = (text: string): string =>
  text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');

/**
 * Searches group names and entry titles across all my groups, in the device's
 * cache (ADR-0005) — works offline, no API call. The cache only ever holds the
 * signed-in user's groups (`saveGroupList` forgets the rest). Given several
 * databases (signed in: the user's cache and the device database with local
 * groups, ADR-0021), the results are merged: groups by last activity, entries
 * newest first. Deleted entries and settlements (no title) don't match.
 */
export async function searchInbox(
  dbs: LocalDb | readonly LocalDb[],
  query: string,
): Promise<InboxSearchResults> {
  const needle = fold(query.trim());
  if (needle === '') return { groups: [], entries: [] };
  const found = await Promise.all((Array.isArray(dbs) ? dbs : [dbs as LocalDb]).map((db) => searchOne(db, needle)));
  return {
    groups: found.flatMap((f) => f.groups).sort(byLastActivity),
    entries: found
      .flatMap((f) => f.entries)
      .sort(
        (a, b) =>
          b.hit.date.localeCompare(a.hit.date) ||
          b.createdAt.localeCompare(a.createdAt) ||
          b.hit.entryId.localeCompare(a.hit.entryId),
      )
      .map((e) => e.hit),
  };
}

async function searchOne(
  db: LocalDb,
  needle: string,
): Promise<{ groups: CachedGroup[]; entries: { hit: EntrySearchHit; createdAt: string }[] }> {
  const groups = (await db.select({ data: localGroups.data }).from(localGroups)).map((g) => g.data);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const rows = await db
    .select({ title: localEntries.title, data: localEntries.data })
    .from(localEntries)
    .where(and(isNull(localEntries.deletedAt), isNotNull(localEntries.title)));

  const entries: { hit: EntrySearchHit; createdAt: string }[] = [];
  for (const { title, data } of rows) {
    const group = groupById.get(data.groupId);
    if (!group || title === null || !fold(title).includes(needle)) continue;
    entries.push({
      createdAt: data.createdAt,
      hit: {
        entryId: data.id,
        groupId: data.groupId,
        title,
        kind: data.kind,
        amount: data.amount,
        currency: data.currency,
        date: data.date,
        group: { name: group.name, emoji: group.emoji, color: group.color },
      },
    });
  }

  return { groups: groups.filter((g) => fold(g.name).includes(needle)), entries };
}
