/**
 * Bed and Breakfast Rule implementation
 *
 * HMRC rule: Match disposals with acquisitions within 30 days AFTER the sale
 * to prevent tax avoidance through quick repurchases.
 *
 * This is the most complex of the three HMRC rules due to:
 * - Stock splits during the B&B period
 * - Excess Reported Income (ERI) handling
 * - Same-day disposal avoidance
 * - Multiple acquisition matching
 */

import Decimal from 'decimal.js-light';
import type {
  HmrcTransactionLog,
  CalculationEntry,
  ExcessReportedIncome,
  ExcessReportedIncomeDistributionLog,
} from './types';
import { HmrcTransactionData, RuleType } from './types';
import { hasKey, addToList } from './transaction-log';
import { normalizeAmount, roundDecimal, ZERO } from '../utils/decimal';
import { BED_AND_BREAKFAST_DAYS } from '../constants/hmrc';

export interface BedAndBreakfastRuleContext {
  acquisitionList: HmrcTransactionLog;
  disposalList: HmrcTransactionLog;
  bnbList: HmrcTransactionLog;
  splitList: Map<string, Decimal>;
  erisDistribution: ExcessReportedIncomeDistributionLog;
  getEri: (symbol: string, date: Date) => ExcessReportedIncome | null;
  dateInTaxYear: (date: Date) => boolean;
}

export interface BedAndBreakfastRuleResult {
  gain: Decimal;
  disposalQuantityRemaining: Decimal;
  proceedsAmountRemaining: Decimal;
  currentQuantityRemaining: Decimal;
  currentAmountRemaining: Decimal;
  calculationEntries: CalculationEntry[];
}

/**
 * Apply the Bed & Breakfast Rule to a disposal
 *
 * Matches disposals with acquisitions within 30 days after the disposal date
 *
 * @param context - Context containing transaction logs and helper functions
 * @param dateIndex - Date of the disposal
 * @param symbol - Stock symbol
 * @param disposalQuantity - Quantity being disposed
 * @param disposalPrice - Price per share of disposal
 * @param disposalFees - Fees for the disposal
 * @param originalDisposalQuantity - Original disposal quantity (before any rules applied)
 * @param currentQuantity - Current quantity in portfolio
 * @param currentAmount - Current amount in portfolio
 * @returns Result of applying the bed & breakfast rule
 */
export function applyBedAndBreakfastRule(
  context: BedAndBreakfastRuleContext,
  dateIndex: Date,
  symbol: string,
  disposalQuantity: Decimal,
  disposalPrice: Decimal,
  disposalFees: Decimal,
  originalDisposalQuantity: Decimal,
  currentQuantity: Decimal,
  currentAmount: Decimal
): BedAndBreakfastRuleResult {
  let gain = ZERO;
  let remainingDisposalQuantity = disposalQuantity;
  let remainingProceedsAmount = disposalQuantity.times(disposalPrice);
  let remainingCurrentQuantity = currentQuantity;
  let remainingCurrentAmount = currentAmount;
  const calculationEntries: CalculationEntry[] = [];

  if (disposalQuantity.isZero() || disposalQuantity.isNegative()) {
    return {
      gain,
      disposalQuantityRemaining: remainingDisposalQuantity,
      proceedsAmountRemaining: remainingProceedsAmount,
      currentQuantityRemaining: remainingCurrentQuantity,
      currentAmountRemaining: remainingCurrentAmount,
      calculationEntries,
    };
  }

  const eris: ExcessReportedIncome[] = [];
  const eri = context.getEri(symbol, dateIndex);
  if (eri) {
    eris.push(eri);
  }

  let splitMultiplier = new Decimal(1);

  for (let i = 0; i < BED_AND_BREAKFAST_DAYS; i++) {
    const searchDate = new Date(dateIndex);
    searchDate.setUTCDate(searchDate.getUTCDate() + i + 1);
    const searchDateKey = searchDate.toISOString().split('T')[0]!;
    const splitKey = `${symbol}:${searchDateKey}`;

    splitMultiplier = splitMultiplier.times(context.splitList.get(splitKey) || new Decimal(1));

    const eriAtSearch = context.getEri(symbol, searchDate);
    if (eriAtSearch) {
      eris.push(eriAtSearch);
    }

    if (!hasKey(context.acquisitionList, searchDate, symbol)) {
      continue;
    }

    const acquisition = context.acquisitionList.get(searchDateKey)!.get(symbol)!;

    const bnbAcquisition = hasKey(context.bnbList, searchDate, symbol)
      ? context.bnbList.get(searchDateKey)!.get(symbol)!
      : new HmrcTransactionData(ZERO, ZERO, ZERO, []);

    if (bnbAcquisition.quantity.greaterThan(acquisition.quantity)) {
      throw new Error('BnB acquisition quantity exceeds actual acquisition quantity');
    }

    const sameDayDisposal = hasKey(context.disposalList, searchDate, symbol)
      ? context.disposalList.get(searchDateKey)!.get(symbol)!
      : new HmrcTransactionData(ZERO, ZERO, ZERO, []);

    if (sameDayDisposal.quantity.greaterThan(acquisition.quantity)) {
      continue;
    }

    const availableForBnb = acquisition.quantity
      .minus(sameDayDisposal.quantity)
      .minus(bnbAcquisition.quantity);

    if (availableForBnb.isZero()) {
      continue;
    }

    if (acquisition.amount.isZero()) {
      console.warn(
        `A split happened shortly after a disposal of ${symbol}. ` +
          `Disposed on ${dateIndex.toISOString().split('T')[0]} and split happened on ${searchDateKey}`
      );
      continue;
    }

    console.warn(
      `Bed and breakfasting for ${symbol}. ` +
        `Disposed on ${dateIndex.toISOString().split('T')[0]} and acquired again on ${searchDateKey}`
    );

    if (!splitMultiplier.equals(1)) {
      console.warn(
        `Bed & breakfast for ${symbol} is taking into account a ${splitMultiplier}x split ` +
          `that happened shortly before the repurchase of shares`
      );
    }

    const availableAcquisitionQuantity = acquisition.quantity.div(splitMultiplier).minus(sameDayDisposal.quantity).minus(bnbAcquisition.quantity);
    const availableQuantity = remainingDisposalQuantity.lessThan(availableAcquisitionQuantity)
      ? remainingDisposalQuantity
      : availableAcquisitionQuantity;

    const fees = disposalFees.times(availableQuantity).div(originalDisposalQuantity);

    const adjustedAcquisitionQuantity = acquisition.quantity.div(splitMultiplier);

    const bnbAcquisitionCost = normalizeAmount(
      availableQuantity.times(acquisition.amount).div(adjustedAcquisitionQuantity)
    );

    const bedAndBreakfastAmount = availableQuantity.times(disposalPrice);
    const bedAndBreakfastProceeds = bedAndBreakfastAmount.plus(fees);
    const bedAndBreakfastAllowableCost = bnbAcquisitionCost.plus(fees);

    let totalDistAmount = ZERO;
    for (const eri of eris) {
      const eriDistAmount = availableQuantity.times(eri.amount);
      totalDistAmount = totalDistAmount.plus(eriDistAmount);

      if (context.dateInTaxYear(eri.date)) {
        const eriDateKey = eri.date.toISOString().split('T')[0]!;
        if (!context.erisDistribution.has(eriDateKey)) {
          context.erisDistribution.set(eriDateKey, new Map());
        }
        const symbolMap = context.erisDistribution.get(eriDateKey)!;
        const existing = symbolMap.get(symbol) || { amount: ZERO };
        symbolMap.set(symbol, {
          amount: existing.amount.plus(eriDistAmount),
        });
      }
    }

    const bedAndBreakfastGain = bedAndBreakfastProceeds.minus(bedAndBreakfastAllowableCost);
    gain = gain.plus(bedAndBreakfastGain);

    remainingDisposalQuantity = remainingDisposalQuantity.minus(availableQuantity);
    remainingProceedsAmount = remainingProceedsAmount.minus(availableQuantity.times(disposalPrice));

    const amountDelta = normalizeAmount(
      availableQuantity.times(remainingCurrentAmount).div(remainingCurrentQuantity)
    );

    remainingCurrentQuantity = remainingCurrentQuantity.minus(availableQuantity);
    remainingCurrentAmount = remainingCurrentAmount.minus(amountDelta);

    if (remainingCurrentQuantity.isZero()) {
      const roundedAmount = roundDecimal(remainingCurrentAmount, 23);
      if (!roundedAmount.isZero()) {
        console.warn(`B&B rule: current amount ${remainingCurrentAmount} should be zero`);
      }
    }

    addToList(
      context.bnbList,
      searchDate,
      symbol,
      availableQuantity.times(splitMultiplier),
      amountDelta.plus(totalDistAmount),
      ZERO,
      eris
    );

    calculationEntries.push({
      type: 'disposal',
      rule: RuleType.BED_AND_BREAKFAST,
      quantity: availableQuantity,
      amount: bedAndBreakfastAmount,
      fees,
      gain: bedAndBreakfastGain,
      allowableCost: bedAndBreakfastAllowableCost,
      newQuantity: remainingCurrentQuantity,
      newPoolCost: remainingCurrentAmount,
    });

    if (remainingDisposalQuantity.isZero() || remainingDisposalQuantity.isNegative()) {
      break;
    }
  }

  return {
    gain,
    disposalQuantityRemaining: remainingDisposalQuantity,
    proceedsAmountRemaining: remainingProceedsAmount,
    currentQuantityRemaining: remainingCurrentQuantity,
    currentAmountRemaining: remainingCurrentAmount,
    calculationEntries,
  };
}
