import { joinTokenFromPath, pendingJoin } from '@/features/group-link/group-link';

/**
 * Every deep link the native app is opened with passes through here (Expo
 * Router native intent). Group links are remembered so that signing in first
 * still ends on the join screen; the path itself is not changed.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const token = joinTokenFromPath(path);
  if (token) pendingJoin.remember(token);
  return path;
}
