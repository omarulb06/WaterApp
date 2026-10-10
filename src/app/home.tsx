import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showSyncWarning } from '../alerts';
import { BootScreen } from '../components/BootScreen';
import { CupTracker } from '../components/CupTracker';
import {
  cupsForTarget,
  formatLiters,
  formatTargetMl,
  formatWeight,
  millilitersFromCups,
  millilitersPerReminder,
  US_CUP_ML,
} from '../hydration';
import { activityLabel, intervalLabel, scheduleModeLabel } from '../options';
import { useAppState } from '../state/AppStateContext';
import { colors, fonts, radius } from '../theme';
import {
  calculateReminderSlots,
  formatClock,
  formatCountdown,
  formatUpcoming,
  nextReminderDate,
  remindersRemainingToday,
} from '../time';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, state, setRemindersEnabled, recordCup, resetIntake } = useAppState();
  const [now, setNow] = useState(() => new Date());
  const [optimistic, setOptimistic] = useState(state?.notifications.enabled ?? false);
  const [busy, setBusy] = useState(false);
  const [cupBusy, setCupBusy] = useState(false);

  useEffect(() => {
    setOptimistic(state?.notifications.enabled ?? false);
  }, [state?.notifications.enabled]);

  useEffect(() => {
    // 15s cadence keeps the "in X min" countdown roughly accurate without
    // waking too often. The display rounds to whole minutes anyway.
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!ready) return <BootScreen />;
  if (!state) return <Redirect href="/onboarding" />;

  const { profile } = state;
  const slots = calculateReminderSlots(
    profile.wakeMinutes,
    profile.sleepMinutes,
    profile.intervalMinutes,
  );
  const each = millilitersPerReminder(profile.targetMl, slots.length);
  const next = optimistic
    ? nextReminderDate(profile.wakeMinutes, profile.sleepMinutes, profile.intervalMinutes, now)
    : null;
  const remainingToday = optimistic
    ? remindersRemainingToday(
        profile.wakeMinutes,
        profile.sleepMinutes,
        profile.intervalMinutes,
        now,
      )
    : 0;
  // The last slot is the final element of today's slot list (ascending).
  const lastSlotToday = slots.length > 0 ? slots[slots.length - 1] : null;
  const lastSlotLabel = lastSlotToday ? formatClock(lastSlotToday.hour * 60 + lastSlotToday.minute) : null;
  const nextIsTomorrow =
    next !== null &&
    (next.getFullYear() !== now.getFullYear() ||
      next.getMonth() !== now.getMonth() ||
      next.getDate() !== now.getDate());
  const nextLabel = !optimistic
    ? 'Paused'
    : next
      ? `${formatUpcoming(next, now)} · ${formatCountdown(next, now)}`
      : 'None scheduled';
  const todayLabel = !optimistic
    ? '—'
    : remainingToday > 0
      ? `${remainingToday} of ${slots.length} left`
      : lastSlotLabel
        ? `Done — last was ${lastSlotLabel}`
        : 'None scheduled';
  const goalText = `Goal: ${formatTargetMl(profile.targetMl)} ml`;

  // Overnight (night-shift) schedules: sleep clock is earlier than wake clock.
  const isOvernight = profile.sleepMinutes < profile.wakeMinutes;
  // A plain-English explanation when Next rolls to tomorrow. Makes the
  // common confusion ("why is Next 8:00 AM when I just set up at 3 PM?")
  // obvious: it's because the awake window has already ended for today.
  const nextHint =
    optimistic && nextIsTomorrow && lastSlotLabel && !isOvernight
      ? `Today's window ${formatClock(profile.wakeMinutes)} – ${formatClock(profile.sleepMinutes)} is already done (last reminder was ${lastSlotLabel}).`
      : null;
  const overnightHint = isOvernight
    ? `Overnight schedule: your awake window runs from ${formatClock(profile.wakeMinutes)} through midnight to ${formatClock(profile.sleepMinutes)}.`
    : null;

  // Daily cup goal and progress. In cup mode we also show the slot interval
  // next to it so the user sees "11 cups · one every 77 min".
  const cupsGoal = cupsForTarget(profile.targetMl);
  const cupsConsumed = state.intake.cupsConsumed;
  const litersConsumed = millilitersFromCups(cupsConsumed);
  const progress = cupsGoal > 0 ? Math.min(1, cupsConsumed / cupsGoal) : 0;
  const goalReached = cupsConsumed >= cupsGoal;

  const facts = [
    {
      label: 'Awake',
      value: `${formatClock(profile.wakeMinutes)} – ${formatClock(profile.sleepMinutes)}`,
    },
    {
      label: 'Style',
      value: `${scheduleModeLabel(profile.scheduleMode)} · ${intervalLabel(profile.intervalMinutes)}`,
    },
    {
      label: 'Reminders today',
      value: `${slots.length} ${slots.length === 1 ? 'reminder' : 'reminders'}`,
    },
    {
      label: 'Each cup',
      value:
        profile.scheduleMode === 'cup'
          ? `${US_CUP_ML} ml (one US cup)`
          : slots.length > 0
            ? `About ${formatTargetMl(each)} ml`
            : '—',
    },
    { label: 'Today', value: todayLabel },
    { label: 'Next', value: nextLabel },
  ];

  async function onDrink(delta: number) {
    if (cupBusy) return;
    setCupBusy(true);
    try {
      await recordCup(delta);
    } finally {
      setCupBusy(false);
    }
  }

  async function onReset() {
    if (cupBusy) return;
    Alert.alert(
      'Reset today?',
      'This clears today\u2019s cup count. You can start logging again from zero.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setCupBusy(true);
            void resetIntake().finally(() => setCupBusy(false));
          },
        },
      ],
    );
  }

  /**
   * Open the battery-optimisation settings so the user can allow this app
   * to keep running in the background. Required on Samsung, Xiaomi, Oppo,
   * Vivo, OnePlus and other OEMs that force-stop apps swiped from recents,
   * which also cancels every scheduled alarm.
   */
  async function openBatterySettings() {
    if (Platform.OS !== 'android') {
      void Linking.openSettings();
      return;
    }
    try {
      // Preferred: open the per-app list where the user picks "Not optimised".
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    } catch {
      try {
        // Fallback: our app's info screen (Battery → Unrestricted lives here on most OEMs).
        await Linking.openSettings();
      } catch (error) {
        console.warn('[water-reminder] openBatterySettings failed:', error);
        Alert.alert(
          'Open battery settings manually',
          'Settings → Apps → Water Reminder → Battery → Unrestricted (or “Not optimised”).',
        );
      }
    }
  }

  async function onToggle(nextEnabled: boolean) {
    if (busy) return;
    const previous = optimistic;
    setOptimistic(nextEnabled);
    setBusy(true);
    try {
      const result = await setRemindersEnabled(nextEnabled);
      setOptimistic(result.enabled);
      showSyncWarning(result, 'Reminders stayed off');
    } catch (error) {
      console.error(error);
      setOptimistic(previous);
      Alert.alert('Could not update reminders', 'Your reminder setting could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.column}>
          <Text style={styles.kicker}>WATER REMINDER</Text>
          <View style={styles.mark} />
          <Text style={styles.goalLabel} accessibilityRole="header">
            Today
          </Text>
          <Text
            style={styles.goalValue}
            accessibilityLabel={`${formatLiters(litersConsumed)} liters of ${formatLiters(profile.targetMl)} liters`}
            maxFontSizeMultiplier={1.3}
          >
            {formatLiters(litersConsumed)}
            <Text style={styles.goalUnit}> / {formatLiters(profile.targetMl)} L</Text>
          </Text>
          <Text style={styles.basis}>
            {cupsConsumed} of {cupsGoal} cups · {goalText} · {formatWeight(profile.weight)}{' '}
            {profile.weightUnit} · {activityLabel(profile.activityLevel)} activity
          </Text>

          <CupTracker consumed={cupsConsumed} goal={cupsGoal} progress={progress} />

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="I drank a cup"
              onPress={() => void onDrink(1)}
              disabled={cupBusy}
              style={({ pressed }) => [
                styles.drinkButton,
                pressed && styles.drinkButtonPressed,
                cupBusy && styles.drinkButtonBusy,
              ]}
            >
              <Text style={styles.drinkEmoji}>💧</Text>
              <Text style={styles.drinkText}>
                {goalReached ? 'One more cup' : 'I drank a cup'}
              </Text>
              <Text style={styles.drinkMeta}>+1 cup · {US_CUP_ML} ml</Text>
            </Pressable>
          </View>

          <View style={styles.undoRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo last cup"
              onPress={() => void onDrink(-1)}
              disabled={cupBusy || cupsConsumed === 0}
              hitSlop={8}
              style={styles.linkButton}
            >
              <Text style={[styles.linkText, cupsConsumed === 0 && styles.linkDisabled]}>Undo</Text>
            </Pressable>
            <Text style={styles.undoSeparator}>·</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset today's cup count"
              onPress={() => void onReset()}
              disabled={cupBusy || cupsConsumed === 0}
              hitSlop={8}
              style={styles.linkButton}
            >
              <Text style={[styles.linkText, cupsConsumed === 0 && styles.linkDisabled]}>Reset today</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            {facts.map((fact, index) => (
              <View
                key={fact.label}
                style={[styles.fact, index < facts.length - 1 && styles.factBorder]}
              >
                <Text style={styles.factLabel}>{fact.label}</Text>
                <Text style={styles.factValue}>{fact.value}</Text>
              </View>
            ))}
          </View>

          {nextHint ? (
            <Text style={styles.hint} accessibilityRole="text">
              {nextHint}
            </Text>
          ) : null}

          {overnightHint ? (
            <Text style={styles.hint} accessibilityRole="text">
              {overnightHint}
            </Text>
          ) : null}

          {Platform.OS === 'android' ? (
            <View style={styles.helpCard}>
              <Text style={styles.helpTitle}>Not getting reminders when the app is closed?</Text>
              <Text style={styles.helpBody}>
                Some phones (Samsung, Xiaomi, Oppo, Vivo, OnePlus, Realme) stop apps swiped from recents and cancel their alarms. Allow Water Reminder to run in the background so reminders keep firing.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void openBatterySettings();
                }}
                style={({ pressed }) => [styles.helpButton, pressed && styles.helpButtonPressed]}
              >
                <Text style={styles.helpButtonText}>Open battery settings</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={[styles.toggleCard, busy && styles.toggleBusy]}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Reminders</Text>
              <Text style={styles.toggleDetail}>
                {optimistic ? 'On between wake and sleep' : 'Paused. Your goal stays saved.'}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Water reminders"
              accessibilityHint={optimistic ? 'On between wake and sleep' : 'Paused'}
              value={optimistic}
              onValueChange={(value) => {
                void onToggle(value);
              }}
              disabled={busy}
              trackColor={{ false: colors.trackOff, true: colors.lagoon }}
              thumbColor={colors.white}
              ios_backgroundColor={colors.trackOff}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/onboarding')}
            style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
          >
            <Text style={styles.secondaryText}>Edit Body Details</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: 520,
    paddingHorizontal: 22,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 1.6,
    color: colors.lagoon,
  },
  mark: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.lagoon,
    marginTop: 12,
  },
  goalLabel: {
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 42,
    color: colors.ink,
    marginTop: 16,
  },
  goalValue: {
    fontFamily: fonts.semibold,
    fontSize: 64,
    lineHeight: 72,
    color: colors.ink,
    marginTop: 4,
  },
  goalUnit: {
    fontFamily: fonts.medium,
    fontSize: 28,
    color: colors.muted,
  },
  basis: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.muted,
    marginTop: 6,
  },
  card: {
    marginTop: 28,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 14,
  },
  factBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  factLabel: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.muted,
  },
  factValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  hint: {
    marginTop: 10,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    paddingHorizontal: 4,
  },
  helpCard: {
    marginTop: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  helpTitle: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  helpBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    marginTop: 4,
  },
  helpButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.lagoon,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  helpButtonPressed: {
    backgroundColor: colors.foam,
  },
  helpButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.lagoon,
  },
  actionsRow: {
    marginTop: 18,
  },
  drinkButton: {
    minHeight: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.lagoon,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
  },
  drinkButtonPressed: {
    backgroundColor: colors.lagoonPressed,
  },
  drinkButtonBusy: {
    opacity: 0.7,
  },
  drinkEmoji: {
    fontSize: 24,
  },
  drinkText: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.white,
    marginTop: 2,
  },
  drinkMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
  },
  undoRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  linkButton: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  linkText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.lagoon,
  },
  linkDisabled: {
    color: colors.faint,
  },
  undoSeparator: {
    color: colors.faint,
    fontSize: 14,
  },
  toggleCard: {
    marginTop: 14,
    minHeight: 76,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleBusy: {
    opacity: 0.7,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleTitle: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.ink,
  },
  toggleDetail: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 2,
  },
  secondary: {
    marginTop: 18,
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.lagoon,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryPressed: {
    backgroundColor: colors.foam,
  },
  secondaryText: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.lagoon,
  },
});
