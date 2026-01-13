/**
 * Capital Gains Calculator
 *
 * Main calculator class that processes broker transactions and applies
 * HMRC capital gains tax rules.
 */

import Decimal from 'decimal.js-light';
import type { BrokerTransaction, SpinOff } from '../types';
import {
  Position,
  HmrcTransactionData,
  ShortPosition,
  type HmrcTransactionLog,
  type CalculationEntry,
  type CalculationLog,
  type CalculationWarning,
  type ExcessReportedIncome,
  type ExcessReportedIncomeDistributionLog,
  type ForeignAmountLog,
  type ForeignCurrencyAmount,
  RuleType,
  CalculationType,
  WarningSeverity,
  WarningCategory,
} from './types';
import {
  getAmountOrFail,
  getSymbolOrFail,
  QuantityNotPositiveError,
  InvalidTransactionError,
  PriceMissingError,
  approxEqualPriceRounding,
  CalculatedAmountDiscrepancyError,
} from './helpers';
import { addToList, hasKey } from './transaction-log';
import { applySameDayRule } from './same-day-rule';
import { applyBedAndBreakfastRule, type BedAndBreakfastRuleContext } from './bed-and-breakfast-rule';
import { applySection104Rule } from './section-104-rule';
import { getTaxYearStart, getTaxYearEnd, isDateInTaxYear } from '../utils/tax-year';
import { roundDecimal, ZERO } from '../utils/decimal';
import { INTERNAL_START_DATE, CAPITAL_GAIN_ALLOWANCES } from '../constants/hmrc';
import { currencyConverter } from '../services/currency-converter';

export interface CapitalGainsCalculatorOptions {
  taxYear: number;
  balanceCheck?: boolean;
  interestFundTickers?: string[];
}

import type { CapitalGainsReport } from './types';
// Re-export CapitalGainsReport from types for convenience
export type { CapitalGainsReport } from './types';

export class CapitalGainsCalculator {
  private taxYear: number;
  private taxYearStartDate: Date;
  private taxYearEndDate: Date;

  private acquisitionList: HmrcTransactionLog = new Map();
  private disposalList: HmrcTransactionLog = new Map();
  private bnbList: HmrcTransactionLog = new Map();
  private splitList: Map<string, Decimal> = new Map();
  private spinOffList: Map<string, SpinOff[]> = new Map(); // date -> list of spinoffs

  private portfolio: Map<string, Position> = new Map();
  private eris: Map<string, Map<string, ExcessReportedIncome>> = new Map();
  private erisDistribution: ExcessReportedIncomeDistributionLog = new Map();

  // Dividend and interest tracking
  private dividendList: Map<string, ForeignCurrencyAmount> = new Map(); // (symbol,date) -> amount
  private dividendTaxList: Map<string, ForeignCurrencyAmount> = new Map(); // (symbol,date) -> tax
  private interestList: ForeignAmountLog = new Map(); // (broker,currency,date) -> amount
  private totalUkInterest: Decimal = ZERO;
  private totalForeignInterest: Decimal = ZERO;
  private calculationLogYields: CalculationLog = new Map(); // For dividends and interest

  // Short position tracking
  // When selling more shares than owned, we open a short position
  // FIFO queue per symbol - oldest shorts covered first
  private shortPositions: Map<string, ShortPosition[]> = new Map();
  // Track short cover events for calculation logging
  private shortCoverList: Map<string, Map<string, HmrcTransactionData>> = new Map();

  // Calculation warnings - collected during processing
  private warnings: CalculationWarning[] = [];

  // Reserved for future: balanceCheck, interestFundTickers options

  constructor(options: CapitalGainsCalculatorOptions) {
    this.taxYear = options.taxYear;
    this.taxYearStartDate = getTaxYearStart(options.taxYear);
    this.taxYearEndDate = getTaxYearEnd(options.taxYear);
  }

  /**
   * Add a warning to the calculation
   */
  private addWarning(
    severity: WarningSeverity,
    category: WarningCategory,
    message: string,
    symbol: string | null = null,
    date: Date | null = null,
    details?: Record<string, unknown>
  ): void {
    this.warnings.push({
      severity,
      category,
      symbol,
      date,
      message,
      details,
    });
  }

  dateInTaxYear(date: Date): boolean {
    return isDateInTaxYear(date, this.taxYear);
  }

  getEri(symbol: string, date: Date): ExcessReportedIncome | null {
    const dateKey = date.toISOString().split('T')[0]!;
    const dateMap = this.eris.get(dateKey);
    if (!dateMap) {
      return null;
    }
    return dateMap.get(symbol) || null;
  }

  /**
   * Process Excess Reported Income (ERI) for a symbol on a given date.
   * ERI reduces the cost basis of offshore fund holdings.
   *
   * @param symbol Security symbol
   * @param dateIndex Date of ERI event
   */
  processEri(symbol: string, dateIndex: Date): CalculationEntry | null {
    const eri = this.getEri(symbol, dateIndex);
    if (!eri) {
      return null;
    }

    const position = this.portfolio.get(symbol);
    if (!position) {
      // No position to apply ERI to
      return null;
    }

    // ERI increases the cost basis (reinvested income)
    // Calculate total ERI amount for the holding: quantity * amountPerShare
    const allowableCost = position.quantity.times(eri.amount);

    // Add to pool cost
    const newPoolCost = position.amount.plus(allowableCost);
    position.amount = newPoolCost;

    // Create calculation entry for logging
    const calculationEntry: CalculationEntry = {
      type: 'eri' as const,
      rule: RuleType.ERI,
      quantity: position.quantity,
      amount: allowableCost.negated(), // Show as cost adjustment
      fees: ZERO,
      newQuantity: position.quantity,
      newPoolCost,
      allowableCost,
    };

    return calculationEntry;
  }

  /**
   * Add a spin-off event to the spinoff list.
   * Spin-offs transfer a portion of the parent company's cost basis to the new company.
   *
   * @param spinOff Spin-off event details
   */
  addSpinOff(spinOff: SpinOff): void {
    const dateKey = spinOff.date.toISOString().split('T')[0]!;

    if (!this.spinOffList.has(dateKey)) {
      this.spinOffList.set(dateKey, []);
    }

    this.spinOffList.get(dateKey)!.push(spinOff);
  }

  addEri(transaction: BrokerTransaction): void {
    const symbol = getSymbolOrFail(transaction);
    const amount = transaction.amount;

    if (amount === null) {
      throw new InvalidTransactionError(transaction, 'ERI must have an amount');
    }

    const dateKey = transaction.date.toISOString().split('T')[0]!;
    if (!this.eris.has(dateKey)) {
      this.eris.set(dateKey, new Map());
    }

    const dateMap = this.eris.get(dateKey)!;
    // Overwrite if duplicate ERI exists for same symbol/date

    dateMap.set(symbol, {
      date: transaction.date,
      symbol,
      amount, // this is the excess income amount
    });
  }

  /**
   * Process a spin-off event, transferring cost basis from parent to spinoff.
   *
   * @param spinOff Spin-off event
   * @param dateIndex Date of the spin-off
   */
  processSpinOff(spinOff: SpinOff, _dateIndex: Date): CalculationEntry[] {
    const calculationEntries: CalculationEntry[] = [];

    const parentPosition = this.portfolio.get(spinOff.source);
    if (!parentPosition) {
      // No position in parent company, nothing to spin off
      return calculationEntries;
    }

    // Calculate amount to transfer from parent to spinoff
    const transferAmount = parentPosition.amount.times(spinOff.costProportion);

    // Reduce parent cost basis
    parentPosition.amount = parentPosition.amount.minus(transferAmount);

    // Check if we already have a position in the spinoff company
    const spinoffPosition = this.portfolio.get(spinOff.dest) || new Position(ZERO, ZERO);

    // Add transferred cost basis to spinoff position
    // Note: quantity comes from broker transactions, we only transfer cost basis here
    this.portfolio.set(spinOff.dest, new Position(
      spinoffPosition.quantity,
      spinoffPosition.amount.plus(transferAmount)
    ));

    // Create calculation entries for logging
    calculationEntries.push({
      type: 'spinoff_reduction' as const,
      rule: RuleType.SECTION_104,
      quantity: parentPosition.quantity,
      amount: transferAmount.negated(), // Show as reduction
      fees: ZERO,
      newQuantity: parentPosition.quantity,
      newPoolCost: parentPosition.amount,
    });

    calculationEntries.push({
      type: 'spinoff_addition' as const,
      rule: RuleType.SECTION_104,
      quantity: spinoffPosition.quantity,
      amount: transferAmount,
      fees: ZERO,
      newQuantity: spinoffPosition.quantity,
      newPoolCost: this.portfolio.get(spinOff.dest)!.amount,
    });

    return calculationEntries;
  }

  async addAcquisition(transaction: BrokerTransaction): Promise<void> {
    const symbol = getSymbolOrFail(transaction);
    let quantity = transaction.quantity;
    const price = transaction.price;

    if (quantity === null || quantity.isZero() || quantity.isNegative()) {
      throw new QuantityNotPositiveError(transaction);
    }

    let amount: Decimal;

    if (transaction.action === 'STOCK_ACTIVITY') {
      if (price === null) {
        throw new PriceMissingError(transaction);
      }
      amount = roundDecimal(quantity.times(price), 2);
    } else if (transaction.action === 'STOCK_SPLIT') {
      // Stock splits have no cost basis
      amount = ZERO;
    } else {
      if (price === null) {
        throw new PriceMissingError(transaction);
      }

      amount = getAmountOrFail(transaction);
      const calculatedAmount = quantity.times(price).plus(transaction.fees);

      if (
        !approxEqualPriceRounding(
          amount,
          quantity,
          price,
          transaction.fees,
          CalculationType.ACQUISITION
        )
      ) {
        throw new CalculatedAmountDiscrepancyError(transaction, calculatedAmount.negated());
      }

      amount = amount.negated();
    }

    // Convert to GBP upfront
    const gbpAmount = await currencyConverter.convertToGbp(amount, transaction.currency, transaction.date);
    const gbpFees = await currencyConverter.convertToGbp(transaction.fees, transaction.currency, transaction.date);

    // Check if we have open short positions to cover first
    const openShorts = this.shortPositions.get(symbol);
    if (openShorts && openShorts.length > 0) {
      let remainingQuantity = quantity;
      let remainingCost = gbpAmount.abs(); // Cost to cover (positive)
      let remainingFees = gbpFees;
      const dateKey = transaction.date.toISOString().split('T')[0]!;

      // Cover shorts in FIFO order
      while (openShorts.length > 0 && remainingQuantity.greaterThan(ZERO)) {
        const shortPosition = openShorts[0]!;
        // Use conditional to find minimum (Decimal.min not available in decimal.js-light)
        const coverQuantity = remainingQuantity.lessThan(shortPosition.quantity)
          ? remainingQuantity
          : shortPosition.quantity;

        // Get proportional proceeds from the short sale
        // Note: shortProceeds is already net of fees (proceeds - sell fees)
        const shortProceeds = shortPosition.getProceedsFor(coverQuantity);

        // Calculate cost to cover this portion
        // Note: coverCost is already inclusive of fees (cost + buy fees)
        const coverProportion = coverQuantity.div(quantity);
        const coverCost = gbpAmount.abs().times(coverProportion);
        const coverFees = gbpFees.times(coverProportion);

        // Track the short cover for calculation
        // Store: amount = net proceeds, fees = total cost to cover
        // Gain = amount - fees = (proceeds - sell fees) - (cost + buy fees)
        if (!this.shortCoverList.has(dateKey)) {
          this.shortCoverList.set(dateKey, new Map());
        }

        const symbolCoverKey = `${symbol}:${shortPosition.openDate.toISOString().split('T')[0]}`;
        const existing = this.shortCoverList.get(dateKey)!.get(symbolCoverKey);
        if (existing) {
          this.shortCoverList.get(dateKey)!.set(
            symbolCoverKey,
            existing.add(new HmrcTransactionData(coverQuantity, shortProceeds, coverCost, []))
          );
        } else {
          this.shortCoverList.get(dateKey)!.set(
            symbolCoverKey,
            new HmrcTransactionData(coverQuantity, shortProceeds, coverCost, [])
          );
        }

        // Update or remove the short position
        const updatedShort = shortPosition.cover(coverQuantity);
        if (updatedShort === null) {
          openShorts.shift(); // Fully covered, remove from queue
        } else {
          openShorts[0] = updatedShort; // Partially covered, update
        }

        remainingQuantity = remainingQuantity.minus(coverQuantity);
        remainingCost = remainingCost.minus(coverCost);
        remainingFees = remainingFees.minus(coverFees);
      }

      // Clean up empty short positions array
      if (openShorts.length === 0) {
        this.shortPositions.delete(symbol);
      }

      // If all shares used to cover shorts, we're done
      if (remainingQuantity.isZero()) {
        return;
      }

      // Update quantity and amount for remaining shares going to pool
      quantity = remainingQuantity;
      // Amount for pool is the remaining cost (positive, like regular acquisitions)
      const remainingAmount = remainingCost;

      const currentPosition = this.portfolio.get(symbol) || new Position();
      this.portfolio.set(symbol, currentPosition.add(new Position(quantity, remainingAmount)));

      addToList(this.acquisitionList, transaction.date, symbol, quantity, remainingAmount, remainingFees);
      return;
    }

    // No shorts to cover - regular acquisition
    const currentPosition = this.portfolio.get(symbol) || new Position();
    this.portfolio.set(symbol, currentPosition.add(new Position(quantity, amount)));

    addToList(this.acquisitionList, transaction.date, symbol, quantity, gbpAmount, gbpFees);
  }

  async addDisposal(transaction: BrokerTransaction): Promise<void> {
    const symbol = getSymbolOrFail(transaction);
    const quantity = transaction.quantity;

    const currentPosition = this.portfolio.get(symbol);
    const currentQuantity = currentPosition?.quantity ?? ZERO;

    if (quantity === null || quantity.isZero() || quantity.isNegative()) {
      throw new QuantityNotPositiveError(transaction);
    }

    const amount = getAmountOrFail(transaction);
    const price = transaction.price;

    if (price === null) {
      throw new PriceMissingError(transaction);
    }

    const calculatedAmount = quantity.times(price).minus(transaction.fees);
    if (
      !approxEqualPriceRounding(
        amount,
        quantity,
        price,
        transaction.fees,
        CalculationType.DISPOSAL
      )
    ) {
      throw new CalculatedAmountDiscrepancyError(transaction, calculatedAmount);
    }

    // Convert to GBP upfront
    const gbpAmount = await currencyConverter.convertToGbp(amount, transaction.currency, transaction.date);
    const gbpFees = await currencyConverter.convertToGbp(transaction.fees, transaction.currency, transaction.date);

    // Check if this is a short sell (selling more than we own)
    if (quantity.greaterThan(currentQuantity)) {
      // Split into regular disposal + short opening
      const regularQuantity = currentQuantity;
      const shortQuantity = quantity.minus(currentQuantity);

      // Process regular disposal portion (if any)
      if (regularQuantity.greaterThan(ZERO)) {
        const regularProportion = regularQuantity.div(quantity);
        const regularAmount = amount.times(regularProportion);
        const regularGbpAmount = gbpAmount.times(regularProportion);
        const regularGbpFees = gbpFees.times(regularProportion);

        this.portfolio.set(symbol, currentPosition!.sub(new Position(regularQuantity, regularAmount)));

        if (this.portfolio.get(symbol)!.quantity.isZero()) {
          this.portfolio.delete(symbol);
        }

        addToList(this.disposalList, transaction.date, symbol, regularQuantity, regularGbpAmount, regularGbpFees);
      } else if (currentPosition) {
        // Clear out any zero position
        this.portfolio.delete(symbol);
      }

      // Open short position for the remaining quantity
      const shortProportion = shortQuantity.div(quantity);
      const shortProceeds = gbpAmount.times(shortProportion);
      const shortFees = gbpFees.times(shortProportion);

      const shortPosition = new ShortPosition(
        shortQuantity,
        shortProceeds,
        transaction.date,
        shortFees
      );

      // Add to short positions queue (FIFO)
      if (!this.shortPositions.has(symbol)) {
        this.shortPositions.set(symbol, []);
      }
      this.shortPositions.get(symbol)!.push(shortPosition);

      return;
    }

    // Regular disposal - we own enough shares
    this.portfolio.set(symbol, currentPosition!.sub(new Position(quantity, amount)));

    if (this.portfolio.get(symbol)!.quantity.isZero()) {
      this.portfolio.delete(symbol);
    }

    addToList(this.disposalList, transaction.date, symbol, quantity, gbpAmount, gbpFees);
  }

  addDividend(transaction: BrokerTransaction): void {
    const symbol = getSymbolOrFail(transaction);
    const amount = transaction.amount;
    const currency = transaction.currency;

    if (amount === null) {
      throw new InvalidTransactionError(transaction, 'Dividend must have an amount');
    }

    const dateKey = `${symbol}:${transaction.date.toISOString().split('T')[0]}`;

    // Add to dividend list
    const existing = this.dividendList.get(dateKey);
    if (existing) {
      this.dividendList.set(dateKey, {
        amount: existing.amount.plus(amount),
        currency: existing.currency,
      });
    } else {
      this.dividendList.set(dateKey, { amount, currency });
    }

    // Track tax (usually negative/withheld at source)
    const tax = transaction.fees.negated(); // Fees represent tax withheld
    const existingTax = this.dividendTaxList.get(dateKey);
    if (existingTax) {
      this.dividendTaxList.set(dateKey, {
        amount: existingTax.amount.plus(tax),
        currency: existingTax.currency,
      });
    } else {
      this.dividendTaxList.set(dateKey, { amount: tax, currency });
    }
  }

  addInterest(transaction: BrokerTransaction): void {
    const amount = transaction.amount;
    const currency = transaction.currency;
    const broker = transaction.broker;

    if (amount === null) {
      throw new InvalidTransactionError(transaction, 'Interest must have an amount');
    }

    const dateKey = `${broker}:${currency}:${transaction.date.toISOString().split('T')[0]}`;

    // Add to interest list
    const existing = this.interestList.get(dateKey);
    if (existing) {
      this.interestList.set(dateKey, {
        amount: existing.amount.plus(amount),
        currency: existing.currency,
      });
    } else {
      this.interestList.set(dateKey, { amount, currency });
    }
  }

  /**
   * Process all interest income for tax reporting.
   * Groups interest by month and adds to calculation log.
   */
  async processInterests(): Promise<void> {
    // Group interest by broker, currency, and month
    const monthlyInterest: Map<string, Map<string, Decimal>> = new Map();

    for (const [key, foreignAmount] of this.interestList.entries()) {
      const [broker, currency, dateStr] = key.split(':');
      const date = new Date(dateStr + 'T00:00:00.000Z');

      if (!this.dateInTaxYear(date)) {
        continue;
      }

      // Group by year-month
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const groupKey = `${broker}:${currency}:${monthKey}`;

      if (!monthlyInterest.has(groupKey)) {
        monthlyInterest.set(groupKey, new Map([['amount', ZERO], ['currency', ZERO]]));
      }

      const group = monthlyInterest.get(groupKey)!;
      group.set('amount', group.get('amount')!.plus(foreignAmount.amount));
    }

    // Process grouped interest
    for (const [groupKey, values] of monthlyInterest.entries()) {
      const parts = groupKey.split(':');
      const broker = parts[0]!;
      const currency = parts[1]!;
      const monthKey = parts[2]!;
      const amount = values.get('amount')!;

      // Use first day of month for exchange rate lookup
      const monthParts = monthKey.split('-');
      const year = monthParts[0]!;
      const month = monthParts[1]!;
      const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));

      // Convert to GBP
      const convertedAmount = await currencyConverter.convertToGbp(amount, currency, date);

      if (currency === 'GBP') {
        this.totalUkInterest = this.totalUkInterest.plus(convertedAmount);
      } else {
        this.totalForeignInterest = this.totalForeignInterest.plus(convertedAmount);
      }

      // Add to calculation log
      const dateKey = date.toISOString().split('T')[0]!;

      if (!this.calculationLogYields.has(dateKey)) {
        this.calculationLogYields.set(dateKey, new Map());
      }

      this.calculationLogYields.get(dateKey)!.set(`interest$${broker}$${currency}`, [
        {
          type: 'interest' as const,
          rule: RuleType.INTEREST,
          quantity: new Decimal(1),
          amount: convertedAmount,
          fees: ZERO,
          newQuantity: new Decimal(1),
          newPoolCost: ZERO,
        },
      ]);
    }
  }

  /**
   * Process all dividend events and taxes.
   */
  async processDividends(): Promise<void> {
    for (const [key, foreignAmount] of this.dividendList.entries()) {
      const keyParts = key.split(':');
      const symbol = keyParts[0]!;
      const dateStr = keyParts[1]!;
      const date = new Date(dateStr + 'T00:00:00.000Z');

      // Convert to GBP
      const amount = await currencyConverter.convertToGbp(foreignAmount.amount, foreignAmount.currency, date);

      if (!this.dateInTaxYear(date)) {
        continue;
      }

      // Note: tax treaty support can be added using dividendTaxList

      const dateKey = date.toISOString().split('T')[0]!;

      if (!this.calculationLogYields.has(dateKey)) {
        this.calculationLogYields.set(dateKey, new Map());
      }

      this.calculationLogYields.get(dateKey)!.set(`dividend$${symbol}`, [
        {
          type: 'dividend' as const,
          rule: RuleType.DIVIDEND,
          quantity: new Decimal(1),
          amount,
          fees: ZERO,
          newQuantity: new Decimal(1),
          newPoolCost: ZERO,
        },
      ]);
    }
  }

  processAcquisition(symbol: string, dateIndex: Date): CalculationEntry[] {
    const dateKey = dateIndex.toISOString().split('T')[0]!;
    const acquisition = this.acquisitionList.get(dateKey)!.get(symbol)!;
    const position = this.portfolio.get(symbol) || new Position();

    const bnbAcquisition = hasKey(this.bnbList, dateIndex, symbol)
      ? this.bnbList.get(dateKey)!.get(symbol)!
      : new HmrcTransactionData(ZERO, ZERO, ZERO, []);

    const calculationEntries: CalculationEntry[] = [];

    const modifiedAmount = acquisition.amount.minus(bnbAcquisition.amount);
    const bedAndBreakfastFees = bnbAcquisition.fees;

    // Always update portfolio with new acquisition
    const newQuantity = position.quantity.plus(acquisition.quantity);
    const newPoolCost = position.amount.plus(modifiedAmount);

    // Only add calculation entry if there are shares not matched by B&B
    if (
      acquisition.quantity.minus(bnbAcquisition.quantity).greaterThan(ZERO) ||
      bnbAcquisition.quantity.isZero()
    ) {
      calculationEntries.push({
        type: 'acquisition',
        rule: RuleType.SECTION_104,
        quantity: acquisition.quantity.minus(bnbAcquisition.quantity),
        amount: modifiedAmount.minus(bnbAcquisition.amount).negated(),
        fees: acquisition.fees.minus(bedAndBreakfastFees),
        newQuantity,
        newPoolCost,
        allowableCost: acquisition.amount,
      });
    }

    // Always update the portfolio with new position
    this.portfolio.set(symbol, new Position(newQuantity, newPoolCost));

    return calculationEntries;
  }

  processDisposal(
    symbol: string,
    dateIndex: Date
  ): { gain: Decimal; entries: CalculationEntry[] } {
    const dateKey = dateIndex.toISOString().split('T')[0]!;
    const disposal = this.disposalList.get(dateKey)!.get(symbol)!;
    let disposalQuantity = disposal.quantity;
    const proceedsAmount = disposal.amount;
    const originalDisposalQuantity = disposalQuantity;
    const disposalPrice = proceedsAmount.div(disposalQuantity);
    let currentQuantity = this.portfolio.get(symbol)?.quantity || ZERO;

    let currentAmount = this.portfolio.get(symbol)?.amount || ZERO;

    if (disposalQuantity.greaterThan(currentQuantity)) {
      throw new Error(
        `Disposal quantity ${disposalQuantity} exceeds current quantity ${currentQuantity}`
      );
    }

    let chargeableGain = ZERO;
    const calculationEntries: CalculationEntry[] = [];

    // Apply Same-Day Rule
    const sameDayResult = applySameDayRule(
      this.acquisitionList,
      dateIndex,
      symbol,
      disposalQuantity,
      disposalPrice,
      disposal.fees,
      originalDisposalQuantity,
      currentQuantity,
      currentAmount
    );

    chargeableGain = chargeableGain.plus(sameDayResult.gain);
    disposalQuantity = sameDayResult.disposalQuantityRemaining;
    currentQuantity = sameDayResult.currentQuantityRemaining;
    currentAmount = sameDayResult.currentAmountRemaining;

    if (sameDayResult.calculationEntry) {
      calculationEntries.push(sameDayResult.calculationEntry);
    }

    // Apply Bed & Breakfast Rule
    if (disposalQuantity.greaterThan(ZERO)) {
      const bnbContext: BedAndBreakfastRuleContext = {
        acquisitionList: this.acquisitionList,
        disposalList: this.disposalList,
        bnbList: this.bnbList,
        splitList: this.splitList,
        erisDistribution: this.erisDistribution,
        getEri: (sym, date) => this.getEri(sym, date),
        dateInTaxYear: (date) => this.dateInTaxYear(date),
      };

      const bnbResult = applyBedAndBreakfastRule(
        bnbContext,
        dateIndex,
        symbol,
        disposalQuantity,
        disposalPrice,
        disposal.fees,
        originalDisposalQuantity,
        currentQuantity,
        currentAmount
      );

      chargeableGain = chargeableGain.plus(bnbResult.gain);
      disposalQuantity = bnbResult.disposalQuantityRemaining;
      currentQuantity = bnbResult.currentQuantityRemaining;
      currentAmount = bnbResult.currentAmountRemaining;

      calculationEntries.push(...bnbResult.calculationEntries);
    }

    // Apply Section 104 Rule
    if (disposalQuantity.greaterThan(ZERO)) {
      const section104Result = applySection104Rule(
        disposalQuantity,
        disposalPrice,
        disposal.fees,
        originalDisposalQuantity,
        currentQuantity,
        currentAmount
      );

      chargeableGain = chargeableGain.plus(section104Result.gain);
      currentQuantity = section104Result.currentQuantityRemaining;
      currentAmount = section104Result.currentAmountRemaining;

      if (section104Result.calculationEntry) {
        calculationEntries.push(section104Result.calculationEntry);
      }
    }

    // Update portfolio after all rules applied
    if (currentQuantity.isZero()) {
      this.portfolio.delete(symbol);
    } else {
      this.portfolio.set(symbol, new Position(currentQuantity, currentAmount));
    }

    chargeableGain = roundDecimal(chargeableGain, 2);

    return {
      gain: chargeableGain,
      entries: calculationEntries,
    };
  }

  /**
   * Process short covers for a given date.
   * When a BUY covers an open short, we calculate the gain/loss.
   * Gain = Proceeds from short sale - Cost to cover - Fees
   */
  processShortCovers(dateIndex: Date): { gain: Decimal; entries: CalculationEntry[] } {
    const dateKey = dateIndex.toISOString().split('T')[0]!;
    const coverMap = this.shortCoverList.get(dateKey);

    if (!coverMap) {
      return { gain: ZERO, entries: [] };
    }

    let totalGain = ZERO;
    const calculationEntries: CalculationEntry[] = [];

    for (const [_symbolCoverKey, coverData] of coverMap.entries()) {

      // Gain = Proceeds (from short sale) - Cost to cover - Total fees
      // coverData.amount = proceeds from short sale
      // coverData.fees = total fees (short sale fees + cover fees)
      // We need the cost to cover, which is implicit in the calculation
      // Actually, in our tracking: amount = proceeds, fees = coverCost + all fees
      // So gain = proceeds - (coverCost + fees) = proceeds - fees
      // But wait, we stored it as: fees = coverCost + coverFees + shortFees
      // So the gain = proceeds - fees (where fees includes the cover cost)
      const gain = coverData.amount.minus(coverData.fees);

      totalGain = totalGain.plus(gain);

      calculationEntries.push({
        type: 'short_cover',
        rule: RuleType.SHORT_COVER,
        quantity: coverData.quantity,
        amount: coverData.amount, // Proceeds from original short
        fees: coverData.fees, // Total cost (cover + all fees)
        gain: roundDecimal(gain, 2),
      });
    }

    return {
      gain: roundDecimal(totalGain, 2),
      entries: calculationEntries,
    };
  }

  async calculateCapitalGain(): Promise<CapitalGainsReport> {
    // Clear warnings from any previous calculation
    this.warnings = [];

    const beginIndex = INTERNAL_START_DATE;
    const taxYearStartIndex = this.taxYearStartDate;
    const endIndex = this.taxYearEndDate;

    let capitalGain = ZERO;
    let capitalLoss = ZERO;

    this.portfolio.clear();

    const calculationLog: CalculationLog = new Map();

    const daysDiff = Math.floor(
      (endIndex.getTime() - beginIndex.getTime()) / (1000 * 60 * 60 * 24)
    );

    for (let dayOffset = 0; dayOffset <= daysDiff; dayOffset++) {
      const dateIndex = new Date(beginIndex);
      dateIndex.setUTCDate(dateIndex.getUTCDate() + dayOffset);
      const dateKey = dateIndex.toISOString().split('T')[0]!;

      // Process acquisitions
      const acqDateMap = this.acquisitionList.get(dateKey);
      if (acqDateMap) {
        for (const symbol of acqDateMap.keys()) {
          const calculationEntries = this.processAcquisition(symbol, dateIndex);

          if (dateIndex >= taxYearStartIndex) {
            if (!calculationLog.has(dateKey)) {
              calculationLog.set(dateKey, new Map());
            }
            calculationLog.get(dateKey)!.set(`buy$${symbol}`, calculationEntries);
          }
        }
      }

      // Process ERI (Excess Reported Income) - reduces cost basis
      // Check if there's an ERI event for any symbol on this date
      const eriDateMap = this.eris.get(dateKey);
      if (eriDateMap) {
        for (const symbol of eriDateMap.keys()) {
          const eriEntry = this.processEri(symbol, dateIndex);

          if (eriEntry && dateIndex >= taxYearStartIndex) {
            if (!calculationLog.has(dateKey)) {
              calculationLog.set(dateKey, new Map());
            }
            calculationLog.get(dateKey)!.set(`eri$${symbol}`, [eriEntry]);
          }
        }
      }

      // Process spin-offs - transfers cost basis from parent to spinoff company
      const spinOffDateList = this.spinOffList.get(dateKey);
      if (spinOffDateList) {
        for (const spinOff of spinOffDateList) {
          const spinoffEntries = this.processSpinOff(spinOff, dateIndex);

          if (spinoffEntries.length > 0 && dateIndex >= taxYearStartIndex) {
            if (!calculationLog.has(dateKey)) {
              calculationLog.set(dateKey, new Map());
            }
            calculationLog.get(dateKey)!.set(`spinoff$${spinOff.source}$${spinOff.dest}`, spinoffEntries);
          }
        }
      }

      // Process disposals
      const dispDateMap = this.disposalList.get(dateKey);
      if (dispDateMap) {
        for (const symbol of dispDateMap.keys()) {
          const { gain: transactionCapitalGain, entries: calculationEntries } =
            this.processDisposal(symbol, dateIndex);

          if (dateIndex >= taxYearStartIndex) {
            if (!calculationLog.has(dateKey)) {
              calculationLog.set(dateKey, new Map());
            }
            calculationLog.get(dateKey)!.set(`sell$${symbol}`, calculationEntries);

            if (transactionCapitalGain.greaterThan(ZERO)) {
              capitalGain = capitalGain.plus(transactionCapitalGain);
            } else {
              capitalLoss = capitalLoss.plus(transactionCapitalGain);
            }
          }
        }
      }

      // Process short covers (when BUYs cover open short positions)
      const shortCoverResult = this.processShortCovers(dateIndex);
      if (shortCoverResult.entries.length > 0 && dateIndex >= taxYearStartIndex) {
        if (!calculationLog.has(dateKey)) {
          calculationLog.set(dateKey, new Map());
        }

        // Group entries by symbol for cleaner logging
        for (const entry of shortCoverResult.entries) {
          const symbol = entry.type === 'short_cover' ? 'short' : 'unknown';
          calculationLog.get(dateKey)!.set(`short_cover$${symbol}`, shortCoverResult.entries);
        }

        if (shortCoverResult.gain.greaterThan(ZERO)) {
          capitalGain = capitalGain.plus(shortCoverResult.gain);
        } else {
          capitalLoss = capitalLoss.plus(shortCoverResult.gain);
        }
      }
    }

    // Process dividends and interest
    await this.processInterests();
    await this.processDividends();

    // Merge yields calculation log into main calculation log
    for (const [dateKey, symbolMap] of this.calculationLogYields.entries()) {
      if (!calculationLog.has(dateKey)) {
        calculationLog.set(dateKey, new Map());
      }
      const dateLog = calculationLog.get(dateKey)!;
      for (const [symbol, entries] of symbolMap.entries()) {
        dateLog.set(symbol, entries);
      }
    }

    const allowanceValue = CAPITAL_GAIN_ALLOWANCES[this.taxYear] || 0;
    const allowance = new Decimal(allowanceValue);

    // Generate warnings for open short positions at year end
    for (const [symbol, shorts] of this.shortPositions.entries()) {
      const totalShortQuantity = shorts.reduce(
        (sum, s) => sum.plus(s.quantity),
        ZERO
      );
      if (totalShortQuantity.greaterThan(ZERO)) {
        this.addWarning(
          WarningSeverity.WARNING,
          WarningCategory.OPEN_POSITION,
          `Open short position of ${totalShortQuantity} shares for ${symbol} at year end. ` +
          `This position will need to be covered in a future tax year.`,
          symbol,
          this.taxYearEndDate,
          { quantity: totalShortQuantity.toNumber(), shortCount: shorts.length }
        );
      }
    }

    // Generate warnings for negative pool amounts (data quality issue)
    for (const [symbol, position] of this.portfolio.entries()) {
      if (position.amount.isNegative()) {
        this.addWarning(
          WarningSeverity.WARNING,
          WarningCategory.DATA_QUALITY,
          `Negative cost basis of £${position.amount.abs().toFixed(2)} for ${symbol}. ` +
          `This may indicate missing acquisition data.`,
          symbol,
          null,
          { quantity: position.quantity.toNumber(), amount: position.amount.toNumber() }
        );
      }
    }

    return {
      taxYear: this.taxYear,
      capitalGain,
      capitalLoss,
      allowance,
      calculationLog,
      dividends: this.dividendList,
      interest: this.interestList,
      portfolio: this.portfolio,
      warnings: this.warnings,
    };
  }
}
