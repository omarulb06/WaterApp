import type { ActivityLevel, ScheduleMode } from './types';

export const DEFAULT_INTERVAL_MINUTES = 60;

export const DEFAULT_SCHEDULE_MODE: ScheduleMode = 'time';

export const SCHEDULE_MODE_OPTIONS: { mode: ScheduleMode; label: string; detail: string }[] = [
  { mode: 'time', label: 'Per time', detail: 'Pick an interval' },
  { mode: 'cup', label: 'Per cup', detail: 'One US cup each' },
];

export function scheduleModeLabel(mode: ScheduleMode): string {
  return SCHEDULE_MODE_OPTIONS.find((o) => o.mode === mode)?.label ?? mode;
}

export const ACTIVITY_OPTIONS: {
  level: ActivityLevel;
  label: string;
  detail: string;
}[] = [
  { level: 'low', label: 'Low', detail: 'Desk day' },
  { level: 'moderate', label: 'Moderate', detail: '+300 ml' },
  { level: 'high', label: 'High', detail: '+600 ml' },
];

export const INTERVAL_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every 1 hour' },
  { minutes: 90, label: 'Every 1.5 hours' },
  { minutes: 120, label: 'Every 2 hours' },
  { minutes: 180, label: 'Every 3 hours' },
];

export function intervalLabel(minutes: number): string {
  return INTERVAL_OPTIONS.find((option) => option.minutes === minutes)?.label ?? `Every ${minutes} minutes`;
}

export function activityLabel(level: ActivityLevel): string {
  return ACTIVITY_OPTIONS.find((option) => option.level === level)?.label ?? level;
}
