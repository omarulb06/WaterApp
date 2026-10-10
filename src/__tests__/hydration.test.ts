import {
  buildUserProfile,
  calculateDailyTargetMl,
  convertWeight,
  cupsForTarget,
  formatLiters,
  formatTargetMl,
  formatWeight,
  intervalForCupSchedule,
  millilitersFromCups,
  millilitersPerReminder,
  US_CUP_ML,
} from '../hydration';

describe('calculateDailyTargetMl', () => {
  it('70 kg + low activity = 2,450 ml', () => {
    expect(calculateDailyTargetMl(70, 'kg', 'low')).toBe(2450);
  });

  it('adds the +300 ml moderate bonus', () => {
    expect(calculateDailyTargetMl(70, 'kg', 'moderate')).toBe(2750);
  });

  it('adds the +600 ml high bonus', () => {
    expect(calculateDailyTargetMl(70, 'kg', 'high')).toBe(3050);
  });

  it('converts pounds to ml via US fluid ounce', () => {
    expect(calculateDailyTargetMl(154, 'lbs', 'low')).toBe(2277);
  });

  it('rounds to the nearest ml', () => {
    const value = calculateDailyTargetMl(72.3, 'kg', 'moderate');
    expect(Number.isInteger(value)).toBe(true);
  });
});

describe('formatTargetMl', () => {
  it('groups thousands with en-US separators', () => {
    expect(formatTargetMl(2450)).toBe('2,450');
    expect(formatTargetMl(10050)).toBe('10,050');
  });
});

describe('millilitersPerReminder', () => {
  it('spreads the target evenly', () => {
    expect(millilitersPerReminder(2450, 14)).toBe(175);
  });

  it('returns 0 when no reminders fit', () => {
    expect(millilitersPerReminder(2450, 0)).toBe(0);
    expect(millilitersPerReminder(2450, -3)).toBe(0);
  });
});

describe('convertWeight', () => {
  it('kg to lbs rounds to one decimal', () => {
    expect(convertWeight(70, 'kg', 'lbs')).toBe(154.3);
  });

  it('lbs to kg rounds to one decimal', () => {
    expect(convertWeight(154, 'lbs', 'kg')).toBe(69.9);
  });

  it('returns the input when units match', () => {
    expect(convertWeight(70, 'kg', 'kg')).toBe(70);
  });
});

describe('formatWeight', () => {
  it('drops the decimal for whole numbers', () => {
    expect(formatWeight(70)).toBe('70');
  });

  it('keeps one decimal otherwise', () => {
    expect(formatWeight(70.4)).toBe('70.4');
  });
});

describe('US_CUP_ML', () => {
  it('equals the user-specified 236.588 ml cup', () => {
    expect(US_CUP_ML).toBe(236.588);
  });
});

describe('cupsForTarget', () => {
  it('rounds up so the cup total never undershoots the goal', () => {
    // 2,450 / 236.588 = 10.355 → 11 cups.
    expect(cupsForTarget(2450)).toBe(11);
    // 2,900 / 236.588 = 12.258 → 13 cups.
    expect(cupsForTarget(2900)).toBe(13);
  });

  it('returns at least 1 cup for degenerate inputs', () => {
    expect(cupsForTarget(0)).toBe(1);
    expect(cupsForTarget(-50)).toBe(1);
    expect(cupsForTarget(100)).toBe(1);
  });
});

describe('intervalForCupSchedule', () => {
  it('fits all 11 cups into a 14-hour window', () => {
    const interval = intervalForCupSchedule(14 * 60, 11);
    // ceil(840 / 11) = 77 minutes between cups.
    expect(interval).toBe(77);
  });

  it('clamps to the 15 minute floor when cups exceed the window', () => {
    const interval = intervalForCupSchedule(60, 50);
    expect(interval).toBe(15);
  });

  it('clamps to the 240 minute ceiling when the window is huge', () => {
    const interval = intervalForCupSchedule(24 * 60, 1);
    expect(interval).toBe(240);
  });
});

describe('millilitersFromCups', () => {
  it('is cups times 236.588 ml, rounded', () => {
    expect(millilitersFromCups(0)).toBe(0);
    expect(millilitersFromCups(1)).toBe(237);
    expect(millilitersFromCups(11)).toBe(2602);
  });
});

describe('formatLiters', () => {
  it('always shows one decimal and converts from ml', () => {
    expect(formatLiters(0)).toBe('0.0');
    expect(formatLiters(1500)).toBe('1.5');
    expect(formatLiters(2450)).toBe('2.5');
  });
});

describe('buildUserProfile', () => {
  it('derives targetMl from weight, unit, and activity', () => {
    const profile = buildUserProfile({
      weight: 70,
      weightUnit: 'kg',
      activityLevel: 'moderate',
      wakeMinutes: 480,
      sleepMinutes: 1320,
      intervalMinutes: 60,
      scheduleMode: 'time',
    });
    expect(profile.targetMl).toBe(2750);
    expect(profile.weight).toBe(70);
    expect(profile.wakeMinutes).toBe(480);
  });
});
