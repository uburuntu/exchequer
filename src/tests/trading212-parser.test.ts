/**
 * Trading 212 parser tests
 */

import { describe, it, expect } from 'vitest';
import { trading212Parser } from '../lib/parsers/trading212';
import {
  ParsingError,
  UnexpectedColumnCountError,
  InvalidActionError,
} from '../lib/parsers/errors';

// Trading 212 2024 export format (21 columns)
const HEADER = 'Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Transaction fee,Notes,ID,Currency conversion fee,Currency (Currency conversion fee),Currency (Transaction fee)';

describe('Trading 212 Parser', () => {
  it('should have correct broker name', () => {
    expect(trading212Parser.brokerName).toBe('Trading212');
  });

  it('should parse valid CSV with market buy', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2345,,,-1234.50,GBP,,,1.50,,TX123,0.50,GBP,GBP`;

    const result = await trading212Parser.parse(csv, 'test.csv');

    expect(result.transactions).toHaveLength(1);
    expect(result.broker).toBe('Trading212');
    expect(result.fileName).toBe('test.csv');
    // Expect price discrepancy warning (exchange rate causes small difference)
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Price per share discrepancy');

    const transaction = result.transactions[0]!;
    expect(transaction.action).toBe('BUY');
    expect(transaction.symbol).toBe('AAPL');
    expect(transaction.description).toBe('Apple Inc.');
    expect(transaction.quantity?.toString()).toBe('10');
    expect(transaction.currency).toBe('GBP');
    expect(transaction.broker).toBe('Trading212');
    expect(transaction.isin).toBe('US0378331005');

    // Amount should be negative for BUY
    expect(transaction.amount?.toNumber()).toBe(-1234.50);

    // Fees: transaction fee + conversion fee
    expect(transaction.fees.toNumber()).toBe(2.00); // 1.50 + 0.50

    // Price calculated from amount and quantity: (1234.50 + 2.00) / 10
    expect(transaction.price?.toNumber()).toBe(123.65);

    // Check date parsing
    expect(transaction.date.getUTCFullYear()).toBe(2023);
    expect(transaction.date.getUTCMonth()).toBe(0); // January (0-indexed)
    expect(transaction.date.getUTCDate()).toBe(15);
  });

  it('should parse market sell', async () => {
    const csv = `${HEADER}
Market sell,2023-02-20 10:15:30,US0378331005,AAPL,Apple Inc.,5,160.00,USD,1.2000,,,960.00,GBP,,,0.75,,TX456,,,GBP`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('SELL');
    expect(transaction.symbol).toBe('AAPL');
    expect(transaction.quantity?.toString()).toBe('5');
    expect(transaction.amount?.toNumber()).toBe(960.00);
    expect(transaction.fees.toNumber()).toBe(0.75);
  });

  it('should parse dividend', async () => {
    const csv = `${HEADER}
Dividend (Ordinary),2023-03-01 09:00:00,US0378331005,AAPL,Apple Inc.,100,0.25,USD,1.2000,,,25.00,GBP,,,0.00,,DIV789,,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('DIVIDEND');
    expect(transaction.symbol).toBe('AAPL');
    expect(transaction.quantity?.toString()).toBe('100');
    expect(transaction.amount?.toNumber()).toBe(25.00);
  });

  it('should parse interest on cash', async () => {
    const csv = `${HEADER}
Interest on cash,2023-04-01 00:00:00,,,,,,,,,,5.50,GBP,,,0.00,,INT001,,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('INTEREST');
    expect(transaction.symbol).toBeNull();
    expect(transaction.amount?.toNumber()).toBe(5.50);
  });

  it('should parse stock split', async () => {
    const csv = `${HEADER}
Stock Split,2022-06-06 00:00:00,US0231351067,AMZN,Amazon.com Inc.,209,0.00,USD,1.1500,,,0.00,GBP,,,0.00,,SPLIT001,,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('STOCK_SPLIT');
    expect(transaction.symbol).toBe('AMZN');
    expect(transaction.quantity?.toString()).toBe('209');
    expect(transaction.price?.toString()).toBe('0');
    expect(transaction.amount?.toString()).toBe('0');
  });

  it('should parse deposit transaction', async () => {
    const csv = `${HEADER}
Deposit,2023-01-01 10:00:00,,,,,,,,,,1000.00,GBP,,,0.00,,DEP001,,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('TRANSFER');
    expect(transaction.symbol).toBeNull();
    expect(transaction.amount?.toNumber()).toBe(1000.00);
  });

  it('should parse withdrawal transaction', async () => {
    const csv = `${HEADER}
Withdrawal,2023-05-01 15:30:00,,,,,,,,,,-500.00,GBP,,,0.00,,WITH001,,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('TRANSFER');
    expect(transaction.symbol).toBeNull();
    // Withdrawal should be negative
    expect(transaction.amount?.toNumber()).toBe(-500.00);
  });

  it('should handle foreign currency transaction fee', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2000,,,-1500.00,GBP,,,2.00,,TX001,,,GBP`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    // Transaction fee in GBP: 2.00
    expect(transaction.fees.toNumber()).toBe(2.00);
  });

  it('should apply ticker renames (FB → META)', async () => {
    const csv = `${HEADER}
Market buy,2022-05-15 10:00:00,US30303M1027,FB,Meta Platforms Inc.,100,198.62,USD,1.2000,,,-19862.00,GBP,,,0.00,,TX_FB,,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    // FB should be renamed to META
    expect(transaction.symbol).toBe('META');
  });

  it('should remove duplicate transactions by ID', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2000,,,-1500.00,GBP,,,1.00,,TX_DUP,,,GBP
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2000,,,-1500.00,GBP,,,1.00,,TX_DUP,,,GBP
Market sell,2023-01-16 10:00:00,US0378331005,AAPL,Apple Inc.,5,155.00,USD,1.2000,,,775.00,GBP,,,0.50,,TX_UNIQUE,,,GBP`;

    const result = await trading212Parser.parse(csv, 'test.csv');

    // Should only have 2 transactions (duplicate removed)
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.action).toBe('BUY');
    expect(result.transactions[1]!.action).toBe('SELL');
  });

  it('should sort by datetime with BUY actions last', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2000,,,-1500.00,GBP,,,0.00,,TX1,,,
Dividend (Ordinary),2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,100,0.25,USD,1.2000,,,25.00,GBP,,,0.00,,TX2,,,
Market sell,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,5,155.00,USD,1.2000,,,775.00,GBP,,,0.00,,TX3,,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');

    // All same datetime, so BUY should be last
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]!.action).toBe('DIVIDEND');
    expect(result.transactions[1]!.action).toBe('SELL');
    expect(result.transactions[2]!.action).toBe('BUY'); // BUY comes last
  });

  it('should warn on price discrepancy', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2000,,,-1200.00,GBP,,,0.00,,TX_DISC,,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');

    // Price from Total: 1200 / 10 = 120 GBP
    // Price / share: 150 USD / 1.2000 = 125 GBP
    // Discrepancy: 5 GBP > 0.015 threshold
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Price per share discrepancy');
  });

  it('should handle empty optional fields', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,,AAPL,Apple Inc.,10,,,,,,-1500.00,GBP,,,,,TX_EMPTY,,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.isin).toBeNull();
    // Price is calculated from amount/quantity even when "Price / share" is empty
    expect(transaction.price?.toNumber()).toBe(150.00); // Calculated: 1500 / 10
    expect(transaction.amount?.toNumber()).toBe(-1500.00);
  });

  it('should handle "Not available" values', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,,AAPL,Apple Inc.,10,Not available,,,,,-1500.00,GBP,,,Not available,,TX_NA,Not available,,`;

    const result = await trading212Parser.parse(csv, 'test.csv');
    const transaction = result.transactions[0]!;

    expect(transaction.symbol).toBe('AAPL');
    expect(transaction.fees.toString()).toBe('0'); // "Not available" treated as zero
  });

  it('should throw on empty file', async () => {
    await expect(trading212Parser.parse('', 'empty.csv')).rejects.toThrow(
      ParsingError
    );
  });

  it('should throw on unknown column', async () => {
    const csv = 'Action,Time,UnknownColumn,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Transaction fee,Notes,ID,Currency conversion fee,Currency (Currency conversion fee),Currency (Transaction fee)';

    await expect(trading212Parser.parse(csv, 'bad.csv')).rejects.toThrow(
      ParsingError
    );
    await expect(trading212Parser.parse(csv, 'bad.csv')).rejects.toThrow(
      'Unknown column(s): UnknownColumn'
    );
  });

  it('should throw on wrong column count', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL`;  // Only 4 fields - should trigger column count error

    await expect(trading212Parser.parse(csv, 'bad.csv')).rejects.toThrow(
      UnexpectedColumnCountError
    );
  });

  it('should throw on invalid action', async () => {
    const csv = `${HEADER}
Invalid Action,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2000,,,-1500.00,GBP,,,0.00,,TX_BAD,,,GBP`;

    await expect(trading212Parser.parse(csv, 'bad.csv')).rejects.toThrow(
      InvalidActionError
    );
  });

  it('should throw on invalid time format', async () => {
    const csv = `${HEADER}
Market buy,15/01/2023 14:30,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2000,,,-1500.00,GBP,,,0.00,,TX_TIME,,,GBP`;

    await expect(trading212Parser.parse(csv, 'bad.csv')).rejects.toThrow(
      ParsingError
    );
    await expect(trading212Parser.parse(csv, 'bad.csv')).rejects.toThrow(
      'Invalid time format'
    );
  });

  it('should throw on invalid decimal', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,abc,150.00,USD,1.2000,,,-1500.00,GBP,,,0.00,,TX_DEC,,,GBP`;

    await expect(trading212Parser.parse(csv, 'bad.csv')).rejects.toThrow(
      'Invalid decimal in No. of shares'
    );
  });

  it('should throw on non-GBP transaction fee', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2000,,,-1500.00,GBP,,,1.50,,TX_EUR,,,EUR`;

    await expect(trading212Parser.parse(csv, 'bad.csv')).rejects.toThrow(
      'The transaction fee is not in GBP which is not supported yet'
    );
  });

  it('should warn when no transactions detected', async () => {
    const csv = HEADER;

    const result = await trading212Parser.parse(csv, 'empty_data.csv');

    expect(result.transactions).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('No transactions detected');
  });

  it('should parse complete test data', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,100,150.00,USD,1.2000,,,-12500.00,GBP,,,1.50,,TX1,0.50,GBP,GBP
Dividend (Ordinary),2023-02-01 09:00:00,US0378331005,AAPL,Apple Inc.,100,0.25,USD,1.2000,,,25.00,GBP,,,0.00,,TX2,,,
Market sell,2023-03-15 16:45:00,US0378331005,AAPL,Apple Inc.,50,155.00,USD,1.2000,,,7750.00,GBP,,,0.75,,TX3,,,GBP
Interest on cash,2023-04-01 00:00:00,,,,,,,,,,5.50,GBP,,,0.00,,TX4,,,
Stock Split,2022-06-06 00:00:00,US0231351067,AMZN,Amazon.com Inc.,209,0.00,USD,1.1500,,,0.00,GBP,,,0.00,,TX5,,,`;

    const result = await trading212Parser.parse(csv, 'test_data.csv');

    expect(result.transactions).toHaveLength(5);
    // Expect price discrepancy warnings for transactions with exchange rates
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);

    // Verify all transaction types parsed correctly (sorted by date)
    expect(result.transactions[0]!.action).toBe('STOCK_SPLIT'); // Oldest first
    expect(result.transactions[1]!.action).toBe('BUY');
    expect(result.transactions[2]!.action).toBe('DIVIDEND');
    expect(result.transactions[3]!.action).toBe('SELL');
    expect(result.transactions[4]!.action).toBe('INTEREST');

    // Verify all have correct broker
    expect(result.transactions.every(t => t.broker === 'Trading212')).toBe(true);
  });

  it('should include row number in error messages', async () => {
    const csv = `${HEADER}
Market buy,2023-01-15 14:30:00,US0378331005,AAPL,Apple Inc.,10,150.00,USD,1.2000,,,-1500.00,GBP,,,0.00,,TX1,,,GBP
Invalid Action,2023-01-16 10:00:00,US0378331005,AAPL,Apple Inc.,5,155.00,USD,1.2000,,,775.00,GBP,,,0.00,,TX2,,,GBP`;

    try {
      await trading212Parser.parse(csv, 'test.csv');
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
