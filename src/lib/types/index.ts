/**
 * Type definitions index
 * Explicitly exports definitions to avoid collisions
 */

export { ActionType } from './broker';
export type {
    BrokerTransaction,
    TaxTreaty,
    SpinOff,
    ExcessReportedIncome,
    ExcessReportedIncomeDistribution,
    Dividend
} from './broker';

export {
    Position,
    HmrcTransactionData,
    CalculationType,
    RuleType
} from '../calculator/types';

export type {
    HmrcTransactionLog,
    CalculationEntry,
    CalculationLog,
    ExcessReportedIncomeLog,
    ExcessReportedIncomeDistributionLog,
    ForeignCurrencyAmount,
    ForeignAmountLog,
} from '../calculator/types';

export type {
    PortfolioEntry,
    SummarizedTaxReport
} from './report';
export { SummarizedTaxReportHelpers } from './report';
