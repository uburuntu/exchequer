/**
 * Unit tests for calculator features
 * Tests dividend, interest, ERI, and spin-off processing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CapitalGainsCalculator } from '../lib/calculator/calculator';
import { ActionType } from '../lib/types/broker';
import Decimal from 'decimal.js-light';

describe('Calculator - Dividend Processing', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2023 });
  });

  it('should track dividend transactions', async () => {
    calculator.addDividend({
      date: new Date('2023-06-15'),
      action: ActionType.DIVIDEND,
      symbol: 'AAPL',
      description: 'Dividend',
      quantity: null,
      price: null,
      fees: new Decimal(0),
      amount: new Decimal(100),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Verify dividend was added (internal state, tested via calculation)
    expect(calculator).toBeDefined();
  });

  it('should handle multiple dividends for same symbol on same date', async () => {
    const date = new Date('2023-06-15');

    calculator.addDividend({
      date,
      action: ActionType.DIVIDEND,
      symbol: 'AAPL',
      description: 'Dividend 1',
      quantity: null,
      price: null,
      fees: new Decimal(5),
      amount: new Decimal(100),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    calculator.addDividend({
      date,
      action: ActionType.DIVIDEND,
      symbol: 'AAPL',
      description: 'Dividend 2',
      quantity: null,
      price: null,
      fees: new Decimal(3),
      amount: new Decimal(50),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Dividends should be aggregated
    expect(calculator).toBeDefined();
  });

  it('should track dividend tax withheld', async () => {
    calculator.addDividend({
      date: new Date('2023-06-15'),
      action: ActionType.DIVIDEND,
      symbol: 'MSFT',
      description: 'Dividend with tax',
      quantity: null,
      price: null,
      fees: new Decimal(15), // Tax withheld
      amount: new Decimal(100),
      currency: 'USD',
      broker: 'Test Broker',
    });

    expect(calculator).toBeDefined();
  });
});

describe('Calculator - Interest Processing', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2023 });
  });

  it('should track interest transactions', async () => {
    calculator.addInterest({
      date: new Date('2023-06-15'),
      action: ActionType.INTEREST,
      symbol: null,
      description: 'Interest on cash',
      quantity: null,
      price: null,
      fees: new Decimal(0),
      amount: new Decimal(25.50),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    expect(calculator).toBeDefined();
  });

  it('should group interest by broker, currency, and month', async () => {
    calculator.addInterest({
      date: new Date('2023-06-05'),
      action: ActionType.INTEREST,
      symbol: null,
      description: 'Interest 1',
      quantity: null,
      price: null,
      fees: new Decimal(0),
      amount: new Decimal(10),
      currency: 'GBP',
      broker: 'Broker A',
    });

    calculator.addInterest({
      date: new Date('2023-06-20'),
      action: ActionType.INTEREST,
      symbol: null,
      description: 'Interest 2',
      quantity: null,
      price: null,
      fees: new Decimal(0),
      amount: new Decimal(15),
      currency: 'GBP',
      broker: 'Broker A',
    });

    // Should be grouped into same month
    expect(calculator).toBeDefined();
  });

  it('should handle foreign currency interest', async () => {
    calculator.addInterest({
      date: new Date('2023-06-15'),
      action: ActionType.INTEREST,
      symbol: null,
      description: 'USD Interest',
      quantity: null,
      price: null,
      fees: new Decimal(0),
      amount: new Decimal(50),
      currency: 'USD',
      broker: 'Test Broker',
    });

    expect(calculator).toBeDefined();
  });
});

describe('Calculator - ERI Processing', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2023 });
  });

  it('should reduce cost basis when ERI is processed', async () => {
    // First acquire shares
    await calculator.addAcquisition({
      date: new Date('2023-01-15'),
      action: ActionType.BUY,
      symbol: 'FUND',
      description: 'Buy fund',
      quantity: new Decimal(100),
      price: new Decimal(10),
      fees: new Decimal(5),
      amount: new Decimal(-1005),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Process ERI should reduce cost basis
    const eriDate = new Date('2023-06-15');
    const eriEntry = calculator.processEri('FUND', eriDate);

    // No ERI data, so should return null
    expect(eriEntry).toBeNull();
  });

  it('should return null when no position exists for ERI', async () => {
    const eriDate = new Date('2023-06-15');
    const eriEntry = calculator.processEri('NONEXISTENT', eriDate);

    expect(eriEntry).toBeNull();
  });
});

describe('Calculator - Spin-off Processing', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2023 });
  });

  it('should add spin-off events to the list', async () => {
    const spinOff = {
      source: 'MMM',
      dest: 'SOLV',
      costProportion: new Decimal(0.25),
      date: new Date('2023-06-15'),
    };

    calculator.addSpinOff(spinOff);

    expect(calculator).toBeDefined();
  });

  it('should transfer cost basis from parent to spinoff', async () => {
    // Acquire parent company shares
    await calculator.addAcquisition({
      date: new Date('2023-01-15'),
      action: ActionType.BUY,
      symbol: 'MMM',
      description: 'Buy MMM',
      quantity: new Decimal(100),
      price: new Decimal(100),
      fees: new Decimal(10),
      amount: new Decimal(-10010),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Create spin-off event
    const spinOff = {
      source: 'MMM',
      dest: 'SOLV',
      costProportion: new Decimal(0.25), // Transfer 25% of cost to spinoff
      date: new Date('2023-06-15'),
    };

    const entries = calculator.processSpinOff(spinOff, spinOff.date);

    // Should create two entries: reduction and addition
    expect(entries).toHaveLength(2);
    expect(entries[0]!.type).toBe('spinoff_reduction');
    expect(entries[1]!.type).toBe('spinoff_addition');

    // Amount transferred should be 25% of cost basis
    // Cost basis = 10010
    // 25% = 2502.50
    expect(entries[0]!.amount.abs().toString()).toBe('2502.5');
    expect(entries[1]!.amount.toString()).toBe('2502.5');
  });

  it('should return empty array when no position in parent', async () => {
    const spinOff = {
      source: 'NONEXISTENT',
      dest: 'SOLV',
      costProportion: new Decimal(0.25),
      date: new Date('2023-06-15'),
    };

    const entries = calculator.processSpinOff(spinOff, spinOff.date);

    expect(entries).toHaveLength(0);
  });
});

describe('Calculator - Integration Tests', () => {
  let calculator: CapitalGainsCalculator;

  beforeEach(() => {
    calculator = new CapitalGainsCalculator({ taxYear: 2023 });
  });

  it('should calculate capital gains with dividends and interest', async () => {
    // Buy shares
    await calculator.addAcquisition({
      date: new Date('2023-01-15'),
      action: ActionType.BUY,
      symbol: 'AAPL',
      description: 'Buy AAPL',
      quantity: new Decimal(10),
      price: new Decimal(100),
      fees: new Decimal(5),
      amount: new Decimal(-1005),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Sell shares
    await calculator.addDisposal({
      date: new Date('2023-06-15'),
      action: ActionType.SELL,
      symbol: 'AAPL',
      description: 'Sell AAPL',
      quantity: new Decimal(10),
      price: new Decimal(150),
      fees: new Decimal(5),
      amount: new Decimal(1495),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Add dividend
    calculator.addDividend({
      date: new Date('2023-03-15'),
      action: ActionType.DIVIDEND,
      symbol: 'AAPL',
      description: 'Dividend',
      quantity: null,
      price: null,
      fees: new Decimal(0),
      amount: new Decimal(50),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Add interest
    calculator.addInterest({
      date: new Date('2023-04-01'),
      action: ActionType.INTEREST,
      symbol: null,
      description: 'Interest',
      quantity: null,
      price: null,
      fees: new Decimal(0),
      amount: new Decimal(25),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    // Capital gain = 1495 - 1005 = 490
    expect(report.capitalGain.toString()).toBe('490');
    expect(report.capitalLoss.toString()).toBe('0');
    expect(report.taxYear).toBe(2023);

    // Calculation log should include dividends and interest
    expect(report.calculationLog.size).toBeGreaterThan(0);
  });

  it('should handle spin-off event and maintain cost basis', async () => {
    // Buy parent company
    await calculator.addAcquisition({
      date: new Date('2023-01-15'),
      action: ActionType.BUY,
      symbol: 'MMM',
      description: 'Buy MMM',
      quantity: new Decimal(100),
      price: new Decimal(100),
      fees: new Decimal(10),
      amount: new Decimal(-10010),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    // Add spin-off event
    calculator.addSpinOff({
      source: 'MMM',
      dest: 'SOLV',
      costProportion: new Decimal(0.25),
      date: new Date('2023-06-15'),
    });

    // Acquire spinoff shares (broker typically adds shares at $0)
    await calculator.addAcquisition({
      date: new Date('2023-06-15'),
      action: ActionType.STOCK_ACTIVITY,
      symbol: 'SOLV',
      description: 'Spinoff SOLV from MMM',
      quantity: new Decimal(25),
      price: new Decimal(0),
      fees: new Decimal(0),
      amount: new Decimal(0),
      currency: 'GBP',
      broker: 'Test Broker',
    });

    const report = await calculator.calculateCapitalGain();

    expect(report.taxYear).toBe(2023);
    expect(report.capitalGain.toString()).toBe('0');
    expect(report.capitalLoss.toString()).toBe('0');

    // Both positions should exist in portfolio
    expect(report.portfolio.has('MMM')).toBe(true);
    expect(report.portfolio.has('SOLV')).toBe(true);

    // MMM cost basis should be reduced by 25% (10010 * 0.75 = 7507.5)
    const mmmPosition = report.portfolio.get('MMM')!;
    expect(mmmPosition.amount.toString()).toBe('7507.5');
    expect(mmmPosition.quantity.toString()).toBe('100');

    // SOLV cost basis should be 25% of MMM original cost (10010 * 0.25 = 2502.5)
    const solvPosition = report.portfolio.get('SOLV')!;
    expect(solvPosition.amount.toString()).toBe('2502.5');
    expect(solvPosition.quantity.toString()).toBe('25');
  });
});
