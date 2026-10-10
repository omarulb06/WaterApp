import { getSetupErrors, parseWeight, sanitizeWeightInput } from '../validation';

describe('sanitizeWeightInput', () => {
  it('strips non-numeric characters', () => {
    expect(sanitizeWeightInput('abc70kg')).toBe('70');
  });

  it('keeps one decimal point and up to one fractional digit', () => {
    expect(sanitizeWeightInput('70.456')).toBe('70.4');
    expect(sanitizeWeightInput('70..5')).toBe('70.5');
  });

  it('allows a trailing dot while typing', () => {
    expect(sanitizeWeightInput('70.')).toBe('70.');
  });
});

describe('parseWeight', () => {
  it('returns null for empty or dot-only input', () => {
    expect(parseWeight('')).toBeNull();
    expect(parseWeight('.')).toBeNull();
  });

  it('parses numeric input', () => {
    expect(parseWeight('70.5')).toBe(70.5);
  });
});

describe('getSetupErrors', () => {
  const base = {
    weightUnit: 'kg' as const,
    wakeMinutes: 480,
    sleepMinutes: 1320,
    intervalMinutes: 60,
  };

  it('accepts a valid profile with no errors', () => {
    expect(getSetupErrors({ ...base, weightText: '70' })).toEqual({});
  });

  it('flags an empty weight', () => {
    const errors = getSetupErrors({ ...base, weightText: '' });
    expect(errors.weight).toBe('Enter your weight.');
  });

  it('flags out-of-range kg weight', () => {
    const errors = getSetupErrors({ ...base, weightText: '10' });
    expect(errors.weight).toContain('20 and 400 kg');
  });

  it('flags out-of-range lb weight', () => {
    const errors = getSetupErrors({ ...base, weightUnit: 'lbs', weightText: '20' });
    expect(errors.weight).toContain('44 and 880 lbs');
  });

  it('accepts an overnight window (sleep clock earlier than wake clock)', () => {
    // Night-shift worker: wake 10 PM, sleep 6 AM next day.
    const errors = getSetupErrors({
      ...base,
      weightText: '70',
      wakeMinutes: 22 * 60,
      sleepMinutes: 6 * 60,
    });
    expect(errors.schedule).toBeUndefined();
  });

  it('flags wake and sleep set to the same minute', () => {
    const errors = getSetupErrors({
      ...base,
      weightText: '70',
      wakeMinutes: 480,
      sleepMinutes: 480,
    });
    expect(errors.schedule).toBe('Wake time and sleep time have to be different.');
  });

  it('flags an interval outside 15..240 minutes', () => {
    const errors = getSetupErrors({ ...base, weightText: '70', intervalMinutes: 5 });
    expect(errors.schedule).toBe('Choose how often to send reminders.');
  });
});
