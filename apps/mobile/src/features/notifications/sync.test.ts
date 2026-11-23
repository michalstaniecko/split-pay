import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const pullGroup = vi.fn(async (groupId: string) => {
  calls.push(`pull ${groupId}`);
});
const invalidateQueries = vi.fn(async ({ queryKey }: { queryKey: readonly string[] }) => {
  calls.push(`invalidate ${queryKey.join('/')}`);
});

vi.mock('@/features/offline/sync', () => ({ syncGroup: pullGroup }));
vi.mock('@/lib/query-client', () => ({ queryClient: { invalidateQueries } }));
vi.mock('@/features/groups/groups-query', () => ({
  groupKeys: { list: () => ['groups', 'list'], detail: (id: string) => ['groups', id] },
}));

const { syncGroup } = await import('./sync');

describe('syncGroup after a push', () => {
  beforeEach(() => {
    calls.length = 0;
    pullGroup.mockClear();
  });

  it("pulls the group's delta into the offline cache, then refreshes the group and the inbox", async () => {
    await syncGroup('g1');
    expect(calls).toEqual(['pull g1', 'invalidate groups/g1', 'invalidate groups/list']);
  });

  it('still refreshes when the pull fails, and reports the failure', async () => {
    pullGroup.mockRejectedValueOnce(new Error('offline'));
    await expect(syncGroup('g1')).rejects.toThrow('offline');
    expect(calls).toEqual(['invalidate groups/g1', 'invalidate groups/list']);
  });
});
