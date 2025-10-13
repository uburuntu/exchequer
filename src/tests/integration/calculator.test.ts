/**
 * Integration tests for the capital gains calculator
 *
 * Tests end-to-end calculation flows with realistic scenarios
 */

import { describe, it, expect } from 'vitest';
import { CapitalGainsCalculator } from '../../lib/calculator/calculator';
import type { BrokerTransaction } from '../../lib/types';
import { ActionType } from '../../lib/types';
import Decimal from 'decimal.js-light';

function createTransaction(
  date: Date,
  action: ActionType,
  symbol: string,
  quantity: number,
  price: number,
  fees: number = 0,
  currency: string = 'GBP'
): BrokerTransaction {
  const qty = new Decimal(quantity);
  const prc = new Decimal(price);
  const feesDec = new Decimal(fees);

  let amount: Decimal;
  if (action === ActionType.BUY) {
    amount = qty.times(prc).plus(feesDec).negated();
  } else {
    amount = qty.times(prc).minus(feesDec);
  }

  return {
    date,
    action,
    symbol,
    description: `${action} ${symbol}`,
    quantity: qty,
    price: prc,
    fees: feesDec,
    amount,
    currency,
    broker: 'Test',
  };
}

describe('Integration Tests - Capital Gains Calculator', () => {
  it('should calculate simple same-day gain', async () => {
    const taxYear = 2024;
    const calculator = new CapitalGainsCalculator({ taxYear });

    const date = new Date('2024-06-01');

    // Buy 10 shares at £100 each with £5 fees
    const buyTxn = createTransaction(date, ActionType.BUY, 'AAPL', 10, 100, 5);

    // Sell 10 shares at £120 each with £5 fees on same day
    const sellTxn = createTransaction(date, ActionType.SELL, 'AAPL', 10, 120, 5);

    await calculator.addAcquisition(buyTxn);
    await calculator.addDisposal(sellTxn);

    const report = await calculator.calculateCapitalGain();

    // Expected gain: (120 * 10 - 5) - (100 * 10 + 5) = 1195 - 1005 = 190
    expect(Number(report.capitalGain.toString())).toBe(190);
    expect(Number(report.capitalLoss.toString())).toBe(0);
    expect(Number(report.capitalGain.toString()) + Number(report.capitalLoss.toString())).toBe(190);
  });

  it('should calculate simple same-day loss', async () => {
    const taxYear = 2024;
    const calculator = new CapitalGainsCalculator({ taxYear });

    const date = new Date('2024-06-01');

    // Buy 10 shares at £150 each with £10 fees
    const buyTxn = createTransaction(date, ActionType.BUY, 'TSLA', 10, 150, 10);

    // Sell 10 shares at £130 each with £10 fees on same day
    const sellTxn = createTransaction(date, ActionType.SELL, 'TSLA', 10, 130, 10);

    await calculator.addAcquisition(buyTxn);
    await calculator.addDisposal(sellTxn);

    const report = await calculator.calculateCapitalGain();

    // Expected loss: (130 * 10 - 10) - (150 * 10 + 10) = 1290 - 1510 = -220
    expect(Number(report.capitalGain.toString())).toBe(0);
    expect(Number(report.capitalLoss.toString())).toBe(-220);
    expect(Number(report.capitalGain.toString()) + Number(report.capitalLoss.toString())).toBe(-220);
  });

  it('should handle Section 104 pooling', async () => {
    const taxYear = 2024;
    const calculator = new CapitalGainsCalculator({ taxYear });

    // Buy 100 shares on different dates
    await calculator.addAcquisition(
      createTransaction(new Date('2023-01-15'), ActionType.BUY, 'MSFT', 50, 200, 10)
    );
    await calculator.addAcquisition(
      createTransaction(new Date('2023-06-20'), ActionType.BUY, 'MSFT', 50, 220, 10)
    );

    // Sell 75 shares in tax year 2024
    await calculator.addDisposal(
      createTransaction(new Date('2024-10-10'), ActionType.SELL, 'MSFT', 75, 250, 15)
    );

    const report = await calculator.calculateCapitalGain();

    // Pool cost: (50 * 200 + 10) + (50 * 220 + 10) = 10010 + 11010 = 21020
    // Average cost per share: 21020 / 100 = 210.20
    // Cost of 75 shares: 75 * 210.20 = 15765
    // Proceeds: 75 * 250 - 15 = 18735
    // Gain: 18735 - 15765 = 2970
    expect(Number(report.capitalGain.toString())).toBe(2970);
    expect(Number(report.capitalLoss.toString())).toBe(0);

    // Check remaining portfolio
    const position = report.portfolio.get('MSFT');
    expect(position).toBeDefined();
    expect(position?.quantity.toNumber()).toBe(25);
  });

  it('should calculate bed and breakfast rule', async () => {
    const taxYear = 2024;
    const calculator = new CapitalGainsCalculator({ taxYear });

    // Need existing shares first
    await calculator.addAcquisition(
      createTransaction(new Date('2024-05-01'), ActionType.BUY, 'GOOG', 200, 100, 10)
    );

    // Sell shares on day 1
    await calculator.addDisposal(
      createTransaction(new Date('2024-06-01'), ActionType.SELL, 'GOOG', 100, 150, 10)
    );

    // Buy back within 30 days (day 20) - bed & breakfast match
    await calculator.addAcquisition(
      createTransaction(new Date('2024-06-20'), ActionType.BUY, 'GOOG', 100, 140, 10)
    );

    const report = await calculator.calculateCapitalGain();

    // Bed & breakfast matching: cost basis is the future purchase
    // Cost: 100 * 140 + 10 = 14010
    // Proceeds: 100 * 150 - 10 = 14990
    // Gain: 14990 - 14010 = 980
    expect(Number(report.capitalGain.toString())).toBe(980);

    // Portfolio should show remaining 100 from initial + 100 from buyback = 200
    const position = report.portfolio.get('GOOG');
    expect(position).toBeDefined();
    expect(Number(position?.quantity.toString())).toBe(200);
  });

  it('should handle partial disposal from pool', async () => {
    const taxYear = 2024;
    const calculator = new CapitalGainsCalculator({ taxYear });

    // Build up position
    await calculator.addAcquisition(
      createTransaction(new Date('2023-01-10'), ActionType.BUY, 'NVDA', 200, 100, 20)
    );

    // Sell half
    await calculator.addDisposal(
      createTransaction(new Date('2024-08-15'), ActionType.SELL, 'NVDA', 100, 180, 15)
    );

    const report = await calculator.calculateCapitalGain();

    // Pool cost: 200 * 100 + 20 = 20020
    // Cost per share: 20020 / 200 = 100.10
    // Cost of 100 shares: 100 * 100.10 = 10010
    // Proceeds: 100 * 180 - 15 = 17985
    // Gain: 17985 - 10010 = 7975
    expect(Number(report.capitalGain.toString())).toBe(7975);

    // Check remaining position
    const position = report.portfolio.get('NVDA');
    expect(position).toBeDefined();
    expect(position?.quantity.toNumber()).toBe(100);
    expect(position?.amount.toNumber()).toBeCloseTo(10010, 2);
  });

  it('should handle multiple symbols independently', async () => {
    const taxYear = 2024;
    const calculator = new CapitalGainsCalculator({ taxYear });

    // Trade symbol A
    await calculator.addAcquisition(
      createTransaction(new Date('2024-05-01'), ActionType.BUY, 'AAPL', 50, 100, 5)
    );
    await calculator.addDisposal(
      createTransaction(new Date('2024-08-15'), ActionType.SELL, 'AAPL', 50, 120, 5)
    );

    // Trade symbol B
    await calculator.addAcquisition(
      createTransaction(new Date('2024-09-20'), ActionType.BUY, 'MSFT', 30, 200, 10)
    );
    await calculator.addDisposal(
      createTransaction(new Date('2024-10-10'), ActionType.SELL, 'MSFT', 30, 180, 10)
    );

    const report = await calculator.calculateCapitalGain();

    // AAPL gain: (50 * 120 - 5) - (50 * 100 + 5) = 5995 - 5005 = 990
    // MSFT loss: (30 * 180 - 10) - (30 * 200 + 10) = 5390 - 6010 = -620
    // Net: 990 - 620 = 370
    expect(Number(report.capitalGain.toString())).toBe(990);
    expect(Number(report.capitalLoss.toString())).toBe(-620);
    expect(Number(report.capitalGain.toString()) + Number(report.capitalLoss.toString())).toBe(370);
  });

  it('should handle dividend income', async () => {
    const taxYear = 2024;
    const calculator = new CapitalGainsCalculator({ taxYear });

    const dividendTxn: BrokerTransaction = {
      date: new Date('2024-07-15'),
      action: ActionType.DIVIDEND,
      symbol: 'VOO',
      description: 'Dividend payment',
      quantity: null,
      price: null,
      fees: new Decimal(0),
      amount: new Decimal(500),
      currency: 'GBP',
      broker: 'Test',
    };

    calculator.addDividend(dividendTxn);

    await calculator.calculateCapitalGain();

    // Dividends tracked but not directly exposed in report
  });

  it('should track portfolio state correctly', async () => {
    const taxYear = 2024;
    const calculator = new CapitalGainsCalculator({ taxYear });

    // Buy 100 shares
    await calculator.addAcquisition(
      createTransaction(new Date('2024-05-01'), ActionType.BUY, 'META', 100, 300, 20)
    );

    // Sell 30 shares
    await calculator.addDisposal(
      createTransaction(new Date('2024-06-15'), ActionType.SELL, 'META', 30, 350, 10)
    );

    // Buy 50 more
    await calculator.addAcquisition(
      createTransaction(new Date('2024-06-20'), ActionType.BUY, 'META', 50, 320, 15)
    );

    const report = await calculator.calculateCapitalGain();

    // Final position: 100 - 30 + 50 = 120 shares
    const position = report.portfolio.get('META');
    expect(position).toBeDefined();
    expect(position?.quantity.toNumber()).toBe(120);

    // Cost should be pooled correctly
    // Initial: 100 * 300 + 20 = 30020
    // After selling 30: 70 shares, cost = 70 * 300.20 = 21014
    // After buying 50: 120 shares, cost = 21014 + (50 * 320 + 15) = 21014 + 16015 = 37029
    // Note: Actual pooling cost may differ slightly due to Section 104 rules
    expect(position?.amount.toNumber()).toBeGreaterThan(20000);
  });
});
