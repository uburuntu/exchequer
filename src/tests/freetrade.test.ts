/**
 * Freetrade parser tests
 *
 * Tests the Freetrade transaction parser.
 */

import { describe, it, expect } from 'vitest';
import { freetradeParser } from '../lib/parsers/freetrade';

// All 28 required Freetrade columns
const COLUMNS = [
  'Title',
  'Type',
  'Timestamp',
  'Account Currency',
  'Total Amount',
  'Buy / Sell',
  'Ticker',
  'ISIN',
  'Price per Share in Account Currency',
  'Stamp Duty',
  'Quantity',
  'Venue',
  'Order ID',
  'Order Type',
  'Instrument Currency',
  'Total Shares Amount',
  'Price per Share',
  'FX Rate',
  'Base FX Rate',
  'FX Fee (BPS)',
  'FX Fee Amount',
  'Dividend Ex Date',
  'Dividend Pay Date',
  'Dividend Eligible Quantity',
  'Dividend Amount Per Share',
  'Dividend Gross Distribution Amount',
  'Dividend Net Distribution Amount',
  'Dividend Withheld Tax Percentage',
  'Dividend Withheld Tax Amount',
];

const HEADER = COLUMNS.join(',');

// Default row values for a simple BUY transaction
const BASE_ROW_VALUES = {
  'Title': 'Buy Apple',
  'Type': 'ORDER',
  'Timestamp': '2024-01-01T10:00:00',
  'Account Currency': 'GBP',
  'Total Amount': '100',
  'Buy / Sell': 'BUY',
  'Ticker': 'AAPL',
  'ISIN': 'US0378331005',
  'Price per Share in Account Currency': '100',
  'Stamp Duty': '0',
  'Quantity': '1',
  'Venue': '',
  'Order ID': '123',
  'Order Type': 'MARKET',
  'Instrument Currency': 'GBP',
  'Total Shares Amount': '100',
  'Price per Share': '100',
  'FX Rate': '1',
  'Base FX Rate': '1',
  'FX Fee (BPS)': '0',
  'FX Fee Amount': '0',
  'Dividend Ex Date': '',
  'Dividend Pay Date': '',
  'Dividend Eligible Quantity': '',
  'Dividend Amount Per Share': '0',
  'Dividend Gross Distribution Amount': '0',
  'Dividend Net Distribution Amount': '0',
  'Dividend Withheld Tax Percentage': '0',
  'Dividend Withheld Tax Amount': '0',
};

function defaultRow(overrides?: Record<string, string>): string {
  const values: Record<string, string> = { ...BASE_ROW_VALUES, ...overrides };
  return COLUMNS.map(col => values[col] || '').join(',');
}

describe('Freetrade Parser', () => {
  it('should throw ParsingError for empty file', async () => {
    const csv = '';

    await expect(freetradeParser.parse(csv, 'empty.csv')).rejects.toThrow(
      'Freetrade CSV file is empty'
    );
  });

  it('should throw ParsingError for missing columns', async () => {
    // Remove last column
    const headerMissing = COLUMNS.slice(0, -1).join(',');

    await expect(freetradeParser.parse(headerMissing, 'missing.csv')).rejects.toThrow(
      'Missing columns'
    );
  });

  it('should throw ParsingError for unknown columns', async () => {
    const headerExtra = HEADER + ',Unexpected';

    await expect(freetradeParser.parse(headerExtra, 'unknown.csv')).rejects.toThrow(
      'Unknown columns: Unexpected'
    );
  });

  it('should throw ParsingError for invalid decimal with row context', async () => {
    const csv = `${HEADER}
${defaultRow({ 'Quantity': 'not-a-number' })}`;

    await expect(freetradeParser.parse(csv, 'invalid.csv')).rejects.toThrow(
      'Invalid decimal value "not-a-number" in column "Quantity"'
    );
  });

  it('should throw error for unsupported currency (non-GBP)', async () => {
    const csv = `${HEADER}
${defaultRow({ 'Account Currency': 'USD' })}`;

    await expect(freetradeParser.parse(csv, 'usd.csv')).rejects.toThrow(
      'Unsupported account currency'
    );
  });

  it('should parse a simple BUY transaction', async () => {
    const csv = `${HEADER}
${defaultRow()}`;

    const result = await freetradeParser.parse(csv, 'buy.csv');

    expect(result.transactions).toHaveLength(1);
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('BUY');
    expect(transaction.symbol).toBe('AAPL');
    expect(transaction.quantity?.toString()).toBe('1');
    expect(transaction.price?.toString()).toBe('100');
    expect(transaction.amount?.toString()).toBe('-100'); // Negative for BUY
    expect(transaction.currency).toBe('GBP');
  });

  it('should throw error for unsupported action types', async () => {
    // ADJUSTMENT is not a supported Freetrade action
    const csv = `${HEADER}
${defaultRow({ 'Type': 'ADJUSTMENT', 'Buy / Sell': '' })}`;

    await expect(freetradeParser.parse(csv, 'unsupported.csv')).rejects.toThrow(
      'Unknown type'
    );
  });
});
