/**
 * Revolut transaction parser
 *
 * Revolut exports transactions in CSV format with the following columns:
 * - Date: ISO 8601 timestamp (e.g., "2024-01-15T10:00:00.000000Z")
 * - Ticker: Stock symbol (empty for cash transactions)
 * - Type: Transaction type (BUY - MARKET, SELL - MARKET, DIVIDEND, CUSTODY FEE, etc.)
 * - Quantity: Number of shares
 * - Price per share: Unit price
 * - Total Amount: Total value with currency symbol
 * - Currency: Transaction currency (e.g., "USD")
 * - FX Rate: Exchange rate to GBP
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
 * Revolut column names
 */
const REVOLUT_COLUMNS = {
  DATE: 'Date',
  TICKER: 'Ticker',
  TYPE: 'Type',
  QUANTITY: 'Quantity',
  PRICE_PER_SHARE: 'Price per share',
  TOTAL_AMOUNT: 'Total Amount',
  CURRENCY: 'Currency',
  FX_RATE: 'FX Rate',
} as const;

/**
 * Check if headers match Revolut format
 */
function isRevolutFormat(headers: string[]): boolean {
  const requiredColumns = [
    REVOLUT_COLUMNS.DATE,
    REVOLUT_COLUMNS.TICKER,
    REVOLUT_COLUMNS.TYPE,
    REVOLUT_COLUMNS.QUANTITY,
    REVOLUT_COLUMNS.PRICE_PER_SHARE,
    REVOLUT_COLUMNS.TOTAL_AMOUNT,
    REVOLUT_COLUMNS.CURRENCY,
  ];

  return requiredColumns.every(col => headers.includes(col));
}

/**
 * Map Revolut type to ActionType
 */
function mapTypeToAction(type: string): ActionType {
  const typeLower = type.toLowerCase();

  if (typeLower.includes('buy')) {
    return ActionType.BUY;
  }
  if (typeLower.includes('sell')) {
    return ActionType.SELL;
  }
  if (typeLower.includes('dividend')) {
    return ActionType.DIVIDEND;
  }
  if (typeLower.includes('cash top-up') || typeLower.includes('cash withdrawal')) {
    return ActionType.TRANSFER;
  }
  if (typeLower.includes('transfer from revolut')) {
    return ActionType.TRANSFER;
  }
  if (typeLower.includes('custody fee') || typeLower.includes('fee')) {
    return ActionType.FEE;
  }
  if (typeLower.includes('stock split')) {
    return ActionType.STOCK_SPLIT;
  }
  if (typeLower.includes('interest')) {
    return ActionType.INTEREST;
  }

  // Default to FEE for unknown types
  return ActionType.FEE;
}

/**
 * Parse Revolut date format: "2024-01-15T10:00:00.000000Z" -> Date
 */
function parseRevolutDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Extract date part
  const datePart = dateStr.split('T')[0];
  if (!datePart) return null;

  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;

  return new Date(Date.UTC(
    parseInt(year!, 10),
    parseInt(month!, 10) - 1,
    parseInt(day!, 10)
  ));
}

/**
 * Parse numeric value, handling currency symbols and commas
 */
function parseNumber(value: string | undefined): Decimal | null {
  if (!value || value.trim() === '') return null;

  // Remove currency symbols ($, £, €) and commas
  const cleaned = value.replace(/[$£€,]/g, '').trim();

  try {
    return new Decimal(cleaned);
  } catch {
    return null;
  }
}

/**
 * Revolut parser
 */
export class RevolutParser implements BrokerParser {
  readonly brokerName = 'Revolut';

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
      throw new ParsingError(fileName, 'Revolut CSV file is empty');
    }

    // First line is header
    const header = lines[0]!;

    // Validate format
    if (!isRevolutFormat(header)) {
      throw new ParsingError(
        fileName,
        'Not a valid Revolut format. Expected columns: Date, Ticker, Type, Quantity, Price per share, Total Amount, Currency'
      );
    }

    // Create column index map
    const colIndex: Record<string, number> = {};
    for (let i = 0; i < header.length; i++) {
      colIndex[header[i]!] = i;
    }

    const dataRows = lines.slice(1);
    const transactions: BrokerTransaction[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]!;
      const rowIndex = i + 2; // 1-indexed, header is row 1

      // Get date
      const dateStr = row[colIndex[REVOLUT_COLUMNS.DATE]!];
      const date = parseRevolutDate(dateStr || '');
      if (!date) {
        warnings.push(`${fileName}:${rowIndex}: Invalid date format "${dateStr}", skipping row`);
        continue;
      }

      // Get type
      const typeStr = row[colIndex[REVOLUT_COLUMNS.TYPE]!];
      if (!typeStr) {
        warnings.push(`${fileName}:${rowIndex}: Missing type, skipping row`);
        continue;
      }

      const action = mapTypeToAction(typeStr);

      // Get ticker
      let symbol = row[colIndex[REVOLUT_COLUMNS.TICKER]!]?.trim() || null;
      if (symbol) {
        symbol = getRenamedTicker(symbol);
      }

      // Skip non-stock transactions (transfers, fees) for CGT purposes
      if (action === ActionType.TRANSFER || action === ActionType.FEE) {
        continue;
      }

      // For stock transactions, require a symbol
      if (!symbol && (action === ActionType.BUY || action === ActionType.SELL)) {
        warnings.push(`${fileName}:${rowIndex}: Missing ticker for ${action}, skipping row`);
        continue;
      }

      // Parse numeric values
      const quantity = parseNumber(row[colIndex[REVOLUT_COLUMNS.QUANTITY]!]);
      const pricePerShare = parseNumber(row[colIndex[REVOLUT_COLUMNS.PRICE_PER_SHARE]!]);
      const totalAmount = parseNumber(row[colIndex[REVOLUT_COLUMNS.TOTAL_AMOUNT]!]);

      // Currency (default to USD if not specified)
      const currency = row[colIndex[REVOLUT_COLUMNS.CURRENCY]!]?.trim() || 'USD';

      // Make amount positive for internal use
      const amount = totalAmount !== null ? totalAmount.abs() : null;

      // Revolut doesn't separate fees in the export
      const fees = ZERO;

      const transaction: BrokerTransaction = {
        date,
        action,
        symbol,
        description: typeStr,
        quantity: quantity !== null ? quantity.abs() : null,
        price: pricePerShare !== null ? pricePerShare.abs() : null,
        fees,
        amount,
        currency,
        broker: 'Revolut',
        isin: null,
      };

      transactions.push(transaction);
    }

    if (transactions.length === 0) {
      warnings.push(`No valid stock transactions found in file "${fileName}"`);
    }

    // Sort by date
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      transactions,
      fileName,
      broker: this.brokerName,
      warnings,
    };
  }
}

// Create singleton instance
export const revolutParser = new RevolutParser();
