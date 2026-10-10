import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { cupsForTarget, formatTargetMl, US_CUP_ML } from './hydration';
import { calculateReminderSlots } from './time';

/** Android channel id. The visible channel name is "Water Reminders". */
export const WATER_CHANNEL_ID = 'water-reminders';

const NOTIFICATION_TITLE = 'Time to drink a cup of water 💧';

/** Serialize cancel/schedule so a second call cannot overlap the first. */
let reminderChain: Promise<unknown> = Promise.resolve();

function enqueueReminders<T>(task: () => Promise<T>): Promise<T> {
  const run = reminderChain.then(task, task);
  reminderChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Show a banner, play the default sound, and skip the app-icon badge
 * when a reminder arrives while the app is open.
 */
try {
  if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
} catch {
  // Scheduling reports its own error if the native module is unavailable.
}

function isPermissionGranted(status: Notifications.NotificationPermissionsStatus): boolean {
  if (status.granted) return true;
  const iosStatus = status.ios?.status;
  return (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

/**
 * Create the high-importance Android channel.
 * Android 13+ will not show the POST_NOTIFICATIONS prompt until a channel exists.
 * `sound` is omitted on purpose: null would silence the channel, while omitting
 * it selects the system default sound. Vibration is enabled explicitly.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(WATER_CHANNEL_ID, {
    name: 'Water Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    enableLights: true,
    lightColor: '#0EA5E9',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
    description: 'Water reminders during the hours you are awake.',
  });
}

/** True when notifications are already allowed. Does not prompt. */
export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  return isPermissionGranted(current);
}

/**
 * Ask for notification permission.
 * On Android 13+ (API 33+) this is the POST_NOTIFICATIONS runtime prompt.
 * On iOS this is the standard alert/sound authorization prompt.
 */
export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  await ensureAndroidChannel();

  const current = await Notifications.getPermissionsAsync();
  if (isPermissionGranted(current)) return true;

  const asked = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  return isPermissionGranted(asked);
}

/**
 * Replace any pending reminders with one repeating daily alert per slot
 * inside the awake window.
 *
 * `wakeTime` and `sleepTime` are minutes from local midnight.
 * iOS keeps at most 64 pending local notifications, so existing alerts are
 * cleared before the new set is scheduled. Android is cleared too, so a
 * changed interval cannot leave the old times behind.
 */
export function scheduleWaterReminders(
  wakeTime: number,
  sleepTime: number,
  intervalMinutes: number,
  targetMl: number,
): Promise<number> {
  return enqueueReminders(() =>
    scheduleWaterRemindersNow(wakeTime, sleepTime, intervalMinutes, targetMl),
  );
}

async function scheduleWaterRemindersNow(
  wakeTime: number,
  sleepTime: number,
  intervalMinutes: number,
  targetMl: number,
): Promise<number> {
  if (Platform.OS === 'web') {
    throw new Error('Local reminders are supported on Android and iOS.');
  }

  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const slots = calculateReminderSlots(wakeTime, sleepTime, intervalMinutes);
  if (slots.length === 0) {
    throw new Error('No reminder times fall between wake and sleep.');
  }
  if (slots.length > 60) {
    throw new Error('That interval creates too many reminders for one day.');
  }

  // Each reminder = one US cup (236.588 ml) so the body is consistent across
  // both schedule modes. Also surfaces the target cups per day for context.
  const cupsPerDay = cupsForTarget(targetMl);
  const body = `Drink one cup (${US_CUP_ML} ml). Target: ${cupsPerDay} cups a day · ${formatTargetMl(targetMl)} ml goal.`;

  try {
    for (const slot of slots) {
      await Notifications.scheduleNotificationAsync({
        identifier: `water-${slot.hour}-${slot.minute}`,
        content: {
          title: NOTIFICATION_TITLE,
          body,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          interruptionLevel: 'active',
          color: '#0EA5E9',
          vibrate: [0, 250, 250, 250],
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: slot.hour,
          minute: slot.minute,
          channelId: WATER_CHANNEL_ID,
        },
      });
    }
  } catch (error) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    throw error;
  }

  return slots.length;
}

async function safeCall<T>(label: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (error) {
    console.warn(`[water-reminder] ${label} failed:`, error);
    return null;
  }
}

/** Pause: drop every pending reminder and any already delivered banner. */
export function cancelReminders(): Promise<void> {
  return enqueueReminders(cancelRemindersNow);
}

async function cancelRemindersNow(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // Scheduled alerts are already cleared if dismissing the tray fails.
  }
}

/**
 * Clear every delivered notification from the system tray without touching
 * what is scheduled. Called when the app returns to the foreground so stale
 * banners from earlier in the day do not pile up.
 */
export function clearDeliveredCache(): Promise<void> {
  return enqueueReminders(clearDeliveredCacheNow);
}

async function clearDeliveredCacheNow(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // Nothing to do if the tray refused to clear; the next cancel will retry.
  }
}

/**
 * Re-sync the OS alarm set with the current profile.
 *
 * Called on app resume and after background wake-ups so a stale schedule
 * (because the OS cleared alarms, the user cleared the app cache, or the
 * day crossed over) is replaced with a fresh set. Never throws: every
 * notification primitive is wrapped so a transient native failure cannot
 * surface as a crash on cold-start or resume. Returns:
 *  - `revoked` if notification permission is no longer granted
 *  - `scheduled` with how many slots were armed otherwise
 *  - `failed` if the OS refused the operation
 */
export async function syncReminders(
  wakeTime: number,
  sleepTime: number,
  intervalMinutes: number,
  targetMl: number,
): Promise<
  { status: 'revoked' } | { status: 'scheduled'; count: number } | { status: 'failed' }
> {
  if (Platform.OS === 'web') return { status: 'revoked' };

  await safeCall('ensureAndroidChannel', ensureAndroidChannel);

  const allowed = await safeCall('hasNotificationPermission', hasNotificationPermission);
  if (allowed === false) {
    await safeCall('cancelReminders', cancelReminders);
    return { status: 'revoked' };
  }

  const count = await safeCall('scheduleWaterReminders', () =>
    scheduleWaterReminders(wakeTime, sleepTime, intervalMinutes, targetMl),
  );
  await safeCall('clearDeliveredCache', clearDeliveredCache);

  if (count === null) return { status: 'failed' };
  return { status: 'scheduled', count };
}
