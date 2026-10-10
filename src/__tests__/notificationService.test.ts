/**
 * Mocks the `expo-notifications` native surface so we can assert that:
 *  - scheduling cancels the previous set before writing new slots
 *  - each slot uses a DAILY trigger on our channel
 *  - cancel also clears the delivered-notification tray
 *  - the "sync on resume" flow clears, re-schedules, and sweeps the tray
 *
 * `jest.mock` with a factory is hoisted above the require below, so the
 * mock is applied before `notificationService` is imported.
 */

jest.mock('expo-notifications', () => {
  const SchedulableTriggerInputTypes = { DAILY: 'daily' };
  const AndroidImportance = { HIGH: 4 };
  const AndroidNotificationVisibility = { PUBLIC: 1 };
  const IosAuthorizationStatus = {
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  };
  const AndroidNotificationPriority = { HIGH: 'high' };
  return {
    __esModule: true,
    SchedulableTriggerInputTypes,
    AndroidImportance,
    AndroidNotificationVisibility,
    IosAuthorizationStatus,
    AndroidNotificationPriority,
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, ios: {} }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, ios: {} }),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications = require('expo-notifications');
import {
  cancelReminders,
  clearDeliveredCache,
  ensureAndroidChannel,
  hasNotificationPermission,
  requestPermissions,
  scheduleWaterReminders,
  syncReminders,
  WATER_CHANNEL_ID,
} from '../notificationService';

beforeEach(() => {
  jest.clearAllMocks();
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, ios: {} });
  Notifications.requestPermissionsAsync.mockResolvedValue({ granted: true, ios: {} });
});

describe('ensureAndroidChannel', () => {
  it('creates the Water Reminders high-importance channel', async () => {
    await ensureAndroidChannel();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      WATER_CHANNEL_ID,
      expect.objectContaining({
        name: 'Water Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
      }),
    );
  });
});

describe('requestPermissions', () => {
  it('does not prompt again when already granted', async () => {
    await requestPermissions();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts when permission has not been granted yet', async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({ granted: false, ios: {} });
    Notifications.requestPermissionsAsync.mockResolvedValueOnce({ granted: true, ios: {} });
    const allowed = await requestPermissions();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(allowed).toBe(true);
  });

  it('reports false when the user declines', async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({ granted: false, ios: {} });
    Notifications.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, ios: {} });
    expect(await requestPermissions()).toBe(false);
  });
});

describe('hasNotificationPermission', () => {
  it('is true for iOS provisional authorization', async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      ios: { status: Notifications.IosAuthorizationStatus.PROVISIONAL },
    });
    expect(await hasNotificationPermission()).toBe(true);
  });

  it('is false when nothing is granted', async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({ granted: false, ios: {} });
    expect(await hasNotificationPermission()).toBe(false);
  });
});

describe('scheduleWaterReminders', () => {
  it('cancels the old set, then schedules one DAILY alert per slot', async () => {
    const count = await scheduleWaterReminders(480, 1320, 60, 2450);

    expect(count).toBe(14);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(14);

    const first = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(first.trigger).toEqual({
      type: 'daily',
      hour: 8,
      minute: 0,
      channelId: WATER_CHANNEL_ID,
    });
    expect(first.content.title).toBe('Time to drink a cup of water 💧');
    // 2,450 ml → ceil(2450 / 236.588) = 11 US cups a day.
    expect(first.content.body).toBe(
      'Drink one cup (236.588 ml). Target: 11 cups a day · 2,450 ml goal.',
    );
  });

  it('states the per-cup amount and daily cup target in each reminder body', async () => {
    // 2,900 ml → ceil(2900 / 236.588) = 13 cups.
    await scheduleWaterReminders(480, 1320, 90, 2900);
    const first = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(first.content.body).toBe(
      'Drink one cup (236.588 ml). Target: 13 cups a day · 2,900 ml goal.',
    );
  });

  it('refuses to schedule when the window has no slots', async () => {
    // Equal wake and sleep yields zero slots.
    await expect(scheduleWaterReminders(480, 480, 60, 2450)).rejects.toThrow(
      /No reminder times/,
    );
  });

  it('schedules overnight windows that cross midnight', async () => {
    // 10 PM → 6 AM, hourly → 8 slots. Pre-reset the schedule mock so each
    // slot gets a fresh resolved value.
    Notifications.scheduleNotificationAsync.mockResolvedValue('id');
    const count = await scheduleWaterReminders(22 * 60, 6 * 60, 60, 2400);
    expect(count).toBe(8);
    const triggerHours = Notifications.scheduleNotificationAsync.mock.calls.map(
      (c: unknown[]) => (c[0] as { trigger: { hour: number } }).trigger.hour,
    );
    expect(triggerHours).toEqual([22, 23, 0, 1, 2, 3, 4, 5]);
  });

  it('rolls back scheduled alarms if a single call fails', async () => {
    Notifications.scheduleNotificationAsync
      .mockResolvedValueOnce('id-1')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(scheduleWaterReminders(480, 1320, 60, 2450)).rejects.toThrow('boom');
    // The rollback cancel is in addition to the initial clear-before-schedule.
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(2);
  });

  it('serialises overlapping schedule calls', async () => {
    const first = scheduleWaterReminders(480, 1320, 60, 2450);
    const second = scheduleWaterReminders(480, 1320, 120, 2450);
    await Promise.all([first, second]);
    // Two full cancel + schedule cycles, in order.
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(2);
  });
});

describe('cancelReminders', () => {
  it('clears both pending and delivered notifications', async () => {
    await cancelReminders();
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('clearDeliveredCache', () => {
  it('dismisses the delivered tray without touching pending alarms', async () => {
    await clearDeliveredCache();
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });
});

describe('syncReminders', () => {
  // Silence the per-call warnings this suite deliberately triggers.
  let warn: jest.SpyInstance;
  beforeAll(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => {
    warn.mockRestore();
  });

  it('re-arms the schedule and clears stale banners when granted', async () => {
    const result = await syncReminders(480, 1320, 60, 2450);
    expect(result).toEqual({ status: 'scheduled', count: 14 });
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(14);
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalled();
  });

  it('reports revoked and cancels when permission is gone', async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({ granted: false, ios: {} });
    const result = await syncReminders(480, 1320, 60, 2450);
    expect(result).toEqual({ status: 'revoked' });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });

  it('swallows a channel setup failure instead of throwing', async () => {
    Notifications.setNotificationChannelAsync.mockRejectedValueOnce(new Error('native down'));
    const result = await syncReminders(480, 1320, 60, 2450);
    // Channel failure does not block scheduling.
    expect(result).toEqual({ status: 'scheduled', count: 14 });
  });

  it('returns failed when scheduling itself refuses, without throwing', async () => {
    Notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error('full queue'));
    const result = await syncReminders(480, 1320, 60, 2450);
    expect(result).toEqual({ status: 'failed' });
  });

  it('still returns a status when the permission check throws', async () => {
    Notifications.getPermissionsAsync.mockRejectedValueOnce(new Error('bridge down'));
    const result = await syncReminders(480, 1320, 60, 2450);
    // A null permission check is treated as "unknown, try to schedule".
    expect(result.status).toBe('scheduled');
  });
});
