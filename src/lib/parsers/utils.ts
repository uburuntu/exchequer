import Decimal from 'decimal.js-light';
import { ParsingError } from './errors';

/**
 * Parse a decimal value from a row column.
 * Throws an error if the value is invalid.
 * Returns 0 for empty/missing values unless strict mode is enabled.
 */
export function parseDecimal(
  row: Record<string, string>,
  column: string,
  fileName: string,
  options: { strict?: boolean } = {}
): Decimal {
  const value = row[column]?.trim();

  if (!value || value === '' || value === 'N/A' || value === 'Not available') {
    if (options.strict) {
      throw new ParsingError(
        `Missing required value for column "${column}"`,
        fileName
      );
    }
    return new Decimal(0);
  }

  const cleaned = value.replace(/[,$£€]/g, '');
  try {
    return new Decimal(cleaned);
  } catch {
    throw new ParsingError(
      `Invalid decimal value "${value}" in column "${column}"`,
      fileName
    );
  }
}

/**
 * Parse a decimal value from a string directly.
 * Useful when the value is already extracted from the row.
 */
export function parseDecimalFromString(
  value: string,
  context: string,
  fileName: string
): Decimal {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '' || trimmed === 'N/A') {
    return new Decimal(0);
  }

  const cleaned = trimmed.replace(/[,$£€]/g, '');
  try {
    return new Decimal(cleaned);
  } catch {
    throw new ParsingError(
      `Invalid decimal value "${value}" in ${context}`,
      fileName
    );
  }
}

/**
 * Parse an optional decimal value from a row column.
 * Returns null for empty/missing values.
 * Throws an error for invalid (non-empty) decimal values.
 */
export function parseOptionalDecimal(
  row: Record<string, string>,
  column: string
): Decimal | null {
  const value = row[column]?.trim();
  if (!value || value === '' || value === 'N/A' || value === 'Not available') {
    return null;
  }
  const cleaned = value.replace(/[,$£€]/g, '');
  try {
    return new Decimal(cleaned);
  } catch (err) {
    throw new Error(`Invalid decimal in ${column}: ${value}`);
  }
}

/**
 * Parse an optional string value from a row column.
 * Returns null for empty/missing values.
 */
export function parseOptionalString(
  row: Record<string, string>,
  column: string
): string | null {
  const value = row[column]?.trim();
  if (!value || value === '' || value === 'N/A' || value === 'Not available') {
    return null;
  }
  return value;
}

/**
 * Parse a date string into a UTC-normalized Date object.
 * Throws an error if the date is invalid.
 */
export function parseDate(dateString: string, fileName: string): Date {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new ParsingError(`Invalid date: ${dateString}`, fileName);
  }
  // Normalize to midnight UTC
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * Validate that a row contains all expected columns.
 * Throws an error if any columns are missing.
 */
export function validateRow(
  row: Record<string, string>,
  expectedColumns: string[],
  fileName: string
): void {
  const missing = expectedColumns.filter(col => !(col in row));
  if (missing.length > 0) {
    throw new ParsingError(
      `Missing columns: ${missing.join(', ')}`,
      fileName
    );
  }
}

/**
 * Clean currency symbols and thousand separators from a string.
 */
export function cleanCurrency(value: string): string {
  return value.replace(/[,$£€]/g, '').trim();
}
