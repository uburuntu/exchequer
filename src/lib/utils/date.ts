/**
 * Date utility functions
 * Helper functions for date manipulation and normalization
 */

import { addDays, format } from 'date-fns';

/**
 * Normalize date to midnight UTC
 * Ensures consistent date handling across the application
 *
 * @param date - Date to normalize
 * @returns Date set to midnight UTC
 */
export function normalizeDate(date: Date): Date {
  // Use UTC methods to avoid timezone conversion issues
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
}

/**
 * Get tax year start date (April 6th)
 * UK tax year runs from April 6 to April 5
 *
 * @param year - Tax year (e.g., 2024 for tax year 2024/25)
 * @returns Date of April 6th
 */
export function getTaxYearStart(year: number): Date {
  return new Date(Date.UTC(year, 3, 6)); // Month is 0-indexed, so 3 = April
}

/**
 * Get tax year end date (April 5th of next year)
 *
 * @param year - Tax year (e.g., 2024 for tax year 2024/25)
 * @returns Date of April 5th next year
 */
export function getTaxYearEnd(year: number): Date {
  return new Date(Date.UTC(year + 1, 3, 5)); // April 5th next year
}

/**
 * Check if a date is within a given tax year
 *
 * @param date - Date to check
 * @param taxYear - Tax year (e.g., 2024)
 * @returns True if date falls within tax year
 */
export function isDateInTaxYear(date: Date, taxYear: number): boolean {
  const start = getTaxYearStart(taxYear);
  const end = getTaxYearEnd(taxYear);
  return date >= start && date <= end;
}

/**
 * Check if an acquisition date is within Bed and Breakfast window
 * (30 days after disposal)
 *
 * @param disposalDate - Date of disposal
 * @param acquisitionDate - Date of acquisition
 * @returns True if acquisition is within 30 days after disposal
 */
export function isBedAndBreakfast(
  disposalDate: Date,
  acquisitionDate: Date
): boolean {
  const maxDate = addDays(disposalDate, 30);
  return acquisitionDate > disposalDate && acquisitionDate <= maxDate;
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 * Useful for using dates as Map keys
 *
 * @param date - Date to format
 * @returns ISO date string
 */
export function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parse ISO date string to Date
 *
 * @param dateStr - ISO date string (YYYY-MM-DD)
 * @returns Normalized Date object
 */
export function parseDateKey(dateStr: string): Date {
  // Parse as UTC to avoid timezone issues
  // Split the date string and create UTC date directly
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)); // month is 1-indexed in string, 0-indexed in Date
}

/**
 * Format date for display in UK format
 *
 * @param date - Date to format
 * @param formatStr - date-fns format string (default: 'dd MMM yyyy')
 * @returns Formatted date string
 */
export function formatDateDisplay(
  date: Date,
  formatStr: string = 'dd MMM yyyy'
): string {
  return format(date, formatStr);
}
