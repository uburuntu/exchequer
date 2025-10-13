/**
 * Type definitions for broker transactions
 */

import type Decimal from 'decimal.js-light';

/**
 * Type of transaction action
 */
export enum ActionType {
  BUY = 'BUY',
  SELL = 'SELL',
  TRANSFER = 'TRANSFER',
  STOCK_ACTIVITY = 'STOCK_ACTIVITY',
  DIVIDEND = 'DIVIDEND',
  DIVIDEND_TAX = 'DIVIDEND_TAX',
  FEE = 'FEE',
  ADJUSTMENT = 'ADJUSTMENT',
  CAPITAL_GAIN = 'CAPITAL_GAIN',
  SPIN_OFF = 'SPIN_OFF',
  INTEREST = 'INTEREST',
  REINVEST_SHARES = 'REINVEST_SHARES',
  REINVEST_DIVIDENDS = 'REINVEST_DIVIDENDS',
  WIRE_FUNDS_RECEIVED = 'WIRE_FUNDS_RECEIVED',
  STOCK_SPLIT = 'STOCK_SPLIT',
  CASH_MERGER = 'CASH_MERGER',
  EXCESS_REPORTED_INCOME = 'EXCESS_REPORTED_INCOME',
  FULL_REDEMPTION = 'FULL_REDEMPTION',
}

/**
 * Broker transaction data
 */
export interface BrokerTransaction {
  date: Date;
  action: ActionType;
  symbol: string | null;
  description: string;
  quantity: Decimal | null;
  price: Decimal | null;
  fees: Decimal;
  amount: Decimal | null;
  currency: string;
  broker: string;
  isin?: string | null;
}

/**
 * Tax treaty between UK and different countries
 */
export interface TaxTreaty {
  country: string;
  countryRate: Decimal;
  treatyRate: Decimal;
}

/**
 * Spin-off event on a share
 */
export interface SpinOff {
  /** Cost proportion to be applied to the cost of original shares */
  costProportion: Decimal;
  /** Source of the Spin-off, e.g MMM for SOLV */
  source: string;
  /** Dest ticker to which SpinOff happened, e.g. SOLV for MMM */
  dest: string;
  /** When the spin-off happened */
  date: Date;
}

/**
 * Excess Reported Income on a fund
 * The income is reported on a fund at the end of its reporting period.
 * The income represents an increase of the cost basis at that date and a
 * taxable event at the distribution date.
 */
export interface ExcessReportedIncome {
  price: Decimal;
  symbol: string;
  date: Date;
  distributionDate: Date;
  isInterest: boolean;
}

/**
 * Excess Reported Income distribution event on a fund
 * This is when the income is distributed to you for tax purposes.
 */
export interface ExcessReportedIncomeDistribution {
  price: Decimal;
  amount: Decimal;
  quantity: Decimal;
}

/**
 * Dividend event
 */
export interface Dividend {
  date: Date;
  symbol: string;
  amount: Decimal;
  taxAtSource: Decimal;
  isInterest: boolean;
  taxTreaty: TaxTreaty | null;
}
