/**
 * HMRC-specific type definitions
 * Re-exports calculator types to avoid duplication
 */

export { Position, HmrcTransactionData, CalculationType, RuleType } from '../calculator/types';
export type {
  HmrcTransactionLog,
  CalculationEntry,
  CalculationLog,
  ExcessReportedIncomeLog,
  ExcessReportedIncomeDistributionLog,
  ForeignCurrencyAmount,
  ForeignAmountLog,
} from '../calculator/types';
