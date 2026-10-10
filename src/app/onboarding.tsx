import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showSyncWarning } from '../alerts';
import { IntervalField } from '../components/IntervalField';
import { TimeField } from '../components/TimeField';
import {
  buildUserProfile,
  calculateDailyTargetMl,
  convertWeight,
  cupsForTarget,
  formatTargetMl,
  formatWeight,
  intervalForCupSchedule,
  millilitersPerReminder,
  US_CUP_ML,
} from '../hydration';
import {
  ACTIVITY_OPTIONS,
  activityLabel,
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_SCHEDULE_MODE,
  SCHEDULE_MODE_OPTIONS,
} from '../options';
import { useAppState } from '../state/AppStateContext';
import { colors, fonts, radius } from '../theme';
import {
  awakeWindowMinutes,
  calculateReminderSlots,
  DEFAULT_SLEEP_MINUTES,
  DEFAULT_WAKE_MINUTES,
} from '../time';
import type { ActivityLevel, ScheduleMode, WeightUnit } from '../types';
import { getSetupErrors, parseWeight, sanitizeWeightInput } from '../validation';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, saveAndEnable } = useAppState();
  const profile = state?.profile;

  const [weightText, setWeightText] = useState(profile ? formatWeight(profile.weight) : '');
  const [unit, setUnit] = useState<WeightUnit>(profile?.weightUnit ?? 'kg');
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activityLevel ?? 'low');
  const [wakeMinutes, setWakeMinutes] = useState(profile?.wakeMinutes ?? DEFAULT_WAKE_MINUTES);
  const [sleepMinutes, setSleepMinutes] = useState(profile?.sleepMinutes ?? DEFAULT_SLEEP_MINUTES);
  const [timeIntervalMinutes, setTimeIntervalMinutes] = useState(
    profile?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES,
  );
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(
    profile?.scheduleMode ?? DEFAULT_SCHEDULE_MODE,
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const weight = parseWeight(weightText);
  // Preview target even if the whole form has not been validated yet, so the
  // cup-mode calculator can show "~11 cups" while the user is still typing.
  const previewTargetMl =
    weight !== null ? calculateDailyTargetMl(weight, unit, activity) : null;

  // In cup mode we derive the interval from the window and the number of US
  // cups needed to reach the daily goal; in time mode the picker drives it.
  const windowMinutes = awakeWindowMinutes(wakeMinutes, sleepMinutes);
  const cupsNeededPreview = previewTargetMl !== null ? cupsForTarget(previewTargetMl) : null;
  const derivedCupInterval =
    cupsNeededPreview !== null && windowMinutes > 0
      ? intervalForCupSchedule(windowMinutes, cupsNeededPreview)
      : DEFAULT_INTERVAL_MINUTES;
  const effectiveInterval = scheduleMode === 'cup' ? derivedCupInterval : timeIntervalMinutes;

  const errors = getSetupErrors({
    weightText,
    weightUnit: unit,
    wakeMinutes,
    sleepMinutes,
    intervalMinutes: effectiveInterval,
  });
  const targetMl = weight !== null && !errors.weight ? previewTargetMl : null;
  const slots = errors.schedule
    ? []
    : calculateReminderSlots(wakeMinutes, sleepMinutes, effectiveInterval);
  const each =
    targetMl !== null && slots.length > 0 ? millilitersPerReminder(targetMl, slots.length) : null;
  const reminderWord = slots.length === 1 ? 'reminder' : 'reminders';
  const banner = submitted && errors.weight ? errors.weight : errors.schedule;

  function onUnitChange(next: WeightUnit) {
    if (next === unit) return;
    if (weight !== null) {
      setWeightText(formatWeight(convertWeight(weight, unit, next)));
    }
    setUnit(next);
  }

  function leave() {
    if (router.canGoBack()) router.back();
    else if (state) router.replace('/home');
  }

  async function onSave() {
    Keyboard.dismiss();
    setSubmitted(true);
    if (errors.weight || errors.schedule || weight === null || saving) return;

    setSaving(true);
    try {
      const nextProfile = buildUserProfile({
        weight,
        weightUnit: unit,
        activityLevel: activity,
        wakeMinutes,
        sleepMinutes,
        intervalMinutes: effectiveInterval,
        scheduleMode,
      });
      const result = await saveAndEnable(nextProfile);
      if (router.canGoBack()) router.back();
      else router.replace('/home');
      showSyncWarning(result, 'Saved without reminders');
    } catch (error) {
      console.error(error);
      Alert.alert('Could not save', 'Your details could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.column} pointerEvents={saving ? 'none' : 'auto'}>
          {state ? (
            <Pressable
              accessibilityRole="button"
              onPress={leave}
              hitSlop={8}
              style={styles.back}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : null}

          <Text style={styles.kicker}>WATER REMINDER</Text>
          <View style={styles.mark} />
          <Text style={styles.title} accessibilityRole="header">
            Set your day
          </Text>
          <Text style={styles.lede}>
            Add your weight and the hours you are awake. Reminders start as soon as you save.
          </Text>

          <Text style={styles.section}>Weight</Text>
          <View style={[styles.weightCard, submitted && errors.weight ? styles.cardInvalid : null]}>
            <TextInput
              accessibilityLabel="Weight"
              value={weightText}
              onChangeText={(value) => setWeightText(sanitizeWeightInput(value))}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder={unit === 'kg' ? '70' : '154'}
              placeholderTextColor={colors.faint}
              maxLength={6}
              style={styles.weightInput}
            />
            <View style={styles.unitToggle}>
              {(['kg', 'lbs'] as const).map((option) => {
                const selected = unit === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onUnitChange(option)}
                    style={[styles.unitOption, selected && styles.unitOptionSelected]}
                  >
                    <Text style={[styles.unitText, selected && styles.unitTextSelected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Text style={styles.section}>Activity level</Text>
          <View style={styles.activityRow}>
            {ACTIVITY_OPTIONS.map((option) => {
              const selected = activity === option.level;
              return (
                <Pressable
                  key={option.level}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label} activity, ${option.detail}`}
                  accessibilityState={{ selected }}
                  onPress={() => setActivity(option.level)}
                  style={[styles.activityOption, selected && styles.activityOptionSelected]}
                >
                  <Text style={[styles.activityLabel, selected && styles.onLagoon]}>{option.label}</Text>
                  <Text style={[styles.activityDetail, selected && styles.onLagoonMuted]}>
                    {option.detail}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.section}>Awake hours</Text>
          <View style={styles.timeRow}>
            <TimeField
              label="Wake"
              minutes={wakeMinutes}
              onChange={setWakeMinutes}
              invalid={Boolean(errors.schedule)}
            />
            <TimeField
              label="Sleep"
              minutes={sleepMinutes}
              onChange={setSleepMinutes}
              invalid={Boolean(errors.schedule)}
            />
          </View>

          <Text style={styles.section}>Reminder style</Text>
          <View style={styles.modeRow}>
            {SCHEDULE_MODE_OPTIONS.map((option) => {
              const selected = scheduleMode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label}, ${option.detail}`}
                  accessibilityState={{ selected }}
                  onPress={() => setScheduleMode(option.mode)}
                  style={[styles.modeOption, selected && styles.modeOptionSelected]}
                >
                  <Text style={[styles.modeLabel, selected && styles.onLagoon]}>{option.label}</Text>
                  <Text style={[styles.modeDetail, selected && styles.onLagoonMuted]}>
                    {option.detail}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {scheduleMode === 'time' ? (
            <>
              <Text style={styles.section}>How often</Text>
              <IntervalField minutes={timeIntervalMinutes} onChange={setTimeIntervalMinutes} />
            </>
          ) : (
            <View style={styles.cupPreview}>
              <Text style={styles.cupPreviewTitle}>
                {cupsNeededPreview !== null
                  ? `${cupsNeededPreview} cups a day`
                  : 'Enter your weight first'}
              </Text>
              <Text style={styles.cupPreviewMeta}>
                {`One cup is ${US_CUP_ML} ml. Reminders fire about every ${derivedCupInterval} min across your awake window.`}
              </Text>
            </View>
          )}

          <View style={styles.preview}>
            <Text style={styles.previewLabel}>Daily target</Text>
            <Text style={targetMl === null ? styles.previewEmpty : styles.previewValue}>
              {targetMl === null
                ? 'Enter a weight to see your goal.'
                : `Goal: ${formatTargetMl(targetMl)} ml`}
            </Text>
            {targetMl !== null ? (
              <Text style={styles.previewMeta}>
                {formatWeight(weight ?? 0)} {unit} · {activityLabel(activity)} activity
              </Text>
            ) : null}
            {!errors.schedule && slots.length > 0 ? (
              <Text style={styles.previewMeta}>
                {slots.length} {reminderWord}
                {each !== null ? ` · about ${formatTargetMl(each)} ml each` : ''}
              </Text>
            ) : null}
          </View>

          {banner ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{banner}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            onPress={() => {
              void onSave();
            }}
            style={({ pressed }) => [
              styles.primary,
              pressed && !saving && styles.primaryPressed,
              saving && styles.primaryDisabled,
            ]}
          >
            <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save & Enable Reminders'}</Text>
          </Pressable>
          <Text style={styles.footnote}>Alerts fire only between wake and sleep, then repeat each day.</Text>
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
  back: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 4,
  },
  backText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.lagoon,
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
  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 46,
    color: colors.ink,
    marginTop: 14,
  },
  lede: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    marginTop: 8,
  },
  section: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    marginTop: 22,
    marginBottom: 8,
  },
  weightCard: {
    minHeight: 84,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingLeft: 16,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInvalid: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSurface,
  },
  weightInput: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 32,
    color: colors.ink,
    paddingVertical: 12,
    includeFontPadding: false,
  },
  unitToggle: {
    width: 124,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.background,
    padding: 4,
    flexDirection: 'row',
  },
  unitOption: {
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitOptionSelected: {
    backgroundColor: colors.lagoon,
  },
  unitText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.muted,
  },
  unitTextSelected: {
    color: colors.white,
  },
  activityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  activityOption: {
    flex: 1,
    minHeight: 76,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  activityOptionSelected: {
    backgroundColor: colors.lagoon,
    borderColor: colors.lagoon,
  },
  activityLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  activityDetail: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeOption: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  modeOptionSelected: {
    backgroundColor: colors.lagoon,
    borderColor: colors.lagoon,
  },
  modeLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  modeDetail: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  cupPreview: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.foam,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cupPreviewTitle: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.ink,
  },
  cupPreviewMeta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    marginTop: 4,
  },
  onLagoon: {
    color: colors.white,
  },
  onLagoonMuted: {
    color: 'rgba(255, 255, 255, 0.84)',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  preview: {
    marginTop: 22,
    borderRadius: radius.lg,
    backgroundColor: colors.foam,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  previewLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.lagoon,
  },
  previewValue: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
    marginTop: 4,
  },
  previewEmpty: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.muted,
    marginTop: 4,
  },
  previewMeta: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 4,
  },
  errorBanner: {
    marginTop: 14,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSurface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
  },
  primary: {
    marginTop: 18,
    minHeight: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.lagoon,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#0A3F3C',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  primaryPressed: {
    backgroundColor: colors.lagoonPressed,
  },
  primaryDisabled: {
    opacity: 0.7,
  },
  primaryText: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.white,
  },
  footnote: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.faint,
    textAlign: 'center',
    marginTop: 12,
  },
});
