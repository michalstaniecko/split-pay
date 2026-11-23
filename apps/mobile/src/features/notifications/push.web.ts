// No push notifications on the web (read-only view, no login): see push.ts.
export async function registerForPush(_locale: string): Promise<void> {}
export async function unregisterFromPush(): Promise<void> {}
export function usePushNotifications() {}
