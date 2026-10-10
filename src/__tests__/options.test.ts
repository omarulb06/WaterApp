import {
  ACTIVITY_OPTIONS,
  activityLabel,
  DEFAULT_INTERVAL_MINUTES,
  INTERVAL_OPTIONS,
  intervalLabel,
} from '../options';

describe('activity options', () => {
  it('exposes the three required levels in order', () => {
    expect(ACTIVITY_OPTIONS.map((option) => option.level)).toEqual(['low', 'moderate', 'high']);
  });

  it('labels moderate as +300 ml and high as +600 ml', () => {
    expect(ACTIVITY_OPTIONS[1].detail).toBe('+300 ml');
    expect(ACTIVITY_OPTIONS[2].detail).toBe('+600 ml');
  });

  it('resolves activityLabel for every level', () => {
    expect(activityLabel('low')).toBe('Low');
    expect(activityLabel('moderate')).toBe('Moderate');
    expect(activityLabel('high')).toBe('High');
  });
});

describe('interval options', () => {
  it('exposes the five intervals the UI offers', () => {
    expect(INTERVAL_OPTIONS.map((option) => option.minutes)).toEqual([30, 60, 90, 120, 180]);
  });

  it('defaults to one hour', () => {
    expect(DEFAULT_INTERVAL_MINUTES).toBe(60);
  });

  it('labels familiar intervals', () => {
    expect(intervalLabel(60)).toBe('Every 1 hour');
    expect(intervalLabel(90)).toBe('Every 1.5 hours');
    expect(intervalLabel(180)).toBe('Every 3 hours');
  });

  it('falls back to a generic label for unknown minutes', () => {
    expect(intervalLabel(45)).toBe('Every 45 minutes');
  });
});
