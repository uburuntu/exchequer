/**
 * Schwab Cancel Buy filtering tests
 *
 * Tests the filtering of Cancel Buy transactions and their matching with original
 * Buy transactions within the search window.
 *
 * Cancel Buy is a Schwab-specific transaction type that indicates a purchase was
 * cancelled. Both the original Buy and the Cancel Buy are mapped to ActionType.BUY,
 * and both need to be filtered out to avoid incorrect capital gains calculations.
 */

import { describe, it, expect } from 'vitest';
import { schwabParser } from '../lib/parsers/schwab';

const HEADER = 'Date,Action,Symbol,Description,Price,Quantity,Fees & Comm,Amount';

describe('Schwab Parser - Cancel Buy Filtering', () => {
  it('should remove both Cancel Buy and original Buy transactions', async () => {
    const csv = `${HEADER}
01/10/2024,Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00
01/12/2024,Cancel Buy,AAPL,APPLE INC,$150.00,10,$0.00,$0.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // Both transactions should be removed
    expect(result.transactions).toHaveLength(0);
  });

  it('should only match Cancel Buy within 5-day window', async () => {
    const csv = `${HEADER}
01/01/2024,Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00
01/10/2024,Cancel Buy,AAPL,APPLE INC,$150.00,10,$0.00,$0.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // 9 days apart - Cancel Buy won't match, both should remain
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.action).toBe('BUY');
    expect(result.transactions[1]!.action).toBe('BUY'); // Cancel Buy mapped to BUY
  });

  it('should match exact symbol, quantity, and price', async () => {
    const csv = `${HEADER}
01/10/2024,Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00
01/10/2024,Buy,AAPL,APPLE INC,$151.00,10,$0.00,-$1510.00
01/12/2024,Cancel Buy,AAPL,APPLE INC,$150.00,10,$0.00,$0.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // Only the first Buy should be removed (exact price match)
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.price?.toNumber()).toBe(151.00);
  });

  it('should not match different symbol', async () => {
    const csv = `${HEADER}
01/10/2024,Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00
01/12/2024,Cancel Buy,MSFT,MICROSOFT CORP,$150.00,10,$0.00,$0.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // Different symbols - no match, both remain
    expect(result.transactions).toHaveLength(2);
  });

  it('should work with fractional shares', async () => {
    const csv = `${HEADER}
01/10/2024,Buy,AAPL,APPLE INC,$150.00,10.5,$0.00,-$1575.00
01/12/2024,Cancel Buy,AAPL,APPLE INC,$150.00,10.5,$0.00,$0.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // Both should be removed (exact fractional quantity match)
    expect(result.transactions).toHaveLength(0);
  });

  it('should handle multiple Cancel Buys for same symbol', async () => {
    const csv = `${HEADER}
01/10/2024,Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00
01/11/2024,Buy,AAPL,APPLE INC,$151.00,20,$0.00,-$3020.00
01/12/2024,Cancel Buy,AAPL,APPLE INC,$150.00,10,$0.00,$0.00
01/13/2024,Cancel Buy,AAPL,APPLE INC,$151.00,20,$0.00,$0.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // All should be removed
    expect(result.transactions).toHaveLength(0);
  });

  it('should not affect unrelated transactions', async () => {
    const csv = `${HEADER}
01/09/2024,Buy,MSFT,MICROSOFT CORP,$200.00,5,$0.00,-$1000.00
01/10/2024,Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00
01/11/2024,Sell,MSFT,MICROSOFT CORP,$205.00,5,$0.00,$1025.00
01/12/2024,Cancel Buy,AAPL,APPLE INC,$150.00,10,$0.00,$0.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // Only AAPL Buy and Cancel Buy removed, MSFT transactions remain
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.every(txn => txn.symbol === 'MSFT')).toBe(true);
  });

  it('should match within 5-day boundary (0-5 days)', async () => {
    // Test all days from 0 to 5
    for (const daysApart of [0, 1, 2, 3, 4, 5]) {
      const buyDate = new Date('2024-01-10');
      const cancelDate = new Date(buyDate);
      cancelDate.setDate(cancelDate.getDate() + daysApart);

      const csv = `${HEADER}
${formatDate(buyDate)},Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00
${formatDate(cancelDate)},Cancel Buy,AAPL,APPLE INC,$150.00,10,$0.00,$0.00`;

      const result = await schwabParser.parse(csv, 'test.csv');

      // Within 5 days - should match and remove both
      expect(result.transactions).toHaveLength(0);
    }
  });

  it('should not match beyond 5-day window (6+ days)', async () => {
    const buyDate = new Date('2024-01-10');
    const cancelDate = new Date(buyDate);
    cancelDate.setDate(cancelDate.getDate() + 6);

    const csv = `${HEADER}
${formatDate(buyDate)},Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00
${formatDate(cancelDate)},Cancel Buy,AAPL,APPLE INC,$150.00,10,$0.00,$0.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // 6 days apart - no match, both remain
    expect(result.transactions).toHaveLength(2);
  });

  it('should not affect normal transactions when no Cancel Buy present', async () => {
    const csv = `${HEADER}
01/10/2024,Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00
01/15/2024,Sell,AAPL,APPLE INC,$155.00,10,$0.00,$1550.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    // No Cancel Buy - both transactions remain (sorted: BUY before SELL on same day)
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.action).toBe('SELL'); // SELL comes first after sorting
    expect(result.transactions[1]!.action).toBe('BUY');
  });
});

// Helper function to format date as MM/DD/YYYY
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}
