/**
 * Decimal arithmetic validation tests
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js-light';
import {
  roundDecimal,
  normalizeAmount,
  approxEqual,
  stripZeros,
  luhnCheckDigit,
  isIsin,
  decimal,
  ZERO,
  ONE,
} from '../lib/utils/decimal';

describe('Decimal Configuration', () => {
  it('should have correct precision setting (28 digits)', () => {
    expect(Decimal.precision).toBe(28);
  });

  it('should use ROUND_HALF_EVEN (banker\'s rounding)', () => {
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_EVEN);
  });
});

describe('roundDecimal', () => {
  it('should round to 0 decimal places by default', () => {
    const result = roundDecimal(new Decimal('3.7'));
    expect(result.toString()).toBe('4');
  });

  it('should use ROUND_HALF_UP', () => {
    // roundDecimal uses ROUND_HALF_UP: 2.5 → 3
    const result1 = roundDecimal(new Decimal('2.5'), 0);
    expect(result1.toString()).toBe('3');

    const result2 = roundDecimal(new Decimal('3.5'), 0);
    expect(result2.toString()).toBe('4');
  });

  it('should round to specified decimal places', () => {
    const result = roundDecimal(new Decimal('3.14159'), 2);
    expect(result.toString()).toBe('3.14');
  });

  it('should handle negative numbers', () => {
    const result = roundDecimal(new Decimal('-3.7'), 0);
    expect(result.toString()).toBe('-4');
  });
});

describe('normalizeAmount', () => {
  it('should round to 10 decimal places', () => {
    const result = normalizeAmount(new Decimal('3.123456789012345'));
    // Note: Decimal.toString() removes trailing zeros
    // But the value is correctly rounded to 10 decimal places
    expect(result.decimalPlaces()).toBeLessThanOrEqual(10);
    expect(result.toFixed(10)).toBe('3.1234567890');
  });

  it('should prevent unbounded precision growth', () => {
    // Simulate currency conversion with repeating decimals
    const usdAmount = new Decimal('100');
    const exchangeRate = new Decimal('1.3'); // GBP/USD
    const gbpAmount = usdAmount.dividedBy(exchangeRate);

    // Without normalization, this would have many decimal places
    const normalized = normalizeAmount(gbpAmount);

    // Should be rounded to 10 decimal places
    const decimalPlaces = normalized.toString().split('.')[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(10);
  });

  it('should handle repeating decimals', () => {
    // Decimal(6) / Decimal(7)
    const expectedResult = '0.8571428571428571428571428571'; // 28 digits precision
    const tsResult = new Decimal(6).div(7);
    expect(tsResult.toString()).toBe(expectedResult);

    // After normalization
    const normalized = normalizeAmount(tsResult);
    expect(normalized.toString()).toBe('0.8571428571'); // 10 decimal places
  });
});

describe('approxEqual', () => {
  it('should return true for values within 0.01', () => {
    const a = new Decimal('10.005');
    const b = new Decimal('10.000');
    expect(approxEqual(a, b)).toBe(true);
  });

  it('should return false for values outside 0.01', () => {
    const a = new Decimal('10.02');
    const b = new Decimal('10.00');
    expect(approxEqual(a, b)).toBe(false);
  });

  it('should handle negative differences', () => {
    const a = new Decimal('10.000');
    const b = new Decimal('10.005');
    expect(approxEqual(a, b)).toBe(true);
  });

  it('should return true for equal values', () => {
    const a = new Decimal('10.00');
    const b = new Decimal('10.00');
    expect(approxEqual(a, b)).toBe(true);
  });
});

describe('stripZeros', () => {
  it('should remove trailing zeros after decimal point', () => {
    expect(stripZeros(new Decimal('3.1400'))).toBe('3.14');
  });

  it('should remove decimal point if no decimals remain', () => {
    expect(stripZeros(new Decimal('3.0000'))).toBe('3');
  });

  it('should keep significant zeros', () => {
    expect(stripZeros(new Decimal('3.1001'))).toBe('3.1001');
  });
});

describe('luhnCheckDigit', () => {
  it('should calculate correct check digit', () => {
    // For ISIN validation, the payload is numeric after letter conversion
    // For US0378331005 (Apple), the payload after conversion is:
    // U=30, S=28, then digits: "3028037833100"
    // Let's test with a simpler numeric payload
    expect(luhnCheckDigit('7992739871')).toBe(3); // Known valid Luhn
  });

  it('should handle even length payloads', () => {
    const result = luhnCheckDigit('1234');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(9);
  });

  it('should handle odd length payloads (zero-padded)', () => {
    const result = luhnCheckDigit('123');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(9);
  });
});

describe('isIsin', () => {
  it('should validate correct ISINs', () => {
    expect(isIsin('US0378331005')).toBe(true); // Apple
    expect(isIsin('GB0002374006')).toBe(true); // BAE Systems
    expect(isIsin('IE00B4BNMY34')).toBe(true); // Accenture
  });

  it('should reject invalid ISINs', () => {
    expect(isIsin('US0378331006')).toBe(false); // Wrong check digit
    expect(isIsin('XX1234567890')).toBe(false); // Invalid country code
    expect(isIsin('US037833100')).toBe(false);  // Too short
    expect(isIsin('US03783310055')).toBe(false); // Too long
  });

  it('should reject non-ISIN formats', () => {
    expect(isIsin('AAPL')).toBe(false);
    expect(isIsin('12345')).toBe(false);
    expect(isIsin('')).toBe(false);
  });
});

describe('decimal helper', () => {
  it('should create Decimal from number', () => {
    const result = decimal(3.14);
    expect(result).toBeInstanceOf(Decimal);
    expect(result.toString()).toBe('3.14');
  });

  it('should create Decimal from string', () => {
    const result = decimal('3.14159');
    expect(result).toBeInstanceOf(Decimal);
    expect(result.toString()).toBe('3.14159');
  });

  it('should return Decimal unchanged', () => {
    const input = new Decimal('3.14');
    const result = decimal(input);
    expect(result).toBe(input);
  });
});

describe('Decimal constants', () => {
  it('should have ZERO constant', () => {
    expect(ZERO.toString()).toBe('0');
    expect(ZERO).toBeInstanceOf(Decimal);
  });

  it('should have ONE constant', () => {
    expect(ONE.toString()).toBe('1');
    expect(ONE).toBeInstanceOf(Decimal);
  });
});

describe('Financial calculations precision', () => {
  it('should handle currency conversion without precision loss', () => {
    // Real-world scenario: Convert USD to GBP
    const usdAmount = new Decimal('24750.00');
    const exchangeRate = new Decimal('1.27345'); // Example rate
    const gbpAmount = normalizeAmount(usdAmount.div(exchangeRate));

    // Should maintain precision
    expect(gbpAmount.decimalPlaces()).toBeLessThanOrEqual(10);
  });

  it('should avoid floating-point errors', () => {
    // Classic JavaScript floating-point problem: 0.1 + 0.2 = 0.30000000000000004
    // Decimal should handle this correctly
    const result = new Decimal('0.1').plus(new Decimal('0.2'));
    expect(result.toString()).toBe('0.3');
    expect(result.equals(new Decimal('0.3'))).toBe(true);
  });

  it('should handle repeating decimals in division', () => {
    // 1/3 should be precise to 28 digits
    const result = ONE.div(new Decimal('3'));
    const expected = '0.3333333333333333333333333333';
    expect(result.toString()).toBe(expected);
  });
});
