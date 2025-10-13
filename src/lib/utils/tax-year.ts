/**
 * Tax year utilities
 *
 * Helper functions for UK tax year calculations
 */

/**
 * Get the start date of a UK tax year (6 April)
 *
 * @param taxYear - The tax year (e.g., 2023 for 2023-2024)
 * @returns Start date of the tax year
 */
export function getTaxYearStart(taxYear: number): Date {
  return new Date(Date.UTC(taxYear, 3, 6)); // April 6th (month is 0-indexed)
}

/**
 * Get the end date of a UK tax year (5 April)
 *
 * @param taxYear - The tax year (e.g., 2023 for 2023-2024)
 * @returns End date of the tax year
 */
export function getTaxYearEnd(taxYear: number): Date {
  return new Date(Date.UTC(taxYear + 1, 3, 5)); // April 5th of following year
}

/**
 * Check if a date falls within a specific tax year
 *
 * @param date - The date to check
 * @param taxYear - The tax year
 * @returns True if the date is in the tax year
 */
export function isDateInTaxYear(date: Date, taxYear: number): boolean {
  const start = getTaxYearStart(taxYear);
  const end = getTaxYearEnd(taxYear);
  return date >= start && date <= end;
}
