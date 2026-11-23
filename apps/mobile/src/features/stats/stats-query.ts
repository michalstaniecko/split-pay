import type { GroupStats } from '@split-pay/shared';
import { queryOptions } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { groupKeys } from '@/features/groups/groups-query';
import { api } from '@/lib/api';

/** Group info → Stats (GET /groups/:groupId/stats), under the group's key so invalidating the group refreshes it. */
export const statsQuery = (groupId: string) =>
  queryOptions({
    queryKey: [...groupKeys.detail(groupId), 'stats'] as const,
    queryFn: async (): Promise<GroupStats> => parseResponse(api.groups[':groupId'].stats.$get({ param: { groupId } })),
  });
