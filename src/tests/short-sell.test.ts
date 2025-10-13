/**
 * Short Sell Tests
 *
 * Tests for short selling support in the capital gains calculator.
 * Short selling occurs when you sell shares you don't own, borrowing them first.
 * The gain/loss is calculated when you later buy shares to cover the short.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js-light';
import { CapitalGainsCalculator } from '../lib/calculator/calculator';
import { ActionType, type BrokerTransaction } from '../lib/types';

function createTransaction(
  date: string,
  action: ActionType,
  symbol: string,
  quantity: number,
  price: number,
  fees: number = 0
): BrokerTransaction {
  const qty = new Decimal(quantity);
  const prc = new Decimal(price);
  const feesDec = new Decimal(fees);

  // For BUY: amount is negative (cost outflow)
  // For SELL: amount is positive (proceeds inflow)
  const amount =
    action === ActionType.BUY
      ? qty.times(prc).plus(feesDec).negated()
      : qty.times(prc).minus(feesDec);

  return {
    date: new Date(date),
    action,
    symbol,
    description: `${action} ${symbol}`,
    quantity: qty,
    price: prc,
    fees: feesDec,
    amount,
    currency: 'GBP',
    broker: 'Test Broker',
    isin: null,
  };
}

describe('Short Sell - Basic Functionality', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2024 });
  });

  it('should allow selling without prior position (naked short)', async () => {
    // Sell 100 shares without owning any - opens a short position
    await calculator.addDisposal(
      createTransaction('2024-06-15', ActionType.SELL, 'AAPL', 100, 150, 10)
    );

    // No error should be thrown
    const report = await calculator.calculateCapitalGain();

    // No capital gain yet - short is still open
    expect(report.capitalGain.isZero()).toBe(true);
    expect(report.capitalLoss.isZero()).toBe(true);
  });

  it('should calculate gain when covering short at lower price (profit)', async () => {
    // Short sell 100 shares at £150 each
    await calculator.addDisposal(
      createTransaction('2024-06-15', ActionType.SELL, 'AAPL', 100, 150, 10)
    );

    // Cover the short by buying 100 shares at £120 each
    await calculator.addAcquisition(
      createTransaction('2024-06-20', ActionType.BUY, 'AAPL', 100, 120, 10)
    );

    const report = await calculator.calculateCapitalGain();

    // Proceeds from short: 100 * 150 - 10 = 14990
    // Cost to cover: 100 * 120 + 10 = 12010
    // Gain: 14990 - 12010 = 2980
    expect(report.capitalGain.toNumber()).toBeCloseTo(2980, 0);
  });

  it('should calculate loss when covering short at higher price', async () => {
    // Short sell 100 shares at £150 each
    await calculator.addDisposal(
      createTransaction('2024-06-15', ActionType.SELL, 'AAPL', 100, 150, 10)
    );

    // Cover the short by buying 100 shares at £180 each
    await calculator.addAcquisition(
      createTransaction('2024-06-20', ActionType.BUY, 'AAPL', 100, 180, 10)
    );

    const report = await calculator.calculateCapitalGain();

    // Proceeds from short: 100 * 150 - 10 = 14990
    // Cost to cover: 100 * 180 + 10 = 18010
    // Loss: 14990 - 18010 = -3020
    expect(report.capitalLoss.toNumber()).toBeCloseTo(-3020, 0);
  });

  it('should handle partial short covering', async () => {
    // Short sell 100 shares at £150 each
    await calculator.addDisposal(
      createTransaction('2024-06-15', ActionType.SELL, 'AAPL', 100, 150, 0)
    );

    // Cover 50 shares at £120 each
    await calculator.addAcquisition(
      createTransaction('2024-06-20', ActionType.BUY, 'AAPL', 50, 120, 0)
    );

    const report = await calculator.calculateCapitalGain();

    // Proceeds from short (50 shares): 50 * 150 = 7500
    // Cost to cover: 50 * 120 = 6000
    // Gain: 7500 - 6000 = 1500
    expect(report.capitalGain.toNumber()).toBeCloseTo(1500, 0);

    // Should still have 50 shares short (not in portfolio)
    expect(report.portfolio.has('AAPL')).toBe(false);
  });

  it('should handle over-covering a short position', async () => {
    // Short sell 50 shares at £150 each
    await calculator.addDisposal(
      createTransaction('2024-06-15', ActionType.SELL, 'AAPL', 50, 150, 0)
    );

    // Buy 100 shares at £120 each (covers 50 short + 50 go to pool)
    await calculator.addAcquisition(
      createTransaction('2024-06-20', ActionType.BUY, 'AAPL', 100, 120, 0)
    );

    const report = await calculator.calculateCapitalGain();

    // Proceeds from short (50 shares): 50 * 150 = 7500
    // Cost to cover: 50 * 120 = 6000
    // Gain: 7500 - 6000 = 1500
    expect(report.capitalGain.toNumber()).toBeCloseTo(1500, 0);

    // Should have 50 shares in portfolio
    expect(report.portfolio.has('AAPL')).toBe(true);
    expect(report.portfolio.get('AAPL')!.quantity.toNumber()).toBe(50);
  });
});

describe('Short Sell - FIFO Matching', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2024 });
  });

  it('should cover shorts in FIFO order', async () => {
    // First short: 50 shares at £150
    await calculator.addDisposal(
      createTransaction('2024-06-15', ActionType.SELL, 'AAPL', 50, 150, 0)
    );

    // Second short: 50 shares at £160
    await calculator.addDisposal(
      createTransaction('2024-06-16', ActionType.SELL, 'AAPL', 50, 160, 0)
    );

    // Buy 50 shares at £120 (should cover first short)
    await calculator.addAcquisition(
      createTransaction('2024-06-20', ActionType.BUY, 'AAPL', 50, 120, 0)
    );

    const report = await calculator.calculateCapitalGain();

    // First short covered: 50 * 150 - 50 * 120 = 7500 - 6000 = 1500
    expect(report.capitalGain.toNumber()).toBeCloseTo(1500, 0);
  });

  it('should handle multiple shorts covered by single buy', async () => {
    // First short: 30 shares at £150
    await calculator.addDisposal(
      createTransaction('2024-06-15', ActionType.SELL, 'AAPL', 30, 150, 0)
    );

    // Second short: 30 shares at £160
    await calculator.addDisposal(
      createTransaction('2024-06-16', ActionType.SELL, 'AAPL', 30, 160, 0)
    );

    // Third short: 30 shares at £170
    await calculator.addDisposal(
      createTransaction('2024-06-17', ActionType.SELL, 'AAPL', 30, 170, 0)
    );

    // Buy 100 shares at £140 (covers all 90 short shares, 10 go to pool)
    await calculator.addAcquisition(
      createTransaction('2024-06-25', ActionType.BUY, 'AAPL', 100, 140, 0)
    );

    const report = await calculator.calculateCapitalGain();

    // Total proceeds: 30*150 + 30*160 + 30*170 = 4500 + 4800 + 5100 = 14400
    // Cost to cover 90 shares: 90 * 140 = 12600
    // Gain: 14400 - 12600 = 1800
    expect(report.capitalGain.toNumber()).toBeCloseTo(1800, 0);

    // Should have 10 shares in portfolio
    expect(report.portfolio.get('AAPL')!.quantity.toNumber()).toBe(10);
  });
});

describe('Short Sell - Mixed with Regular Trading', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2024 });
  });

  it('should handle selling more than owned (partial disposal + short)', async () => {
    // Buy 50 shares at £100
    await calculator.addAcquisition(
      createTransaction('2024-06-01', ActionType.BUY, 'AAPL', 50, 100, 0)
    );

    // Sell 80 shares at £120 (50 regular disposal + 30 short)
    await calculator.addDisposal(
      createTransaction('2024-06-15', ActionType.SELL, 'AAPL', 80, 120, 0)
    );

    const report = await calculator.calculateCapitalGain();

    // Regular disposal: 50 shares
    // Proceeds: 50/80 * (80 * 120) = 50 * 120 = 6000
    // Cost: 50 * 100 = 5000
    // Gain: 1000
    expect(report.capitalGain.toNumber()).toBeCloseTo(1000, 0);
  });

  it('should handle short cover followed by regular sell', async () => {
    // Short 50 shares at £150
    await calculator.addDisposal(
      createTransaction('2024-06-01', ActionType.SELL, 'AAPL', 50, 150, 0)
    );

    // Buy 100 shares at £120 (covers 50 short, 50 go to pool)
    await calculator.addAcquisition(
      createTransaction('2024-06-15', ActionType.BUY, 'AAPL', 100, 120, 0)
    );

    // Sell 30 shares from pool at £140
    await calculator.addDisposal(
      createTransaction('2024-06-20', ActionType.SELL, 'AAPL', 30, 140, 0)
    );

    const report = await calculator.calculateCapitalGain();

    // Short cover gain: 50 * (150 - 120) = 1500
    // Regular disposal gain: 30 * (140 - 120) = 600
    // Total: 2100
    expect(report.capitalGain.toNumber()).toBeCloseTo(2100, 0);

    // Should have 20 shares left
    expect(report.portfolio.get('AAPL')!.quantity.toNumber()).toBe(20);
  });
});
