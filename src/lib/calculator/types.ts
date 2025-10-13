/**
 * Capital Gains Calculator core types
 *
 * Shared types used across the calculation engine
 */

import type Decimal from 'decimal.js-light';
import { normalizeAmount, ZERO } from '../utils/decimal';

export class Position {
  constructor(
    public quantity: Decimal = ZERO,
    public amount: Decimal = ZERO
  ) { }

  add(other: Position): Position {
    return new Position(
      this.quantity.plus(other.quantity),
      normalizeAmount(this.amount.plus(other.amount))
    );
  }

  sub(other: Position): Position {
    return new Position(
      this.quantity.minus(other.quantity),
      normalizeAmount(this.amount.minus(other.amount))
    );
  }

  toString(): string {
    return `Position(${this.quantity}, ${this.amount})`;
  }
}

export class HmrcTransactionData {
  constructor(
    public quantity: Decimal,
    public amount: Decimal,
    public fees: Decimal,
    public eris: ExcessReportedIncome[] = []
  ) { }

  add(other: HmrcTransactionData): HmrcTransactionData {
    return new HmrcTransactionData(
      this.quantity.plus(other.quantity),
      this.amount.plus(other.amount),
      this.fees.plus(other.fees),
      [...this.eris, ...other.eris]
    );
  }
}

export type HmrcTransactionLog = Map<string, Map<string, HmrcTransactionData>>;

export interface CalculationEntry {
  type: string;
  rule: string;
  quantity: Decimal;
  amount: Decimal;
  fees: Decimal;
  gain?: Decimal;
  newQuantity?: Decimal;
  newPoolCost?: Decimal;
  allowableCost?: Decimal;
}

export type CalculationLog = Map<string, Map<string, CalculationEntry[]>>;

export interface SpinOff {
  dest: string;
  source: string;
  costProportion: Decimal;
  date: Date;
}

export interface ExcessReportedIncome {
  symbol: string;
  date: Date;
  amount: Decimal;
}

export interface ExcessReportedIncomeDistribution {
  amount: Decimal;
}

export type ExcessReportedIncomeLog = Map<string, Map<string, ExcessReportedIncome>>;
export type ExcessReportedIncomeDistributionLog = Map<
  string,
  Map<string, ExcessReportedIncomeDistribution>
>;

export interface ForeignCurrencyAmount {
  amount: Decimal;
  currency: string;
}

export type ForeignAmountLog = Map<string, ForeignCurrencyAmount>;

export interface Dividend {
  date: Date;
  symbol: string;
  amount: Decimal;
  taxAtSource: Decimal;
  isInterest: boolean;
  taxTreaty: string | null;
}

export interface CapitalGainsReport {
  taxYear: number;
  capitalGain: Decimal;
  capitalLoss: Decimal;
  allowance: Decimal;
  calculationLog: CalculationLog;
  dividends: Map<string, ForeignCurrencyAmount>;
  interest: ForeignAmountLog;
  portfolio: Map<string, Position>;
  warnings: CalculationWarning[];
}

/**
 * Severity levels for calculation warnings
 */
export enum WarningSeverity {
  /** Informational - calculation completed but user should be aware */
  INFO = 'INFO',
  /** Warning - calculation may be incomplete or have assumptions */
  WARNING = 'WARNING',
  /** Error - calculation could not be completed correctly */
  ERROR = 'ERROR',
}

/**
 * Categories of calculation warnings
 */
export enum WarningCategory {
  /** Missing data - required information not found */
  MISSING_DATA = 'MISSING_DATA',
  /** Data quality - potential issues with input data */
  DATA_QUALITY = 'DATA_QUALITY',
  /** Matching issues - problems with same-day/B&B/S104 matching */
  MATCHING = 'MATCHING',
  /** Position issues - negative pools, unmatched quantities */
  POSITION = 'POSITION',
  /** Open positions - shorts or other open positions at year end */
  OPEN_POSITION = 'OPEN_POSITION',
}

/**
 * A warning generated during capital gains calculation
 */
export interface CalculationWarning {
  /** Severity of the warning */
  severity: WarningSeverity;
  /** Category of the warning */
  category: WarningCategory;
  /** Symbol affected (if applicable) */
  symbol: string | null;
  /** Date of the transaction/event (if applicable) */
  date: Date | null;
  /** Human-readable message */
  message: string;
  /** Additional details for debugging */
  details?: Record<string, unknown>;
}

export enum CalculationType {
  ACQUISITION = 'ACQUISITION',
  DISPOSAL = 'DISPOSAL',
}

export enum RuleType {
  SAME_DAY = 'SAME_DAY',
  BED_AND_BREAKFAST = 'BED_AND_BREAKFAST',
  SECTION_104 = 'SECTION_104',
  DIVIDEND = 'DIVIDEND',
  INTEREST = 'INTEREST',
  ERI = 'ERI',
  SHORT_COVER = 'SHORT_COVER',
}

/**
 * Represents an open short position that needs to be covered.
 * A short occurs when selling shares you don't own.
 */
export class ShortPosition {
  constructor(
    /** Number of shares owed (always positive) */
    public quantity: Decimal,
    /** Proceeds received from the short sale (in GBP) */
    public proceeds: Decimal,
    /** Date the short was opened */
    public openDate: Date,
    /** Fees paid on the short sale */
    public fees: Decimal
  ) {}

  /**
   * Cover part of the short position
   * @param coverQuantity Number of shares to cover
   * @returns New ShortPosition with reduced quantity, or null if fully covered
   */
  cover(coverQuantity: Decimal): ShortPosition | null {
    const remaining = this.quantity.minus(coverQuantity);
    if (remaining.isZero() || remaining.isNegative()) {
      return null;
    }
    // Proportionally reduce proceeds and fees
    const proportion = remaining.div(this.quantity);
    return new ShortPosition(
      remaining,
      this.proceeds.times(proportion),
      this.openDate,
      this.fees.times(proportion)
    );
  }

  /**
   * Get the proceeds for covering a portion of this short
   */
  getProceedsFor(coverQuantity: Decimal): Decimal {
    if (coverQuantity.greaterThanOrEqualTo(this.quantity)) {
      return this.proceeds;
    }
    return this.proceeds.times(coverQuantity.div(this.quantity));
  }

  /**
   * Get the fees for covering a portion of this short
   */
  getFeesFor(coverQuantity: Decimal): Decimal {
    if (coverQuantity.greaterThanOrEqualTo(this.quantity)) {
      return this.fees;
    }
    return this.fees.times(coverQuantity.div(this.quantity));
  }
}
