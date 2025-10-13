/**
 * Same-Day Rule implementation
 *
 * HMRC rule: When shares are sold and bought on the same day,
 * match them first for capital gains calculations.
 */

import Decimal from 'decimal.js-light';
import type { HmrcTransactionLog, CalculationEntry } from './types';
import { RuleType } from './types';
import { hasKey } from './transaction-log';
import { normalizeAmount, roundDecimal } from '../utils/decimal';

export interface SameDayRuleResult {
  gain: Decimal;
  disposalQuantityRemaining: Decimal;
  proceedsAmountRemaining: Decimal;
  currentQuantityRemaining: Decimal;
  currentAmountRemaining: Decimal;
  calculationEntry: CalculationEntry | null;
}

/**
 * Apply the Same-Day Rule to a disposal
 *
 * Matches disposals with acquisitions on the same day
 *
 * @param acquisitionList - List of all acquisitions
 * @param dateIndex - Date of the disposal
 * @param symbol - Stock symbol
 * @param disposalQuantity - Quantity being disposed
 * @param disposalPrice - Price per share of disposal
 * @param disposalFees - Fees for the disposal
 * @param originalDisposalQuantity - Original disposal quantity (before any rules applied)
 * @param currentQuantity - Current quantity in portfolio
 * @param currentAmount - Current amount in portfolio
 * @returns Result of applying the same-day rule
 */
export function applySameDayRule(
  acquisitionList: HmrcTransactionLog,
  dateIndex: Date,
  symbol: string,
  disposalQuantity: Decimal,
  disposalPrice: Decimal,
  disposalFees: Decimal,
  originalDisposalQuantity: Decimal,
  currentQuantity: Decimal,
  currentAmount: Decimal
): SameDayRuleResult {
  let gain = new Decimal(0);
  let calculationEntry: CalculationEntry | null = null;

  if (!hasKey(acquisitionList, dateIndex, symbol)) {
    return {
      gain,
      disposalQuantityRemaining: disposalQuantity,
      proceedsAmountRemaining: disposalQuantity.times(disposalPrice),
      currentQuantityRemaining: currentQuantity,
      currentAmountRemaining: currentAmount,
      calculationEntry,
    };
  }

  const dateKey = dateIndex.toISOString().split('T')[0]!;
  const sameDayAcquisition = acquisitionList.get(dateKey)!.get(symbol)!;

  const availableQuantity = disposalQuantity.lessThan(sameDayAcquisition.quantity)
    ? disposalQuantity
    : sameDayAcquisition.quantity;

  if (availableQuantity.isZero() || availableQuantity.isNegative()) {
    return {
      gain,
      disposalQuantityRemaining: disposalQuantity,
      proceedsAmountRemaining: disposalQuantity.times(disposalPrice),
      currentQuantityRemaining: currentQuantity,
      currentAmountRemaining: currentAmount,
      calculationEntry,
    };
  }

  const fees = disposalFees.times(availableQuantity).div(originalDisposalQuantity);

  const acquisitionCost = normalizeAmount(
    availableQuantity.times(sameDayAcquisition.amount).div(sameDayAcquisition.quantity)
  );

  const sameDayAmount = availableQuantity.times(disposalPrice);
  const sameDayProceeds = sameDayAmount.plus(fees);
  const sameDayAllowableCost = acquisitionCost.plus(fees);
  const sameDayGain = sameDayProceeds.minus(sameDayAllowableCost);

  gain = sameDayGain;

  const newDisposalQuantity = disposalQuantity.minus(availableQuantity);
  const newProceedsAmount = disposalQuantity
    .minus(availableQuantity)
    .times(disposalPrice);
  const newCurrentQuantity = currentQuantity.minus(availableQuantity);
  const newCurrentAmount = currentAmount.minus(acquisitionCost);

  if (newCurrentQuantity.isZero()) {
    const roundedAmount = roundDecimal(newCurrentAmount, 23);
    if (!roundedAmount.isZero()) {
      console.warn(`Same-day rule: current amount ${newCurrentAmount} should be zero`);
    }
  }

  calculationEntry = {
    type: 'disposal',
    rule: RuleType.SAME_DAY,
    quantity: availableQuantity,
    amount: sameDayAmount,
    fees,
    gain: sameDayGain,
    allowableCost: sameDayAllowableCost,
    newQuantity: newCurrentQuantity,
    newPoolCost: newCurrentAmount,
  };

  return {
    gain,
    disposalQuantityRemaining: newDisposalQuantity,
    proceedsAmountRemaining: newProceedsAmount,
    currentQuantityRemaining: newCurrentQuantity,
    currentAmountRemaining: newCurrentAmount,
    calculationEntry,
  };
}
