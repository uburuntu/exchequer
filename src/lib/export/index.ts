/**
 * Export module index
 *
 * Re-exports all export functionality
 */

import type { CapitalGainsReport } from '../calculator/types';
import type { SummarizedTaxReport, PortfolioEntry } from '../types/report';
import { ZERO } from '../utils/decimal';

export {
  exportTransactionsToCSV,
  exportCGTReportToCSV,
  exportDisposalsToCSV,
} from './csv-export';

export {
  exportCGTReportToPDF,
  exportDisposalsToPDF,
} from './pdf-report';

/**
 * Convert a CapitalGainsReport to SummarizedTaxReport for export functions
 */
export function toSummarizedReport(report: CapitalGainsReport): SummarizedTaxReport {
  // Convert portfolio Map to array
  const portfolio: PortfolioEntry[] = [];
  for (const [symbol, position] of report.portfolio.entries()) {
    portfolio.push({
      symbol,
      quantity: position.quantity,
      amount: position.amount,
      unrealizedGains: null, // Not available from CapitalGainsReport
    });
  }

  // Calculate disposal metrics from calculation log
  let disposalCount = 0;
  let disposalProceeds = ZERO;
  let allowableCosts = ZERO;

  for (const [_dateKey, symbolMap] of report.calculationLog.entries()) {
    for (const [_symbol, entries] of symbolMap.entries()) {
      for (const entry of entries) {
        if (entry.type === 'disposal' && entry.gain !== undefined) {
          disposalCount++;
          disposalProceeds = disposalProceeds.plus(entry.amount);
          const cost = entry.allowableCost ?? entry.amount.minus(entry.gain);
          allowableCosts = allowableCosts.plus(cost);
        }
      }
    }
  }

  // Calculate total interest from the interest log
  // ForeignAmountLog is Map<string, ForeignCurrencyAmount>
  let totalUkInterest = ZERO;
  let totalForeignInterest = ZERO;
  for (const [_dateKey, interestEntry] of report.interest.entries()) {
    if (interestEntry.currency === 'GBP') {
      totalUkInterest = totalUkInterest.plus(interestEntry.amount);
    } else {
      totalForeignInterest = totalForeignInterest.plus(interestEntry.amount);
    }
  }

  return {
    taxYear: report.taxYear,
    portfolio,
    disposalCount,
    disposalProceeds,
    allowableCosts,
    capitalGain: report.capitalGain,
    capitalLoss: report.capitalLoss,
    capitalGainAllowance: report.allowance,
    dividendAllowance: null, // Not available from CapitalGainsReport
    calculationLog: report.calculationLog,
    calculationLogYields: new Map(), // Not available from CapitalGainsReport
    totalUkInterest,
    totalForeignInterest,
    showUnrealizedGains: false,
  };
}
