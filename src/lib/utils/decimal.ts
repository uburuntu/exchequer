/**
 * Decimal utility functions
 *
 * CRITICAL: This file configures decimal.js-light for financial calculations.
 * All financial calculations MUST use these functions to ensure accuracy.
 */

import Decimal from 'decimal.js-light';

/**
 * Configure decimal.js-light for financial calculations
 * Uses precision=28 and ROUND_HALF_EVEN (banker's rounding) for consistency
 */
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,    // Banker's rounding
  toExpNeg: -7,
  toExpPos: 21,
});

/**
 * Round decimal to given precision using ROUND_HALF_UP
 *
 * @param value - The decimal value to round
 * @param digits - Number of decimal places (default: 0)
 * @returns Rounded decimal
 */
export function roundDecimal(value: Decimal, digits: number = 0): Decimal {
  return value.toDecimalPlaces(digits, Decimal.ROUND_HALF_UP);
}

/**
 * Normalize amount to prevent unbounded precision growth
 *
 * Financial amounts are rounded to 10 decimal places, which is far more
 * precision than needed for real-world financial calculations, while preventing
 * precision from growing unbounded through currency conversions with repeating
 * decimals (e.g., GBP/USD conversions).
 *
 * @param amount - The amount to normalize
 * @returns Normalized amount with 10 decimal places
 */
export function normalizeAmount(amount: Decimal): Decimal {
  return roundDecimal(amount, 10);
}

/**
 * Calculate if two decimals are the same within 0.01
 *
 * It is not clear how Schwab or other brokers round the dollar value,
 * so assume the values are equal if they are within 0.01.
 *
 * @param valA - First value
 * @param valB - Second value
 * @returns True if values are within 0.01 of each other
 */
export function approxEqual(valA: Decimal, valB: Decimal): boolean {
  return valA.minus(valB).abs().lessThan(new Decimal('0.01'));
}

/**
 * Strip trailing zeros from Decimal
 *
 * @param value - The decimal value
 * @returns String representation without trailing zeros
 */
export function stripZeros(value: Decimal): string {
  return value.toFixed(10).replace(/\.?0+$/, '');
}

/**
 * Luhn check digit algorithm
 * Reference: https://en.wikipedia.org/wiki/Luhn_algorithm
 *
 * @param payload - String of numbers
 * @returns Check digit
 */
export function luhnCheckDigit(payload: string): number {
  let paddedPayload = payload;
  if (payload.length % 2 === 1) {
    paddedPayload = `0${payload}`;  // zero pad so length is even
  }

  let checksum = 0;
  const luhnEvenDigitMaxValue = 9;
  const luhnEvenDigitMultiplier = 2;

  // Reverse the string and iterate
  const reversed = paddedPayload.split('').reverse().join('');
  for (let idx = 0; idx < reversed.length; idx++) {
    let digit = parseInt(reversed[idx]!, 10);
    if (idx % 2 === 0) {
      digit *= luhnEvenDigitMultiplier;
      if (digit > luhnEvenDigitMaxValue) {
        digit -= luhnEvenDigitMaxValue;
      }
    }
    checksum += digit;
  }

  // using mod operator twice asserts the check digit is < 10
  return (10 - (checksum % 10)) % 10;
}

/**
 * Validate if a string is a valid ISIN
 * Reference: https://en.wikipedia.org/wiki/International_Securities_Identification_Number
 *
 * @param isin - String to validate
 * @returns True if valid ISIN
 */
export function isIsin(isin: string): boolean {
  // ISIN format: 2 letter country code + 9 alphanumeric + 1 check digit
  const isinRegex = /^([A-Z]{2})([A-Z0-9]{9})([0-9])$/;
  const isinCharIdxs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  if (!isinRegex.test(isin)) {
    return false;
  }

  const payload = isin.slice(0, 11);
  const checkDigit = parseInt(isin[11]!, 10);

  // Convert letters to numbers (A=10, B=11, ..., Z=35)
  const numericPayload = payload
    .split('')
    .map(c => isinCharIdxs.indexOf(c).toString())
    .join('');

  return luhnCheckDigit(numericPayload) === checkDigit;
}

/**
 * Helper function to create a Decimal from various input types
 * Ensures consistent Decimal creation across the codebase
 *
 * @param value - Number, string, or Decimal
 * @returns Decimal instance
 */
export function decimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) {
    return value;
  }
  return new Decimal(value);
}

/**
 * Helper to create a Decimal(0)
 */
export const ZERO = new Decimal(0);

/**
 * Helper to create a Decimal(1)
 */
export const ONE = new Decimal(1);
