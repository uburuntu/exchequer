/**
 * Sharesight transaction parser
 *
 * Supports two report types:
 * - Taxable Income Report (dividends)
 * - All Trades Report (buys/sells)
 */

import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction } from '../types';
import { ActionType } from '../types';
import { getRenamedTicker } from '../constants';
import { ZERO } from '../utils/decimal';
import { ParsingError, UnexpectedColumnCountError } from './errors';
import { parseDecimal, parseOptionalDecimal } from './utils';

const BROKER_NAME = 'Sharesight';
const STOCK_ACTIVITY_COMMENT_MARKER = 'Stock Activity';

enum DividendColumn {
  CODE = 'Code',
  NAME = 'Name',
  DATE_PAID = 'Date Paid',
  COMMENTS = 'Comments',
  NET_DIVIDEND = 'Net Dividend',
  TAX_DEDUCTED = 'Tax Deducted',
  TAX_CREDIT = 'Tax Credit',
  GROSS_DIVIDEND = 'Gross Dividend',
  EXCHANGE_RATE = 'Exchange Rate',
  CURRENCY = 'Currency',
  NET_AMOUNT = 'Net Amount',
  FOREIGN_TAX_DEDUCTED = 'Foreign Tax Deducted',
  GROSS_AMOUNT = 'Gross Amount',
}

enum TradeColumn {
  MARKET = 'Market',
  CODE = 'Code',
  NAME = 'Name',
  TYPE = 'Type',
  DATE = 'Date',
  QUANTITY = 'Quantity',
  PRICE = 'Price *',
  BROKERAGE = 'Brokerage *',
  CURRENCY = 'Currency',
  EXCHANGE_RATE = 'Exchange Rate',
  VALUE = 'Value',
  COMMENTS = 'Comments',
}

interface DividendSectionSchema {
  sectionName: string;
  expectedColumns: DividendColumn[];
  amountColumn: DividendColumn;
  taxColumn: DividendColumn;
  currencyColumn: DividendColumn | null;
  defaultCurrency: string | null;
}

const LOCAL_DIVIDEND_SCHEMA: DividendSectionSchema = {
  sectionName: 'Sharesight local dividend header',
  expectedColumns: [
    DividendColumn.CODE,
    DividendColumn.NAME,
    DividendColumn.DATE_PAID,
    DividendColumn.NET_DIVIDEND,
    DividendColumn.TAX_DEDUCTED,
    DividendColumn.TAX_CREDIT,
    DividendColumn.GROSS_DIVIDEND,
    DividendColumn.COMMENTS,
  ],
  amountColumn: DividendColumn.GROSS_DIVIDEND,
  taxColumn: DividendColumn.TAX_DEDUCTED,
  currencyColumn: null,
  defaultCurrency: 'GBP',
};

const FOREIGN_DIVIDEND_SCHEMA: DividendSectionSchema = {
  sectionName: 'Sharesight foreign dividend header',
  expectedColumns: [
    DividendColumn.CODE,
    DividendColumn.NAME,
    DividendColumn.DATE_PAID,
    DividendColumn.EXCHANGE_RATE,
    DividendColumn.CURRENCY,
    DividendColumn.NET_AMOUNT,
    DividendColumn.FOREIGN_TAX_DEDUCTED,
    DividendColumn.GROSS_AMOUNT,
    DividendColumn.COMMENTS,
  ],
  amountColumn: DividendColumn.GROSS_AMOUNT,
  taxColumn: DividendColumn.FOREIGN_TAX_DEDUCTED,
  currencyColumn: DividendColumn.CURRENCY,
  defaultCurrency: null,
};

class RowIterator {
  private rows: string[][];
  private index: number = 0;

  constructor(rows: string[][]) {
    this.rows = rows;
  }

  get line(): number {
    return this.index + 1;
  }

  next(): string[] | null {
    if (this.index >= this.rows.length) {
      return null;
    }
    return this.rows[this.index++]!;
  }

  peek(): string[] | null {
    if (this.index >= this.rows.length) {
      return null;
    }
    return this.rows[this.index]!;
  }

  [Symbol.iterator](): Iterator<string[]> {
    const self = this;
    return {
      next(): IteratorResult<string[]> {
        const row = self.next();
        if (row === null) {
          return { done: true, value: undefined };
        }
        return { done: false, value: row };
      },
    };
  }
}

function parseDate(dateStr: string): Date {
  const parts = dateStr.split('/');
  const day = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10);
  const year = parseInt(parts[2]!, 10);
  return new Date(Date.UTC(year, month - 1, day));
}

function validateHeader(
  header: string[],
  expected: string[],
  fileName: string,
  section: string
): void {
  const expectedSet = new Set(expected);
  const headerSet = new Set(header.filter((col) => col));
  const missing = [...expectedSet].filter((col) => !headerSet.has(col));

  if (missing.length > 0) {
    throw new ParsingError(
      fileName,
      `Missing expected columns in ${section}: ${missing.join(', ')}`
    );
  }
}

function* parseDividendPayments(
  schema: DividendSectionSchema,
  rows: RowIterator,
  fileName: string
): Generator<BrokerTransaction> {
  const header = rows.next();
  if (!header) {
    return;
  }

  validateHeader(
    header,
    schema.expectedColumns.map((col) => col.valueOf()),
    fileName,
    schema.sectionName
  );

  for (const row of rows) {
    if (row[0] === 'Total') {
      break;
    }

    if (row.length !== header.length) {
      throw new UnexpectedColumnCountError(fileName, header.length, row.length);
    }

    const rowDict: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      const columnName = header[i];
      if (columnName) {
        rowDict[columnName] = row[i] || '';
      }
    }

    const dividendDate = parseDate(rowDict[DividendColumn.DATE_PAID]!);
    let symbol = rowDict[DividendColumn.CODE]!;
    symbol = getRenamedTicker(symbol);
    const description = rowDict[DividendColumn.COMMENTS] || '';

    let currency: string;
    if (schema.defaultCurrency) {
      currency = schema.defaultCurrency;
    } else {
      if (!schema.currencyColumn) {
        throw new ParsingError(
          fileName,
          `Missing currency column definition for ${schema.sectionName}`
        );
      }

      currency = (rowDict[schema.currencyColumn] || '').trim();
      if (!currency) {
        throw new ParsingError(
          fileName,
          `Missing currency in column '${schema.currencyColumn}' for ${schema.sectionName}`
        );
      }
    }

    const amount = parseDecimal(rowDict, schema.amountColumn, fileName);
    const tax = parseOptionalDecimal(rowDict, schema.taxColumn);

    yield {
      date: dividendDate,
      action: ActionType.DIVIDEND,
      symbol,
      description,
      broker: BROKER_NAME,
      currency,
      amount,
      quantity: null,
      price: null,
      fees: ZERO,
    };

    if (tax && !tax.isZero()) {
      yield {
        date: dividendDate,
        action: ActionType.DIVIDEND_TAX,
        symbol,
        description,
        broker: BROKER_NAME,
        currency,
        amount: tax.negated(),
        quantity: null,
        price: null,
        fees: ZERO,
      };
    }
  }
}

function* parseLocalIncome(
  rows: RowIterator,
  fileName: string
): Generator<BrokerTransaction> {
  for (const row of rows) {
    if (row[0] === 'Total Local Income') {
      return;
    }

    if (row[0] === 'Dividend Payments') {
      yield* parseDividendPayments(LOCAL_DIVIDEND_SCHEMA, rows, fileName);
    }
  }
}

function* parseForeignIncome(
  rows: RowIterator,
  fileName: string
): Generator<BrokerTransaction> {
  yield* parseDividendPayments(FOREIGN_DIVIDEND_SCHEMA, rows, fileName);
}

function parseIncomeReport(lines: string[][], fileName: string): BrokerTransaction[] {
  const transactions: BrokerTransaction[] = [];
  const rowsIter = new RowIterator(lines);

  try {
    for (const row of rowsIter) {
      if (row[0] === 'Local Income') {
        transactions.push(...parseLocalIncome(rowsIter, fileName));
      } else if (row[0] === 'Foreign Income') {
        transactions.push(...parseForeignIncome(rowsIter, fileName));
      }
    }
  } catch (err) {
    if (err instanceof ParsingError && err.rowIndex === undefined) {
      err.rowIndex = rowsIter.line;
    }
    throw err;
  }

  return transactions;
}

function* parseTrades(
  header: string[],
  rows: RowIterator,
  fileName: string
): Generator<BrokerTransaction> {
  validateHeader(
    header,
    Object.values(TradeColumn).map((col) => col.valueOf()),
    fileName,
    'Sharesight trades header'
  );

  for (const row of rows) {
    if (row.every((cell) => !cell)) {
      break;
    }

    if (row.length !== header.length) {
      throw new UnexpectedColumnCountError(fileName, header.length, row.length);
    }

    const rowDict: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      const columnName = header[i];
      if (columnName) {
        rowDict[columnName] = row[i] || '';
      }
    }

    const tradeType = rowDict[TradeColumn.TYPE]!;
    let action: ActionType;
    if (tradeType === 'Buy') {
      action = ActionType.BUY;
    } else if (tradeType === 'Sell') {
      action = ActionType.SELL;
    } else {
      throw new ParsingError(fileName, `Unknown action: ${tradeType}`);
    }

    const market = rowDict[TradeColumn.MARKET]!;
    const symbol = `${market}:${rowDict[TradeColumn.CODE]!}`;
    const tradeDate = parseDate(rowDict[TradeColumn.DATE]!);
    let quantity = parseDecimal(rowDict, TradeColumn.QUANTITY, fileName);
    let price = parseDecimal(rowDict, TradeColumn.PRICE, fileName);
    let fees = parseOptionalDecimal(rowDict, TradeColumn.BROKERAGE) || ZERO;
    let currency = rowDict[TradeColumn.CURRENCY]!;
    const description = rowDict[TradeColumn.COMMENTS] || '';
    const gbpValue = parseOptionalDecimal(rowDict, TradeColumn.VALUE);

    if (market === 'FX') {
      if (!gbpValue) {
        throw new ParsingError(fileName, 'Missing Value in FX transaction');
      }

      price = gbpValue.abs().div(quantity.abs());
      currency = 'GBP';
    }

    let amount: Decimal | null = quantity.times(price).negated().minus(fees);
    quantity = quantity.abs();

    let finalAction: ActionType = action;
    if (description.toLowerCase().includes(STOCK_ACTIVITY_COMMENT_MARKER.toLowerCase())) {
      if (action !== ActionType.BUY) {
        throw new ParsingError(fileName, 'Stock activity must have Type=Buy');
      }

      finalAction = ActionType.STOCK_ACTIVITY;
      amount = null;
    }

    yield {
      date: tradeDate,
      action: finalAction,
      symbol,
      description,
      quantity,
      price,
      fees,
      amount,
      currency,
      broker: BROKER_NAME,
    };
  }
}

function parseTradeReport(lines: string[][], fileName: string): BrokerTransaction[] {
  const transactions: BrokerTransaction[] = [];
  const rowsIter = new RowIterator(lines);

  for (const row of rowsIter) {
    if (row[0] === 'Market') {
      const header = row;
      try {
        transactions.push(...parseTrades(header, rowsIter, fileName));
      } catch (err) {
        if (err instanceof ParsingError && err.rowIndex === undefined) {
          err.rowIndex = rowsIter.line;
        }
        throw err;
      }
    }
  }

  return transactions;
}

export class SharesightParser implements BrokerParser {
  readonly brokerName = 'Sharesight';

  async parse(fileContent: string, fileName: string): Promise<ParserResult> {
    const warnings: string[] = [];

    const parseResult = Papa.parse<string[]>(fileContent, {
      skipEmptyLines: false,
    });

    if (parseResult.errors.length > 0) {
      throw new ParsingError(fileName, `CSV parsing failed: ${parseResult.errors[0]!.message}`);
    }

    const lines = parseResult.data;

    if (lines.length === 0) {
      throw new ParsingError(fileName, 'Sharesight CSV file is empty');
    }

    let transactions: BrokerTransaction[];

    if (fileName.toLowerCase().includes('taxable income report')) {
      transactions = parseIncomeReport(lines, fileName);
    } else if (fileName.toLowerCase().includes('all trades report')) {
      transactions = parseTradeReport(lines, fileName);
    } else {
      throw new ParsingError(
        fileName,
        'Sharesight file must be either "Taxable Income Report" or "All Trades Report"'
      );
    }

    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

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

export const sharesightParser = new SharesightParser();
