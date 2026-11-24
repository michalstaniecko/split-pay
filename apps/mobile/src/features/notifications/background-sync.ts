import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { parsePushData } from './notifications';
import { syncGroup } from './sync';

/** Task run for pushes received while the app is in the background (silent sync pushes). */
export const PUSH_SYNC_TASK = 'split-pay-push-sync';

// Must be defined at module scope, before the app renders (imported from index.ts).
TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_SYNC_TASK, async ({ data }) => {
  const push = parsePushData('actionIdentifier' in data ? data.notification.request.content.data : data.data);
  if (!push) return Notifications.BackgroundNotificationTaskResult.NoData;
  try {
    await syncGroup(push.groupId);
    return Notifications.BackgroundNotificationTaskResult.NewData;
  } catch {
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
});
