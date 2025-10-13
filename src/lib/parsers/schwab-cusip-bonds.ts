/**
 * CUSIP bond price adjustment logic for Schwab transactions
 *
 * Schwab reports bond prices per $100 face value, while capital gains calculations
 * need prices per $1 face value.
 */

import Decimal from 'decimal.js-light';

const CUSIP_SYMBOL_LENGTH = 9;
const BOND_PRICE_DIVISOR = 100;
const MIN_ACCRUED_INTEREST_THRESHOLD = new Decimal('0.01');
const MAX_ACCRUED_INTEREST_BUY = new Decimal('0.01');
const MAX_ACCRUED_INTEREST_SELL = new Decimal(100);
const BOND_PRICE_TOLERANCE_RATIO = new Decimal('0.5');

const CUSIP_ALPHA_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ*@#';

function validateCusipCheckDigit(cusip: string): boolean {
  let totalSum = 0;

  for (let idx = 0; idx < cusip.length - 1; idx++) {
    const char = cusip[idx]!.toUpperCase();
    let val: number;

    if (/\d/.test(char)) {
      val = parseInt(char, 10);
    } else if (CUSIP_ALPHA_CHARS.includes(char)) {
      val = CUSIP_ALPHA_CHARS.indexOf(char) + 10;
    } else {
      return false;
    }

    if (idx % 2 !== 0) {
      val *= 2;
    }

    totalSum += Math.floor(val / 10) + (val % 10);
  }

  const checkDigit = (10 - (totalSum % 10)) % 10;
  return String(checkDigit) === cusip[cusip.length - 1];
}

function isCusipSymbol(symbol: string | null): boolean {
  if (!symbol || symbol.length !== CUSIP_SYMBOL_LENGTH) {
    return false;
  }

  return validateCusipCheckDigit(symbol);
}

function isAmountInRange(amount: Decimal, minVal: Decimal, maxVal: Decimal): boolean {
  return amount.greaterThanOrEqualTo(minVal) && amount.lessThanOrEqualTo(maxVal);
}

function isAmountWithinTolerance(
  amount: Decimal,
  expectedGross: Decimal,
  toleranceRatio: Decimal
): boolean {
  return amount.abs().minus(expectedGross.abs()).abs()
    .lessThan(expectedGross.abs().times(toleranceRatio));
}

function validateBondAmount(
  amount: Decimal,
  expectedGross: Decimal,
  fees: Decimal
): boolean {
  let expectedMin: Decimal;
  let expectedMax: Decimal;

  if (amount.lessThan(0)) {
    expectedMin = expectedGross.abs().plus(fees.abs()).plus(MAX_ACCRUED_INTEREST_BUY).negated();
    expectedMax = expectedGross.abs().plus(fees.abs()).minus(MAX_ACCRUED_INTEREST_BUY).negated();
  } else {
    expectedMin = expectedGross.abs().minus(fees.abs()).minus(MAX_ACCRUED_INTEREST_SELL);
    expectedMax = expectedGross.abs().minus(fees.abs()).plus(MAX_ACCRUED_INTEREST_SELL);
  }

  return isAmountInRange(amount, expectedMin, expectedMax) ||
         isAmountWithinTolerance(amount, expectedGross, BOND_PRICE_TOLERANCE_RATIO);
}

export function adjustCusipBondPrice(
  symbol: string | null,
  price: Decimal | null,
  quantity: Decimal | null,
  amount: Decimal | null,
  fees: Decimal
): [Decimal | null, Decimal] {
  if (!isCusipSymbol(symbol) || price === null) {
    return [price, fees];
  }

  const adjustedPrice = price.div(BOND_PRICE_DIVISOR);

  if (quantity === null || amount === null) {
    return [adjustedPrice, fees];
  }

  const expectedGross = quantity.times(adjustedPrice);

  if (!validateBondAmount(amount, expectedGross, fees)) {
    return [price, fees];
  }

  const expectedAmount = quantity.times(adjustedPrice);
  const accruedInterest = amount.abs().minus(expectedAmount.abs()).minus(fees.abs());

  if (accruedInterest.greaterThan(MIN_ACCRUED_INTEREST_THRESHOLD)) {
    const adjustedFees = fees.plus(accruedInterest);
    return [adjustedPrice, adjustedFees];
  }

  return [adjustedPrice, fees];
}
