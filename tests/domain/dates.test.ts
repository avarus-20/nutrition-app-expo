import {
  addDays,
  addMonths,
  daysBetweenInclusive,
  eachDay,
  endOfMonth,
  isValidLocalDate,
  localDateTimeToIso,
  monthGrid,
  normalizeIso,
  startOfMonth,
  startOfWeek,
  toLocalDate,
} from '@/utils/dates';

describe('dates', () => {
  it('formats local dates using local time, not UTC', () => {
    // 23:30 local on Jan 31 must stay Jan 31 regardless of the UTC offset.
    expect(toLocalDate(new Date(2024, 0, 31, 23, 30))).toBe('2024-01-31');
    expect(toLocalDate(new Date(2024, 0, 1, 0, 5))).toBe('2024-01-01');
  });

  it('validates local dates strictly', () => {
    expect(isValidLocalDate('2024-02-29')).toBe(true);
    expect(isValidLocalDate('2023-02-29')).toBe(false);
    expect(isValidLocalDate('2024-13-01')).toBe(false);
    expect(isValidLocalDate('2024-1-01')).toBe(false);
    expect(isValidLocalDate(20240101)).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('adds months clamping the day', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2024-03-15', -3)).toBe('2023-12-15');
  });

  it('computes month and week boundaries', () => {
    expect(startOfMonth('2024-02-17')).toBe('2024-02-01');
    expect(endOfMonth('2024-02-17')).toBe('2024-02-29');
    expect(startOfWeek('2024-06-09')).toBe('2024-06-03'); // Sunday -> Monday
    expect(startOfWeek('2024-06-03')).toBe('2024-06-03');
  });

  it('counts and enumerates days inclusively (DST safe)', () => {
    expect(daysBetweenInclusive('2024-03-01', '2024-03-31')).toBe(31);
    expect(eachDay('2024-10-26', '2024-10-28')).toEqual(['2024-10-26', '2024-10-27', '2024-10-28']);
  });

  it('builds a Monday-first month grid', () => {
    const grid = monthGrid('2024-02-10');
    expect(grid[0]).toEqual([null, null, null, '2024-02-01', '2024-02-02', '2024-02-03', '2024-02-04']);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid.flat().filter(Boolean)).toHaveLength(29);
  });

  it('combines date and time into ISO', () => {
    const iso = localDateTimeToIso('2024-05-05', '08:30');
    const d = new Date(iso);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
  });

  it('normalizes server timestamps', () => {
    expect(normalizeIso('2024-01-01T10:00:00+00:00')).toBe('2024-01-01T10:00:00.000Z');
    expect(() => normalizeIso('nope')).toThrow(RangeError);
  });
});
