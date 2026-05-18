import { describe, test, expect } from 'vitest';
import { simToWall, wallToSim, formatWallTime, parseTimeInput, looksLikeTimestamp } from '../clockUtils.js';

const EPOCH = '2026-05-18T08:00:00';

describe('simToWall', () => {
  test('converts sim time 30 minutes to 08:30', () => {
    const result = simToWall(30, EPOCH, 'minutes');
    expect(result).toBeInstanceOf(Date);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(30);
  });

  test('sim time 0 returns epoch datetime', () => {
    const result = simToWall(0, EPOCH, 'minutes');
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(new Date(EPOCH).getTime());
  });

  test('returns null when epoch is null', () => {
    expect(simToWall(30, null)).toBeNull();
  });

  test('returns null when epoch is empty string', () => {
    expect(simToWall(30, '')).toBeNull();
  });

  test('converts 2 hours correctly', () => {
    const result = simToWall(2, EPOCH, 'hours');
    expect(result).toBeInstanceOf(Date);
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(0);
  });
});

describe('wallToSim', () => {
  test('converts 08:30 wall time to 30 minutes from 08:00 epoch', () => {
    const result = wallToSim('2026-05-18T08:30:00', EPOCH, 'minutes');
    expect(result).toBe(30);
  });

  test('returns null when epoch is null', () => {
    expect(wallToSim('2026-05-18T08:30:00', null)).toBeNull();
  });

  test('returns null when dt is null', () => {
    expect(wallToSim(null, EPOCH)).toBeNull();
  });

  test('returns null when epoch is empty string', () => {
    expect(wallToSim('2026-05-18T08:30:00', '')).toBeNull();
  });
});

describe('simToWall and wallToSim are inverses', () => {
  test('wallToSim(simToWall(t)) === t', () => {
    const t = 45;
    const wall = simToWall(t, EPOCH, 'minutes');
    const back = wallToSim(wall, EPOCH, 'minutes');
    expect(back).toBeCloseTo(t, 5);
  });

  test('simToWall(wallToSim(dt)) === dt', () => {
    const dt = '2026-05-18T09:15:00';
    const sim = wallToSim(dt, EPOCH, 'minutes');
    const wall = simToWall(sim, EPOCH, 'minutes');
    expect(wall.getTime()).toBe(new Date(dt).getTime());
  });
});

describe('parseTimeInput', () => {
  test('plain number string returns the number', () => {
    expect(parseTimeInput('30', EPOCH, 'minutes')).toBe(30);
  });

  test('HH:MM string with epoch returns sim time', () => {
    expect(parseTimeInput('08:30', EPOCH, 'minutes')).toBe(30);
  });

  test('ISO datetime string with epoch returns sim time', () => {
    expect(parseTimeInput('2026-05-18T08:30:00', EPOCH, 'minutes')).toBe(30);
  });

  test('HH:MM with no epoch returns null', () => {
    expect(parseTimeInput('08:30', null, 'minutes')).toBeNull();
  });

  test('null value returns null', () => {
    expect(parseTimeInput(null, EPOCH)).toBeNull();
  });

  test('empty string returns null', () => {
    expect(parseTimeInput('', EPOCH)).toBeNull();
  });
});

describe('looksLikeTimestamp', () => {
  test('HH:MM looks like a timestamp', () => {
    expect(looksLikeTimestamp('08:30')).toBe(true);
  });

  test('ISO datetime looks like a timestamp', () => {
    expect(looksLikeTimestamp('2026-05-18T08:00')).toBe(true);
  });

  test('plain number does NOT look like a timestamp', () => {
    expect(looksLikeTimestamp('30')).toBe(false);
  });

  test('HH:MM:SS looks like a timestamp', () => {
    expect(looksLikeTimestamp('08:30:00')).toBe(true);
  });
});

describe('formatWallTime', () => {
  test('formats a Date object in en-GB locale with weekday and time', () => {
    const d = new Date('2026-05-18T08:00:00');
    const result = formatWallTime(d);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // en-GB with weekday: should contain day abbreviation like "Mon"
    expect(result).toMatch(/\d{2}/); // has two-digit day or time
  });

  test('formats a string date', () => {
    const result = formatWallTime('2026-05-18T08:30:00');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/\d{2}/);
  });

  test('returns null for null input', () => {
    expect(formatWallTime(null)).toBeNull();
  });

  test('returns null for invalid date', () => {
    expect(formatWallTime('not-a-date')).toBeNull();
  });
});
