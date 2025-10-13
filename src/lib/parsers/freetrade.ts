/**
 * Freetrade transaction parser
 *
 * Parses Freetrade UK transaction exports
 */

import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction } from '../types';
import { ActionType } from '../types';
import { ZERO } from '../utils/decimal';
import { ParsingError } from './errors';
import { parseDecimal } from './utils';

const BROKER_NAME = 'Freetrade';

enum FreetradeColumn {
  TITLE = 'Title',
  TYPE = 'Type',
  TIMESTAMP = 'Timestamp',
  ACCOUNT_CURRENCY = 'Account Currency',
  TOTAL_AMOUNT = 'Total Amount',
  BUY_SELL = 'Buy / Sell',
  TICKER = 'Ticker',
  ISIN = 'ISIN',
  PRICE_PER_SHARE_ACCOUNT = 'Price per Share in Account Currency',
  STAMP_DUTY = 'Stamp Duty',
  QUANTITY = 'Quantity',
  VENUE = 'Venue',
  ORDER_ID = 'Order ID',
  ORDER_TYPE = 'Order Type',
  INSTRUMENT_CURRENCY = 'Instrument Currency',
  TOTAL_SHARES_AMOUNT = 'Total Shares Amount',
  PRICE_PER_SHARE = 'Price per Share',
  FX_RATE = 'FX Rate',
  BASE_FX_RATE = 'Base FX Rate',
  FX_FEE_BPS = 'FX Fee (BPS)',
  FX_FEE_AMOUNT = 'FX Fee Amount',
  DIVIDEND_EX_DATE = 'Dividend Ex Date',
  DIVIDEND_PAY_DATE = 'Dividend Pay Date',
  DIVIDEND_ELIGIBLE_QUANTITY = 'Dividend Eligible Quantity',
  DIVIDEND_AMOUNT_PER_SHARE = 'Dividend Amount Per Share',
  DIVIDEND_GROSS_AMOUNT = 'Dividend Gross Distribution Amount',
  DIVIDEND_NET_AMOUNT = 'Dividend Net Distribution Amount',
  DIVIDEND_WITHHELD_PERCENTAGE = 'Dividend Withheld Tax Percentage',
  DIVIDEND_WITHHELD_AMOUNT = 'Dividend Withheld Tax Amount',
}

const COLUMNS = Object.values(FreetradeColumn);
const REQUIRED_COLUMNS = new Set<string>(COLUMNS);

function actionFromStr(
  actionType: string,
  buySell: string,
  fileName: string
): ActionType {
  if (actionType === 'INTEREST_FROM_CASH') {
    return ActionType.INTEREST;
  }

  if (actionType === 'DIVIDEND') {
    return ActionType.DIVIDEND;
  }

  if (actionType === 'TOP_UP' || actionType === 'WITHDRAWAL') {
    return ActionType.TRANSFER;
  }

  if (actionType === 'ORDER' || actionType === 'FREESHARE_ORDER') {
    if (buySell === 'BUY') {
      return ActionType.BUY;
    }

    if (buySell === 'SELL') {
      return ActionType.SELL;
    }

    throw new ParsingError(fileName, `Unknown buy_sell: '${buySell}'`);
  }

  throw new ParsingError(fileName, `Unknown type: '${actionType}'`);
}

function validateHeader(header: string[], fileName: string): void {
  const provided = new Set(header);
  const missing = [...REQUIRED_COLUMNS].filter((col) => !provided.has(col));

  if (missing.length > 0) {
    throw new ParsingError(fileName, `Missing columns: ${missing.join(', ')}`);
  }

  const unknown = [...provided].filter((col) => !REQUIRED_COLUMNS.has(col));
  if (unknown.length > 0) {
    throw new ParsingError(fileName, `Unknown columns: ${unknown.join(', ')}`);
  }
}

function parseFreetradeTransaction(
  header: string[],
  rowRaw: string[],
  fileName: string
): BrokerTransaction {
  const row: Record<string, string> = {};
  for (let i = 0; i < header.length; i++) {
    row[header[i]!] = rowRaw[i] || '';
  }

  const action = actionFromStr(
    row[FreetradeColumn.TYPE]!,
    row[FreetradeColumn.BUY_SELL]!,
    fileName
  );

  const symbol =
    row[FreetradeColumn.TICKER] && row[FreetradeColumn.TICKER] !== ''
      ? row[FreetradeColumn.TICKER]
      : null;

  if (symbol === null && action !== 'TRANSFER' && action !== 'INTEREST') {
    throw new ParsingError(fileName, `No symbol for action: ${action}`);
  }

  if (row[FreetradeColumn.ACCOUNT_CURRENCY] !== 'GBP') {
    throw new ParsingError(
      fileName,
      `Unsupported account currency for ${BROKER_NAME}: ${row[FreetradeColumn.ACCOUNT_CURRENCY]}`
    );
  }

  let quantity: Decimal | null;
  let price: Decimal | null;
  let amount: Decimal | null;
  let currency: string;

  if (action === 'SELL' || action === 'BUY') {
    quantity = parseDecimal(row, FreetradeColumn.QUANTITY, fileName);
    price = parseDecimal(row, FreetradeColumn.PRICE_PER_SHARE, fileName);
    amount = parseDecimal(row, FreetradeColumn.TOTAL_SHARES_AMOUNT, fileName);
    currency = row[FreetradeColumn.INSTRUMENT_CURRENCY]!;

    if (currency !== 'GBP') {
      const fxRate = parseDecimal(row, FreetradeColumn.FX_RATE, fileName);
      price = price.div(fxRate);
      amount = amount.div(fxRate);
    }

    currency = 'GBP';
  } else if (action === 'DIVIDEND') {
    amount = parseDecimal(row, FreetradeColumn.DIVIDEND_GROSS_AMOUNT, fileName);
    quantity = null;
    price = null;
    currency = row[FreetradeColumn.INSTRUMENT_CURRENCY]!;

    if (currency !== 'GBP') {
      const baseFxRate = parseDecimal(row, FreetradeColumn.BASE_FX_RATE, fileName);
      amount = amount.div(baseFxRate);
    }

    currency = 'GBP';
  } else if (action === 'TRANSFER' || action === 'INTEREST') {
    amount = parseDecimal(row, FreetradeColumn.TOTAL_AMOUNT, fileName);
    quantity = null;
    price = null;
    currency = 'GBP';
  } else {
    throw new ParsingError(
      fileName,
      `Unsupported action type for ${BROKER_NAME}: ${row[FreetradeColumn.TYPE]}`
    );
  }

  if (row[FreetradeColumn.TYPE] === 'FREESHARE_ORDER') {
    price = ZERO;
    amount = ZERO;
  }

  const amountNegative = action === 'BUY' || row[FreetradeColumn.TYPE] === 'WITHDRAWAL';
  if (amount !== null && amountNegative) {
    amount = amount.negated();
  }

  const timestampStr = row[FreetradeColumn.TIMESTAMP]!;
  let date: Date;
  try {
    const parsed = new Date(timestampStr);
    date = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  } catch (err) {
    throw new ParsingError(fileName, `Invalid timestamp format: ${timestampStr}`);
  }

  const description = `${row[FreetradeColumn.TITLE]} ${action}`;

  return {
    date,
    action,
    symbol,
    description,
    quantity,
    price,
    fees: ZERO,
    amount,
    currency,
    broker: BROKER_NAME,
  };
}

export class FreetradeParser implements BrokerParser {
  readonly brokerName = 'Freetrade';

  async parse(fileContent: string, fileName: string): Promise<ParserResult> {
    const warnings: string[] = [];

    // Check for empty file before parsing
    if (!fileContent || fileContent.trim() === '') {
      throw new ParsingError(fileName, 'Freetrade CSV file is empty');
    }

    const parseResult = Papa.parse<string[]>(fileContent, {
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      throw new ParsingError(fileName, `CSV parsing failed: ${parseResult.errors[0]!.message}`);
    }

    const lines = parseResult.data;

    if (lines.length === 0) {
      throw new ParsingError(fileName, 'Freetrade CSV file is empty');
    }

    const header = lines[0]!;
    validateHeader(header, fileName);

    const dataRows = lines.slice(1);
    dataRows.reverse();

    const transactions: BrokerTransaction[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]!;
      const originalIndex = lines.length - i - 1;
      const rowIndex = originalIndex + 1;

      try {
        transactions.push(parseFreetradeTransaction(header, row, fileName));
      } catch (err) {
        if (err instanceof ParsingError && err.rowIndex === undefined) {
          err.rowIndex = rowIndex;
        }
        throw err;
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

export const freetradeParser = new FreetradeParser();
