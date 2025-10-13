/**
 * Schwab action type mapping tests
 *
 * Tests the conversion from Schwab CSV action strings to internal ActionType enum values.
 */

import { describe, it, expect } from 'vitest';
import { schwabParser } from '../lib/parsers/schwab';

describe('Schwab Parser - Action Mapping', () => {
  it('should map "Bond Interest" to INTEREST', async () => {
    const csv = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2024,Bond Interest,,,,,,$10.50`;

    const result = await schwabParser.parse(csv, 'test.csv');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.action).toBe('INTEREST');
    expect(result.transactions[0]!.amount?.toNumber()).toBe(10.50);
  });

  it('should map "Credit Interest" to INTEREST', async () => {
    const csv = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2024,Credit Interest,,,,,,$5.25`;

    const result = await schwabParser.parse(csv, 'test.csv');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.action).toBe('INTEREST');
    expect(result.transactions[0]!.amount?.toNumber()).toBe(5.25);
  });
});
