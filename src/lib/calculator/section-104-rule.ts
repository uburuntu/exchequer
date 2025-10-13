/**
 * Section 104 Pooling Rule implementation
 *
 * HMRC rule: Default rule for remaining shares after Same-Day and B&B rules.
 * All shares of the same type are pooled with an averaged cost basis.
 *
 * This is the simplest of the three HMRC rules - it's just average cost pooling.
 */

import Decimal from 'decimal.js-light';
import type { CalculationEntry } from './types';
import { RuleType } from './types';
import { normalizeAmount, roundDecimal, ZERO } from '../utils/decimal';

export interface Section104RuleResult {
  gain: Decimal;
  disposalQuantityRemaining: Decimal;
  proceedsAmountRemaining: Decimal;
  currentQuantityRemaining: Decimal;
  currentAmountRemaining: Decimal;
  calculationEntry: CalculationEntry | null;
}

/**
 * Apply the Section 104 Pooling Rule to a disposal
 *
 * Uses average cost basis for all remaining shares
 *
 * @param disposalQuantity - Quantity being disposed
 * @param disposalPrice - Price per share of disposal
 * @param disposalFees - Fees for the disposal
 * @param originalDisposalQuantity - Original disposal quantity (before any rules applied)
 * @param currentQuantity - Current quantity in portfolio
 * @param currentAmount - Current amount in portfolio
 * @returns Result of applying the section 104 rule
 */
export function applySection104Rule(
  disposalQuantity: Decimal,
  disposalPrice: Decimal,
  disposalFees: Decimal,
  originalDisposalQuantity: Decimal,
  currentQuantity: Decimal,
  currentAmount: Decimal
): Section104RuleResult {
  let gain = ZERO;
  let calculationEntry: CalculationEntry | null = null;

  if (disposalQuantity.isZero() || disposalQuantity.isNegative()) {
    return {
      gain,
      disposalQuantityRemaining: ZERO,
      proceedsAmountRemaining: ZERO,
      currentQuantityRemaining: currentQuantity,
      currentAmountRemaining: currentAmount,
      calculationEntry,
    };
  }

  const availableQuantity = disposalQuantity;
  const fees = disposalFees.times(availableQuantity).div(originalDisposalQuantity);

  const amountDelta = normalizeAmount(
    availableQuantity.times(currentAmount).div(currentQuantity)
  );

  const r104Amount = availableQuantity.times(disposalPrice);
  const r104Proceeds = r104Amount.plus(fees);
  const r104AllowableCost = amountDelta.plus(fees);
  const r104Gain = r104Proceeds.minus(r104AllowableCost);

  gain = r104Gain;

  const newDisposalQuantity = ZERO;
  const newProceedsAmount = ZERO;
  const newCurrentQuantity = currentQuantity.minus(availableQuantity);
  const newCurrentAmount = currentAmount.minus(amountDelta);

  if (newCurrentQuantity.isZero()) {
    const roundedAmount = roundDecimal(newCurrentAmount, 10);
    if (!roundedAmount.isZero()) {
      console.warn(`Section 104 rule: current amount ${newCurrentAmount} should be zero`);
    }
  }

  calculationEntry = {
    type: 'disposal',
    rule: RuleType.SECTION_104,
    quantity: availableQuantity,
    amount: r104Amount,
    fees,
    gain: r104Gain,
    allowableCost: r104AllowableCost,
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
