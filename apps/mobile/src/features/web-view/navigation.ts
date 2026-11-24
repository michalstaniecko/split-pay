import { router } from 'expo-router';

/** Closes a view-only web page; opened directly (nothing to go back to) → the link's Conversation. */
export function closePublicPage(token: string) {
  if (router.canGoBack()) router.back();
  else router.replace({ pathname: '/g/[token]', params: { token } });
}
