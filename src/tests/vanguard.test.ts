/**
 * Vanguard parser tests
 *
 * Tests the Vanguard UK transaction parser.
 */

import { describe, it, expect } from 'vitest';
import { vanguardParser } from '../lib/parsers/vanguard';

const HEADER = 'Date,Details,Amount,Balance';

describe('Vanguard Parser', () => {
  it('should parse a simple BUY transaction', async () => {
    const csv = `${HEADER}
09/03/2022,Bought 10 Foo Fund (FOO),-100.00,0`;

    const result = await vanguardParser.parse(csv, 'buy.csv');

    expect(result.transactions).toHaveLength(1);
    const transaction = result.transactions[0]!;

    expect(transaction.action).toBe('BUY');
    expect(transaction.symbol).toBe('FOO');
    expect(transaction.quantity?.toString()).toBe('10');
    expect(transaction.price?.toString()).toBe('10'); // Derived: amount/quantity
    expect(transaction.amount?.toString()).toBe('-100');
    expect(transaction.currency).toBe('GBP');
  });

  it('should throw ParsingError for invalid decimal', async () => {
    const csv = `${HEADER}
09/03/2022,Bought 10 Foo Fund (FOO),not-a-number,0`;

    await expect(vanguardParser.parse(csv, 'invalid.csv')).rejects.toThrow(
      'Invalid decimal'
    );
  });

  it('should throw ParsingError for invalid header column', async () => {
    const csv = 'Date,Details,Unexpected,Balance';

    await expect(vanguardParser.parse(csv, 'invalid_header.csv')).rejects.toThrow(
      "Expected column 3 to be 'Amount' but found 'Unexpected'"
    );
  });

  it('should throw ParsingError for empty file', async () => {
    const csv = '';

    await expect(vanguardParser.parse(csv, 'empty.csv')).rejects.toThrow(
      'Vanguard CSV file is empty'
    );
  });
});
