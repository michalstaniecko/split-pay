import { router } from 'expo-router';

/**
 * Closes a sheet or modal route. On web (SPA) sheets are plain routes and may
 * be opened directly, so fall back to the inbox when there is nothing to go back to.
 */
export function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
