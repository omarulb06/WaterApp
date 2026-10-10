import { isClockMinutes } from './time';
import type { WeightUnit } from './types';

const MIN_KG = 20;
const MAX_KG = 400;
const MIN_LB = 44;
const MAX_LB = 880;

export type SetupErrors = {
  weight?: string;
  schedule?: string;
};

/** Keep a single decimal so "70." can still be typed. */
export function sanitizeWeightInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const [whole, ...fraction] = cleaned.split('.');
  if (fraction.length === 0) return whole;
  return `${whole}.${fraction.join('').slice(0, 1)}`;
}

export function parseWeight(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '.') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function getSetupErrors(input: {
  weightText: string;
  weightUnit: WeightUnit;
  wakeMinutes: number;
  sleepMinutes: number;
  intervalMinutes: number;
}): SetupErrors {
  const errors: SetupErrors = {};
  const weight = parseWeight(input.weightText);

  if (weight === null || weight <= 0) {
    errors.weight = 'Enter your weight.';
  } else {
    const min = input.weightUnit === 'kg' ? MIN_KG : MIN_LB;
    const max = input.weightUnit === 'kg' ? MAX_KG : MAX_LB;
    if (weight < min || weight > max) {
      errors.weight = `Enter a weight between ${min} and ${max} ${input.weightUnit}.`;
    }
  }

  if (
    !isClockMinutes(input.wakeMinutes) ||
    !isClockMinutes(input.sleepMinutes) ||
    input.wakeMinutes === input.sleepMinutes
  ) {
    // Overnight schedules (sleep before wake on the clock) are allowed:
    // the window just wraps across midnight. Only equal times are invalid.
    errors.schedule = 'Wake time and sleep time have to be different.';
  } else if (
    !Number.isInteger(input.intervalMinutes) ||
    input.intervalMinutes < 15 ||
    input.intervalMinutes > 240
  ) {
    errors.schedule = 'Choose how often to send reminders.';
  }

  return errors;
}
