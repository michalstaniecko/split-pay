import type { Attendance } from '@split-pay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { api } from '@/lib/api';
import { groupKeys } from './groups-query';

/**
 * Saves the attendance of several members (PUT …/members/:memberId/attendance
 * per member), then refreshes the group. Attendance must already be canonical
 * (`gridChanges` / `normalizeAttendance`); `null` = whole trip.
 */
export function useSaveAttendance(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: readonly { memberId: string; attendance: Attendance | null }[]) =>
      Promise.all(
        changes.map(({ memberId, attendance }) =>
          parseResponse(
            api.groups[':groupId'].members[':memberId'].attendance.$put({
              param: { groupId, memberId },
              json: { attendance },
            }),
          ),
        ),
      ),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    },
  });
}
