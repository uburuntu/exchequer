/**
 * Sharesight parser tests
 *
 * Tests the Sharesight transaction parser (multi-section CSV).
 */

import { describe, it, expect } from 'vitest';
import { sharesightParser } from '../lib/parsers/sharesight';

describe('Sharesight Parser', () => {
  it('should throw ParsingError for missing local dividend column', async () => {
    // Missing "Gross Dividend" column
    const csv = `Test Portfolio

Local Income

Dividend Payments
Code,Name,Date Paid,Net Dividend,Tax Deducted,Tax Credit,Comments
ABC,Example,01/01/2020,10,0,0,Note
Total`;

    await expect(sharesightParser.parse(csv, 'Taxable Income Report.csv')).rejects.toThrow(
      'Missing expected columns in Sharesight local dividend header: Gross Dividend'
    );
  });

  it('should throw ParsingError for missing foreign dividend column', async () => {
    // Missing "Foreign Tax Deducted" column
    const csv = `Test Portfolio

Foreign Income
Code,Name,Date Paid,Exchange Rate,Currency,Net Amount,Gross Amount,Comments
ABC,Example,01/02/2020,1.23,USD,10,12,Note
Total`;

    await expect(sharesightParser.parse(csv, 'Taxable Income Report.csv')).rejects.toThrow(
      'Missing expected columns in Sharesight foreign dividend header: Foreign Tax Deducted'
    );
  });

  it('should throw ParsingError for missing trade column', async () => {
    // Missing "Value" column
    const csv = `Market,Code,Name,Type,Date,Quantity,Price *,Brokerage *,Currency,Exchange Rate,Comments
NASDAQ,ABC,Example,Buy,01/01/2020,1,100,0,USD,1.2,Note`;

    await expect(sharesightParser.parse(csv, 'All Trades Report.csv')).rejects.toThrow(
      'Missing expected columns in Sharesight trades header: Value'
    );
  });

  it('should throw ParsingError for invalid decimal with row context', async () => {
    // Invalid quantity "oops"
    const csv = `Market,Code,Name,Type,Date,Quantity,Price *,Brokerage *,Currency,Exchange Rate,Value,,Comments
NASDAQ,ABC,Example,Buy,01/01/2020,oops,100,0,USD,1.2,1000,,Note`;

    await expect(sharesightParser.parse(csv, 'All Trades Report.csv')).rejects.toThrow(
      'Invalid decimal'
    );
  });
});
