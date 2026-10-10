/** 08:00 AM */
export const DEFAULT_WAKE_MINUTES = 8 * 60;

/** 10:00 PM */
export const DEFAULT_SLEEP_MINUTES = 22 * 60;

/**
 * Local calendar day as "YYYY-MM-DD". Used as the key for the daily intake
 * counter so a tap at 23:59 and another at 00:01 land on different days.
 */
export function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface ReminderSlot {
  /** 0–23, local time. */
  hour: number;
  /** 0–59, local time. */
  minute: number;
}

export function isClockMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 24 * 60;
}

/**
 * Clock times for one awake window.
 *
 * The first reminder is the wake time. Each later reminder is
 * `intervalMinutes` after the previous one. A time is kept while the cumulative
 * cursor stays strictly before sleep.
 *
 * Same-day window:
 *   08:00 wake, 22:00 sleep, every 90 minutes produces
 *   08:00, 09:30, 11:00, …, 21:30.
 *
 * Overnight window (sleep earlier than wake on the clock):
 *   22:00 wake, 06:00 sleep, every 60 minutes produces
 *   22:00, 23:00, 00:00, 01:00, …, 05:00.
 *   The cursor keeps counting past midnight; each slot is normalised back
 *   onto the 24-hour clock via `cursor % 1440`.
 */
export function calculateReminderSlots(
  wakeMinutes: number,
  sleepMinutes: number,
  intervalMinutes: number,
): ReminderSlot[] {
  if (!isClockMinutes(wakeMinutes) || !isClockMinutes(sleepMinutes)) return [];
  if (wakeMinutes === sleepMinutes || intervalMinutes <= 0) return [];

  // When sleep is before wake on the clock the window spans midnight. Pretend
  // sleep happens on the next calendar day so cursor-based iteration still
  // walks the whole awake range.
  const effectiveSleep = sleepMinutes > wakeMinutes ? sleepMinutes : sleepMinutes + 24 * 60;

  const slots: ReminderSlot[] = [];
  for (let cursor = wakeMinutes; cursor < effectiveSleep; cursor += intervalMinutes) {
    const normalised = cursor % (24 * 60);
    slots.push({
      hour: Math.floor(normalised / 60),
      minute: normalised % 60,
    });
  }
  return slots;
}

/**
 * Length of the awake window in minutes, correctly handling overnight
 * windows where sleep is earlier than wake on the clock.
 */
export function awakeWindowMinutes(wakeMinutes: number, sleepMinutes: number): number {
  if (!isClockMinutes(wakeMinutes) || !isClockMinutes(sleepMinutes)) return 0;
  if (wakeMinutes === sleepMinutes) return 0;
  return sleepMinutes > wakeMinutes
    ? sleepMinutes - wakeMinutes
    : sleepMinutes + 24 * 60 - wakeMinutes;
}

/** 12-hour label, e.g. 480 → "8:00 AM", 1320 → "10:00 PM". */
export function formatClock(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function minutesToDate(minutes: number, base = new Date()): Date {
  const next = new Date(base);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

export function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * The next reminder datetime strictly after `now`.
 *
 * For every slot, project it onto today — if that datetime has already
 * passed, roll to tomorrow. Then pick the slot with the smallest positive
 * delta. This handles overnight windows (whose slots are not monotonically
 * ordered across the day boundary) just as cleanly as same-day windows.
 */
export function nextReminderDate(
  wakeMinutes: number,
  sleepMinutes: number,
  intervalMinutes: number,
  now = new Date(),
): Date | null {
  const slots = calculateReminderSlots(wakeMinutes, sleepMinutes, intervalMinutes);
  if (slots.length === 0) return null;

  const nowTime = now.getTime();
  let best: Date | null = null;
  let bestDelta = Infinity;

  for (const slot of slots) {
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setHours(slot.hour, slot.minute, 0, 0);
    if (candidate.getTime() <= nowTime) {
      candidate.setDate(candidate.getDate() + 1);
    }
    const delta = candidate.getTime() - nowTime;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}

export function formatUpcoming(when: Date, now: Date): string {
  const clock = formatClock(when.getHours() * 60 + when.getMinutes());
  const sameDay =
    when.getFullYear() === now.getFullYear() &&
    when.getMonth() === now.getMonth() &&
    when.getDate() === now.getDate();
  return sameDay ? clock : `Tomorrow ${clock}`;
}

/**
 * How many reminder slots are still ahead of `now` inside the current
 * awake window.
 *
 * "Current window" starts at the most recent wake boundary (today or
 * yesterday depending on wrap) and ends at the next sleep boundary. For
 * overnight schedules the count correctly spans midnight.
 */
export function remindersRemainingToday(
  wakeMinutes: number,
  sleepMinutes: number,
  intervalMinutes: number,
  now = new Date(),
): number {
  const slots = calculateReminderSlots(wakeMinutes, sleepMinutes, intervalMinutes);
  if (slots.length === 0) return 0;

  // The next sleep boundary (today's sleep if still future, otherwise tomorrow's).
  const sleepBoundary = new Date(now);
  sleepBoundary.setSeconds(0, 0);
  sleepBoundary.setHours(Math.floor(sleepMinutes / 60), sleepMinutes % 60, 0, 0);
  if (sleepBoundary.getTime() <= now.getTime()) {
    sleepBoundary.setDate(sleepBoundary.getDate() + 1);
  }
  const sleepTime = sleepBoundary.getTime();

  // Only count a slot if it is between now and the next sleep boundary.
  let count = 0;
  for (const slot of slots) {
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setHours(slot.hour, slot.minute, 0, 0);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    if (candidate.getTime() < sleepTime) count++;
  }
  return count;
}

/**
 * Short human countdown between `now` and `when`.
 * "in 45 sec" / "in 7 min" / "in 2 hr 15 min" / "9 hr 30 min".
 * Returns "now" when the two timestamps are within a second of each other.
 */
export function formatCountdown(when: Date, now: Date): string {
  const totalSeconds = Math.max(0, Math.round((when.getTime() - now.getTime()) / 1000));
  if (totalSeconds < 1) return 'now';
  if (totalSeconds < 60) return `in ${totalSeconds} sec`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `in ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `in ${hours} hr` : `in ${hours} hr ${minutes} min`;
}
