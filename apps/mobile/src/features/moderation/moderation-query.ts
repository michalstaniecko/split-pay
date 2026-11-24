import type { ReportReason } from '@split-pay/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { photoKeys } from '@/features/photos/photos-query';
import { api } from '@/lib/api';

/** Content reporting and the admin panel (#27). Admin data is online-only. */
export const moderationKeys = {
  all: ['admin'] as const,
  reports: () => [...moderationKeys.all, 'reports'] as const,
  blocked: () => [...moderationKeys.all, 'blocked'] as const,
};

/** Reports a photo the user can see. The answer says nothing more than "reported". */
export const useReportPhoto = () =>
  useMutation({
    mutationFn: (input: { photoId: string; reason: ReportReason; details: string }) =>
      parseResponse(api.reports.$post({ json: input })),
  });

/** Avatars of a group's members with their photo ids (same cache as `groupAvatarsQuery`). */
export const groupAvatarPhotosQuery = (groupId: string) =>
  queryOptions({
    queryKey: photoKeys.groupAvatars(groupId),
    queryFn: () => parseResponse(api.groups[':groupId'].avatars.$get({ param: { groupId } })),
    select: (data) => new Map(data.avatars.map((a) => [a.memberId, { photoId: a.photoId, url: a.url }])),
    retry: false,
  });

const fetchReports = async () => (await parseResponse(api.admin.reports.$get())).reports;
/** An open report as the admin panel shows it. */
export type AdminReport = Awaited<ReturnType<typeof fetchReports>>[number];

export const adminReportsQuery = () => queryOptions({ queryKey: moderationKeys.reports(), queryFn: fetchReports });

export const blockedAccountsQuery = () =>
  queryOptions({
    queryKey: moderationKeys.blocked(),
    queryFn: async () => (await parseResponse(api.admin.users.blocked.$get())).blocked,
  });

/** Admin actions; each refreshes the report list and the blocked accounts. */
export function useAdminActions() {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: moderationKeys.all });
  const removePhoto = useMutation({
    mutationFn: (photoId: string) => parseResponse(api.admin.photos[':photoId'].$delete({ param: { photoId } })),
    onSuccess,
  });
  const dismissReport = useMutation({
    mutationFn: (reportId: string) =>
      parseResponse(api.admin.reports[':reportId'].dismiss.$post({ param: { reportId } })),
    onSuccess,
  });
  const block = useMutation({
    mutationFn: (input: { userId: string; reason: string }) =>
      parseResponse(
        api.admin.users[':userId'].block.$post({ param: { userId: input.userId }, json: { reason: input.reason } }),
      ),
    onSuccess,
  });
  const unblock = useMutation({
    mutationFn: (userId: string) => parseResponse(api.admin.users[':userId'].block.$delete({ param: { userId } })),
    onSuccess,
  });
  return { removePhoto, dismissReport, block, unblock };
}
