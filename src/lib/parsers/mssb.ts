/**
 * Morgan Stanley (MSSB) transaction parser
 *
 * Parses Release Reports and Withdrawal Reports from Morgan Stanley
 */

import Papa from 'papaparse';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction } from '../types';
import { ActionType } from '../types';
import { getRenamedTicker } from '../constants';
import { ZERO } from '../utils/decimal';
import { ParsingError, UnexpectedColumnCountError } from './errors';
import { parseDecimal } from './utils';

const BROKER_NAME = 'Morgan Stanley';

enum ReleaseColumn {
  VEST_DATE = 'Vest Date',
  ORDER_NUMBER = 'Order Number',
  PLAN = 'Plan',
  TYPE = 'Type',
  STATUS = 'Status',
  PRICE = 'Price',
  QUANTITY = 'Quantity',
  NET_CASH_PROCEEDS = 'Net Cash Proceeds',
  NET_SHARE_PROCEEDS = 'Net Share Proceeds',
  TAX_PAYMENT_METHOD = 'Tax Payment Method',
}

enum WithdrawalColumn {
  EXECUTION_DATE = 'Execution Date',
  ORDER_NUMBER = 'Order Number',
  PLAN = 'Plan',
  TYPE = 'Type',
  ORDER_STATUS = 'Order Status',
  PRICE = 'Price',
  QUANTITY = 'Quantity',
  NET_AMOUNT = 'Net Amount',
  NET_SHARE_PROCEEDS = 'Net Share Proceeds',
  TAX_PAYMENT_METHOD = 'Tax Payment Method',
}

const COLUMNS_RELEASE = Object.values(ReleaseColumn);
const COLUMNS_WITHDRAWAL = Object.values(WithdrawalColumn);

const KNOWN_SYMBOL_DICT: Record<string, string> = {
  'GSU Class C': 'GOOG',
  'Cash': 'USD',
};

interface StockSplit {
  symbol: string;
  date: Date;
  factor: number;
}

const STOCK_SPLIT_INFO: StockSplit[] = [
  { symbol: 'GOOG', date: new Date(Date.UTC(2022, 5, 15)), factor: 20 },
];

function parseReleaseReport(rowRaw: string[], fileName: string): BrokerTransaction {
  if (rowRaw.length !== COLUMNS_RELEASE.length) {
    throw new UnexpectedColumnCountError(fileName, COLUMNS_RELEASE.length, rowRaw.length);
  }

  const row: Record<string, string> = {};
  for (let i = 0; i < COLUMNS_RELEASE.length; i++) {
    const colName = COLUMNS_RELEASE[i]!;
    row[colName] = rowRaw[i] || '';
  }

  const plan = row[ReleaseColumn.PLAN] || '';

  if (row[ReleaseColumn.TYPE] !== 'Release') {
    throw new ParsingError(fileName, `Unknown type: ${row[ReleaseColumn.TYPE]}`);
  }

  if (!['Complete', 'Staged'].includes(row[ReleaseColumn.STATUS] || '')) {
    throw new ParsingError(fileName, `Unknown status: ${row[ReleaseColumn.STATUS]}`);
  }

  const priceRaw = row[ReleaseColumn.PRICE] || '';
  if (!priceRaw || !priceRaw.startsWith('$')) {
    throw new ParsingError(fileName, `Unknown price currency: ${priceRaw}`);
  }

  if (row[ReleaseColumn.NET_CASH_PROCEEDS] !== '$0.00') {
    throw new ParsingError(
      fileName,
      `Non-zero Net Cash Proceeds: ${row[ReleaseColumn.NET_CASH_PROCEEDS]}`
    );
  }

  if (!(plan in KNOWN_SYMBOL_DICT)) {
    throw new ParsingError(fileName, `Unknown plan: ${plan}`);
  }

  const quantity = parseDecimal(row, ReleaseColumn.NET_SHARE_PROCEEDS, fileName);
  const price = parseDecimal(row, ReleaseColumn.PRICE, fileName);
  const amount = quantity.times(price);
  let symbol = KNOWN_SYMBOL_DICT[plan]!;
  symbol = getRenamedTicker(symbol);

  const vestDateStr = row[ReleaseColumn.VEST_DATE] || '';
  let date: Date;
  try {
    const parts = vestDateStr.split('-');
    const day = parseInt(parts[0]!, 10);
    const monthMap: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
    };
    const month = monthMap[parts[1]!];
    const year = parseInt(parts[2]!, 10);

    if (month === undefined) {
      throw new Error('Invalid month');
    }

    date = new Date(Date.UTC(year, month, day));
  } catch (err) {
    throw new ParsingError(fileName, `Invalid date format: ${vestDateStr}`);
  }

  return {
    date,
    action: ActionType.STOCK_ACTIVITY,
    symbol,
    description: plan,
    quantity,
    price,
    fees: ZERO,
    amount,
    currency: 'USD',
    broker: BROKER_NAME,
  };
}

function isNotice(row: string[]): boolean {
  return row[0]?.substring(0, 11) === 'Please note';
}

function handleStockSplit(transaction: BrokerTransaction): BrokerTransaction {
  for (const split of STOCK_SPLIT_INFO) {
    if (
      transaction.symbol === split.symbol &&
      transaction.action === 'SELL' &&
      transaction.date < split.date
    ) {
      if (transaction.quantity !== null) {
        transaction.quantity = transaction.quantity.times(split.factor);
      }
      if (transaction.price !== null) {
        transaction.price = transaction.price.div(split.factor);
      }
    }
  }

  return transaction;
}

function parseWithdrawalReport(rowRaw: string[], fileName: string): BrokerTransaction | null {
  if (isNotice(rowRaw)) {
    return null;
  }

  if (rowRaw.length !== COLUMNS_WITHDRAWAL.length) {
    throw new UnexpectedColumnCountError(fileName, COLUMNS_WITHDRAWAL.length, rowRaw.length);
  }

  const row: Record<string, string> = {};
  for (let i = 0; i < COLUMNS_WITHDRAWAL.length; i++) {
    const colName = COLUMNS_WITHDRAWAL[i]!;
    row[colName] = rowRaw[i] || '';
  }

  const plan = row[WithdrawalColumn.PLAN] || '';

  if (row[WithdrawalColumn.TYPE] !== 'Sale') {
    throw new ParsingError(fileName, `Unknown type: ${row[WithdrawalColumn.TYPE]}`);
  }

  if (row[WithdrawalColumn.ORDER_STATUS] !== 'Complete') {
    throw new ParsingError(fileName, `Unknown status: ${row[WithdrawalColumn.ORDER_STATUS]}`);
  }

  const priceRaw = row[WithdrawalColumn.PRICE] || '';
  if (!priceRaw || !priceRaw.startsWith('$')) {
    throw new ParsingError(fileName, `Unknown price currency: ${priceRaw}`);
  }

  if (!(plan in KNOWN_SYMBOL_DICT)) {
    throw new ParsingError(fileName, `Unknown plan: ${plan}`);
  }

  const quantity = parseDecimal(row, WithdrawalColumn.QUANTITY, fileName).negated();
  const price = parseDecimal(row, WithdrawalColumn.PRICE, fileName);
  let amount = parseDecimal(row, WithdrawalColumn.NET_AMOUNT, fileName);
  const fees = quantity.times(price).minus(amount);

  let action: ActionType;

  if (plan === 'Cash') {
    action = ActionType.TRANSFER;
    amount = amount.negated();
  } else {
    action = ActionType.SELL;
  }

  const executionDateStr = row[WithdrawalColumn.EXECUTION_DATE] || '';
  let date: Date;
  try {
    const parts = executionDateStr.split('-');
    const day = parseInt(parts[0]!, 10);
    const monthMap: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
    };
    const month = monthMap[parts[1]!];
    const year = parseInt(parts[2]!, 10);

    if (month === undefined) {
      throw new Error('Invalid month');
    }

    date = new Date(Date.UTC(year, month, day));
  } catch (err) {
    throw new ParsingError(fileName, `Invalid date format: ${executionDateStr}`);
  }

  const transaction: BrokerTransaction = {
    date,
    action,
    symbol: KNOWN_SYMBOL_DICT[plan]!,
    description: plan,
    quantity,
    price,
    fees,
    amount,
    currency: 'USD',
    broker: BROKER_NAME,
  };

  return handleStockSplit(transaction);
}

function validateHeader(header: string[], goldenHeader: string[], fileName: string): void {
  if (header.length !== goldenHeader.length) {
    throw new UnexpectedColumnCountError(fileName, goldenHeader.length, header.length);
  }

  for (let i = 0; i < goldenHeader.length; i++) {
    if (goldenHeader[i] !== header[i]) {
      throw new ParsingError(
        fileName,
        `Expected column ${i + 1} to be ${goldenHeader[i]} but found ${header[i]}`
      );
    }
  }
}

export class MssbParser implements BrokerParser {
  readonly brokerName = 'Morgan Stanley';

  async parse(fileContent: string, fileName: string): Promise<ParserResult> {
    const warnings: string[] = [];
    const transactions: BrokerTransaction[] = [];

    // Check for empty file before parsing
    if (!fileContent || fileContent.trim() === '') {
      throw new ParsingError(fileName, 'Morgan Stanley CSV file is empty');
    }

    const parseResult = Papa.parse<string[]>(fileContent, {
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      throw new ParsingError(fileName, `CSV parsing failed: ${parseResult.errors[0]!.message}`);
    }

    const lines = parseResult.data;

    if (lines.length === 0) {
      throw new ParsingError(fileName, 'Morgan Stanley CSV file is empty');
    }

    const header = lines[0]!;
    const dataRows = lines.slice(1);

    if (fileName.includes('Withdrawal')) {
      validateHeader(header, COLUMNS_WITHDRAWAL, fileName);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]!;
        const rowIndex = i + 2;

        try {
          const transaction = parseWithdrawalReport(row, fileName);
          if (transaction) {
            transactions.push(transaction);
          }
        } catch (err) {
          if (err instanceof ParsingError) {
            if (err.rowIndex === undefined) {
              err.rowIndex = rowIndex;
            }
          }
          throw err;
        }
      }
    } else {
      validateHeader(header, COLUMNS_RELEASE, fileName);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]!;
        const rowIndex = i + 2;

        try {
          const transaction = parseReleaseReport(row, fileName);
          transactions.push(transaction);
        } catch (err) {
          if (err instanceof ParsingError) {
            if (err.rowIndex === undefined) {
              err.rowIndex = rowIndex;
            }
          }
          throw err;
        }
      }
    }

    if (transactions.length === 0) {
      warnings.push(`No transactions detected in file "${fileName}"`);
    }

    return {
      transactions,
      fileName,
      broker: this.brokerName,
      warnings,
    };
  }
}

export const mssbParser = new MssbParser();
