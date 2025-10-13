/**
 * Report and portfolio type definitions
 */

import Decimal from 'decimal.js-light';
import type { CalculationLog } from './hmrc';

/**
 * A single symbol entry for the portfolio in the final report
 */
export interface PortfolioEntry {
  symbol: string;
  quantity: Decimal;
  amount: Decimal;
  unrealizedGains: Decimal | null;
}

/**
 * Summarized Tax Report for UI
 */
export interface SummarizedTaxReport {
  taxYear: number;
  portfolio: PortfolioEntry[];
  disposalCount: number;
  disposalProceeds: Decimal;
  allowableCosts: Decimal;
  capitalGain: Decimal;
  capitalLoss: Decimal;
  capitalGainAllowance: Decimal | null;
  dividendAllowance: Decimal | null;
  calculationLog: CalculationLog;
  calculationLogYields: CalculationLog;
  totalUkInterest: Decimal;
  totalForeignInterest: Decimal;
  showUnrealizedGains: boolean;
}

/**
 * Helper functions for SummarizedTaxReport
 */
export namespace SummarizedTaxReportHelpers {
  export function totalGain(report: SummarizedTaxReport): Decimal {
    return report.capitalGain.plus(report.capitalLoss);
  }

  export function taxableGain(report: SummarizedTaxReport): Decimal {
    if (report.capitalGainAllowance === null) {
      throw new Error('Capital gain allowance is not set');
    }
    const total = totalGain(report);
    const netGain = total.minus(report.capitalGainAllowance);
    return netGain.isPositive() ? netGain : new Decimal(0);
  }

  export function totalUnrealizedGains(report: SummarizedTaxReport): Decimal {
    return report.portfolio.reduce((sum, entry) => {
      if (entry.unrealizedGains !== null) {
        return sum.plus(entry.unrealizedGains);
      }
      return sum;
    }, new Decimal(0));
  }
}
