import {
  awakeWindowMinutes,
  calculateReminderSlots,
  dateToMinutes,
  DEFAULT_SLEEP_MINUTES,
  DEFAULT_WAKE_MINUTES,
  formatClock,
  formatCountdown,
  formatUpcoming,
  isClockMinutes,
  minutesToDate,
  nextReminderDate,
  remindersRemainingToday,
} from '../time';

describe('calculateReminderSlots', () => {
  it('8:00 to 22:00 every 60 min yields 14 slots', () => {
    const slots = calculateReminderSlots(DEFAULT_WAKE_MINUTES, DEFAULT_SLEEP_MINUTES, 60);
    expect(slots).toHaveLength(14);
    expect(slots[0]).toEqual({ hour: 8, minute: 0 });
    expect(slots[slots.length - 1]).toEqual({ hour: 21, minute: 0 });
  });

  it('every 90 min ends at 21:30', () => {
    const slots = calculateReminderSlots(DEFAULT_WAKE_MINUTES, DEFAULT_SLEEP_MINUTES, 90);
    expect(slots).toHaveLength(10);
    expect(slots[slots.length - 1]).toEqual({ hour: 21, minute: 30 });
  });

  it('wraps across midnight when sleep clock is earlier than wake clock', () => {
    // 10 PM wake, 6 AM sleep, every hour → 8 slots crossing midnight.
    const slots = calculateReminderSlots(22 * 60, 6 * 60, 60);
    expect(slots).toHaveLength(8);
    expect(slots[0]).toEqual({ hour: 22, minute: 0 });
    expect(slots[2]).toEqual({ hour: 0, minute: 0 });
    expect(slots[slots.length - 1]).toEqual({ hour: 5, minute: 0 });
  });

  it('returns no slots when wake equals sleep', () => {
    expect(calculateReminderSlots(480, 480, 60)).toEqual([]);
  });

  it('returns no slots for a zero or negative interval', () => {
    expect(calculateReminderSlots(480, 1320, 0)).toEqual([]);
    expect(calculateReminderSlots(480, 1320, -15)).toEqual([]);
  });

  it('rejects out-of-range clock minutes', () => {
    expect(calculateReminderSlots(-10, 1320, 60)).toEqual([]);
    expect(calculateReminderSlots(480, 1440, 60)).toEqual([]);
  });
});

describe('awakeWindowMinutes', () => {
  it('is the straight difference for a same-day window', () => {
    expect(awakeWindowMinutes(480, 1320)).toBe(840);
  });

  it('wraps across midnight for an overnight window', () => {
    expect(awakeWindowMinutes(22 * 60, 6 * 60)).toBe(8 * 60);
  });

  it('is zero for identical wake and sleep', () => {
    expect(awakeWindowMinutes(480, 480)).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats mid-day', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(480)).toBe('8:00 AM');
    expect(formatClock(720)).toBe('12:00 PM');
    expect(formatClock(1320)).toBe('10:00 PM');
  });
});

describe('nextReminderDate', () => {
  it('picks the next slot later today', () => {
    const now = new Date(2026, 0, 15, 9, 15);
    const next = nextReminderDate(480, 1320, 60, now);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(10);
    expect(next!.getMinutes()).toBe(0);
    expect(next!.getDate()).toBe(15);
  });

  it('wraps to tomorrow after the last slot', () => {
    const now = new Date(2026, 0, 15, 22, 30);
    const next = nextReminderDate(480, 1320, 60, now);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(16);
    expect(next!.getHours()).toBe(8);
  });

  it('returns null when the window has no slots', () => {
    // Equal wake and sleep means there is no awake window at all.
    expect(nextReminderDate(480, 480, 60, new Date())).toBeNull();
  });

  it('skips the current slot when now is exactly on it', () => {
    // 10:00 AM sharp – that slot already fired, next should be 11:00 today.
    const now = new Date(2026, 0, 15, 10, 0, 0, 0);
    const next = nextReminderDate(480, 1320, 60, now);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(15);
    expect(next!.getHours()).toBe(11);
    expect(next!.getMinutes()).toBe(0);
  });

  it('picks the first slot today when now is before wake', () => {
    const now = new Date(2026, 0, 15, 6, 45, 0, 0);
    const next = nextReminderDate(480, 1320, 60, now);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(15);
    expect(next!.getHours()).toBe(8);
  });

  it('still picks the final slot of the day when now is one minute before it', () => {
    const now = new Date(2026, 0, 15, 20, 59, 0, 0);
    const next = nextReminderDate(480, 1320, 60, now);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(15);
    expect(next!.getHours()).toBe(21);
  });

  it('rolls into the next month across month boundaries', () => {
    // Jan 31 after sleep -> next = Feb 1 wake.
    const now = new Date(2026, 0, 31, 22, 30);
    const next = nextReminderDate(480, 1320, 60, now);
    expect(next).not.toBeNull();
    expect(next!.getMonth()).toBe(1);
    expect(next!.getDate()).toBe(1);
    expect(next!.getHours()).toBe(8);
  });

  it('crosses midnight for an overnight window', () => {
    // Night shift: wake 22:00, sleep 06:00, hourly. At 23:30, next is 00:00 tomorrow.
    const now = new Date(2026, 0, 15, 23, 30);
    const next = nextReminderDate(22 * 60, 6 * 60, 60, now);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(16);
    expect(next!.getHours()).toBe(0);
    expect(next!.getMinutes()).toBe(0);
  });

  it('picks the first awake slot when now is outside the overnight window', () => {
    // Night shift wake 22, sleep 06. At 15:00 (mid-afternoon) the next slot is 22:00 today.
    const now = new Date(2026, 0, 15, 15, 0);
    const next = nextReminderDate(22 * 60, 6 * 60, 60, now);
    expect(next).not.toBeNull();
    expect(next!.getDate()).toBe(15);
    expect(next!.getHours()).toBe(22);
  });
});

describe('remindersRemainingToday', () => {
  it('counts all slots when now is before wake', () => {
    const now = new Date(2026, 0, 15, 6, 0);
    expect(remindersRemainingToday(480, 1320, 60, now)).toBe(14);
  });

  it('counts only the ones strictly after now', () => {
    // 10:00 AM sharp -> slots 11..21 remain (11 slots).
    const now = new Date(2026, 0, 15, 10, 0);
    expect(remindersRemainingToday(480, 1320, 60, now)).toBe(11);
  });

  it('returns 0 after the last slot', () => {
    const now = new Date(2026, 0, 15, 21, 30);
    expect(remindersRemainingToday(480, 1320, 60, now)).toBe(0);
  });

  it('counts cross-midnight slots for an overnight window', () => {
    // Wake 22, sleep 06, hourly, now 23:00 -> next sleep is tomorrow 06:00.
    // Remaining slots are 00, 01, 02, 03, 04, 05 (6 slots).
    const now = new Date(2026, 0, 15, 23, 0);
    expect(remindersRemainingToday(22 * 60, 6 * 60, 60, now)).toBe(6);
  });

  it('returns 0 for identical wake and sleep', () => {
    expect(remindersRemainingToday(480, 480, 60, new Date())).toBe(0);
  });
});

describe('formatCountdown', () => {
  const now = new Date(2026, 0, 15, 10, 0, 0, 0);

  it('reports seconds under a minute', () => {
    const when = new Date(now.getTime() + 42_000);
    expect(formatCountdown(when, now)).toBe('in 42 sec');
  });

  it('reports whole minutes under an hour', () => {
    const when = new Date(now.getTime() + 15 * 60_000);
    expect(formatCountdown(when, now)).toBe('in 15 min');
  });

  it('reports hours and minutes above an hour', () => {
    const when = new Date(now.getTime() + (2 * 60 + 15) * 60_000);
    expect(formatCountdown(when, now)).toBe('in 2 hr 15 min');
  });

  it('drops the minutes component when zero', () => {
    const when = new Date(now.getTime() + 3 * 60 * 60_000);
    expect(formatCountdown(when, now)).toBe('in 3 hr');
  });

  it('returns "now" when the moment has arrived', () => {
    expect(formatCountdown(now, now)).toBe('now');
    const past = new Date(now.getTime() - 500);
    expect(formatCountdown(past, now)).toBe('now');
  });
});

describe('formatUpcoming', () => {
  it('shows just the clock for a time today', () => {
    const now = new Date(2026, 0, 15, 9, 15);
    const when = new Date(2026, 0, 15, 10, 0);
    expect(formatUpcoming(when, now)).toBe('10:00 AM');
  });

  it('prefixes with Tomorrow across the day boundary', () => {
    const now = new Date(2026, 0, 15, 22, 30);
    const when = new Date(2026, 0, 16, 8, 0);
    expect(formatUpcoming(when, now)).toBe('Tomorrow 8:00 AM');
  });
});

describe('minutesToDate and dateToMinutes round-trip', () => {
  it('preserves hour/minute', () => {
    const base = new Date(2026, 0, 15, 0, 0, 0, 0);
    const d = minutesToDate(615, base);
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(15);
    expect(dateToMinutes(d)).toBe(615);
  });
});

describe('isClockMinutes', () => {
  it('accepts 0..1439, rejects everything else', () => {
    expect(isClockMinutes(0)).toBe(true);
    expect(isClockMinutes(1439)).toBe(true);
    expect(isClockMinutes(1440)).toBe(false);
    expect(isClockMinutes(-1)).toBe(false);
    expect(isClockMinutes(10.5)).toBe(false);
  });
});
