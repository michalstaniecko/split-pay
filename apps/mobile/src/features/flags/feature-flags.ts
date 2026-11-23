import { type FeatureFlags, mergeFeatureFlags, parseFeatureFlagsJson } from '@split-pay/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { api } from '@/lib/api';
import { deviceStorage } from '@/lib/device-storage';

// The last flags the API served are kept on the device, so a restart without
// network keeps them; before the first successful fetch every flag is off.
const KEY = 'feature-flags';

const loadCachedFlags = (): FeatureFlags => parseFeatureFlagsJson(deviceStorage.getItem(KEY) ?? undefined);

/** Feature flags from the API (GET /flags), cached on the device. */
export const featureFlagsQuery = () =>
  queryOptions({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      // Flags this build doesn't know are dropped; malformed values stay off.
      const flags = mergeFeatureFlags(await parseResponse(api.flags.$get()));
      deviceStorage.setItem(KEY, JSON.stringify(flags));
      return flags;
    },
    initialData: loadCachedFlags,
    // The cached copy counts as stale, so it is refreshed on first use.
    initialDataUpdatedAt: 0,
    staleTime: 60 * 60 * 1000,
  });

/** Current feature flags. Never pending: offline it returns the cached copy or the safe defaults. */
export function useFeatureFlags(): FeatureFlags {
  return useQuery(featureFlagsQuery()).data;
}
