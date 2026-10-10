import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadAppState, saveAppState } from '../storage';
import { localDateKey } from '../time';
import type { AppState } from '../types';

const STORAGE_KEY = '@water-reminder/state';

const sample: AppState = {
  profile: {
    weight: 70,
    weightUnit: 'kg',
    activityLevel: 'moderate',
    wakeMinutes: 480,
    sleepMinutes: 1320,
    intervalMinutes: 60,
    scheduleMode: 'time',
    targetMl: 2750,
  },
  notifications: {
    enabled: true,
    channelId: 'water-reminders',
  },
  intake: {
    date: localDateKey(),
    cupsConsumed: 3,
  },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('saveAppState + loadAppState', () => {
  it('round-trips the full state', async () => {
    await saveAppState(sample);
    const loaded = await loadAppState();
    expect(loaded).toEqual(sample);
  });

  it('stores a versioned payload', async () => {
    await saveAppState(sample);
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.version).toBe(2);
    expect(parsed.profile.weight).toBe(70);
    expect(parsed.profile.scheduleMode).toBe('time');
    expect(parsed.intake.cupsConsumed).toBe(3);
  });

  it('migrates a v1 payload forward with sensible defaults', async () => {
    // What previous installs wrote: no scheduleMode, no intake, version 1.
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        profile: {
          weight: 70,
          weightUnit: 'kg',
          activityLevel: 'moderate',
          wakeMinutes: 480,
          sleepMinutes: 1320,
          intervalMinutes: 60,
          targetMl: 2750,
        },
        notifications: { enabled: true, channelId: 'water-reminders' },
      }),
    );
    const loaded = await loadAppState();
    expect(loaded).not.toBeNull();
    expect(loaded!.profile.scheduleMode).toBe('time');
    expect(loaded!.intake.cupsConsumed).toBe(0);
    expect(loaded!.intake.date).toBe(localDateKey());
  });

  it('returns null when no state is stored', async () => {
    expect(await loadAppState()).toBeNull();
  });

  it('rejects a payload missing a version', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ profile: sample.profile, notifications: sample.notifications }),
    );
    expect(await loadAppState()).toBeNull();
  });

  it('rejects a payload with the wrong activity enum', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        profile: { ...sample.profile, activityLevel: 'extreme' },
        notifications: sample.notifications,
        intake: sample.intake,
      }),
    );
    expect(await loadAppState()).toBeNull();
  });

  it('rejects a payload with non-finite numbers', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        profile: { ...sample.profile, weight: null },
        notifications: sample.notifications,
        intake: sample.intake,
      }),
    );
    expect(await loadAppState()).toBeNull();
  });

  it('rejects a v2 payload with no scheduleMode', async () => {
    const { scheduleMode: _removed, ...rest } = sample.profile;
    void _removed;
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        profile: rest,
        notifications: sample.notifications,
        intake: sample.intake,
      }),
    );
    expect(await loadAppState()).toBeNull();
  });

  it('returns null for unparseable JSON', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not json');
    expect(await loadAppState()).toBeNull();
  });
});
