/** Kilograms or pounds, chosen on the setup screen. */
export type WeightUnit = 'kg' | 'lbs';

/** Used only to add the activity bonus on top of the base intake. */
export type ActivityLevel = 'low' | 'moderate' | 'high';

/**
 * How reminder slots are organised:
 *  - 'time': the user picks a fixed interval (every 60 min, 90 min, …).
 *  - 'cup' : the app derives the interval so one US cup per reminder adds
 *             up to roughly the daily target by sleep time.
 */
export type ScheduleMode = 'time' | 'cup';

/**
 * Body details collected during setup, plus the daily target derived from them.
 * Times are minutes from local midnight (08:00 AM → 480, 10:00 PM → 1320).
 */
export interface UserProfile {
  weight: number;
  weightUnit: WeightUnit;
  activityLevel: ActivityLevel;
  wakeMinutes: number;
  sleepMinutes: number;
  /** Effective minutes between reminders (derived from `cupsPerDay` in cup mode). */
  intervalMinutes: number;
  scheduleMode: ScheduleMode;
  /** Daily intake target in milliliters, after the activity bonus. */
  targetMl: number;
}

/** Whether reminders are currently armed, and which Android channel they use. */
export interface NotificationSettings {
  enabled: boolean;
  channelId: string;
}

/**
 * Running count of cups the user has confirmed drinking today.
 * `date` is the local YYYY-MM-DD, used to reset the counter at midnight.
 */
export interface IntakeState {
  date: string;
  cupsConsumed: number;
}

/** Everything persisted between launches. */
export interface AppState {
  profile: UserProfile;
  notifications: NotificationSettings;
  intake: IntakeState;
}

export type SyncWarningCode = 'permission' | 'schedule' | 'unsupported';

/** Result of saving a profile or flipping the pause switch. */
export interface SyncResult {
  enabled: boolean;
  warning?: string;
  warningCode?: SyncWarningCode;
}
