/**
 * Schwab corporate action transaction pairing tests
 *
 * Tests the pairing of corporate action transactions (Cash Merger and Full Redemption)
 * where split transaction rows need to be combined into unified transactions with
 * calculated prices.
 */

import { describe, it, expect } from 'vitest';
import { schwabParser } from '../lib/parsers/schwab';

const HEADER = 'Date,Action,Symbol,Description,Price,Quantity,Fees & Comm,Amount';

describe('Schwab Parser - Corporate Action Pairing', () => {
  it('should combine Cash Merger + Cash Merger Adj transactions', async () => {
    const csv = `${HEADER}
03/02/2021,Cash Merger,FOO,FOO INC,,,,$1000
03/02/2021,Cash Merger Adj,FOO,FOO INC,,-100,$5,`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // Should have 1 unified transaction
    expect(result.transactions).toHaveLength(1);
    const unified = result.transactions[0]!;

    // Verify unified transaction
    expect(unified.action).toBe('CASH_MERGER');
    expect(unified.symbol).toBe('FOO');
    expect(unified.quantity?.toString()).toBe('100'); // Converted to positive
    expect(unified.amount?.toString()).toBe('1000');
    expect(unified.price?.toString()).toBe('10'); // 1000 / 100
    expect(unified.fees.toString()).toBe('5'); // From Adj transaction
  });

  it('should combine Full Redemption Adj + Full Redemption transactions', async () => {
    const csv = `${HEADER}
05/15/2023,Full Redemption Adj,BAR,BAR CORP,,,,$2500
05/15/2023,Full Redemption,BAR,BAR CORP,,-50,,`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // Should have 1 unified transaction
    expect(result.transactions).toHaveLength(1);
    const unified = result.transactions[0]!;

    // Verify unified transaction
    expect(unified.action).toBe('FULL_REDEMPTION');
    expect(unified.symbol).toBe('BAR');
    expect(unified.quantity?.toString()).toBe('50'); // Converted to positive
    expect(unified.amount?.toString()).toBe('2500');
    expect(unified.price?.toString()).toBe('50'); // 2500 / 50
    expect(unified.fees.toString()).toBe('0'); // No fees
  });

  it('should not affect other transactions when pairing Cash Merger', async () => {
    const csv = `${HEADER}
01/01/2021,Buy,AAPL,APPLE INC,$150,10,$1,-$1501
03/02/2021,Cash Merger,FOO,FOO INC,,,,$1000
03/02/2021,Cash Merger Adj,FOO,FOO INC,,-100,,`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // Should have 2 transactions: unified Cash Merger + Buy
    expect(result.transactions).toHaveLength(2);

    // Find transactions by symbol (order may vary)
    const fooTxn = result.transactions.find(t => t.symbol === 'AAPL');
    const cashMergerTxn = result.transactions.find(t => t.symbol === 'FOO');

    expect(cashMergerTxn!.action).toBe('CASH_MERGER');
    expect(cashMergerTxn!.quantity?.toString()).toBe('100');
    expect(fooTxn!.action).toBe('BUY');
    expect(fooTxn!.symbol).toBe('AAPL');
  });

  it('should handle multiple Cash Merger pairs correctly', async () => {
    const csv = `${HEADER}
03/02/2021,Cash Merger,FOO,FOO INC,,,,$1000
03/02/2021,Cash Merger Adj,FOO,FOO INC,,-100,,
04/15/2021,Cash Merger,BAR,BAR CORP,,,,$5000
04/15/2021,Cash Merger Adj,BAR,BAR CORP,,-200,,`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // Should have 2 unified transactions
    expect(result.transactions).toHaveLength(2);

    // Find transactions by symbol
    const fooTxn = result.transactions.find(t => t.symbol === 'FOO');
    const barTxn = result.transactions.find(t => t.symbol === 'BAR');

    // Verify FOO merger
    expect(fooTxn!.symbol).toBe('FOO');
    expect(fooTxn!.quantity?.toString()).toBe('100');
    expect(fooTxn!.price?.toString()).toBe('10');

    // Verify BAR merger
    expect(barTxn!.symbol).toBe('BAR');
    expect(barTxn!.quantity?.toString()).toBe('200');
    expect(barTxn!.price?.toString()).toBe('25');
  });
});
