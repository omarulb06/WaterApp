import AsyncStorage from '@react-native-async-storage/async-storage';

import { localDateKey } from './time';
import type { AppState, IntakeState } from './types';

/**
 * On-device JSON store for the profile, calculated target, reminder toggle,
 * and the daily cup counter. AsyncStorage works inside Expo Go. MMKV would
 * need a custom dev build.
 *
 * Shape versioning:
 *   v1 — { profile (no scheduleMode), notifications }
 *   v2 — { profile (with scheduleMode), notifications, intake }
 */
const STORAGE_KEY = '@water-reminder/state';

interface StoredStateV1 {
  version: 1;
  profile: {
    weight: number;
    weightUnit: 'kg' | 'lbs';
    activityLevel: 'low' | 'moderate' | 'high';
    wakeMinutes: number;
    sleepMinutes: number;
    intervalMinutes: number;
    targetMl: number;
  };
  notifications: { enabled: boolean; channelId: string };
}

interface StoredStateV2 extends AppState {
  version: 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isV1Profile(value: unknown): value is StoredStateV1['profile'] {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.weight) &&
    (value.weightUnit === 'kg' || value.weightUnit === 'lbs') &&
    (value.activityLevel === 'low' ||
      value.activityLevel === 'moderate' ||
      value.activityLevel === 'high') &&
    isFiniteNumber(value.wakeMinutes) &&
    isFiniteNumber(value.sleepMinutes) &&
    isFiniteNumber(value.intervalMinutes) &&
    isFiniteNumber(value.targetMl)
  );
}

function isV2Profile(value: unknown): value is AppState['profile'] {
  if (!isV1Profile(value)) return false;
  // isV1Profile has already asserted this is a record with the base fields.
  const extra = (value as unknown as Record<string, unknown>).scheduleMode;
  return extra === 'time' || extra === 'cup';
}

function isNotifications(value: unknown): value is AppState['notifications'] {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    typeof value.channelId === 'string'
  );
}

function isIntake(value: unknown): value is IntakeState {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    isNonNegativeInt(value.cupsConsumed)
  );
}

/** Fresh daily intake, cups=0, dated today. */
function emptyIntake(): IntakeState {
  return { date: localDateKey(), cupsConsumed: 0 };
}

export async function loadAppState(): Promise<AppState | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  if (parsed.version === 2) {
    const profile = parsed.profile;
    if (
      !isV2Profile(profile) ||
      !isNotifications(parsed.notifications) ||
      !isIntake(parsed.intake)
    ) {
      return null;
    }
    return {
      profile: {
        weight: profile.weight,
        weightUnit: profile.weightUnit,
        activityLevel: profile.activityLevel,
        wakeMinutes: profile.wakeMinutes,
        sleepMinutes: profile.sleepMinutes,
        intervalMinutes: profile.intervalMinutes,
        scheduleMode: profile.scheduleMode,
        targetMl: profile.targetMl,
      },
      notifications: parsed.notifications,
      intake: parsed.intake,
    };
  }

  if (parsed.version === 1) {
    // Migrate forward: existing users default to the 'time' schedule they
    // already picked, and intake starts fresh for today.
    if (!isV1Profile(parsed.profile) || !isNotifications(parsed.notifications)) {
      return null;
    }
    return {
      profile: { ...parsed.profile, scheduleMode: 'time' },
      notifications: parsed.notifications,
      intake: emptyIntake(),
    };
  }

  return null;
}

export async function saveAppState(state: AppState): Promise<void> {
  const payload: StoredStateV2 = {
    version: 2,
    profile: state.profile,
    notifications: state.notifications,
    intake: state.intake,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
