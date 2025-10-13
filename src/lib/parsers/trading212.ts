/**
 * Trading 212 transaction parser
 *
 * Trading 212 exports CSV files with extensive transaction details including
 * fees, exchange rates, and ISIN codes.
 */

import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction } from '../types';
import { ActionType } from '../types';
import { getRenamedTicker } from '../constants';
import { decimal, ZERO } from '../utils/decimal';
import { ParsingError, UnexpectedColumnCountError, InvalidActionError } from './errors';
import { parseOptionalDecimal } from './utils';

/**
 * Trading 212 column names (exactly as they appear in exports)
 */
const TRADING212_COLUMNS = {
  ACTION: 'Action',
  TIME: 'Time',
  ISIN: 'ISIN',
  TICKER: 'Ticker',
  NAME: 'Name',
  NO_OF_SHARES: 'No. of shares',
  PRICE_PER_SHARE: 'Price / share',
  CURRENCY_PRICE_PER_SHARE: 'Currency (Price / share)',
  EXCHANGE_RATE: 'Exchange rate',
  RESULT_GBP: 'Result (GBP)',
  RESULT: 'Result',
  CURRENCY_RESULT: 'Currency (Result)',
  TOTAL_GBP: 'Total (GBP)',
  TOTAL: 'Total',
  CURRENCY_TOTAL: 'Currency (Total)',
  WITHHOLDING_TAX: 'Withholding tax',
  CURRENCY_WITHHOLDING_TAX: 'Currency (Withholding tax)',
  CHARGE_AMOUNT_GBP: 'Charge amount (GBP)',
  TRANSACTION_FEE_GBP: 'Transaction fee (GBP)',
  TRANSACTION_FEE: 'Transaction fee',
  FINRA_FEE_GBP: 'Finra fee (GBP)',
  FINRA_FEE: 'Finra fee',
  STAMP_DUTY_GBP: 'Stamp duty (GBP)',
  NOTES: 'Notes',
  TRANSACTION_ID: 'ID',
  CURRENCY_CONVERSION_FEE_GBP: 'Currency conversion fee (GBP)',
  CURRENCY_CONVERSION_FEE: 'Currency conversion fee',
  CURRENCY_CURRENCY_CONVERSION_FEE: 'Currency (Currency conversion fee)',
  CURRENCY_TRANSACTION_FEE: 'Currency (Transaction fee)',
  CURRENCY_FINRA_FEE: 'Currency (Finra fee)',
} as const;

// Set of all valid column names for validation
const COLUMN_SET = new Set<string>(Object.values(TRADING212_COLUMNS));

type RowData = Record<string, string>;

/**
 * Convert Trading 212 action label to ActionType
 */
function parseAction(label: string, fileName: string, rowIndex?: number): ActionType {
  // Buy actions
  if (['Market buy', 'Limit buy', 'Stop buy'].includes(label)) {
    return ActionType.BUY;
  }

  // Sell actions
  if (['Market sell', 'Limit sell', 'Stop sell'].includes(label)) {
    return ActionType.SELL;
  }

  // Transfer actions
  if (['Deposit', 'Withdrawal'].includes(label)) {
    return ActionType.TRANSFER;
  }

  // Dividend actions
  if ([
    'Dividend (Ordinary)',
    'Dividend (Dividend)',
    'Dividend (Dividends paid by us corporations)',
  ].includes(label)) {
    return ActionType.DIVIDEND;
  }

  // Interest actions
  if (['Interest on cash', 'Lending interest'].includes(label)) {
    return ActionType.INTEREST;
  }

  // Stock split
  if (label === 'Stock Split') {
    return ActionType.STOCK_SPLIT;
  }

  // Adjustment
  if (label === 'Result adjustment') {
    return ActionType.ADJUSTMENT;
  }

  throw new InvalidActionError(fileName, label, rowIndex);
}

/**
 * Parsed Trading 212 transaction (extends base transaction with extra fields)
 */
interface Trading212TransactionData extends BrokerTransaction {
  datetime: Date;
  rawAction: string;
  priceForeign: Decimal | null;
  currencyForeign: string;
  exchangeRate: Decimal | null;
  transactionFee: Decimal;
  finraFee: Decimal;
  stampDuty: Decimal;
  conversionFee: Decimal;
  transactionId: string | null;
  notes: string | null;
}

/**
 * Parse a single Trading 212 transaction
 */
function parseTrading212Transaction(
  header: string[],
  rowRaw: string[],
  fileName: string,
  rowIndex: number,
  warnings: string[]
): Trading212TransactionData {
  if (rowRaw.length !== header.length) {
    throw new UnexpectedColumnCountError(fileName, header.length, rowRaw.length, rowIndex);
  }

  // Create row object indexed by column name
  const row: RowData = {};
  for (let i = 0; i < header.length; i++) {
    row[header[i]!] = rowRaw[i]!;
  }

  // Parse timestamp
  const timeStr = row[TRADING212_COLUMNS.TIME]!;
  // Handle both formats: with and without microseconds
  // "2023-02-09 10:30:15.123" or "2023-02-09 10:30:15"
  const datetime = new Date(timeStr.replace(' ', 'T') + 'Z'); // Parse as UTC

  // Check if date parsing failed
  if (isNaN(datetime.getTime())) {
    throw new ParsingError(
      fileName,
      `Invalid time format: "${timeStr}"`,
      rowIndex
    );
  }

  const date = new Date(Date.UTC(
    datetime.getUTCFullYear(),
    datetime.getUTCMonth(),
    datetime.getUTCDate()
  ));

  const rawAction = row[TRADING212_COLUMNS.ACTION]!;
  const action = parseAction(rawAction, fileName, rowIndex);

  // Parse symbol (with ticker renames)
  let symbol: string | null = row[TRADING212_COLUMNS.TICKER] || null;
  if (symbol !== null) {
    symbol = getRenamedTicker(symbol);
  }

  const description = row[TRADING212_COLUMNS.NAME] || '';

  // Parse decimals (throws Error on invalid input, caught and converted to ParsingError)
  let quantity: Decimal | null;
  let priceForeign: Decimal | null;
  let exchangeRate: Decimal | null;

  try {
    quantity = parseOptionalDecimal(row, TRADING212_COLUMNS.NO_OF_SHARES);
    priceForeign = parseOptionalDecimal(row, TRADING212_COLUMNS.PRICE_PER_SHARE);
    exchangeRate = parseOptionalDecimal(row, TRADING212_COLUMNS.EXCHANGE_RATE);
  } catch (err) {
    throw new ParsingError(
      fileName,
      err instanceof Error ? err.message : String(err),
      rowIndex
    );
  }

  const currencyForeign = row[TRADING212_COLUMNS.CURRENCY_PRICE_PER_SHARE] || '';

  // Parse fees (Trading 212 has multiple fee types)
  let transactionFee = parseOptionalDecimal(row, TRADING212_COLUMNS.TRANSACTION_FEE_GBP) || ZERO;
  const transactionFeeForeign = parseOptionalDecimal(row, TRADING212_COLUMNS.TRANSACTION_FEE) || ZERO;

  if (transactionFeeForeign.greaterThan(0)) {
    if (row[TRADING212_COLUMNS.CURRENCY_TRANSACTION_FEE] !== 'GBP') {
      throw new ParsingError(
        fileName,
        'The transaction fee is not in GBP which is not supported yet',
        rowIndex
      );
    }
    transactionFee = transactionFee.plus(transactionFeeForeign);
  }

  let finraFee = parseOptionalDecimal(row, TRADING212_COLUMNS.FINRA_FEE_GBP) || ZERO;
  const finraFeeForeign = parseOptionalDecimal(row, TRADING212_COLUMNS.FINRA_FEE) || ZERO;

  if (finraFeeForeign.greaterThan(0)) {
    if (row[TRADING212_COLUMNS.CURRENCY_FINRA_FEE] !== 'GBP') {
      throw new ParsingError(
        fileName,
        'Finra fee is not in GBP which is not supported yet',
        rowIndex
      );
    }
    finraFee = finraFee.plus(finraFeeForeign);
  }

  const stampDuty = parseOptionalDecimal(row, TRADING212_COLUMNS.STAMP_DUTY_GBP) || ZERO;

  let conversionFee = parseOptionalDecimal(row, TRADING212_COLUMNS.CURRENCY_CONVERSION_FEE_GBP) || ZERO;
  const conversionFeeForeign = parseOptionalDecimal(row, TRADING212_COLUMNS.CURRENCY_CONVERSION_FEE) || ZERO;

  if (conversionFeeForeign.greaterThan(0)) {
    if (row[TRADING212_COLUMNS.CURRENCY_CURRENCY_CONVERSION_FEE] !== 'GBP') {
      throw new ParsingError(
        fileName,
        'The conversion fee is not in GBP which is not supported yet',
        rowIndex
      );
    }
    conversionFee = conversionFee.plus(conversionFeeForeign);
  }

  const fees = transactionFee.plus(finraFee).plus(conversionFee);

  // Parse amount and currency
  let amount: Decimal | null;
  let currency: string;

  if (TRADING212_COLUMNS.TOTAL in row && row[TRADING212_COLUMNS.TOTAL]) {
    amount = parseOptionalDecimal(row, TRADING212_COLUMNS.TOTAL);
    currency = row[TRADING212_COLUMNS.CURRENCY_TOTAL] || 'GBP';
  } else {
    amount = parseOptionalDecimal(row, TRADING212_COLUMNS.TOTAL_GBP);
    currency = 'GBP';
  }

  // BUY and Withdrawal should be negative
  if (
    amount !== null &&
    (action === 'BUY' || rawAction === 'Withdrawal') &&
    amount.greaterThan(0)
  ) {
    amount = amount.negated();
  }

  // Calculate price from amount and quantity
  let price: Decimal | null = null;
  if (amount !== null && quantity !== null && !quantity.isZero()) {
    price = amount.abs().plus(fees).div(quantity);
  }

  // Validate price against foreign price (if available)
  if (
    price !== null &&
    priceForeign !== null &&
    (currencyForeign === 'GBP' || exchangeRate !== null)
  ) {
    const exRate = exchangeRate || decimal(1);
    const calculatedPriceForeign = price.times(exRate);
    const discrepancy = priceForeign.minus(calculatedPriceForeign);

    if (discrepancy.abs().greaterThan(new Decimal('0.015'))) {
      warnings.push(
        `${fileName}:${rowIndex}: Price per share discrepancy of ${discrepancy.toFixed(3)} ` +
        `for ${symbol || 'unknown'}. Review transaction in UI.`
      );
    }
  }

  const isin = row[TRADING212_COLUMNS.ISIN] || null;
  const transactionId = row[TRADING212_COLUMNS.TRANSACTION_ID] || null;
  const notes = row[TRADING212_COLUMNS.NOTES] || null;

  return {
    date,
    action,
    symbol,
    description,
    quantity,
    price,
    fees,
    amount,
    currency,
    broker: 'Trading212',
    isin,
    datetime,
    rawAction,
    priceForeign,
    currencyForeign,
    exchangeRate,
    transactionFee,
    finraFee,
    stampDuty,
    conversionFee,
    transactionId,
    notes,
  };
}

/**
 * Validate header columns
 */
function validateHeader(header: string[], fileName: string): void {
  const unknown = header.filter(col => !COLUMN_SET.has(col));
  if (unknown.length > 0) {
    throw new ParsingError(
      fileName,
      `Unknown column(s): ${unknown.join(', ')}`
    );
  }
}

/**
 * Trading 212 parser
 */
export class Trading212Parser implements BrokerParser {
  readonly brokerName = 'Trading212';

  async parse(fileContent: string, fileName: string): Promise<ParserResult> {
    const warnings: string[] = [];

    // Parse CSV
    const parseResult = Papa.parse<string[]>(fileContent, {
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      throw new ParsingError(
        fileName,
        `CSV parsing failed: ${parseResult.errors[0]!.message}`
      );
    }

    const lines = parseResult.data;

    if (lines.length === 0) {
      throw new ParsingError(fileName, 'Trading 212 CSV file is empty');
    }

    // First line is header
    const header = lines[0]!;
    validateHeader(header, fileName);

    const dataRows = lines.slice(1);

    // Parse all transactions
    const transactions: Trading212TransactionData[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < dataRows.length; i++) {
      const rowIndex = i + 2; // +2 because: 1-indexed and header is row 1
      const row = dataRows[i]!;

      try {
        const transaction = parseTrading212Transaction(
          header,
          row,
          fileName,
          rowIndex,
          warnings
        );

        // Remove duplicates using transaction ID
        if (transaction.transactionId) {
          if (seenIds.has(transaction.transactionId)) {
            continue; // Skip duplicate
          }
          seenIds.add(transaction.transactionId);
        }

        transactions.push(transaction);
      } catch (err) {
        if (err instanceof ParsingError) {
          throw err;
        }
        throw new ParsingError(
          fileName,
          err instanceof Error ? err.message : String(err),
          rowIndex
        );
      }
    }

    if (transactions.length === 0) {
      warnings.push(`No transactions detected in file "${fileName}"`);
    }

    // Sort by datetime, then by action type
    // BUY actions come after other actions on same datetime
    // (to avoid negative balance errors)
    transactions.sort((a, b) => {
      const timeDiff = a.datetime.getTime() - b.datetime.getTime();
      if (timeDiff !== 0) return timeDiff;

      // If times are equal, BUY comes last
      const aIsBuy = a.action === 'BUY';
      const bIsBuy = b.action === 'BUY';
      if (aIsBuy && !bIsBuy) return 1;
      if (!aIsBuy && bIsBuy) return -1;
      return 0;
    });

    // Convert to base BrokerTransaction interface (strip extra fields)
    const baseTransactions: BrokerTransaction[] = transactions.map(t => ({
      date: t.date,
      action: t.action,
      symbol: t.symbol,
      description: t.description,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      amount: t.amount,
      currency: t.currency,
      broker: t.broker,
      isin: t.isin,
    }));

    return {
      transactions: baseTransactions,
      fileName,
      broker: this.brokerName,
      warnings,
    };
  }
}

// Create singleton instance
export const trading212Parser = new Trading212Parser();
