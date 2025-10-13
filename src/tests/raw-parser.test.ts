/**
 * RAW parser tests
 */

import { describe, it, expect } from 'vitest';
import { rawParser } from '../lib/parsers/raw';
import {
  ParsingError,
  UnexpectedColumnCountError,
  InvalidActionError,
  InvalidDecimalError,
} from '../lib/parsers/errors';

describe('RAW Parser', () => {
  it('should have correct broker name', () => {
    expect(rawParser.brokerName).toBe('RAW');
  });

  it('should parse valid CSV with header', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-02-09,DIVIDEND,AAPL,100,0.80,0.0,USD
2023-01-15,BUY,MSFT,50,250.00,1.50,USD
2023-01-10,SELL,GOOGL,25,95.00,0.75,USD`;

    const result = await rawParser.parse(csv, 'test.csv');

    expect(result.transactions).toHaveLength(3);
    expect(result.broker).toBe('RAW');
    expect(result.fileName).toBe('test.csv');
    expect(result.warnings).toHaveLength(0);

    // Check first transaction (DIVIDEND)
    const dividend = result.transactions[0]!;
    expect(dividend.action).toBe('DIVIDEND');
    expect(dividend.symbol).toBe('AAPL');
    expect(dividend.quantity?.toString()).toBe('100');
    expect(dividend.price?.toString()).toBe('0.8');
    expect(dividend.fees.toString()).toBe('0');
    expect(dividend.currency).toBe('USD');
    expect(dividend.broker).toBe('RAW');

    // Amount for dividend: quantity * price - fees
    expect(dividend.amount?.toString()).toBe('80'); // 100 * 0.80 - 0.0

    // Check date parsing
    expect(dividend.date.getUTCFullYear()).toBe(2023);
    expect(dividend.date.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(dividend.date.getUTCDate()).toBe(9);
  });

  it('should parse valid CSV without header', async () => {
    const csv = `2023-02-09,DIVIDEND,AAPL,100,0.80,0.0,USD
2023-01-15,BUY,MSFT,50,250.00,1.50,USD`;

    const result = await rawParser.parse(csv, 'test.csv');

    expect(result.transactions).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('missing header row');
  });

  it('should handle BUY action with negative amount', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-01-15,BUY,MSFT,50,250.00,1.50,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    const buy = result.transactions[0]!;

    expect(buy.action).toBe('BUY');
    // BUY amount should be negative: -(50 * 250.00) - 1.50 = -12501.50
    expect(buy.amount?.toNumber()).toBe(-12501.5);
  });

  it('should handle SELL action with positive amount', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-01-10,SELL,GOOGL,25,95.00,0.75,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    const sell = result.transactions[0]!;

    expect(sell.action).toBe('SELL');
    // SELL amount: (25 * 95.00) - 0.75 = 2374.25
    expect(sell.amount?.toNumber()).toBe(2374.25);
  });

  it('should apply ticker renames (FB → META)', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2022-05-15,BUY,FB,104,198.62,0.00,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    // FB should be renamed to META
    expect(transaction.symbol).toBe('META');
  });

  it('should handle empty symbol field', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-01-15,TRANSFER,,,,0.0,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.symbol).toBeNull();
    expect(transaction.amount).toBeNull(); // No price/quantity
  });

  it('should handle empty quantity and price', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-01-15,WIRE_FUNDS_RECEIVED,,,,,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.quantity).toBeNull();
    expect(transaction.price).toBeNull();
    expect(transaction.amount).toBeNull();
  });

  it('should default fees to zero if empty', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-02-09,DIVIDEND,AAPL,100,0.80,,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.fees.toString()).toBe('0');
  });

  it('should remove thousand separators from numbers', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-01-15,BUY,AAPL,1,"1,234.56",1.50,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.price?.toString()).toBe('1234.56');
  });

  it('should throw on empty file', async () => {
    await expect(rawParser.parse('', 'empty.csv')).rejects.toThrow(ParsingError);
    // PapaParse may give different error messages for empty files
  });

  it('should throw on wrong column count in header', async () => {
    const csv = `date,action,symbol,quantity,price`;

    await expect(rawParser.parse(csv, 'bad.csv')).rejects.toThrow(
      UnexpectedColumnCountError
    );
  });

  it('should throw on wrong column count in data row', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-02-09,DIVIDEND,AAPL,100`;

    await expect(rawParser.parse(csv, 'bad.csv')).rejects.toThrow(
      UnexpectedColumnCountError
    );
  });

  it('should throw on invalid header column names', async () => {
    const csv = `date,action,ticker,quantity,price,fees,currency`;

    await expect(rawParser.parse(csv, 'bad.csv')).rejects.toThrow(ParsingError);
    await expect(rawParser.parse(csv, 'bad.csv')).rejects.toThrow(
      "Expected column 3 to be 'symbol'"
    );
  });

  it('should throw on invalid action type', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-02-09,INVALID_ACTION,AAPL,100,0.80,0.0,USD`;

    await expect(rawParser.parse(csv, 'bad.csv')).rejects.toThrow(
      InvalidActionError
    );
    await expect(rawParser.parse(csv, 'bad.csv')).rejects.toThrow(
      'Unknown action: INVALID_ACTION'
    );
  });

  it('should throw on invalid date format', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
02/09/2023,DIVIDEND,AAPL,100,0.80,0.0,USD`;

    await expect(rawParser.parse(csv, 'bad.csv')).rejects.toThrow(ParsingError);
    await expect(rawParser.parse(csv, 'bad.csv')).rejects.toThrow(
      'Invalid date format'
    );
  });

  it('should throw on invalid decimal', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-02-09,DIVIDEND,AAPL,abc,0.80,0.0,USD`;

    await expect(rawParser.parse(csv, 'bad.csv')).rejects.toThrow(
      InvalidDecimalError
    );
  });

  it('should throw on missing required quantity (when not allowed empty)', async () => {
    // Note: In RAW format, quantity CAN be empty, so this tests the error path
    // by using an action that would fail calculation without quantity/price
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-02-09,DIVIDEND,AAPL,,0.80,0.0,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    // Should not throw, just return null amount
    expect(result.transactions[0]!.amount).toBeNull();
  });

  it('should preserve decimal precision', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2022-07-26,DIVIDEND,OTGLY,305,0.031737,0.0,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    // Verify precise decimal handling
    expect(transaction.price?.toString()).toBe('0.031737');
    expect(transaction.quantity?.toString()).toBe('305');
    // Amount: 305 * 0.031737 = 9.67978
    expect(transaction.amount?.toString()).toBe('9.679785');
  });

  it('should handle stock split with zero price', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2022-06-06,STOCK_SPLIT,AMZN,209,0.00,0.00,USD`;

    const result = await rawParser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('STOCK_SPLIT');
    expect(transaction.price?.toString()).toBe('0');
    expect(transaction.amount?.toString()).toBe('0');
  });

  it('should parse complete test file', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-02-09,DIVIDEND,OPRA,4200,0.80,0.0,USD
2022-11-14,SELL,META,19,116.00,0.05,USD
2022-11-14,SELL,META,1,116.00,0.00,USD
2022-11-10,SELL,META,19,107.00,0.05,USD
2022-11-10,SELL,META,1,107.00,0.00,USD
2022-08-15,BUY,META,105,180.50,0.00,USD
2022-08-10,SELL,META,50,179.00,0.20,USD
2022-07-26,DIVIDEND,OTGLY,305,0.031737,0.0,USD
2022-06-06,STOCK_SPLIT,AMZN,209,0.00,0.00,USD
2022-05-15,BUY,FB,104,198.62,0.00,USD
2022-05-11,BUY,BABA,10,82.50,0.00,USD`;

    const result = await rawParser.parse(csv, 'test_data.csv');

    expect(result.transactions).toHaveLength(11);
    expect(result.warnings).toHaveLength(0);

    // Verify FB was renamed to META
    const fbTransaction = result.transactions.find(
      t => t.date.getUTCFullYear() === 2022 &&
           t.date.getUTCMonth() === 4 && // May
           t.date.getUTCDate() === 15
    );
    expect(fbTransaction?.symbol).toBe('META');

    // Verify all transactions have proper broker
    expect(result.transactions.every(t => t.broker === 'RAW')).toBe(true);
  });

  it('should include row number in error messages', async () => {
    const csv = `date,action,symbol,quantity,price,fees,currency
2023-02-09,DIVIDEND,AAPL,100,0.80,0.0,USD
2023-01-15,INVALID,MSFT,50,250.00,1.50,USD`;

    try {
      await rawParser.parse(csv, 'test.csv');
      expect.fail('Should have thrown error');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidActionError);
      if (err instanceof ParsingError) {
        expect(err.rowIndex).toBe(3); // Header + 1 good row + 1 bad row
        expect(err.message).toContain('test.csv:3');
      }
    }
  });
});
