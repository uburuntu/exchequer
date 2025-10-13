/**
 * RAW format transaction parser
 *
 * This is the simplest parser - a generic CSV format that can be used
 * when a broker isn't directly supported.
 *
 * Format: date,action,symbol,quantity,price,fees,currency
 * Example: 2023-02-09,DIVIDEND,OPRA,4200,0.80,0.0,USD
 */

import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction, ActionType } from '../types';
import { ActionType as ActionTypeEnum } from '../types';
import { getRenamedTicker } from '../constants';
import { ZERO } from '../utils/decimal';
import { parseDateKey } from '../utils/date';
import {
  ParsingError,
  UnexpectedColumnCountError,
  InvalidActionError,
  InvalidDecimalError,
  MissingValueError,
} from './errors';

/**
 * Column names for RAW format (lowercase)
 */
const RAW_COLUMNS = [
  'date',
  'action',
  'symbol',
  'quantity',
  'price',
  'fees',
  'currency',
] as const;

type RawColumn = (typeof RAW_COLUMNS)[number];

const EXPECTED_COLUMN_COUNT = RAW_COLUMNS.length;

/**
 * Row data type (indexed by column name)
 */
type RawRow = Record<RawColumn, string>;

/**
 * Convert string label to ActionType
 */
function parseAction(label: string, fileName: string, rowIndex?: number): ActionType {
  const upperLabel = label.toUpperCase();
  if (upperLabel in ActionTypeEnum) {
    return upperLabel as ActionType;
  }
  throw new InvalidActionError(fileName, label, rowIndex);
}

/**
 * Parse decimal value from string
 */
function parseDecimal(
  row: RawRow,
  column: RawColumn,
  fileName: string,
  options: {
    allowEmpty: boolean;
    defaultValue?: Decimal;
    rowIndex?: number;
  }
): Decimal | null {
  const value = row[column];

  if (value === '') {
    if (options.allowEmpty) {
      return options.defaultValue ?? null;
    }
    throw new MissingValueError(fileName, column, options.rowIndex);
  }

  // Remove thousand separators (commas)
  const normalized = value.replace(/,/g, '');

  try {
    return new Decimal(normalized);
  } catch (err) {
    throw new InvalidDecimalError(fileName, column, value, options.rowIndex);
  }
}

/**
 * Validate header row
 */
function validateHeader(header: string[], fileName: string): void {
  if (header.length !== EXPECTED_COLUMN_COUNT) {
    throw new UnexpectedColumnCountError(
      fileName,
      EXPECTED_COLUMN_COUNT,
      header.length,
      1 // Header is row 1
    );
  }

  const normalizedHeader = header.map(h => h.trim().toLowerCase());

  for (let i = 0; i < RAW_COLUMNS.length; i++) {
    const expected = RAW_COLUMNS[i];
    const actual = normalizedHeader[i];
    if (expected !== actual) {
      throw new ParsingError(
        fileName,
        `Expected column ${i + 1} to be '${expected}' but found '${header[i]}'`,
        1
      );
    }
  }
}

/**
 * Check if first row is likely a header
 */
function hasHeader(firstRow: string[]): boolean {
  if (firstRow.length === 0) {
    return false;
  }
  // Header row should have all non-empty alphabetic values
  return firstRow.every(value => {
    const trimmed = value.trim();
    return trimmed !== '' && /^[a-zA-Z]+$/.test(trimmed);
  });
}

/**
 * Parse a single RAW transaction row
 */
function parseRawTransaction(
  row: string[],
  fileName: string,
  rowIndex: number
): BrokerTransaction {
  if (row.length !== EXPECTED_COLUMN_COUNT) {
    throw new UnexpectedColumnCountError(
      fileName,
      EXPECTED_COLUMN_COUNT,
      row.length,
      rowIndex
    );
  }

  // Create indexed row object
  const rowData: RawRow = {
    date: row[0]!,
    action: row[1]!,
    symbol: row[2]!,
    quantity: row[3]!,
    price: row[4]!,
    fees: row[5]!,
    currency: row[6]!,
  };

  // Parse date (YYYY-MM-DD format)
  let date: Date;
  try {
    date = parseDateKey(rowData.date);
    // Validate that we got a valid date (not NaN)
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
  } catch (err) {
    throw new ParsingError(
      fileName,
      `Invalid date format: "${rowData.date}". Expected YYYY-MM-DD`,
      rowIndex
    );
  }

  // Parse action
  const action = parseAction(rowData.action, fileName, rowIndex);

  // Parse symbol (apply ticker renames)
  let symbol: string | null = rowData.symbol || null;
  if (symbol !== null) {
    symbol = getRenamedTicker(symbol);
  }

  // Parse numeric values
  const quantity = parseDecimal(rowData, 'quantity', fileName, {
    allowEmpty: true,
    rowIndex,
  });

  const price = parseDecimal(rowData, 'price', fileName, {
    allowEmpty: true,
    rowIndex,
  });

  const parsedFees = parseDecimal(rowData, 'fees', fileName, {
    allowEmpty: true,
    defaultValue: ZERO,
    rowIndex,
  });
  // Fees default to ZERO if not provided
  const fees = parsedFees ?? ZERO;

  // Calculate amount from price and quantity
  let amount: Decimal | null = null;
  if (price !== null && quantity !== null) {
    amount = price.times(quantity);

    // BUY transactions are negative (money out)
    if (action === ActionTypeEnum.BUY) {
      amount = amount.abs().negated(); // Ensure negative
    }

    // Subtract fees from amount
    amount = amount.minus(fees);
  }

  const currency = rowData.currency;

  return {
    date,
    action,
    symbol,
    description: '', // RAW format has no description field
    quantity,
    price,
    fees,
    amount,
    currency,
    broker: 'RAW', // Changed from "Unknown" to "RAW" for clarity
  };
}

/**
 * RAW format parser
 */
export class RawParser implements BrokerParser {
  readonly brokerName = 'RAW';

  async parse(fileContent: string, fileName: string): Promise<ParserResult> {
    const warnings: string[] = [];

    // Parse CSV using PapaParse
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
      throw new ParsingError(fileName, 'RAW CSV file is empty');
    }

    // Check for header row
    let dataRows = lines;
    let startRowIndex = 1;

    if (hasHeader(lines[0]!)) {
      validateHeader(lines[0]!, fileName);
      dataRows = lines.slice(1);
      startRowIndex = 2;
    } else {
      warnings.push(
        `RAW CSV file "${fileName}" is missing header row. ` +
          'The header is required but will be inferred for now.'
      );
    }

    // Parse all data rows
    const transactions: BrokerTransaction[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const rowIndex = startRowIndex + i;
      const row = dataRows[i]!;

      try {
        const transaction = parseRawTransaction(row, fileName, rowIndex);
        transactions.push(transaction);
      } catch (err) {
        // Re-throw parsing errors with row context
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

    return {
      transactions,
      fileName,
      broker: this.brokerName,
      warnings,
    };
  }
}

// Create singleton instance
export const rawParser = new RawParser();
