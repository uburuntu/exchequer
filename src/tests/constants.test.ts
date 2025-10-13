/**
 * Constants validation tests
 */

import { describe, it, expect } from 'vitest';
import {
  getCapitalGainAllowance,
  getDividendAllowance,
  DIVIDEND_DOUBLE_TAXATION_RULES,
} from '../lib/constants/allowances';
import {
  UK_CURRENCY,
  BED_AND_BREAKFAST_DAYS,
  getRenamedTicker,
  CAPITAL_GAIN_ALLOWANCES,
  DIVIDEND_ALLOWANCES,
} from '../lib/constants/hmrc';

describe('Capital Gains Allowances', () => {
  it('should have allowances for recent years', () => {
    expect(CAPITAL_GAIN_ALLOWANCES[2024]).toBe(3000);
    expect(CAPITAL_GAIN_ALLOWANCES[2023]).toBe(6000);
    expect(CAPITAL_GAIN_ALLOWANCES[2022]).toBe(12300);
  });

  it('should get allowance for valid year', () => {
    expect(getCapitalGainAllowance(2024)).toBe(3000);
  });

  it('should return null for invalid year', () => {
    expect(getCapitalGainAllowance(2050)).toBeNull();
  });
});

describe('Dividend Allowances', () => {
  it('should have allowances for recent years', () => {
    expect(DIVIDEND_ALLOWANCES[2024]).toBe(500);
    expect(DIVIDEND_ALLOWANCES[2023]).toBe(1000);
    expect(DIVIDEND_ALLOWANCES[2022]).toBe(2000);
  });

  it('should get allowance for valid year', () => {
    expect(getDividendAllowance(2024)).toBe(500);
  });

  it('should return null for invalid year', () => {
    expect(getDividendAllowance(2018)).toBeNull();
  });
});

describe('Double Taxation Rules', () => {
  it('should have USD tax treaty', () => {
    const usd = DIVIDEND_DOUBLE_TAXATION_RULES['USD'];
    expect(usd).toBeDefined();
    expect(usd?.country).toBe('USA');
    expect(usd?.countryRate.toString()).toBe('0.15');
    expect(usd?.treatyRate.toString()).toBe('0.15');
  });

  it('should have Poland tax treaty', () => {
    const pln = DIVIDEND_DOUBLE_TAXATION_RULES['PLN'];
    expect(pln).toBeDefined();
    expect(pln?.country).toBe('Poland');
    expect(pln?.countryRate.toString()).toBe('0.19');
    expect(pln?.treatyRate.toString()).toBe('0.1');
  });
});

describe('HMRC Constants', () => {
  it('should have correct UK currency', () => {
    expect(UK_CURRENCY).toBe('GBP');
  });

  it('should have correct Bed and Breakfast days', () => {
    expect(BED_AND_BREAKFAST_DAYS).toBe(30);
  });
});

describe('Ticker Renames', () => {
  it('should rename FB to META', () => {
    expect(getRenamedTicker('FB')).toBe('META');
  });

  it('should return original ticker if no rename', () => {
    expect(getRenamedTicker('AAPL')).toBe('AAPL');
  });
});
