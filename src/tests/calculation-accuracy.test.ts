/**
 * Calculation Accuracy Tests
 *
 * Comprehensive tests for HMRC tax calculation rules covering edge cases,
 * loss scenarios, and boundary conditions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CapitalGainsCalculator } from '../lib/calculator/calculator';
import type { BrokerTransaction } from '../lib/types';
import { ActionType } from '../lib/types';
import Decimal from 'decimal.js-light';

/**
 * Helper function to create test transactions with proper amount calculation
 */
function createTransaction(
  date: string | Date,
  action: ActionType,
  symbol: string,
  quantity: number,
  price: number,
  fees: number = 0,
  currency: string = 'GBP'
): BrokerTransaction {
  const d = typeof date === 'string' ? new Date(date) : date;
  const qty = new Decimal(quantity);
  const prc = new Decimal(price);
  const feesDec = new Decimal(fees);

  // BUY: negative amount (money out), SELL: positive amount (money in)
  const amount = action === ActionType.BUY
    ? qty.times(prc).plus(feesDec).negated()
    : qty.times(prc).minus(feesDec);

  return {
    date: d,
    action,
    symbol,
    description: `${action} ${symbol}`,
    quantity: qty,
    price: prc,
    fees: feesDec,
    amount,
    currency,
    broker: 'Test Broker',
  };
}

// =============================================================================
// SUITE 1: Same-Day Rule Tests
// =============================================================================

describe('Calculation Accuracy - Same-Day Rule', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2024 });
  });

  it('should calculate loss on same day correctly', async () => {
    // Buy 100 shares @ £150
    await calculator.addAcquisition(createTransaction(
      '2024-06-15', ActionType.BUY, 'AAPL', 100, 150, 0
    ));

    // Sell 100 shares @ £130 same day (loss)
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 130, 0
    ));

    const report = await calculator.calculateCapitalGain();

    // Loss = (100 * 130) - (100 * 150) = 13000 - 15000 = -2000
    expect(report.capitalGain.toString()).toBe('0');
    expect(report.capitalLoss.toString()).toBe('-2000');
  });

  it('should handle multiple same-day transactions correctly', async () => {
    const date = '2024-06-15';

    // Buy 50 shares @ £100
    await calculator.addAcquisition(createTransaction(date, ActionType.BUY, 'AAPL', 50, 100));
    // Sell 30 shares @ £110
    await calculator.addDisposal(createTransaction(date, ActionType.SELL, 'AAPL', 30, 110));
    // Buy 20 more shares @ £105
    await calculator.addAcquisition(createTransaction(date, ActionType.BUY, 'AAPL', 20, 105));
    // Sell 40 shares @ £115
    await calculator.addDisposal(createTransaction(date, ActionType.SELL, 'AAPL', 40, 115));

    const report = await calculator.calculateCapitalGain();

    // Total bought same day: 70 shares, avg price = (50*100 + 20*105) / 70 = 7100 / 70 = 101.43
    // Total sold: 70 shares
    // Proceeds: 30*110 + 40*115 = 3300 + 4600 = 7900
    // Cost: 70 * 101.43 = 7100
    // Gain = 7900 - 7100 = 800
    expect(Number(report.capitalGain.toString())).toBeCloseTo(800, 0);
  });

  it('should handle fractional shares on same day', async () => {
    // Buy 10.5 shares @ £100
    await calculator.addAcquisition(createTransaction(
      '2024-06-15', ActionType.BUY, 'AAPL', 10.5, 100
    ));

    // Sell 5.25 shares @ £120 same day
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 5.25, 120
    ));

    const report = await calculator.calculateCapitalGain();

    // Proceeds: 5.25 * 120 = 630
    // Cost: 5.25 * 100 = 525
    // Gain: 630 - 525 = 105
    expect(report.capitalGain.toString()).toBe('105');

    // Remaining shares: 10.5 - 5.25 = 5.25
    const position = report.portfolio.get('AAPL');
    expect(position?.quantity.toString()).toBe('5.25');
  });

  it('should handle multiple symbols on same day independently', async () => {
    const date = '2024-06-15';

    // AAPL: Buy 100 @ £100, Sell 100 @ £110 (gain £1000)
    await calculator.addAcquisition(createTransaction(date, ActionType.BUY, 'AAPL', 100, 100));
    await calculator.addDisposal(createTransaction(date, ActionType.SELL, 'AAPL', 100, 110));

    // MSFT: Buy 100 @ £200, Sell 100 @ £190 (loss £1000)
    await calculator.addAcquisition(createTransaction(date, ActionType.BUY, 'MSFT', 100, 200));
    await calculator.addDisposal(createTransaction(date, ActionType.SELL, 'MSFT', 100, 190));

    const report = await calculator.calculateCapitalGain();

    // AAPL gain: 1000, MSFT loss: -1000
    expect(report.capitalGain.toString()).toBe('1000');
    expect(report.capitalLoss.toString()).toBe('-1000');
  });

  it('should include fees in same-day calculations', async () => {
    // Buy 100 shares @ £100 with £10 fee
    await calculator.addAcquisition(createTransaction(
      '2024-06-15', ActionType.BUY, 'AAPL', 100, 100, 10
    ));

    // Sell 100 shares @ £110 with £5 fee
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 110, 5
    ));

    const report = await calculator.calculateCapitalGain();

    // Proceeds: 100 * 110 - 5 = 10995
    // Cost: 100 * 100 + 10 = 10010
    // Gain: 10995 - 10010 = 985
    expect(report.capitalGain.toString()).toBe('985');
  });

  it('should leave portfolio empty when exact quantity sold same day', async () => {
    // Buy 100 shares
    await calculator.addAcquisition(createTransaction(
      '2024-06-15', ActionType.BUY, 'AAPL', 100, 100
    ));

    // Sell exactly 100 shares same day
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 110
    ));

    const report = await calculator.calculateCapitalGain();

    // Portfolio should be empty
    expect(report.portfolio.has('AAPL')).toBe(false);
    expect(report.capitalGain.toString()).toBe('1000');
  });
});

// =============================================================================
// SUITE 2: Bed & Breakfast Rule Tests
// =============================================================================

describe('Calculation Accuracy - Bed & Breakfast Rule', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2024 });
  });

  it('should calculate loss with B&B rule correctly', async () => {
    // Buy 100 shares @ £150 on June 1
    await calculator.addAcquisition(createTransaction(
      '2024-06-01', ActionType.BUY, 'AAPL', 100, 150
    ));

    // Sell 100 shares @ £100 on June 15 (apparent loss of £5000)
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 100
    ));

    // Buy back 100 shares @ £105 on June 25 (within 30 days - B&B applies)
    await calculator.addAcquisition(createTransaction(
      '2024-06-25', ActionType.BUY, 'AAPL', 100, 105
    ));

    const report = await calculator.calculateCapitalGain();

    // B&B: Cost is from June 25 purchase = 100 * 105 = 10500
    // Proceeds: 100 * 100 = 10000
    // Loss: 10000 - 10500 = -500 (not -5000!)
    expect(report.capitalLoss.toString()).toBe('-500');
  });

  it('should apply B&B rule at exactly 30 days boundary', async () => {
    // First acquire some shares to have a pool
    await calculator.addAcquisition(createTransaction(
      '2024-06-01', ActionType.BUY, 'AAPL', 100, 100
    ));

    // Sell on June 15
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 120
    ));

    // Buy on July 15 (exactly 30 days later - B&B should apply)
    await calculator.addAcquisition(createTransaction(
      '2024-07-15', ActionType.BUY, 'AAPL', 100, 110
    ));

    const report = await calculator.calculateCapitalGain();

    // B&B applies: cost from July 15 purchase = 11000
    // Proceeds: 12000
    // Gain: 12000 - 11000 = 1000
    expect(report.capitalGain.toString()).toBe('1000');
  });

  it('should use Section 104 at 31 days (outside B&B window)', async () => {
    // Acquire shares to build a pool
    await calculator.addAcquisition(createTransaction(
      '2024-06-01', ActionType.BUY, 'AAPL', 100, 100
    ));

    // Sell on June 15
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 120
    ));

    // Buy on July 16 (31 days later - outside B&B window)
    await calculator.addAcquisition(createTransaction(
      '2024-07-16', ActionType.BUY, 'AAPL', 100, 110
    ));

    const report = await calculator.calculateCapitalGain();

    // Section 104 applies: cost from original pool = 10000
    // Proceeds: 12000
    // Gain: 12000 - 10000 = 2000
    expect(report.capitalGain.toString()).toBe('2000');
  });

  it('should not apply B&B when buying BEFORE disposal', async () => {
    // Buy on June 1
    await calculator.addAcquisition(createTransaction(
      '2024-06-01', ActionType.BUY, 'AAPL', 100, 100
    ));

    // Sell on June 15 - B&B only looks forward, not backward
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 120
    ));

    const report = await calculator.calculateCapitalGain();

    // Section 104 applies (pool from June 1)
    // Cost: 10000, Proceeds: 12000
    // Gain: 2000
    expect(report.capitalGain.toString()).toBe('2000');
  });

  it('should handle multiple B&B matches for single disposal', async () => {
    // Build initial pool
    await calculator.addAcquisition(createTransaction(
      '2024-05-01', ActionType.BUY, 'AAPL', 200, 100
    ));

    // Sell 100 shares on June 15
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 150
    ));

    // Buy back 30 on June 20
    await calculator.addAcquisition(createTransaction(
      '2024-06-20', ActionType.BUY, 'AAPL', 30, 120
    ));

    // Buy back 40 on July 1
    await calculator.addAcquisition(createTransaction(
      '2024-07-01', ActionType.BUY, 'AAPL', 40, 130
    ));

    const report = await calculator.calculateCapitalGain();

    // Of the 100 sold:
    // - 30 matched to B&B (June 20): cost = 30 * 120 = 3600
    // - 40 matched to B&B (July 1): cost = 40 * 130 = 5200
    // - 30 from Section 104 pool: cost = 30 * 100 = 3000
    // Total cost: 3600 + 5200 + 3000 = 11800
    // Proceeds: 100 * 150 = 15000
    // Gain: 15000 - 11800 = 3200
    expect(report.capitalGain.toString()).toBe('3200');
  });

  it('should handle fractional shares in B&B', async () => {
    // Build pool
    await calculator.addAcquisition(createTransaction(
      '2024-05-01', ActionType.BUY, 'AAPL', 20, 100
    ));

    // Sell 10.5 shares
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 10.5, 150
    ));

    // Buy back 5.25 within 30 days
    await calculator.addAcquisition(createTransaction(
      '2024-06-25', ActionType.BUY, 'AAPL', 5.25, 120
    ));

    const report = await calculator.calculateCapitalGain();

    // Of 10.5 sold:
    // - 5.25 matched to B&B: cost = 5.25 * 120 = 630
    // - 5.25 from Section 104: cost = 5.25 * 100 = 525
    // Total cost: 1155
    // Proceeds: 10.5 * 150 = 1575
    // Gain: 1575 - 1155 = 420
    expect(report.capitalGain.toString()).toBe('420');
  });

  it('should include fees in B&B cost basis', async () => {
    // Build pool
    await calculator.addAcquisition(createTransaction(
      '2024-05-01', ActionType.BUY, 'AAPL', 100, 100, 10
    ));

    // Sell 100 shares with fees
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 150, 5
    ));

    // Buy back within 30 days with fees
    await calculator.addAcquisition(createTransaction(
      '2024-06-25', ActionType.BUY, 'AAPL', 100, 120, 10
    ));

    const report = await calculator.calculateCapitalGain();

    // B&B: cost from June 25 = 100 * 120 + 10 = 12010
    // Proceeds: 100 * 150 - 5 = 14995
    // Gain: 14995 - 12010 = 2985
    expect(report.capitalGain.toString()).toBe('2985');
  });
});

// =============================================================================
// SUITE 3: Section 104 Pooling Tests
// =============================================================================

describe('Calculation Accuracy - Section 104 Pooling', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2024 });
  });

  it('should calculate loss from pool correctly', async () => {
    // Buy 100 @ £150
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'AAPL', 100, 150
    ));

    // Buy 100 @ £130
    await calculator.addAcquisition(createTransaction(
      '2024-05-15', ActionType.BUY, 'AAPL', 100, 130
    ));

    // Sell 100 @ £120 (pool average = 140)
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 120
    ));

    const report = await calculator.calculateCapitalGain();

    // Pool: (100 * 150 + 100 * 130) / 200 = 28000 / 200 = 140 avg
    // Selling 100: cost = 100 * 140 = 14000
    // Proceeds: 100 * 120 = 12000
    // Loss: 12000 - 14000 = -2000
    expect(report.capitalLoss.toString()).toBe('-2000');
  });

  it('should calculate correct average for large quantity pool', async () => {
    // Buy 1000 @ £100 = £100,000
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'AAPL', 1000, 100
    ));

    // Buy 500 @ £120 = £60,000
    await calculator.addAcquisition(createTransaction(
      '2024-05-15', ActionType.BUY, 'AAPL', 500, 120
    ));

    // Sell 750 @ £115
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 750, 115
    ));

    const report = await calculator.calculateCapitalGain();

    // Pool: (1000 * 100 + 500 * 120) / 1500 = 160000 / 1500 = 106.67 avg
    // Selling 750: cost = 750 * 106.67 = 80000
    // Proceeds: 750 * 115 = 86250
    // Gain: 86250 - 80000 = 6250
    expect(Number(report.capitalGain.toString())).toBeCloseTo(6250, 0);
  });

  it('should handle penny stock precision', async () => {
    // Buy 10000 @ £0.001 = £10
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'PENNY', 10000, 0.001
    ));

    // Sell 5000 @ £0.002 = £10
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'PENNY', 5000, 0.002
    ));

    const report = await calculator.calculateCapitalGain();

    // Cost: 5000 * 0.001 = 5
    // Proceeds: 5000 * 0.002 = 10
    // Gain: 10 - 5 = 5
    expect(report.capitalGain.toString()).toBe('5');
  });

  it('should handle expensive stock correctly', async () => {
    // Buy 1 share @ £50,000
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'BRK.A', 1, 50000
    ));

    // Sell 1 @ £55,000
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'BRK.A', 1, 55000
    ));

    const report = await calculator.calculateCapitalGain();

    expect(report.capitalGain.toString()).toBe('5000');
  });

  it('should track running pool accurately over multiple trades', async () => {
    // Build up and draw down the pool
    await calculator.addAcquisition(createTransaction('2024-04-10', ActionType.BUY, 'AAPL', 100, 100)); // Pool: 100 @ 100
    await calculator.addAcquisition(createTransaction('2024-04-20', ActionType.BUY, 'AAPL', 50, 120));  // Pool: 150 @ 106.67
    await calculator.addDisposal(createTransaction('2024-05-10', ActionType.SELL, 'AAPL', 75, 115));   // Sell 75
    await calculator.addAcquisition(createTransaction('2024-06-10', ActionType.BUY, 'AAPL', 100, 110)); // Add 100
    await calculator.addDisposal(createTransaction('2024-07-10', ActionType.SELL, 'AAPL', 50, 130));   // Sell 50

    const report = await calculator.calculateCapitalGain();

    // This validates the pool is tracking correctly through multiple operations
    expect(report.capitalGain.toNumber()).toBeGreaterThan(0);

    // Final pool should have: 150 - 75 + 100 - 50 = 125 shares
    const position = report.portfolio.get('AAPL');
    expect(position?.quantity.toString()).toBe('125');
  });

  it('should add fees to pool cost basis', async () => {
    // Buy 100 @ £100 + £10 fee = £10010 total
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'AAPL', 100, 100, 10
    ));

    // Buy 100 @ £110 + £15 fee = £11015 total
    await calculator.addAcquisition(createTransaction(
      '2024-05-15', ActionType.BUY, 'AAPL', 100, 110, 15
    ));

    // Sell 100 @ £120 - £5 fee = £11995 proceeds
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 120, 5
    ));

    const report = await calculator.calculateCapitalGain();

    // Pool cost: (10010 + 11015) / 200 = 21025 / 200 = 105.125 per share
    // Selling 100: cost = 100 * 105.125 = 10512.5
    // Proceeds: 100 * 120 - 5 = 11995
    // Gain: 11995 - 10512.5 = 1482.5
    expect(Number(report.capitalGain.toString())).toBeCloseTo(1482.5, 0);
  });
});

// =============================================================================
// SUITE 4: ERI (Excess Reported Income) Tests
// =============================================================================

describe('Calculation Accuracy - ERI', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2024 });
  });

  /**
   * Helper to create an ERI transaction.
   * Note: ERI amount is per-share, not total.
   */
  function createEriTransaction(
    date: string | Date,
    symbol: string,
    amountPerShare: number
  ): BrokerTransaction {
    const d = typeof date === 'string' ? new Date(date) : date;
    return {
      date: d,
      action: ActionType.EXCESS_REPORTED_INCOME,
      symbol,
      description: `ERI ${symbol}`,
      quantity: null,
      price: null,
      fees: new Decimal(0),
      amount: new Decimal(amountPerShare),
      currency: 'GBP',
      broker: 'Test Broker',
    };
  }

  it('should increase cost basis with ERI', async () => {
    // Buy fund shares
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'VUAG', 100, 100
    ));

    // Add ERI (£5 per share)
    calculator.addEri(createEriTransaction('2024-06-01', 'VUAG', 5));

    // Sell all shares
    await calculator.addDisposal(createTransaction(
      '2024-08-15', ActionType.SELL, 'VUAG', 100, 110
    ));

    const report = await calculator.calculateCapitalGain();

    // Without ERI: cost = 10000, proceeds = 11000, gain = 1000
    // With ERI: cost = 10000 + (100 * 5) = 10500, proceeds = 11000, gain = 500
    expect(report.capitalGain.toString()).toBe('500');
  });

  it('should accumulate multiple ERI reports', async () => {
    // Buy fund shares
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'VUAG', 100, 100
    ));

    // Add multiple ERI reports (per-share amounts)
    calculator.addEri(createEriTransaction('2024-05-01', 'VUAG', 2)); // £2/share = £200 total
    calculator.addEri(createEriTransaction('2024-06-01', 'VUAG', 3)); // £3/share = £300 total
    calculator.addEri(createEriTransaction('2024-07-01', 'VUAG', 1)); // £1/share = £100 total

    // Sell all shares
    await calculator.addDisposal(createTransaction(
      '2024-08-15', ActionType.SELL, 'VUAG', 100, 115
    ));

    const report = await calculator.calculateCapitalGain();

    // Cost: 10000 + (100 * 2) + (100 * 3) + (100 * 1) = 10000 + 600 = 10600
    // Proceeds: 11500
    // Gain: 11500 - 10600 = 900
    expect(report.capitalGain.toString()).toBe('900');
  });

  it('should apply ERI proportionally on partial disposal', async () => {
    // Buy 100 shares
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'VUAG', 100, 100
    ));

    // Add ERI of £10 per share
    calculator.addEri(createEriTransaction('2024-06-01', 'VUAG', 10));

    // Sell only 50 shares
    await calculator.addDisposal(createTransaction(
      '2024-08-15', ActionType.SELL, 'VUAG', 50, 120
    ));

    const report = await calculator.calculateCapitalGain();

    // Pool after ERI: cost = 10000 + (100 * 10) = 11000, avg = 110/share
    // Cost for 50 shares: 50 * 110 = 5500
    // Proceeds: 50 * 120 = 6000
    // Gain: 6000 - 5500 = 500
    expect(report.capitalGain.toString()).toBe('500');

    // Remaining 50 shares should still have proportional ERI
    const position = report.portfolio.get('VUAG');
    expect(position?.quantity.toString()).toBe('50');
    // Remaining cost: 5500
    expect(position?.amount.toString()).toBe('5500');
  });

  it('should apply ERI with B&B rule', async () => {
    // Build initial position
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'VUAG', 100, 100
    ));

    // Add ERI (£5 per share)
    calculator.addEri(createEriTransaction('2024-05-01', 'VUAG', 5));

    // Sell shares
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'VUAG', 100, 110
    ));

    // Buy back within 30 days (B&B applies)
    await calculator.addAcquisition(createTransaction(
      '2024-06-25', ActionType.BUY, 'VUAG', 100, 105
    ));

    const report = await calculator.calculateCapitalGain();

    // B&B: cost from June 25 = 10500 (no ERI on new purchase yet)
    // Proceeds: 11000
    // Gain: 11000 - 10500 = 500
    expect(report.capitalGain.toString()).toBe('500');
  });

  it('should demonstrate ERI reducing capital gain', async () => {
    // Without ERI: £100 buy, £110 sell = £10 gain per share
    // With ERI: £100 buy + £5 ERI = £105 cost, £110 sell = £5 gain per share

    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'VUAG', 100, 100
    ));

    // ERI of £5 per share
    calculator.addEri(createEriTransaction('2024-06-01', 'VUAG', 5));

    await calculator.addDisposal(createTransaction(
      '2024-08-15', ActionType.SELL, 'VUAG', 100, 110
    ));

    const report = await calculator.calculateCapitalGain();

    // Without ERI: gain would be 1000
    // With ERI: gain is 500
    expect(report.capitalGain.toString()).toBe('500');
  });
});

// =============================================================================
// SUITE 5: Edge Cases
// =============================================================================

describe('Calculation Accuracy - Edge Cases', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2024 });
  });

  it('should handle very small gain accurately', async () => {
    // Buy 100 @ exactly £100.00
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'AAPL', 100, 100.00
    ));

    // Sell @ £100.01 (1 penny more)
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 100.01
    ));

    const report = await calculator.calculateCapitalGain();

    // Gain: 100 * 0.01 = £1.00
    expect(report.capitalGain.toString()).toBe('1');
  });

  it('should handle zero gain/loss correctly', async () => {
    // Buy and sell at exact same price
    await calculator.addAcquisition(createTransaction(
      '2024-04-15', ActionType.BUY, 'AAPL', 100, 100
    ));

    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 100
    ));

    const report = await calculator.calculateCapitalGain();

    expect(report.capitalGain.toString()).toBe('0');
    expect(report.capitalLoss.toString()).toBe('0');
  });

  it('should handle mixed rules in single disposal correctly', async () => {
    // Build a pool first with enough shares
    await calculator.addAcquisition(createTransaction(
      '2024-04-01', ActionType.BUY, 'AAPL', 100, 90
    ));

    // Sell 100 shares (will be matched with Same-Day and B&B)
    await calculator.addDisposal(createTransaction(
      '2024-06-15', ActionType.SELL, 'AAPL', 100, 150
    ));

    // Same-day buy: 40 shares
    await calculator.addAcquisition(createTransaction(
      '2024-06-15', ActionType.BUY, 'AAPL', 40, 100
    ));

    // B&B buy: 30 shares within 30 days
    await calculator.addAcquisition(createTransaction(
      '2024-06-25', ActionType.BUY, 'AAPL', 30, 110
    ));

    const report = await calculator.calculateCapitalGain();

    // Of 100 sold:
    // - 40 matched Same-Day: cost = 40 * 100 = 4000, proceeds = 40 * 150 = 6000, gain = 2000
    // - 30 matched B&B: cost = 30 * 110 = 3300, proceeds = 30 * 150 = 4500, gain = 1200
    // - 30 from Section 104: cost = 30 * 90 = 2700, proceeds = 30 * 150 = 4500, gain = 1800
    // Total gain: 2000 + 1200 + 1800 = 5000
    expect(report.capitalGain.toString()).toBe('5000');
  });

  it('should assign trades to correct tax year at boundary', async () => {
    // Tax year 2024 runs from April 6, 2024 to April 5, 2025
    const calculator2024 = new CapitalGainsCalculator({ taxYear: 2024 });

    // Trade on April 5, 2025 (last day of 2024 tax year)
    await calculator2024.addAcquisition(createTransaction(
      '2025-04-05', ActionType.BUY, 'AAPL', 100, 100
    ));

    await calculator2024.addDisposal(createTransaction(
      '2025-04-05', ActionType.SELL, 'AAPL', 100, 110
    ));

    const report2024 = await calculator2024.calculateCapitalGain();

    // Trade should be in 2024 tax year
    expect(report2024.taxYear).toBe(2024);
    expect(report2024.capitalGain.toString()).toBe('1000');
  });

  it('should handle very large transaction counts', async () => {
    // Add many small transactions
    for (let i = 0; i < 50; i++) {
      const day = String(10 + (i % 20)).padStart(2, '0');
      const month = String(4 + Math.floor(i / 20)).padStart(2, '0');

      await calculator.addAcquisition(createTransaction(
        `2024-${month}-${day}`, ActionType.BUY, 'AAPL', 10, 100 + i
      ));
    }

    // Sell all at once
    await calculator.addDisposal(createTransaction(
      '2024-08-01', ActionType.SELL, 'AAPL', 500, 150
    ));

    const report = await calculator.calculateCapitalGain();

    // Should complete without error and show a gain
    expect(report.capitalGain.toNumber()).toBeGreaterThan(0);
    expect(report.portfolio.has('AAPL')).toBe(false); // All sold
  });
});
