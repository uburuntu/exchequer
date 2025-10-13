/**
 * EquatePlus transaction parser
 *
 * EquatePlus is used for employee stock plans (RSUs, ESPPs, etc.).
 *
 * Expected columns:
 * - Order reference: Transaction ID
 * - Date: Date in "DD MMM YYYY" format (e.g., "15 Jun 2023")
 * - Order type: "Sell at market price", "Withhold-to-cover", "Dividend"
 * - Quantity: Number of shares
 * - Status: "Executed" or other
 * - Execution price: Price per share with £ symbol
 * - Instrument: Stock name (e.g., "BP Ordinary Shares")
 * - Product type: "shares", "restricted stock units", etc.
 * - Fees: Transaction fees with £ symbol
 * - Net proceeds: Total proceeds with £ symbol
 * - Net units: Net shares after withholding (for RSU vests)
 */

import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction } from '../types';
import { ActionType } from '../types';
import { ZERO } from '../utils/decimal';
import { ParsingError } from './errors';

/**
 * EquatePlus column names
 */
const EQUATEPLUS_COLUMNS = {
  ORDER_REFERENCE: 'Order reference',
  DATE: 'Date',
  ORDER_TYPE: 'Order type',
  QUANTITY: 'Quantity',
  STATUS: 'Status',
  EXECUTION_PRICE: 'Execution price',
  INSTRUMENT: 'Instrument',
  PRODUCT_TYPE: 'Product type',
  FEES: 'Fees',
  NET_PROCEEDS: 'Net proceeds',
  NET_UNITS: 'Net units',
} as const;

/**
 * Check if headers match EquatePlus format
 */
function isEquatePlusFormat(headers: string[]): boolean {
  const requiredColumns = [
    EQUATEPLUS_COLUMNS.DATE,
    EQUATEPLUS_COLUMNS.ORDER_TYPE,
    EQUATEPLUS_COLUMNS.QUANTITY,
    EQUATEPLUS_COLUMNS.STATUS,
    EQUATEPLUS_COLUMNS.INSTRUMENT,
  ];

  return requiredColumns.every(col => headers.includes(col));
}

/**
 * Month name to number mapping
 */
const MONTH_MAP: Record<string, number> = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3,
  'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7,
  'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
};

/**
 * Parse EquatePlus date format: "15 Jun 2023" -> Date
 */
function parseEquatePlusDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Match format: "15 Jun 2023" or "6 Nov 2023"
  const match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const monthNum = MONTH_MAP[month!];
  if (monthNum === undefined) return null;

  return new Date(Date.UTC(
    parseInt(year!, 10),
    monthNum,
    parseInt(day!, 10)
  ));
}

/**
 * Parse number with commas: "1,200" -> Decimal
 */
function parseNumber(value: string | undefined): Decimal | null {
  if (!value || value.trim() === '' || value.trim() === '-') return null;

  // Remove commas
  const cleaned = value.replace(/,/g, '').trim();

  try {
    return new Decimal(cleaned);
  } catch {
    return null;
  }
}

/**
 * Parse price with £ symbol: "£5.25" -> Decimal
 */
function parsePrice(value: string | undefined): Decimal | null {
  if (!value || value.trim() === '' || value.trim() === '-') return null;

  // Remove £ symbol and commas
  const cleaned = value.replace(/[£,]/g, '').trim();

  try {
    return new Decimal(cleaned);
  } catch {
    return null;
  }
}

/**
 * Extract stock symbol from instrument name
 * E.g., "BP Ordinary Shares" -> "BP"
 */
function extractSymbol(instrument: string): string {
  if (!instrument) return '';

  const parts = instrument.trim().split(' ');

  // If it ends with "Ordinary Shares", "Shares", "Award", etc., take the first part
  if (parts.length > 1) {
    const lastWord = parts[parts.length - 1]!.toLowerCase();
    if (lastWord === 'shares' || lastWord === 'award' || lastWord === 'stock') {
      return parts[0]!;
    }
  }

  // Otherwise, return the first word
  return parts[0] || '';
}

/**
 * EquatePlus parser
 */
export class EquatePlusParser implements BrokerParser {
  readonly brokerName = 'EquatePlus';

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
      throw new ParsingError(fileName, 'EquatePlus CSV file is empty');
    }

    // First line is header
    const header = lines[0]!;

    // Validate format
    if (!isEquatePlusFormat(header)) {
      throw new ParsingError(
        fileName,
        'Not a valid EquatePlus format. Expected columns: Date, Order type, Quantity, Status, Instrument'
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

      // Get status - only process executed transactions
      const status = row[colIndex[EQUATEPLUS_COLUMNS.STATUS]!]?.trim();
      if (status !== 'Executed') {
        continue;
      }

      // Get date
      const dateStr = row[colIndex[EQUATEPLUS_COLUMNS.DATE]!]?.trim();
      const date = parseEquatePlusDate(dateStr || '');
      if (!date) {
        warnings.push(`${fileName}:${rowIndex}: Invalid date format "${dateStr}", skipping row`);
        continue;
      }

      // Get order type
      const orderType = row[colIndex[EQUATEPLUS_COLUMNS.ORDER_TYPE]!]?.trim();
      if (!orderType) {
        continue;
      }

      // Get instrument and extract symbol
      const instrument = row[colIndex[EQUATEPLUS_COLUMNS.INSTRUMENT]!]?.trim() || '';
      const symbol = extractSymbol(instrument);

      if (!symbol) {
        continue; // Skip rows without a symbol
      }

      // Parse based on order type
      if (orderType === 'Sell at market price') {
        // SELL transaction
        const quantity = parseNumber(row[colIndex[EQUATEPLUS_COLUMNS.QUANTITY]!]);
        const executionPrice = parsePrice(row[colIndex[EQUATEPLUS_COLUMNS.EXECUTION_PRICE]!]);
        const fees = parsePrice(row[colIndex[EQUATEPLUS_COLUMNS.FEES]!]) || ZERO;
        const netProceeds = parsePrice(row[colIndex[EQUATEPLUS_COLUMNS.NET_PROCEEDS]!]);
        const orderRef = row[colIndex[EQUATEPLUS_COLUMNS.ORDER_REFERENCE]!]?.trim();

        const transaction: BrokerTransaction = {
          date,
          action: ActionType.SELL,
          symbol,
          description: `Sell: ${instrument}${orderRef ? ` (${orderRef})` : ''}`,
          quantity,
          price: executionPrice,
          fees,
          amount: netProceeds !== null ? netProceeds.abs() : null,
          currency: 'GBP',
          broker: 'EquatePlus',
          isin: null,
        };
        transactions.push(transaction);

      } else if (orderType === 'Withhold-to-cover') {
        // RSU vesting - only if Net units > 0
        const netUnits = parseNumber(row[colIndex[EQUATEPLUS_COLUMNS.NET_UNITS]!]);

        if (netUnits === null || netUnits.isZero() || netUnits.isNegative()) {
          // Shares withheld for taxes, not an acquisition
          continue;
        }

        const executionPrice = parsePrice(row[colIndex[EQUATEPLUS_COLUMNS.EXECUTION_PRICE]!]);
        const orderRef = row[colIndex[EQUATEPLUS_COLUMNS.ORDER_REFERENCE]!]?.trim();
        const productType = row[colIndex[EQUATEPLUS_COLUMNS.PRODUCT_TYPE]!]?.trim();

        // Calculate total value
        const total = executionPrice !== null ? executionPrice.times(netUnits) : null;

        const transaction: BrokerTransaction = {
          date,
          action: ActionType.STOCK_ACTIVITY, // RSU vest
          symbol,
          description: `RSU Vest: ${instrument}${productType ? ` (${productType})` : ''}${orderRef ? ` - ${orderRef}` : ''}`,
          quantity: netUnits,
          price: executionPrice,
          fees: ZERO,
          amount: total,
          currency: 'GBP',
          broker: 'EquatePlus',
          isin: null,
        };
        transactions.push(transaction);

      } else if (orderType === 'Dividend') {
        // Dividend transaction
        const quantity = parseNumber(row[colIndex[EQUATEPLUS_COLUMNS.QUANTITY]!]);
        const netProceeds = parsePrice(row[colIndex[EQUATEPLUS_COLUMNS.NET_PROCEEDS]!]);
        const orderRef = row[colIndex[EQUATEPLUS_COLUMNS.ORDER_REFERENCE]!]?.trim();

        const transaction: BrokerTransaction = {
          date,
          action: ActionType.DIVIDEND,
          symbol,
          description: `Dividend: ${instrument}${orderRef ? ` (${orderRef})` : ''}`,
          quantity,
          price: null,
          fees: ZERO,
          amount: netProceeds,
          currency: 'GBP',
          broker: 'EquatePlus',
          isin: null,
        };
        transactions.push(transaction);
      }
      // Skip unknown order types
    }

    if (transactions.length === 0) {
      warnings.push(`No valid transactions found in file "${fileName}"`);
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
export const equatePlusParser = new EquatePlusParser();
