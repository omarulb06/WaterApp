import type { ActivityLevel, ScheduleMode, UserProfile, WeightUnit } from './types';

/** US fluid ounce in milliliters. Used only when weight is entered in pounds. */
const ML_PER_US_FL_OZ = 29.5735295625;

/**
 * One US customary cup. The user explicitly asked for 0.236588 L as the
 * reference cup for cup-mode intervals and the "I drank a cup" tracker.
 */
export const US_CUP_ML = 236.588;

/** Shortest allowed interval between reminders (minutes), matches validation. */
const MIN_INTERVAL_MINUTES = 15;
/** Longest allowed interval between reminders (minutes), matches validation. */
const MAX_INTERVAL_MINUTES = 240;

const ACTIVITY_BONUS_ML: Record<ActivityLevel, number> = {
  low: 0,
  moderate: 300,
  high: 600,
};

/**
 * Daily target in milliliters.
 *
 * Base intake:
 *   kg  → weight × 35 ml
 *   lbs → weight × 0.5 US fl oz, then converted to ml
 * Activity bonus (always milliliters): 0 / 300 / 600.
 * The result is rounded to the nearest milliliter.
 */
export function calculateDailyTargetMl(
  weight: number,
  unit: WeightUnit,
  activity: ActivityLevel,
): number {
  const baseMl = unit === 'kg' ? weight * 35 : weight * 0.5 * ML_PER_US_FL_OZ;
  return Math.round(baseMl + ACTIVITY_BONUS_ML[activity]);
}

export function buildUserProfile(input: {
  weight: number;
  weightUnit: WeightUnit;
  activityLevel: ActivityLevel;
  wakeMinutes: number;
  sleepMinutes: number;
  intervalMinutes: number;
  scheduleMode: ScheduleMode;
}): UserProfile {
  return {
    ...input,
    targetMl: calculateDailyTargetMl(input.weight, input.weightUnit, input.activityLevel),
  };
}

/**
 * How many whole cups the user needs to hit `targetMl` using one US cup each.
 * Rounded up so the total intake never undershoots the goal; min 1.
 */
export function cupsForTarget(targetMl: number): number {
  if (!Number.isFinite(targetMl) || targetMl <= 0) return 1;
  return Math.max(1, Math.ceil(targetMl / US_CUP_ML));
}

/**
 * Interval in minutes that spreads `cupCount` reminders across the awake
 * window so each cup gets its own reminder, bounded to the picker's
 * [15, 240] minute range. `ceil` guarantees that we schedule exactly
 * `cupCount` slots (and never one too many).
 */
export function intervalForCupSchedule(windowMinutes: number, cupCount: number): number {
  if (windowMinutes <= 0 || cupCount <= 0) return MIN_INTERVAL_MINUTES;
  const raw = Math.ceil(windowMinutes / cupCount);
  return Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, raw));
}

/** Milliliters consumed from a given cup count (one US cup each). */
export function millilitersFromCups(cupCount: number): number {
  if (!Number.isFinite(cupCount) || cupCount <= 0) return 0;
  return Math.round(cupCount * US_CUP_ML);
}

/** Pretty "1.42" (always one decimal) for a milliliters amount shown in liters. */
export function formatLiters(ml: number): string {
  const liters = (Number.isFinite(ml) ? ml : 0) / 1000;
  return liters.toFixed(1);
}

/** Grouped milliliters without the unit suffix, e.g. 2450 → "2,450". */
export function formatTargetMl(targetMl: number): string {
  return Math.round(targetMl).toLocaleString('en-US');
}

/**
 * Even split of the daily target across the awake-window reminders.
 * Rounding can leave the last reminder a milliliter off; the UI says "about".
 */
export function millilitersPerReminder(targetMl: number, reminderCount: number): number {
  if (reminderCount <= 0) return 0;
  return Math.round(targetMl / reminderCount);
}

const KG_PER_LB = 0.45359237;

export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight;
  const converted = from === 'kg' ? weight / KG_PER_LB : weight * KG_PER_LB;
  return Math.round(converted * 10) / 10;
}

export function formatWeight(weight: number): string {
  const rounded = Math.round(weight * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
