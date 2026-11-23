import type { Entry, GroupStats } from '@split-pay/shared';
import { queryOptions } from '@tanstack/react-query';
import { DetailedError, type InferResponseType, parseResponse } from 'hono/client';
import { publicApi } from '@/lib/public-api';

const link = publicApi.public.links[':token'];

/** Query keys of the view-only web, per link token. */
export const publicKeys = {
  link: (token: string) => ['public', token] as const,
  entries: (token: string) => [...publicKeys.link(token), 'entries'] as const,
  balances: (token: string) => [...publicKeys.link(token), 'balances'] as const,
  stats: (token: string) => [...publicKeys.link(token), 'stats'] as const,
};

/** Unknown or revoked link token: the API answers 404. */
export const isInvalidLink = (error: unknown) => error instanceof DetailedError && error.statusCode === 404;

// A revoked link stays revoked: don't retry 404s.
const retry = (failureCount: number, error: unknown) => !isInvalidLink(error) && failureCount < 1;

/** The group, its members and whom a personal claim link is for (GET /public/links/:token). */
export const publicGroupQuery = (token: string) =>
  queryOptions({
    queryKey: publicKeys.link(token),
    queryFn: () => parseResponse(link.$get({ param: { token } })),
    retry,
  });
export type PublicGroup = InferResponseType<typeof link.$get, 200>;
export type PublicMember = PublicGroup['members'][number];

/**
 * An entry of the public view: `createdBy` is blanked (user ids are not
 * public), `addedBy` names the author's member instead; no receipt photo.
 */
export type PublicEntry = Entry & { addedBy: string | null };

/** Live entries in Conversation order. */
export const publicEntriesQuery = (token: string) =>
  queryOptions({
    queryKey: publicKeys.entries(token),
    queryFn: async (): Promise<PublicEntry[]> => parseResponse(link.entries.$get({ param: { token } })),
    retry,
  });

/** Balances and suggested transfers (no payout details on the web). */
export const publicBalancesQuery = (token: string) =>
  queryOptions({
    queryKey: publicKeys.balances(token),
    queryFn: () => parseResponse(link.balances.$get({ param: { token } })),
    retry,
  });
export type PublicBalances = InferResponseType<typeof link.balances.$get, 200>;

/** Group info → Stats. */
export const publicStatsQuery = (token: string) =>
  queryOptions({
    queryKey: publicKeys.stats(token),
    queryFn: async (): Promise<GroupStats> => parseResponse(link.stats.$get({ param: { token } })),
    retry,
  });
