/**
 * MSSB (Morgan Stanley) parser tests
 *
 * Tests the Morgan Stanley Release and Withdrawal report parsers.
 */

import { describe, it, expect } from 'vitest';
import { mssbParser } from '../lib/parsers/mssb';

const COLUMNS_RELEASE = [
  'Vest Date',
  'Order Number',
  'Plan',
  'Type',
  'Status',
  'Price',
  'Quantity',
  'Net Cash Proceeds',
  'Net Share Proceeds',
  'Tax Payment Method',
];

const COLUMNS_WITHDRAWAL = [
  'Execution Date',
  'Order Number',
  'Plan',
  'Type',
  'Order Status',
  'Price',
  'Quantity',
  'Net Amount',
  'Net Share Proceeds',
  'Tax Payment Method',
];

describe('MSSB Parser', () => {
  it('should throw ParsingError for empty file', async () => {
    const csv = '';

    await expect(mssbParser.parse(csv, 'Withdrawals Report.csv')).rejects.toThrow(
      'CSV file is empty'
    );
  });

  it('should parse a valid release report', async () => {
    const csv = `${COLUMNS_RELEASE.join(',')}
25-Mar-2023,ORDER-1,GSU Class C,Release,Complete,$10.00,3.000,$0.00,3,Fractional Shares`;

    const result = await mssbParser.parse(csv, 'Releases Report.csv');

    expect(result.transactions).toHaveLength(1);
    const transaction = result.transactions[0]!;

    expect(transaction.symbol).toBe('GOOG'); // GSU Class C mapped to GOOG
    expect(transaction.action).toBe('STOCK_ACTIVITY');
    expect(transaction.quantity?.toString()).toBe('3');
    expect(transaction.price?.toString()).toBe('10');
    expect(transaction.amount?.toString()).toBe('30');
  });

  it('should skip notice rows in withdrawal report', async () => {
    const csv = `${COLUMNS_WITHDRAWAL.join(',')}
02-Apr-2021,ORDER-2,Cash,Sale,Complete,$1.00,"-4,218.95",$4218.95,0,N/A
Please note that any Alphabet share sales...`;

    const result = await mssbParser.parse(csv, 'Withdrawals Report.csv');

    expect(result.transactions).toHaveLength(1);
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('TRANSFER');
    expect(transaction.amount?.toString()).toBe('-4218.95');
    expect(transaction.fees.toString()).toBe('0');
  });

  it('should throw ParsingError for invalid decimal', async () => {
    const csv = `${COLUMNS_WITHDRAWAL.join(',')}
09-Feb-2023,ORDER-3,GSU Class C,Sale,Complete,$105.70,bad,$3170.93,0,N/A`;

    await expect(mssbParser.parse(csv, 'Withdrawals Report.csv')).rejects.toThrow(
      'Invalid decimal'
    );
  });

  it('should throw ParsingError for invalid header', async () => {
    const invalidHeader = ['Vest date', ...COLUMNS_RELEASE.slice(1)];
    const csv = invalidHeader.join(',');

    await expect(mssbParser.parse(csv, 'Releases Report.csv')).rejects.toThrow(
      'Expected column 1'
    );
  });
});
