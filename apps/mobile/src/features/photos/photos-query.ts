import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { Platform } from 'react-native';
import { entryKeys } from '@/features/entries/entries-query';
import { groupKeys } from '@/features/groups/groups-query';
import { api } from '@/lib/api';
import { BucketUploadError, type LocalPhoto, uploadForm } from './photo-draft';

/**
 * Photos (ADR-0006): the API signs URLs, the phone uploads to and reads from
 * the private bucket directly. Read URLs live 10 minutes, so these queries go
 * stale after 5 and refresh in the background; images are cached by photo id
 * (`cacheKey`), so a fresh URL doesn't download the photo again.
 */
const URL_STALE_MS = 5 * 60 * 1000;
const URL_REFRESH_MS = 9 * 60 * 1000;

export const photoKeys = {
  /** Under the entries key: every entry change refreshes the receipts too. */
  receipts: (groupId: string) => [...entryKeys.list(groupId), 'receipts'] as const,
  groupAvatars: (groupId: string) => [...groupKeys.detail(groupId), 'avatars'] as const,
  myAvatar: () => ['me', 'avatar'] as const,
};

/** Signed URLs of the receipts of the group's live entries, by entry id. */
export const receiptsQuery = (groupId: string) =>
  queryOptions({
    queryKey: photoKeys.receipts(groupId),
    queryFn: () => parseResponse(api.groups[':groupId'].receipts.$get({ param: { groupId } })),
    select: (data) => new Map(data.receipts.map((r) => [r.entryId, { photoId: r.photoId, url: r.url }])),
    staleTime: URL_STALE_MS,
    refetchInterval: URL_REFRESH_MS,
    retry: false,
  });

/** Signed URLs of the avatars of the group's members, by member id. */
export const groupAvatarsQuery = (groupId: string) =>
  queryOptions({
    queryKey: photoKeys.groupAvatars(groupId),
    queryFn: () => parseResponse(api.groups[':groupId'].avatars.$get({ param: { groupId } })),
    select: (data) => new Map(data.avatars.map((a) => [a.memberId, a.url])),
    staleTime: URL_STALE_MS,
    refetchInterval: URL_REFRESH_MS,
    retry: false,
  });

/** My avatar (Profile, inbox header); `null` = none. */
export const myAvatarQuery = () =>
  queryOptions({
    queryKey: photoKeys.myAvatar(),
    queryFn: async () => (await parseResponse(api.me.avatar.$get())).avatar,
    staleTime: URL_STALE_MS,
    refetchInterval: URL_REFRESH_MS,
    retry: false,
  });

/** Sends a prepared photo to the bucket with a presigned POST upload. */
export async function uploadToBucket(upload: { url: string; fields: Record<string, string> }, photo: LocalPhoto) {
  const file =
    Platform.OS === 'web'
      ? await (await fetch(photo.uri)).blob()
      : // React Native's FormData streams a file given as { uri, name, type }.
        ({ uri: photo.uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  const body = new FormData();
  for (const [name, value] of uploadForm(upload.fields, file)) body.append(name, value);
  const res = await fetch(upload.url, { method: 'POST', body });
  if (!res.ok) throw new BucketUploadError(res.status, await res.text());
}

/**
 * Uploads a receipt for entry `entryId` (which may not exist yet) and returns
 * its photo id for the entry's `receiptPhotoId`. Limits are refused with
 * error codes (`photoProblem`).
 */
export async function uploadReceipt(groupId: string, entryId: string, photo: LocalPhoto): Promise<string> {
  const issued = await parseResponse(
    api.groups[':groupId'].receipts.uploads.$post({
      param: { groupId },
      json: { entryId, contentType: 'image/jpeg', size: photo.size },
    }),
  );
  await uploadToBucket(issued.upload, photo);
  return issued.photoId;
}

/** Every group's avatars (my avatar is shown in all of them). */
const isGroupAvatarsKey = (key: readonly unknown[]) => key[0] === 'groups' && key[2] === 'avatars';

/** Uploads a new avatar and makes it mine; the old one is deleted by the API. */
export function useSetAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photo: LocalPhoto) => {
      const issued = await parseResponse(
        api.me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: photo.size } }),
      );
      await uploadToBucket(issued.upload, photo);
      return (await parseResponse(api.me.avatar.$put({ json: { photoId: issued.photoId } }))).avatar;
    },
    onSuccess: async (avatar) => {
      queryClient.setQueryData(photoKeys.myAvatar(), avatar);
      await queryClient.invalidateQueries({ predicate: (q) => isGroupAvatarsKey(q.queryKey) });
    },
  });
}

/** Removes my avatar (the initial shows again). */
export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => parseResponse(api.me.avatar.$delete()),
    onSuccess: async () => {
      queryClient.setQueryData(photoKeys.myAvatar(), null);
      await queryClient.invalidateQueries({ predicate: (q) => isGroupAvatarsKey(q.queryKey) });
    },
  });
}
