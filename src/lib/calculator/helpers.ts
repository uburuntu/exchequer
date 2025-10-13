/**
 * Capital Gains Calculator helper functions
 */

import Decimal from 'decimal.js-light';
import type { BrokerTransaction } from '../types';
import { CalculationType } from './types';
import { approxEqual } from '../utils/decimal';

export class AmountMissingError extends Error {
  constructor(public transaction: BrokerTransaction) {
    super(`Amount missing for transaction: ${JSON.stringify(transaction)}`);
    this.name = 'AmountMissingError';
  }
}

export class SymbolMissingError extends Error {
  constructor(public transaction: BrokerTransaction) {
    super(`Symbol missing for transaction: ${JSON.stringify(transaction)}`);
    this.name = 'SymbolMissingError';
  }
}

export class QuantityMissingError extends Error {
  constructor(public transaction: BrokerTransaction) {
    super(`Quantity missing for transaction: ${JSON.stringify(transaction)}`);
    this.name = 'QuantityMissingError';
  }
}

export class PriceMissingError extends Error {
  constructor(public transaction: BrokerTransaction) {
    super(`Price missing for transaction: ${JSON.stringify(transaction)}`);
    this.name = 'PriceMissingError';
  }
}

export class QuantityNotPositiveError extends Error {
  constructor(public transaction: BrokerTransaction) {
    super(`Quantity not positive for transaction: ${JSON.stringify(transaction)}`);
    this.name = 'QuantityNotPositiveError';
  }
}

export class CalculatedAmountDiscrepancyError extends Error {
  constructor(
    public transaction: BrokerTransaction,
    public calculatedAmount: Decimal
  ) {
    super(
      `Calculated amount ${calculatedAmount} differs from transaction amount ${transaction.amount}`
    );
    this.name = 'CalculatedAmountDiscrepancyError';
  }
}

export class InvalidTransactionError extends Error {
  constructor(
    public transaction: BrokerTransaction,
    message: string
  ) {
    super(message);
    this.name = 'InvalidTransactionError';
  }
}

export function getAmountOrFail(transaction: BrokerTransaction): Decimal {
  const amount = transaction.amount;
  if (amount === null) {
    throw new AmountMissingError(transaction);
  }
  return amount;
}

export function getSymbolOrFail(transaction: BrokerTransaction): string {
  const symbol = transaction.symbol;
  if (symbol === null) {
    throw new SymbolMissingError(transaction);
  }
  return symbol;
}

export function getQuantityOrFail(transaction: BrokerTransaction): Decimal {
  const quantity = transaction.quantity;
  if (quantity === null) {
    throw new QuantityMissingError(transaction);
  }
  return quantity;
}

export function approxEqualPriceRounding(
  amountOnRecord: Decimal,
  quantityOnRecord: Decimal,
  priceOnRecord: Decimal,
  feesOnRecord: Decimal,
  calculationType: CalculationType
): boolean {
  let calculatedAmount: Decimal;
  let calculatedPrice: Decimal;

  if (calculationType === CalculationType.ACQUISITION) {
    calculatedAmount = quantityOnRecord.times(priceOnRecord).plus(feesOnRecord).negated();
    calculatedPrice = amountOnRecord.negated().minus(feesOnRecord).div(quantityOnRecord);
  } else {
    calculatedAmount = quantityOnRecord.times(priceOnRecord).minus(feesOnRecord);
    calculatedPrice = amountOnRecord.plus(feesOnRecord).div(quantityOnRecord);
  }

  const priceInRange = calculatedPrice.minus(priceOnRecord).abs().lessThan(new Decimal('0.0001'));

  if (priceInRange) {
    return true;
  }

  return approxEqual(amountOnRecord, calculatedAmount);
}
