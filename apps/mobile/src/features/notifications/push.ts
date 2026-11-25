import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { parseResponse } from 'hono/client';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useLocale } from '@/i18n/locale-provider';
import { api } from '@/lib/api';
import { deviceStorage } from '@/lib/device-storage';
import { PUSH_SYNC_TASK } from './background-sync';
import { notificationHref, parsePushData } from './notifications';
import { syncGroup } from './sync';

const TOKEN_KEY = 'push-token';

// Visible notifications show while the app is open too; silent ones (no title) never do.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const visible = Boolean(notification.request.content.title);
    return { shouldShowBanner: visible, shouldShowList: visible, shouldPlaySound: visible, shouldSetBadge: false };
  },
});

/**
 * The Expo project id push tokens belong to. Comes from `extra.eas.projectId`
 * in app.json once the Expo project exists (product owner).
 */
function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Registers this device for pushes: asks for permission, gets the Expo push
 * token and sends it to the API with the UI language (notification texts use
 * it). Silent sync pushes work even if notifications are not allowed.
 */
export async function registerForPush(locale: string): Promise<void> {
  if (!Device.isDevice) return;
  const projectId = expoProjectId();
  if (!projectId) {
    console.warn('[push] no Expo project id (extra.eas.projectId in app.json) — push notifications are off');
    return;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Kwitz',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) await Notifications.requestPermissionsAsync();

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await parseResponse(
    api.me['push-tokens'].$put({
      json: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', locale },
    }),
  );
  deviceStorage.setItem(TOKEN_KEY, token);
  await Notifications.registerTaskAsync(PUSH_SYNC_TASK);
}

/**
 * Removes this device's token before signing out. Best effort: the API also
 * drops it with the session.
 */
export async function unregisterFromPush(): Promise<void> {
  const token = deviceStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    await api.me['push-tokens'].$delete({ json: { token } });
  } catch {
    // Offline: the token goes with the session on the server anyway.
  }
  deviceStorage.setItem(TOKEN_KEY, '');
}

/**
 * Push notifications in the signed-in app: registers the device (again when
 * the language changes), opens the Conversation at the entry when a
 * notification is tapped and syncs the group when a push arrives while the
 * app is open.
 */
export function usePushNotifications() {
  const { locale } = useLocale();

  useEffect(() => {
    registerForPush(locale).catch((error: unknown) => console.warn('[push] registration failed', error));
  }, [locale]);

  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = parsePushData(response.notification.request.content.data);
    if (data?.type !== 'notification') return;
    void syncGroup(data.groupId).catch(() => undefined);
    router.navigate(notificationHref(data));
    // Handled: don't open it again on the next render or launch.
    Notifications.clearLastNotificationResponse();
  }, [response]);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = parsePushData(notification.request.content.data);
      if (data) void syncGroup(data.groupId).catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);
}
