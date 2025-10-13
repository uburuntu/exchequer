/**
 * Date utility tests
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeDate,
  getTaxYearStart,
  getTaxYearEnd,
  isDateInTaxYear,
  isBedAndBreakfast,
  formatDateKey,
  parseDateKey,
} from '../lib/utils/date';

describe('normalizeDate', () => {
  it('should normalize date to midnight UTC', () => {
    const date = new Date('2024-06-15T14:30:00Z');
    const normalized = normalizeDate(date);

    expect(normalized.getUTCHours()).toBe(0);
    expect(normalized.getUTCMinutes()).toBe(0);
    expect(normalized.getUTCSeconds()).toBe(0);
    expect(normalized.getUTCMilliseconds()).toBe(0);
  });

  it('should preserve the date', () => {
    // Use a date without time component to avoid timezone issues
    const date = new Date(Date.UTC(2024, 5, 15, 23, 59, 59)); // June 15, 2024 23:59:59 UTC
    const normalized = normalizeDate(date);

    expect(normalized.getUTCFullYear()).toBe(2024);
    expect(normalized.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(normalized.getUTCDate()).toBe(15);
  });
});

describe('getTaxYearStart', () => {
  it('should return April 6th for tax year 2024', () => {
    const start = getTaxYearStart(2024);

    expect(start.getUTCFullYear()).toBe(2024);
    expect(start.getUTCMonth()).toBe(3); // April (0-indexed)
    expect(start.getUTCDate()).toBe(6);
  });
});

describe('getTaxYearEnd', () => {
  it('should return April 5th of next year for tax year 2024', () => {
    const end = getTaxYearEnd(2024);

    expect(end.getUTCFullYear()).toBe(2025);
    expect(end.getUTCMonth()).toBe(3); // April (0-indexed)
    expect(end.getUTCDate()).toBe(5);
  });
});

describe('isDateInTaxYear', () => {
  it('should return true for date within tax year', () => {
    const date = new Date('2024-06-15'); // Mid tax year 2024/25
    expect(isDateInTaxYear(date, 2024)).toBe(true);
  });

  it('should return true for start date', () => {
    const date = new Date('2024-04-06'); // Start of tax year 2024/25
    expect(isDateInTaxYear(date, 2024)).toBe(true);
  });

  it('should return true for end date', () => {
    const date = new Date('2025-04-05'); // End of tax year 2024/25
    expect(isDateInTaxYear(date, 2024)).toBe(true);
  });

  it('should return false for date before tax year', () => {
    const date = new Date('2024-04-05'); // Day before tax year 2024/25
    expect(isDateInTaxYear(date, 2024)).toBe(false);
  });

  it('should return false for date after tax year', () => {
    const date = new Date('2025-04-06'); // Day after tax year 2024/25
    expect(isDateInTaxYear(date, 2024)).toBe(false);
  });
});

describe('isBedAndBreakfast', () => {
  it('should return true for acquisition within 30 days', () => {
    const disposal = new Date('2024-01-15');
    const acquisition = new Date('2024-02-10'); // 26 days later
    expect(isBedAndBreakfast(disposal, acquisition)).toBe(true);
  });

  it('should return true for acquisition exactly 30 days later', () => {
    const disposal = new Date('2024-01-15');
    const acquisition = new Date('2024-02-14'); // Exactly 30 days later
    expect(isBedAndBreakfast(disposal, acquisition)).toBe(true);
  });

  it('should return false for acquisition more than 30 days later', () => {
    const disposal = new Date('2024-01-15');
    const acquisition = new Date('2024-02-15'); // 31 days later
    expect(isBedAndBreakfast(disposal, acquisition)).toBe(false);
  });

  it('should return false for same-day acquisition', () => {
    const disposal = new Date('2024-01-15');
    const acquisition = new Date('2024-01-15'); // Same day
    expect(isBedAndBreakfast(disposal, acquisition)).toBe(false);
  });

  it('should return false for acquisition before disposal', () => {
    const disposal = new Date('2024-01-15');
    const acquisition = new Date('2024-01-10'); // Before disposal
    expect(isBedAndBreakfast(disposal, acquisition)).toBe(false);
  });
});

describe('formatDateKey', () => {
  it('should format date as YYYY-MM-DD', () => {
    const date = new Date('2024-06-15');
    expect(formatDateKey(date)).toBe('2024-06-15');
  });

  it('should pad month and day with zeros', () => {
    const date = new Date('2024-01-05');
    expect(formatDateKey(date)).toBe('2024-01-05');
  });
});

describe('parseDateKey', () => {
  it('should parse YYYY-MM-DD to Date', () => {
    const date = parseDateKey('2024-06-15');

    expect(date.getUTCFullYear()).toBe(2024);
    expect(date.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(date.getUTCDate()).toBe(15);
  });

  it('should normalize parsed date', () => {
    const date = parseDateKey('2024-06-15');

    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
  });
});
