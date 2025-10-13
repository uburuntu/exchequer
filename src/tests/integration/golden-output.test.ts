/**
 * Golden Output Integration Tests
 *
 * Tests end-to-end calculation with real broker CSVs and validates
 * against known golden outputs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CapitalGainsCalculator } from '../../lib/calculator/calculator';
import { schwabParser } from '../../lib/parsers/schwab';
import { trading212Parser } from '../../lib/parsers/trading212';
import { mssbParser } from '../../lib/parsers/mssb';
import { CurrencyConverter } from '../../lib/services/currency-converter';
import type { BrokerTransaction } from '../../lib/types';
import Decimal from 'decimal.js-light';
import Papa from 'papaparse';

const FIXTURES_PATH = join(__dirname, '../fixtures/data');
const EXCHANGE_RATES_FILE = join(__dirname, '../fixtures/exchange_rates.csv');

function readTestFile(relativePath: string): string {
  return readFileSync(join(FIXTURES_PATH, relativePath), 'utf-8');
}

interface ExchangeRate {
  month: string;
  currency: string;
  rate: string;
}

function loadExchangeRates(): Map<string, Map<string, Decimal>> {
  const csvContent = readFileSync(EXCHANGE_RATES_FILE, 'utf-8');
  const parsed = Papa.parse<ExchangeRate>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  // Group rates by exact date (YYYY-MM-DD)
  const ratesByDate = new Map<string, Map<string, Decimal>>();

  for (const row of parsed.data) {
    if (row.currency && row.month && row.rate) {
      // Use full date string as key (e.g., "2020-06-02")
      const dateKey = row.month;

      if (!ratesByDate.has(dateKey)) {
        ratesByDate.set(dateKey, new Map());
      }

      ratesByDate.get(dateKey)!.set(row.currency, new Decimal(row.rate));
    }
  }

  return ratesByDate;
}

describe('Golden Output Tests - Multi-Broker End-to-End', () => {
  beforeEach(() => {
    // Load real HMRC exchange rates from CSV file (grouped by month)
    const exchangeRates = loadExchangeRates();

    // Mock currency converter to use the real HMRC rates (monthly lookup)
    const mockGetRate = vi.spyOn(CurrencyConverter.prototype, 'getRate');
    mockGetRate.mockImplementation(async (currency: string, date: Date) => {
      if (currency === 'GBP') {
        return new Decimal(1);
      }

      // Get exact date from transaction date (YYYY-MM-DD)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      const yearMonth = `${year}-${month}`;

      // Try exact date first
      let dateRates = exchangeRates.get(dateKey);

      // If exact date not found, find any date in the same year-month
      // (HMRC API returns monthly rates, so all dates in a month have same rate)
      if (!dateRates) {
        for (const [key, rates] of exchangeRates.entries()) {
          if (key.startsWith(yearMonth)) {
            dateRates = rates;
            break;
          }
        }
      }

      if (!dateRates) {
        console.error(`Missing exchange rates for date ${dateKey} (or month ${yearMonth})`);
        throw new Error(`Missing exchange rates for date ${dateKey} (or month ${yearMonth})`);
      }

      const rate = dateRates.get(currency);
      if (!rate) {
        console.error(`Missing ${currency} rate for date ${dateKey}`);
        throw new Error(`Missing ${currency} rate for date ${dateKey}`);
      }

      return rate;
    });
  });

  it('should match golden output for 2020/2021 tax year with Schwab + Trading212 + MSSB', async () => {
    // Expected:
    // - 27 broker transactions total
    // - Tax year: 2020/2021
    // - Capital gain: £25170.57
    // - Capital loss: £0.00
    // - Number of disposals: 4
    // - Disposal proceeds: £43836.90
    // - Allowable costs: £18666.33

    const taxYear = 2020; // 2020/2021 tax year

    // Parse all broker files
    const schwabCsv = readTestFile('schwab/schwab_transactions.csv');
    const schwabResult = await schwabParser.parse(schwabCsv, 'schwab_transactions.csv');

    const trading212Csv = readTestFile('trading212/from_2020-09-11_to_2021-04-02.csv');
    const trading212Result = await trading212Parser.parse(
      trading212Csv,
      'from_2020-09-11_to_2021-04-02.csv'
    );

    const mssbReleases = readTestFile('morgan_stanley/Releases Report.csv');
    const mssbReleasesResult = await mssbParser.parse(mssbReleases, 'Releases Report.csv');

    const mssbWithdrawals = readTestFile('morgan_stanley/Withdrawals Report.csv');
    const mssbWithdrawalsResult = await mssbParser.parse(mssbWithdrawals, 'Withdrawals Report.csv');

    // Combine all transactions
    const allTransactions = [
      ...schwabResult.transactions,
      ...trading212Result.transactions,
      ...mssbReleasesResult.transactions,
      ...mssbWithdrawalsResult.transactions,
    ];

    // Verify we got 27 transactions
    expect(allTransactions).toHaveLength(27);

    // Sort by date (acquisitions before disposals on same day)
    allTransactions.sort((a, b) => {
      const dateCompare = a.date.getTime() - b.date.getTime();
      if (dateCompare !== 0) return dateCompare;

      // Same day: SELL before BUY to avoid negative balance
      const actionOrder: Record<string, number> = {
        SELL: 0,
        BUY: 1,
        STOCK_ACTIVITY: 2,
        DIVIDEND: 3,
        INTEREST: 4,
      };
      return (actionOrder[a.action] || 99) - (actionOrder[b.action] || 99);
    });

    // Create calculator and add transactions
    const calculator = new CapitalGainsCalculator({ taxYear });

    // Build initial ISIN map from existing transactions
    const isinMap = new Map<string, string>();
    for (const txn of allTransactions) {
      if (txn.isin && txn.symbol) {
        isinMap.set(txn.isin, txn.symbol);
      }
    }

    for (const txn of allTransactions) {
      if (txn.action === 'BUY' || txn.action === 'STOCK_ACTIVITY') {
        await calculator.addAcquisition(txn);
      } else if (txn.action === 'SELL') {
        await calculator.addDisposal(txn);
      } else if (txn.action === 'DIVIDEND') {
        calculator.addDividend(txn);
      } else if (txn.action === 'INTEREST') {
        calculator.addInterest(txn);
      }
      // Other actions (TRANSFER, etc.) are not processed
    }

    // Step 2b: Process ERI (Excess Reported Income)
    // Load ERI from resources/eri/*.csv and initial_isin_translation.csv to map symbols

    // Load initial_isin_translation.csv
    const isinTranslationContent = readFileSync(join(FIXTURES_PATH, 'initial_isin_translation.csv'), 'utf-8');

    // Parse ISIN translation file manually to handle multiple symbols
    const isinToSymbols = new Map<string, Set<string>>();
    const isinLines = isinTranslationContent.split('\n');
    for (const line of isinLines) {
      if (!line.trim() || line.startsWith('ISIN')) continue;
      const parts = line.split(',').map(s => s.trim()).filter(s => s.length > 0);
      const isin = parts[0]!;
      const symbols = parts.slice(1);

      if (!isinToSymbols.has(isin)) {
        isinToSymbols.set(isin, new Set());
      }
      for (const s of symbols) {
        isinToSymbols.get(isin)!.add(s);
      }
    }

    // Also add isinMap from transactions (highest priority?)
    for (const [isin, sym] of isinMap) {
      if (!isinToSymbols.has(isin)) {
        isinToSymbols.set(isin, new Set());
      }
      isinToSymbols.get(isin)!.add(sym);
    }

    // Collect all symbols we care about (from transactions)
    const trackedSymbols = new Set<string>();
    for (const txn of allTransactions) {
      if (txn.symbol) trackedSymbols.add(txn.symbol);
    }

    // Read and parse Vanguard ERI file
    const eriFileContent = readFileSync(join(FIXTURES_PATH, 'eri/vanguard_eri.csv'), 'utf-8');
    const eriParsed = Papa.parse<{ ISIN: string; 'Fund Reporting Period End Date': string; Currency: string; 'Excess of reporting income over distribution': string }>(eriFileContent, {
      header: true,
      skipEmptyLines: true,
    });

    for (const row of eriParsed.data) {
      const isin = row.ISIN;
      const potentialSymbols = isinToSymbols.get(isin);

      if (!potentialSymbols) continue;

      // Find which symbol(s) we actually hold/track
      for (const symbol of potentialSymbols) {
        if (!trackedSymbols.has(symbol)) continue;

        // Found a match! Process ERI for this symbol.
        const dateStr = row['Fund Reporting Period End Date'];
        if (!dateStr) continue;
        const dateParts = dateStr.split('/');
        if (dateParts.length !== 3) continue;

        const year = dateParts[2];
        const month = dateParts[1];
        const day = dateParts[0];

        if (!year || !month || !day) continue;

        // Format is DD/MM/YYYY. Create date using UTC to avoid timezone issues
        const date = new Date(Date.UTC(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day)
        ));

        const amount = new Decimal(row['Excess of reporting income over distribution']);

        // Skip zero amounts
        if (amount.isZero()) continue;

        // ERI transaction
        const eriTxn: BrokerTransaction = {
          date,
          action: 'EXCESS_REPORTED_INCOME' as any, // Cast because likely not exported in test context or strict enum match issue
          symbol,
          description: `ERI for ${symbol}`,
          quantity: null,
          price: null,
          fees: new Decimal(0),
          amount, // Positive amount for ERI income
          currency: row.Currency,
          broker: 'Vanguard (ERI)',
          isin
        }

        // Add ERI transaction to calculator
        calculator.addEri(eriTxn);
      }
    }

    // Calculate and validate against golden output
    const report = await calculator.calculateCapitalGain();

    // Verify report structure and values
    expect(report.taxYear).toBe(2020);

    // Golden output expectations:
    // Capital gain: £25170.57
    // Capital loss: £0.00
    // Number of disposals: 4

    // Validate capital gains - MUST match exactly for tax calculations
    const capitalGain = Number(report.capitalGain.toString());
    const capitalLoss = Number(report.capitalLoss.toString());

    console.log('=== GOLDEN OUTPUT VALIDATION ===');
    console.log('Calculated Capital Gain:', capitalGain);
    console.log('Expected Capital Gain:', 25170.57);
    console.log('Difference:', Math.abs(capitalGain - 25170.57));
    console.log('Calculated Capital Loss:', capitalLoss);
    console.log('Expected Capital Loss:', 0);
    console.log('\n=== DETAILED BREAKDOWN ===');

    // Log each disposal calculation
    let totalGainFromLog = 0;
    for (const [dateKey, symbolMap] of report.calculationLog.entries()) {
      for (const [symbol, entries] of symbolMap.entries()) {
        for (const entry of entries) {
          if (entry.gain !== undefined && entry.gain !== null) {
            const gainValue = Number(entry.gain.toString());
            const amount = Number(entry.amount.toString());
            const cost = Number(entry.allowableCost?.toString() || '0');
            const qty = Number(entry.quantity.toString());
            console.log(`${dateKey} - ${symbol}: gain=${gainValue}, proceeds=${amount}, cost=${cost}, quantity=${qty}`);
            totalGainFromLog += gainValue;
          }
        }
      }
    }
    console.log('Sum of gains from calculation log:', totalGainFromLog);
    console.log('=================================');

    // Validate exact match for tax calculations
    expect(capitalGain).toBe(25170.57);
    expect(capitalLoss).toBe(0);

    // Validate portfolio holdings at end of tax year
    // Expected:
    // VUAG: 30.50 shares
    // VNRG: 1.00 shares
    // NVDA: 1.00 shares
    // GOOG: 172.00 shares

    const vuagPosition = report.portfolio.get('VUAG');
    expect(vuagPosition).toBeDefined();
    expect(Number(vuagPosition?.quantity.toString())).toBeCloseTo(30.5, 2);

    const vnrgPosition = report.portfolio.get('VNRG');
    expect(vnrgPosition).toBeDefined();
    expect(Number(vnrgPosition?.quantity.toString())).toBeCloseTo(1.0, 2);

    const nvdaPosition = report.portfolio.get('NVDA');
    expect(nvdaPosition).toBeDefined();
    expect(Number(nvdaPosition?.quantity.toString())).toBeCloseTo(1.0, 2);

    const googPosition = report.portfolio.get('GOOG');
    expect(googPosition).toBeDefined();
    expect(Number(googPosition?.quantity.toString())).toBeCloseTo(172.0, 2);

    // Verify calculation completed successfully
    expect(report.calculationLog).toBeDefined();
    expect(report.calculationLog.size).toBeGreaterThan(0);
  });
});
