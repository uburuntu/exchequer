/**
 * UK tax allowances and rates
 */

import Decimal from 'decimal.js-light';
import type { TaxTreaty } from '../types';
import { CAPITAL_GAIN_ALLOWANCES, DIVIDEND_ALLOWANCES } from './hmrc';

/**
 * Double taxation treaty rates per country
 *
 * Source: https://www.gov.uk/hmrc-internal-manuals/double-taxation-relief
 */
export const DIVIDEND_DOUBLE_TAXATION_RULES: Record<string, TaxTreaty> = {
  USD: {
    country: 'USA',
    countryRate: new Decimal('0.15'),
    treatyRate: new Decimal('0.15'),
  },
  PLN: {
    country: 'Poland',
    countryRate: new Decimal('0.19'),
    treatyRate: new Decimal('0.1'),
  },
};

/**
 * Get capital gains allowance for a tax year
 *
 * @param taxYear - Tax year (e.g., 2024 for 2024/25)
 * @returns Allowance amount in pounds, or null if not available
 */
export function getCapitalGainAllowance(taxYear: number): number | null {
  return CAPITAL_GAIN_ALLOWANCES[taxYear] ?? null;
}

/**
 * Get dividend allowance for a tax year
 *
 * @param taxYear - Tax year (e.g., 2024 for 2024/25)
 * @returns Allowance amount in pounds, or null if not available
 */
export function getDividendAllowance(taxYear: number): number | null {
  return DIVIDEND_ALLOWANCES[taxYear] ?? null;
}
