/**
 * Unit tests for HMRC tax calculation rules
 * Tests Same-Day Rule, Bed & Breakfast Rule, and Section 104 Pooling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CapitalGainsCalculator } from '../lib/calculator/calculator';
import { ActionType } from '../lib/types/broker';
import Decimal from 'decimal.js-light';

describe('HMRC Rules - Same-Day Rule', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2023 });
  });

  it('should match buy and sell on the same day', async () => {
    // Buy 100 shares on June 15
    await calculator.addAcquisition({
      date: new Date('2023-06-15'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL',
      quantity: new Decimal(100),
      price: new Decimal(100),
      fees: new Decimal(10),
      amount: new Decimal(-10010),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell 50 shares same day (same-day rule applies)
    await calculator.addDisposal({
      date: new Date('2023-06-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell AAPL',
      quantity: new Decimal(50),
      price: new Decimal(150),
      fees: new Decimal(5),
      amount: new Decimal(7495),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // Gain calculation:
    // Cost basis for 50 shares (same-day) = (10010 / 100) * 50 = 5005
    // Proceeds = 7495
    // Gain = 7495 - 5005 = 2490
    expect(report.capitalGain.toString()).toBe('2490');

    // Remaining 50 shares should be in portfolio
    const position = report.portfolio.get('AAPL')!;
    expect(position.quantity.toString()).toBe('50');
    expect(position.amount.toString()).toBe('5005');
  });

  it('should apply same-day rule before bed & breakfast', async () => {
    // Buy 200 shares early (to have shares to sell)
    await calculator.addAcquisition({
      date: new Date('2023-05-01'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL early',
      quantity: new Decimal(200),
      price: new Decimal(90),
      fees: new Decimal(18),
      amount: new Decimal(-18018),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell 100 shares on June 15
    await calculator.addDisposal({
      date: new Date('2023-06-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell AAPL',
      quantity: new Decimal(100),
      price: new Decimal(150),
      fees: new Decimal(10),
      amount: new Decimal(14990),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Buy 60 shares same day (same-day match)
    await calculator.addAcquisition({
      date: new Date('2023-06-15'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL same day',
      quantity: new Decimal(60),
      price: new Decimal(100),
      fees: new Decimal(6),
      amount: new Decimal(-6006),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Buy 40 shares next day (within 30 days - B&B applies to remaining 40)
    await calculator.addAcquisition({
      date: new Date('2023-06-16'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL next day',
      quantity: new Decimal(40),
      price: new Decimal(110),
      fees: new Decimal(4),
      amount: new Decimal(-4404),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // Same-day: 60 shares @ 100 + fees = 6006
    // Proceeds for 60: (14990 / 100) * 60 = 8994
    // Gain from same-day: 8994 - 6006 = 2988

    // B&B: 40 shares @ 110 + fees = 4404
    // Proceeds for 40: (14990 / 100) * 40 = 5996
    // Gain from B&B: 5996 - 4404 = 1592

    // Total gain: 2988 + 1592 = 4580
    expect(report.capitalGain.toString()).toBe('4580');
  });

  it('should handle selling more shares than bought same day (short sell)', async () => {
    // Buy 100 shares
    await calculator.addAcquisition({
      date: new Date('2023-06-15'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL',
      quantity: new Decimal(100),
      price: new Decimal(100),
      fees: new Decimal(10),
      amount: new Decimal(-10010),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell 150 shares (100 same-day + 50 short)
    // This should now create a short position for 50 shares
    await calculator.addDisposal({
      date: new Date('2023-06-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell AAPL',
      quantity: new Decimal(150),
      price: new Decimal(150),
      fees: new Decimal(15),
      amount: new Decimal(22485),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // The disposal should have processed 100 shares normally
    // and opened a short position for 50 shares
    // Calculate to verify the behavior
    const report = await calculator.calculateCapitalGain();

    // 100 shares disposed at £150 each = £15000 proceeds (proportional: 15000 - 10 fees)
    // Cost basis: 100 shares at £100 + £10 fees = £10010
    // The remaining 50 shares are a short position (not in disposal list)
    expect(report.capitalGain.greaterThan(new Decimal(0))).toBe(true);
  });
});

describe('HMRC Rules - Bed & Breakfast Rule', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2023 });
  });

  it('should match disposal with acquisition within 30 days', async () => {
    // Buy 100 shares well before disposal (to have shares to sell)
    await calculator.addAcquisition({
      date: new Date('2023-05-01'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL initial',
      quantity: new Decimal(100),
      price: new Decimal(90),
      fees: new Decimal(9),
      amount: new Decimal(-9009),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell 100 shares on June 15
    await calculator.addDisposal({
      date: new Date('2023-06-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell AAPL',
      quantity: new Decimal(100),
      price: new Decimal(150),
      fees: new Decimal(10),
      amount: new Decimal(14990),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Buy 100 shares 10 days later (within 30 days - B&B applies)
    await calculator.addAcquisition({
      date: new Date('2023-06-25'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL',
      quantity: new Decimal(100),
      price: new Decimal(110),
      fees: new Decimal(11),
      amount: new Decimal(-11011),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // Cost basis (B&B): 11011
    // Proceeds: 14990
    // Gain: 14990 - 11011 = 3979
    expect(report.capitalGain.toString()).toBe('3979');

    // June 25 purchase adds 100 shares to portfolio (B&B only affects tax calculation)
    const position = report.portfolio.get('AAPL')!;
    expect(position.quantity.toString()).toBe('100');
    expect(position.amount.toString()).toBe('2002'); // 11011 - 9009 (amount removed from May 1 pool)
  });

  it('should not match acquisition 31 days after disposal', async () => {
    // Buy shares well before disposal (to have some in portfolio)
    await calculator.addAcquisition({
      date: new Date('2023-05-01'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL early',
      quantity: new Decimal(100),
      price: new Decimal(90),
      fees: new Decimal(9),
      amount: new Decimal(-9009),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell 100 shares on June 15
    await calculator.addDisposal({
      date: new Date('2023-06-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell AAPL',
      quantity: new Decimal(100),
      price: new Decimal(150),
      fees: new Decimal(10),
      amount: new Decimal(14990),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Buy 100 shares 31 days later (outside 30-day window - Section 104 applies)
    await calculator.addAcquisition({
      date: new Date('2023-07-16'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL',
      quantity: new Decimal(100),
      price: new Decimal(110),
      fees: new Decimal(11),
      amount: new Decimal(-11011),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // Should use Section 104 pool (early purchase @ 90)
    // Cost basis: 9009
    // Proceeds: 14990
    // Gain: 14990 - 9009 = 5981
    expect(report.capitalGain.toString()).toBe('5981');

    // New purchase should be in portfolio
    const position = report.portfolio.get('AAPL')!;
    expect(position.quantity.toString()).toBe('100');
  });

  it('should handle partial B&B matching', async () => {
    // Buy shares well before disposal (to have shares to sell)
    await calculator.addAcquisition({
      date: new Date('2023-05-01'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL early',
      quantity: new Decimal(100),
      price: new Decimal(90),
      fees: new Decimal(9),
      amount: new Decimal(-9009),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell 100 shares
    await calculator.addDisposal({
      date: new Date('2023-06-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell AAPL',
      quantity: new Decimal(100),
      price: new Decimal(150),
      fees: new Decimal(10),
      amount: new Decimal(14990),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Buy only 50 shares within 30 days (partial B&B match)
    await calculator.addAcquisition({
      date: new Date('2023-06-20'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL partial',
      quantity: new Decimal(50),
      price: new Decimal(110),
      fees: new Decimal(5.50),
      amount: new Decimal(-5505.50),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // 50 shares matched via B&B with June 20 purchase (110 + fees)
    // Proceeds for 50: (14990 / 100) * 50 = 7495
    // Cost for 50 B&B: (5505.50 / 50) * 50 = 5505.50
    // Fees for 50: (10 / 100) * 50 = 5
    // B&B gain: 7495 - 5505.50 = 1989.50 (fees included in proceeds/costs)

    // Remaining 50 shares matched via Section 104 with May 1 purchase (90 + fees)
    // Cost for 50: (9009 / 100) * 50 = 4504.50
    // Proceeds for 50: 7495
    // Fees for 50: 5
    // Section 104 gain: 7495 - 4504.50 = 2990.50 (fees included)

    // Total gain: 1989.50 + 2990.50 = 4980
    expect(report.capitalGain.toString()).toBe('4980');

    // 50 shares from June 20 purchase should remain in portfolio
    const position = report.portfolio.get('AAPL')!;
    expect(position.quantity.toString()).toBe('50');
  });
});

describe('HMRC Rules - Section 104 Pooling', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2023 });
  });

  it('should maintain average cost in Section 104 pool', async () => {
    // First purchase: 100 shares @ 100
    await calculator.addAcquisition({
      date: new Date('2023-05-15'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL first',
      quantity: new Decimal(100),
      price: new Decimal(100),
      fees: new Decimal(10),
      amount: new Decimal(-10010),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Second purchase: 100 shares @ 120
    await calculator.addAcquisition({
      date: new Date('2023-06-15'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL second',
      quantity: new Decimal(100),
      price: new Decimal(120),
      fees: new Decimal(12),
      amount: new Decimal(-12012),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell 100 shares
    await calculator.addDisposal({
      date: new Date('2023-09-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell AAPL',
      quantity: new Decimal(100),
      price: new Decimal(150),
      fees: new Decimal(15),
      amount: new Decimal(14985),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // Pool: 200 shares, total cost = 10010 + 12012 = 22022
    // Average cost per share = 22022 / 200 = 110.11
    // Cost for 100 shares = 11011
    // Proceeds = 14985
    // Gain = 14985 - 11011 = 3974
    expect(report.capitalGain.toString()).toBe('3974');

    // Remaining 100 shares in pool
    const position = report.portfolio.get('AAPL')!;
    expect(position.quantity.toString()).toBe('100');
    expect(position.amount.toString()).toBe('11011');
  });

  it('should handle multiple purchases and sales', async () => {
    // Purchase 1: 100 @ 100
    await calculator.addAcquisition({
      date: new Date('2023-05-01'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy 1',
      quantity: new Decimal(100),
      price: new Decimal(100),
      fees: new Decimal(10),
      amount: new Decimal(-10010),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sale 1: 50 shares
    await calculator.addDisposal({
      date: new Date('2023-06-01'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell 1',
      quantity: new Decimal(50),
      price: new Decimal(110),
      fees: new Decimal(5),
      amount: new Decimal(5495),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Purchase 2: 50 @ 105 (more than 30 days after first sale to avoid B&B)
    await calculator.addAcquisition({
      date: new Date('2023-08-02'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy 2',
      quantity: new Decimal(50),
      price: new Decimal(105),
      fees: new Decimal(5.25),
      amount: new Decimal(-5255.25),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sale 2: 75 shares
    await calculator.addDisposal({
      date: new Date('2023-09-01'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell 2',
      quantity: new Decimal(75),
      price: new Decimal(120),
      fees: new Decimal(9),
      amount: new Decimal(8991),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // First sale: 50 shares from pool of 100 @ 100.10 = 5005
    // Proceeds: 5495, Gain: 490

    // After first sale: 50 shares @ 5005 remain
    // Second purchase adds: 50 shares @ 5255.25
    // Pool: 100 shares @ 10260.25 (average: 102.6025)

    // Second sale: 75 shares @ 102.6025 = 7695.1875
    // Proceeds: 8991, Gain: 1295.8125

    // Total gain: 490 + 1295.81 = 1785.81 (rounded to 2 decimals)
    expect(report.capitalGain.toDecimalPlaces(2).toString()).toBe('1785.81');

    // Remaining: 25 shares
    const position = report.portfolio.get('AAPL')!;
    expect(position.quantity.toString()).toBe('25');
  });

  it('should clear portfolio when all shares sold', async () => {
    // Buy 100 shares
    await calculator.addAcquisition({
      date: new Date('2023-05-15'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL',
      quantity: new Decimal(100),
      price: new Decimal(100),
      fees: new Decimal(10),
      amount: new Decimal(-10010),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell all 100 shares
    await calculator.addDisposal({
      date: new Date('2023-09-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell all AAPL',
      quantity: new Decimal(100),
      price: new Decimal(150),
      fees: new Decimal(15),
      amount: new Decimal(14985),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // Portfolio should be empty
    expect(report.portfolio.has('AAPL')).toBe(false);
    expect(report.portfolio.size).toBe(0);

    // Gain: 14985 - 10010 = 4975
    expect(report.capitalGain.toString()).toBe('4975');
  });
});

describe('HMRC Rules - Integration Scenarios', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2023 });
  });

  it('should apply all three rules in correct order', async () => {
    // Pre-existing holding from earlier in tax year - need 200 total shares to sell
    await calculator.addAcquisition({
      date: new Date('2023-05-01'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Old holding',
      quantity: new Decimal(200),
      price: new Decimal(80),
      fees: new Decimal(16),
      amount: new Decimal(-16016),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell 200 shares on June 15
    await calculator.addDisposal({
      date: new Date('2023-06-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Large sale',
      quantity: new Decimal(200),
      price: new Decimal(150),
      fees: new Decimal(30),
      amount: new Decimal(29970),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Same-day purchase: 60 shares
    await calculator.addAcquisition({
      date: new Date('2023-06-15'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Same-day buy',
      quantity: new Decimal(60),
      price: new Decimal(100),
      fees: new Decimal(6),
      amount: new Decimal(-6006),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // B&B purchase: 90 shares (within 30 days)
    await calculator.addAcquisition({
      date: new Date('2023-06-25'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'B&B buy',
      quantity: new Decimal(90),
      price: new Decimal(110),
      fees: new Decimal(9.90),
      amount: new Decimal(-9909.90),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // Order of matching:
    // 1. Same-day: 60 shares @ 6006 = proceeds 8991
    // 2. B&B: 90 shares @ 9909.90 = proceeds 13485.50
    // 3. Section 104: 50 shares from 200 @ 16016 pool
    //    Average cost: 16016 / 200 = 80.08 per share
    //    Cost for 50: 4004
    //    Proceeds: (29970 / 200) * 50 = 7492.50

    // Total cost: 6006 + 9909.90 + 4004 = 19919.90
    // Total proceeds: 29970
    // Gain: 29970 - 19919.90 = 10050.10
    expect(report.capitalGain.toFixed(2)).toBe('10050.10');
  });
});
