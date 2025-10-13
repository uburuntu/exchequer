/**
 * Interactive Brokers transaction parser
 *
 * Interactive Brokers CSV has a multi-section format:
 * - First column: Section name (e.g., "Trades", "Cash Transactions", "Corporate Actions")
 * - Second column: Row type ("Header" or "Data")
 * - Variable columns per section
 *
 * We focus on the "Trades" section for buy/sell transactions.
 * Only "Trade" rows are actual executions (not "Order", "ClosedLot", "SubTotal").
 */

import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction } from '../types';
import { ActionType } from '../types';
import { getRenamedTicker } from '../constants';
import { ZERO } from '../utils/decimal';
import { ParsingError } from './errors';

/**
 * Interactive Brokers column names (as they appear in the header row)
 */
const IB_COLUMNS = {
  SECTION: 'Trades',          // Will be "Trades" for trades section
  ROW_TYPE: 'Header',         // "Header" or "Data"
  DATA_DISCRIMINATOR: 'DataDiscriminator',  // "Order", "Trade", "ClosedLot", "SubTotal"
  ASSET_CATEGORY: 'Asset Category',
  CURRENCY: 'Currency',
  SYMBOL: 'Symbol',
  DATE_TIME: 'Date/Time',
  EXCHANGE: 'Exchange',
  QUANTITY: 'Quantity',
  T_PRICE: 'T. Price',
  PROCEEDS: 'Proceeds',
  COMM_FEE: 'Comm/Fee',
  BASIS: 'Basis',
  REALIZED_PL: 'Realized P/L',
  CODE: 'Code',
} as const;

/**
 * Check if headers match Interactive Brokers format
 */
function isInteractiveBrokersFormat(headers: string[]): boolean {
  // IB format has specific columns in the header
  const requiredColumns = [
    IB_COLUMNS.SECTION,
    IB_COLUMNS.ROW_TYPE,
    IB_COLUMNS.DATA_DISCRIMINATOR,
    IB_COLUMNS.ASSET_CATEGORY,
    IB_COLUMNS.CURRENCY,
    IB_COLUMNS.SYMBOL,
    IB_COLUMNS.DATE_TIME,
    IB_COLUMNS.QUANTITY,
    IB_COLUMNS.T_PRICE,
    IB_COLUMNS.PROCEEDS,
    IB_COLUMNS.COMM_FEE,
  ];

  return requiredColumns.every(col => headers.includes(col));
}

/**
 * Parse IB date/time format: "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD;HH:MM:SS"
 */
function parseIBDateTime(dateTimeStr: string): Date | null {
  if (!dateTimeStr) return null;

  // Handle both semicolon and space separators
  const [datePart, timePart] = dateTimeStr.split(/[; ]/);
  if (!datePart) return null;

  // Validate ISO date format
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;

  // Parse time if available for more precise sorting
  let hours = 0, minutes = 0, seconds = 0;
  if (timePart) {
    const timeMatch = timePart.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (timeMatch) {
      hours = parseInt(timeMatch[1]!, 10);
      minutes = parseInt(timeMatch[2]!, 10);
      seconds = parseInt(timeMatch[3]!, 10);
    }
  }

  return new Date(Date.UTC(
    parseInt(year!, 10),
    parseInt(month!, 10) - 1,
    parseInt(day!, 10),
    hours,
    minutes,
    seconds
  ));
}

/**
 * Parse a numeric value, handling commas and negative values
 */
function parseNumber(value: string | undefined): Decimal | null {
  if (!value || value.trim() === '') return null;

  // Remove commas
  const cleaned = value.replace(/,/g, '').trim();

  try {
    return new Decimal(cleaned);
  } catch {
    return null;
  }
}

/**
 * Interactive Brokers parser
 */
export class InteractiveBrokersParser implements BrokerParser {
  readonly brokerName = 'Interactive Brokers';

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
      throw new ParsingError(fileName, 'Interactive Brokers CSV file is empty');
    }

    // First line is header
    const header = lines[0]!;

    // Validate format
    if (!isInteractiveBrokersFormat(header)) {
      throw new ParsingError(
        fileName,
        'Not a valid Interactive Brokers format. Expected columns: Trades, Header, DataDiscriminator, Asset Category, Currency, Symbol, Date/Time, Quantity, T. Price, Proceeds, Comm/Fee'
      );
    }

    // Create column index map
    const colIndex: Record<string, number> = {};
    for (let i = 0; i < header.length; i++) {
      colIndex[header[i]!] = i;
    }

    const dataRows = lines.slice(1);
    const transactions: BrokerTransaction[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]!;
      const rowIndex = i + 2; // 1-indexed, header is row 1

      // Get section and row type
      const section = row[colIndex[IB_COLUMNS.SECTION]!];
      const rowType = row[colIndex[IB_COLUMNS.ROW_TYPE]!];
      const dataDiscriminator = row[colIndex[IB_COLUMNS.DATA_DISCRIMINATOR]!];

      // Only process "Trades,Data,Trade" rows (actual executions)
      if (section !== 'Trades' || rowType !== 'Data' || dataDiscriminator !== 'Trade') {
        continue;
      }

      // Parse asset category - only handle Stocks for now
      const assetCategory = row[colIndex[IB_COLUMNS.ASSET_CATEGORY]!];
      if (assetCategory !== 'Stocks') {
        // Skip non-stock transactions (options, forex, etc.)
        continue;
      }

      // Parse symbol
      let symbol = row[colIndex[IB_COLUMNS.SYMBOL]!]?.trim() || null;
      if (!symbol) {
        warnings.push(`${fileName}:${rowIndex}: Missing symbol, skipping row`);
        continue;
      }
      symbol = getRenamedTicker(symbol);

      // Parse date
      const dateTimeStr = row[colIndex[IB_COLUMNS.DATE_TIME]!];
      const datetime = parseIBDateTime(dateTimeStr || '');
      if (!datetime) {
        warnings.push(`${fileName}:${rowIndex}: Invalid date format "${dateTimeStr}", skipping row`);
        continue;
      }

      // Extract just the date for the transaction
      const date = new Date(Date.UTC(
        datetime.getUTCFullYear(),
        datetime.getUTCMonth(),
        datetime.getUTCDate()
      ));

      // Parse numeric values
      const quantity = parseNumber(row[colIndex[IB_COLUMNS.QUANTITY]!]);
      const tPrice = parseNumber(row[colIndex[IB_COLUMNS.T_PRICE]!]);
      const proceeds = parseNumber(row[colIndex[IB_COLUMNS.PROCEEDS]!]);
      const commFee = parseNumber(row[colIndex[IB_COLUMNS.COMM_FEE]!]);

      if (quantity === null) {
        warnings.push(`${fileName}:${rowIndex}: Invalid quantity, skipping row`);
        continue;
      }

      // Determine action: positive quantity = BUY, negative = SELL
      const action = quantity.isNegative() ? ActionType.SELL : ActionType.BUY;

      // Store absolute quantity
      const absQuantity = quantity.abs();

      // Calculate amount from proceeds (make positive for internal use)
      const amount = proceeds !== null ? proceeds.abs() : null;

      // Fees are usually negative in IB, take absolute value
      const fees = commFee !== null ? commFee.abs() : ZERO;

      // Price per share
      const price = tPrice !== null ? tPrice.abs() : null;

      // Currency
      const currency = row[colIndex[IB_COLUMNS.CURRENCY]!]?.trim() || 'USD';

      // Generate unique ID for deduplication
      const txnId = `IB-${dateTimeStr}-${symbol}-${quantity.toString()}`;
      if (seenIds.has(txnId)) {
        continue; // Skip duplicate
      }
      seenIds.add(txnId);

      const transaction: BrokerTransaction = {
        date,
        action,
        symbol,
        description: `${action} ${symbol}`,
        quantity: absQuantity,
        price,
        fees,
        amount,
        currency,
        broker: 'Interactive Brokers',
        isin: null, // IB doesn't include ISIN in trades section
      };

      transactions.push(transaction);
    }

    if (transactions.length === 0) {
      warnings.push(`No valid stock transactions found in file "${fileName}"`);
    }

    // Sort by date, then by action (BUY after SELL on same day for consistency)
    transactions.sort((a, b) => {
      const timeDiff = a.date.getTime() - b.date.getTime();
      if (timeDiff !== 0) return timeDiff;

      // If same day, SELL comes first (so we sell from existing pool before buying)
      const aIsSell = a.action === 'SELL';
      const bIsSell = b.action === 'SELL';
      if (aIsSell && !bIsSell) return -1;
      if (!aIsSell && bIsSell) return 1;
      return 0;
    });

    return {
      transactions,
      fileName,
      broker: this.brokerName,
      warnings,
    };
  }
}

// Create singleton instance
export const interactiveBrokersParser = new InteractiveBrokersParser();
