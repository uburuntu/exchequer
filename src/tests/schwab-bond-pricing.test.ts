/**
 * Schwab bond pricing tests
 *
 * Tests the handling of CUSIP bond symbols where prices are quoted per $100 face value
 * and need to be divided by 100 for calculation purposes.
 */

import { describe, it, expect } from 'vitest';
import { schwabParser } from '../lib/parsers/schwab';
import { adjustCusipBondPrice } from '../lib/parsers/schwab-cusip-bonds';
import Decimal from 'decimal.js-light';

const HEADER = 'Date,Action,Symbol,Description,Price,Quantity,Fees & Comm,Amount';

describe('Schwab Parser - Bond Pricing', () => {
  it('should divide bond buy price by 100 for CUSIP symbols', async () => {
    const csv = `${HEADER}
01/01/2024,Buy,91282CMF5,US TREASURY NOTE,$9917.27,40000,$0.00,-$3966908.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.price?.toString()).toBe('99.1727');
  });

  it('should divide bond sell price by 100 for CUSIP symbols', async () => {
    const csv = `${HEADER}
01/01/2024,Sell,91282CKS9,US TREASURY NOTE,$10076.95,50000,$50.00,$5038425.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.price?.toString()).toBe('100.7695');
  });

  it('should not divide regular stock price', async () => {
    const csv = `${HEADER}
01/01/2024,Buy,AAPL,APPLE INC,$150.00,10,$0.00,-$1500.00`;

    const result = await schwabParser.parse(csv, 'test.csv');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.price?.toString()).toBe('150');
  });

  describe('CUSIP Detection', () => {
    const testCases: Array<[string | null, boolean]> = [
      ['91282CMF5', true],  // Valid CUSIP (US Treasury Note)
      ['912797QL4', true],  // Valid CUSIP (US Treasury Bill)
      ['91282CKE0', true],  // Valid CUSIP (US Treasury Note)
      ['AAPL', false],      // Too short (4 chars)
      ['12345678', false],  // Too short (8 chars)
      ['1234567890', false], // Too long (10 chars)
      ['123456789', false], // Invalid check digit
      ['12345678A', false], // Invalid check digit
      [null, false],        // None
    ];

    testCases.forEach(([symbol, expectedIsCusip]) => {
      it(`should ${expectedIsCusip ? 'detect' : 'not detect'} "${symbol}" as CUSIP`, () => {
        const price = new Decimal('10000.00');
        const quantity = new Decimal(100);
        const fees = new Decimal(0);

        // For valid CUSIP: amount should match quantity * (price/100)
        // For invalid: amount should match quantity * price
        const amount = expectedIsCusip
          ? quantity.times(price.div(100)).negated()
          : quantity.times(price).negated();

        const [adjustedPrice, adjustedFees] = adjustCusipBondPrice(
          symbol,
          price,
          quantity,
          amount,
          fees
        );

        if (expectedIsCusip) {
          expect(adjustedPrice?.toString()).toBe(price.div(100).toString());
        } else {
          expect(adjustedPrice?.toString()).toBe(price.toString());
        }
        expect(adjustedFees.toString()).toBe(fees.toString());
      });
    });
  });

  describe('Bond Price Adjustment Validation', () => {
    const validationTestCases: Array<{
      name: string;
      price: string;
      quantity: string;
      amount: string;
      fees: string;
      shouldAdjust: boolean;
    }> = [
      {
        name: 'Valid bond buy with no accrued interest',
        price: '9917.27',
        quantity: '40000',
        amount: '-3966908.00',
        fees: '0',
        shouldAdjust: true,
      },
      {
        name: 'Valid bond sell with small accrued interest',
        price: '10076.95',
        quantity: '50000',
        amount: '5038425.00',
        fees: '50.00',
        shouldAdjust: true,
      },
      {
        name: 'Invalid: amount too far off (should not apply adjustment)',
        price: '10000.00',
        quantity: '10000',
        amount: '-50000000.00',
        fees: '0',
        shouldAdjust: false,
      },
      {
        name: 'Fractional quantity edge case',
        price: '10000.00',
        quantity: '100.5',
        amount: '-10050.00',
        fees: '0',
        shouldAdjust: true,
      },
      {
        name: 'Zero fees',
        price: '10000.00',
        quantity: '100',
        amount: '-10000.00',
        fees: '0',
        shouldAdjust: true,
      },
      {
        name: 'With fees',
        price: '10000.00',
        quantity: '100',
        amount: '-10050.00',
        fees: '50.00',
        shouldAdjust: true,
      },
    ];

    validationTestCases.forEach(({ name, price, quantity, amount, fees, shouldAdjust }) => {
      it(name, () => {
        const symbol = '91282CMF5'; // Valid CUSIP
        const priceDecimal = new Decimal(price);
        const quantityDecimal = new Decimal(quantity);
        const amountDecimal = new Decimal(amount);
        const feesDecimal = new Decimal(fees);

        const [adjustedPrice, adjustedFees] = adjustCusipBondPrice(
          symbol,
          priceDecimal,
          quantityDecimal,
          amountDecimal,
          feesDecimal
        );

        if (shouldAdjust) {
          expect(adjustedPrice?.toString()).toBe(priceDecimal.div(100).toString());
        } else {
          expect(adjustedPrice?.toString()).toBe(priceDecimal.toString());
          expect(adjustedFees.toString()).toBe(feesDecimal.toString());
        }
      });
    });
  });

  it('should add accrued interest to fees for bonds', () => {
    const symbol = '91282CMF5';
    const price = new Decimal('9917.27');
    const quantity = new Decimal(40000);
    const fees = new Decimal(0);

    // Amount includes $500 accrued interest
    // Expected: 40000 * (9917.27/100) = 3,966,908
    // Actual: 3,966,908 + 500 = 3,967,408
    const amount = new Decimal('-3967408.00');

    const [adjustedPrice, adjustedFees] = adjustCusipBondPrice(
      symbol,
      price,
      quantity,
      amount,
      fees
    );

    // Price should be divided by 100
    expect(adjustedPrice?.toString()).toBe('99.1727');

    // Accrued interest should be added to fees
    // accrued_interest = |amount| - |expected_amount| - |fees|
    // accrued_interest = 3967408 - 3966908 - 0 = 500
    expect(adjustedFees.toString()).toBe('500');
  });

  it('should not add very small accrued interest (<=0.01) to fees', () => {
    const symbol = '91282CMF5';
    const price = new Decimal('10000.00');
    const quantity = new Decimal(100);
    const fees = new Decimal(0);

    // Amount exactly equals quantity * (price/100), no accrued interest
    const amount = new Decimal('-10000.00');

    const [adjustedPrice, adjustedFees] = adjustCusipBondPrice(
      symbol,
      price,
      quantity,
      amount,
      fees
    );

    // Price adjusted but fees unchanged
    expect(adjustedPrice?.toString()).toBe('100');
    expect(adjustedFees.toString()).toBe('0');
  });
});
