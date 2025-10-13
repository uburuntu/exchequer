/**
 * HMRC-specific constants
 */

/**
 * UK currency code
 */
export const UK_CURRENCY = 'GBP';

/**
 * Bed and Breakfast rule: HMRC requires matching disposals with acquisitions
 * within 30 days following the disposal to prevent tax avoidance.
 *
 * Source: https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg51560
 */
export const BED_AND_BREAKFAST_DAYS = 30;

/**
 * Internal start date for calculations
 */
export const INTERNAL_START_DATE = new Date(Date.UTC(2010, 0, 1)); // January 1, 2010

/**
 * Ticker symbol renames
 *
 * Maps old ticker symbols to new ones (e.g., Facebook -> Meta)
 */
export const TICKER_RENAMES: Record<string, string> = {
  'FB': 'META',
};

/**
 * Get the renamed ticker symbol if it exists
 *
 * @param symbol - Original ticker symbol
 * @returns Renamed symbol or original if no rename exists
 */
export function getRenamedTicker(symbol: string): string {
  return TICKER_RENAMES[symbol] ?? symbol;
}

/**
 * Capital Gains Tax annual allowances by tax year
 *
 * Source: https://www.gov.uk/capital-gains-tax/allowances
 */
export const CAPITAL_GAIN_ALLOWANCES: Record<number, number> = {
  2014: 11000,
  2015: 11100,
  2016: 11100,
  2017: 11300,
  2018: 11700,
  2019: 12000,
  2020: 12300,
  2021: 12300,
  2022: 12300,
  2023: 6000,
  2024: 3000,
  2025: 3000,
};

/**
 * Dividend Tax annual allowances by tax year
 *
 * Source: https://www.gov.uk/tax-on-dividends
 */
export const DIVIDEND_ALLOWANCES: Record<number, number> = {
  2019: 2000,
  2020: 2000,
  2021: 2000,
  2022: 2000,
  2023: 1000,
  2024: 500,
  2025: 500,
};

