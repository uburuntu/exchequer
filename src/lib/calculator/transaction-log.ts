/**
 * Transaction log utilities
 *
 * Helper functions for working with HMRC transaction logs
 */

import Decimal from 'decimal.js-light';
import { HmrcTransactionData, type HmrcTransactionLog, type ExcessReportedIncome } from './types';
import { ZERO } from '../utils/decimal';

export function hasKey(
  transactions: HmrcTransactionLog,
  dateIndex: Date,
  symbol: string
): boolean {
  const dateKey = dateIndex.toISOString().split('T')[0]!;
  const dateMap = transactions.get(dateKey);
  if (!dateMap) {
    return false;
  }
  return dateMap.has(symbol);
}

export function addToList(
  currentList: HmrcTransactionLog,
  dateIndex: Date,
  symbol: string,
  quantity: Decimal,
  amount: Decimal,
  fees: Decimal,
  eris: ExcessReportedIncome[] = []
): void {
  const dateKey = dateIndex.toISOString().split('T')[0]!;

  let dateMap = currentList.get(dateKey);
  if (!dateMap) {
    dateMap = new Map();
    currentList.set(dateKey, dateMap);
  }

  const existing = dateMap.get(symbol) || new HmrcTransactionData(ZERO, ZERO, ZERO, []);
  const newData = new HmrcTransactionData(quantity, amount, fees, eris);
  dateMap.set(symbol, existing.add(newData));
}
