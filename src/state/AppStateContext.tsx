import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState as RNAppState, Platform, type AppStateStatus } from 'react-native';

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
import { loadAppState, saveAppState } from '../storage';
import { localDateKey } from '../time';
import type { AppState, IntakeState, SyncResult, SyncWarningCode, UserProfile } from '../types';

type AppStateContextValue = {
  ready: boolean;
  state: AppState | null;
  saveAndEnable: (profile: UserProfile) => Promise<SyncResult>;
  setRemindersEnabled: (enabled: boolean) => Promise<SyncResult>;
  recordCup: (delta: number) => Promise<void>;
  resetIntake: () => Promise<void>;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

function emptyIntake(): IntakeState {
  return { date: localDateKey(), cupsConsumed: 0 };
}

/**
 * Return an intake record for today. If `prior` was from an older local
 * date, the counter resets to zero at the day boundary.
 */
function ensureIntakeForToday(prior: IntakeState | undefined): IntakeState {
  const today = localDateKey();
  if (!prior || prior.date !== today) return { date: today, cupsConsumed: 0 };
  return prior;
}

async function armReminders(
  profile: UserProfile,
): Promise<{ warning?: string; warningCode?: SyncWarningCode } | undefined> {
  if (Platform.OS === 'web') {
    return {
      warningCode: 'unsupported',
      warning: 'Reminders run on the Android and iOS apps.',
    };
  }

  const permitted = await requestPermissions();
  if (!permitted) {
    await cancelReminders();
    return {
      warningCode: 'permission',
      warning:
        'Allow notifications to get water reminders between wake and sleep. You can turn them on from the home screen after that.',
    };
  }

  try {
    await scheduleWaterReminders(
      profile.wakeMinutes,
      profile.sleepMinutes,
      profile.intervalMinutes,
      profile.targetMl,
    );
    return undefined;
  } catch (error) {
    await cancelReminders();
    const detail = error instanceof Error ? error.message : '';
    const friendly =
      detail.startsWith('No reminder') || detail.startsWith('That interval')
        ? detail
        : 'Reminders could not be scheduled. Your details are saved, and you can try the switch again.';
    return { warningCode: 'schedule', warning: friendly };
  }
}

async function persist(next: AppState): Promise<void> {
  try {
    await saveAppState(next);
  } catch (error) {
    await cancelReminders();
    throw error;
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let next: AppState | null = null;
      try {
        // Channel creation errors are logged by syncReminders, not surfaced here.
        try {
          await ensureAndroidChannel();
        } catch (error) {
          console.warn('[water-reminder] launch channel setup failed:', error);
        }

        try {
          next = await loadAppState();
        } catch (error) {
          console.warn('[water-reminder] loadAppState failed:', error);
          next = null;
        }

        // Roll the intake counter forward if the stored date is not today.
        if (next) {
          const refreshed = ensureIntakeForToday(next.intake);
          if (refreshed !== next.intake) {
            next = { ...next, intake: refreshed };
            try {
              await saveAppState(next);
            } catch (error) {
              console.warn('[water-reminder] intake rollover persist failed:', error);
            }
          }
        }

        if (next?.notifications.enabled && Platform.OS !== 'web') {
          const result = await syncReminders(
            next.profile.wakeMinutes,
            next.profile.sleepMinutes,
            next.profile.intervalMinutes,
            next.profile.targetMl,
          );
          if (result.status !== 'scheduled') {
            // Permission revoked or OS refused: reflect in local state.
            const paused: AppState = {
              ...next,
              notifications: { ...next.notifications, enabled: false },
            };
            try {
              await saveAppState(paused);
            } catch (error) {
              console.warn('[water-reminder] launch persist failed:', error);
            }
            next = paused;
          }
        }
      } catch (error) {
        // Belt-and-braces: nothing above should bubble, but if it did,
        // keep the app usable instead of crashing on cold start.
        console.warn('[water-reminder] launch init failed:', error);
      } finally {
        if (!cancelled) {
          setState(next);
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Keep the OS alarm set and the tray in sync when the app comes back
   * to the foreground. Addresses stale schedules after Android force-stops,
   * cache clears, or a crossed day boundary, and auto-dismisses old banners.
   */
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let appStatus: AppStateStatus = RNAppState.currentState;
    const subscription = RNAppState.addEventListener('change', (next) => {
      const wasBackground = appStatus === 'background' || appStatus === 'inactive';
      appStatus = next;
      if (next !== 'active' || !wasBackground) return;

      const current = stateRef.current;
      if (!current) return;

      (async () => {
        try {
          // Also roll the intake counter if we have crossed midnight while backgrounded.
          const refreshed = ensureIntakeForToday(current.intake);
          let working = current;
          if (refreshed !== current.intake) {
            working = { ...current, intake: refreshed };
            try {
              await saveAppState(working);
            } catch (error) {
              console.warn('[water-reminder] resume intake persist failed:', error);
            }
            setState(working);
          }

          if (working.notifications.enabled) {
            const result = await syncReminders(
              working.profile.wakeMinutes,
              working.profile.sleepMinutes,
              working.profile.intervalMinutes,
              working.profile.targetMl,
            );
            if (result.status === 'revoked') {
              const next: AppState = {
                ...working,
                notifications: { ...working.notifications, enabled: false },
              };
              try {
                await saveAppState(next);
              } catch (persistError) {
                console.warn('[water-reminder] resume persist failed:', persistError);
              }
              setState(next);
            }
            // `failed` is logged inside syncReminders; the toggle stays as the
            // user left it so a transient OS hiccup doesn't flip them off.
          } else {
            // Even when paused, clear any stale delivered notifications.
            await clearDeliveredCache();
          }
        } catch (error) {
          // syncReminders itself does not throw, but keep a last-resort guard.
          console.warn('[water-reminder] resume sync failed:', error);
        }
      })();
    });

    return () => subscription.remove();
  }, []);

  const saveAndEnable = useCallback(async (profile: UserProfile): Promise<SyncResult> => {
    const failure = await armReminders(profile);
    const prior = stateRef.current;
    const next: AppState = {
      profile,
      notifications: {
        enabled: failure === undefined,
        channelId: WATER_CHANNEL_ID,
      },
      // Preserve today's cup count across edits so changing body details
      // doesn't wipe the tally the user has already drunk.
      intake: ensureIntakeForToday(prior?.intake),
    };
    await persist(next);
    setState(next);
    return {
      enabled: next.notifications.enabled,
      warning: failure?.warning,
      warningCode: failure?.warningCode,
    };
  }, []);

  const setRemindersEnabled = useCallback(async (enabled: boolean): Promise<SyncResult> => {
    const current = stateRef.current;
    if (!current) {
      throw new Error('Save body details before changing reminders.');
    }

    if (!enabled) {
      await cancelReminders();
      const next: AppState = {
        ...current,
        notifications: { ...current.notifications, enabled: false },
        intake: ensureIntakeForToday(current.intake),
      };
      await saveAppState(next);
      setState(next);
      return { enabled: false };
    }

    const failure = await armReminders(current.profile);
    const next: AppState = {
      ...current,
      notifications: {
        enabled: failure === undefined,
        channelId: WATER_CHANNEL_ID,
      },
      intake: ensureIntakeForToday(current.intake),
    };
    await persist(next);
    setState(next);
    return {
      enabled: next.notifications.enabled,
      warning: failure?.warning,
      warningCode: failure?.warningCode,
    };
  }, []);

  const recordCup = useCallback(async (delta: number): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;

    const base = ensureIntakeForToday(current.intake);
    // Allow decrements for an "Undo" button, but never let the tally go negative.
    const nextCount = Math.max(0, base.cupsConsumed + Math.trunc(delta));
    const nextIntake: IntakeState = { date: base.date, cupsConsumed: nextCount };
    const next: AppState = { ...current, intake: nextIntake };
    setState(next);
    try {
      await saveAppState(next);
    } catch (error) {
      console.warn('[water-reminder] recordCup persist failed:', error);
      // Roll back the optimistic UI update if persistence failed.
      setState(current);
    }
  }, []);

  const resetIntake = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    const next: AppState = { ...current, intake: emptyIntake() };
    setState(next);
    try {
      await saveAppState(next);
    } catch (error) {
      console.warn('[water-reminder] resetIntake persist failed:', error);
      setState(current);
    }
  }, []);

  const value = useMemo(
    () => ({ ready, state, saveAndEnable, setRemindersEnabled, recordCup, resetIntake }),
    [ready, state, saveAndEnable, setRemindersEnabled, recordCup, resetIntake],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return value;
}
