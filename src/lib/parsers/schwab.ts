/**
 * Charles Schwab transaction parser
 *
 * Supports Schwab transaction exports with optional award prices file.
 * Implements MultiFileBrokerParser to handle both Individual Transactions
 * and Equity Awards files together.
 */

import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { 
  MultiFileBrokerParser, 
  MultiFileParserResult, 
  ParserResult, 
  BrokerFileGroup,
  BrokerFileType,
} from './base';
import type { BrokerTransaction } from '../types';
import { ActionType } from '../types';
import { getRenamedTicker } from '../constants';
import { ZERO } from '../utils/decimal';
import { ParsingError, UnexpectedColumnCountError } from './errors';
import { adjustCusipBondPrice } from './schwab-cusip-bonds';

/** Schwab file types */
export const SCHWAB_FILE_TYPES = {
  INDIVIDUAL: 'individual',
  AWARDS: 'awards',
} as const;

export type SchwabFileType = typeof SCHWAB_FILE_TYPES[keyof typeof SCHWAB_FILE_TYPES];

const OLD_COLUMNS_NUM = 9;
const NEW_COLUMNS_NUM = 8;
const CANCEL_BUY_SEARCH_DAYS = 5;

enum SchwabColumn {
  DATE = 'Date',
  ACTION = 'Action',
  SYMBOL = 'Symbol',
  DESCRIPTION = 'Description',
  PRICE = 'Price',
  QUANTITY = 'Quantity',
  FEES_AND_COMM = 'Fees & Comm',
  AMOUNT = 'Amount',
}

enum AwardColumn {
  DATE = 'Date',
  SYMBOL = 'Symbol',
  FAIR_MARKET_VALUE_PRICE = 'FairMarketValuePrice',
}

interface AwardPricesMap {
  [date: string]: { [symbol: string]: Decimal };
}

class AwardPrices {
  constructor(private prices: AwardPricesMap) {}

  get(date: Date, symbol: string): [Date, Decimal] {
    const renamedSymbol = getRenamedTicker(symbol);

    for (let i = 0; i < 7; i++) {
      const searchDate = new Date(date);
      searchDate.setUTCDate(searchDate.getUTCDate() - i);
      const dateKey = searchDate.toISOString().split('T')[0]!;

      if (this.prices[dateKey] && this.prices[dateKey][renamedSymbol]) {
        return [searchDate, this.prices[dateKey][renamedSymbol]!];
      }
    }

    throw new Error(`Award price not found for symbol ${symbol} on date ${date.toISOString().split('T')[0]}`);
  }
}

function parseAction(label: string, fileName: string): ActionType {
  if (['Buy', 'Cancel Buy'].includes(label)) {
    return ActionType.BUY;
  }

  if (label === 'Sell') {
    return ActionType.SELL;
  }

  if ([
    'MoneyLink Transfer',
    'Misc Cash Entry',
    'Service Fee',
    'Wire Funds',
    'Wire Sent',
    'Funds Received',
    'Journal',
    'Cash In Lieu',
    'Visa Purchase',
    'MoneyLink Deposit',
    'MoneyLink Adj',
    'Security Transfer',
  ].includes(label)) {
    return ActionType.TRANSFER;
  }

  if (label === 'Stock Plan Activity') {
    return ActionType.STOCK_ACTIVITY;
  }

  if ([
    'Qualified Dividend',
    'Cash Dividend',
    'Qual Div Reinvest',
    'Div Adjustment',
    'Special Qual Div',
    'Non-Qualified Div',
  ].includes(label)) {
    return ActionType.DIVIDEND;
  }

  if (['NRA Tax Adj', 'NRA Withholding', 'Foreign Tax Paid'].includes(label)) {
    return ActionType.DIVIDEND_TAX;
  }

  if (label === 'ADR Mgmt Fee') {
    return ActionType.FEE;
  }

  if (['Adjustment', 'IRS Withhold Adj', 'Wire Funds Adj'].includes(label)) {
    return ActionType.ADJUSTMENT;
  }

  if (['Short Term Cap Gain', 'Long Term Cap Gain'].includes(label)) {
    return ActionType.CAPITAL_GAIN;
  }

  if (label === 'Spin-off') {
    return ActionType.SPIN_OFF;
  }

  if (['Credit Interest', 'Bond Interest'].includes(label)) {
    return ActionType.INTEREST;
  }

  if (label === 'Reinvest Shares') {
    return ActionType.REINVEST_SHARES;
  }

  if (label === 'Reinvest Dividend') {
    return ActionType.REINVEST_DIVIDENDS;
  }

  if (label === 'Wire Funds Received') {
    return ActionType.WIRE_FUNDS_RECEIVED;
  }

  if (label === 'Stock Split') {
    return ActionType.STOCK_SPLIT;
  }

  if (['Cash Merger', 'Cash Merger Adj'].includes(label)) {
    return ActionType.CASH_MERGER;
  }

  if (['Full Redemption', 'Full Redemption Adj'].includes(label)) {
    return ActionType.FULL_REDEMPTION;
  }

  throw new ParsingError(fileName, `Unknown action: '${label}'`);
}

interface SchwabTransactionData extends BrokerTransaction {
  rawAction: string;
}

interface ParsedTransactionResult {
  transaction: SchwabTransactionData | null;
  warning: string | null;
}

function parseSchwabTransaction(
  row: Record<string, string>,
  fileName: string,
  awardsPrives: AwardPrices
): ParsedTransactionResult {
  const values = Object.values(row);

  if (values.length < NEW_COLUMNS_NUM || values.length > OLD_COLUMNS_NUM) {
    throw new UnexpectedColumnCountError(fileName, NEW_COLUMNS_NUM, values.length);
  }

  if (values.length === OLD_COLUMNS_NUM && values[OLD_COLUMNS_NUM - 1] !== '') {
    throw new ParsingError(fileName, `Column ${OLD_COLUMNS_NUM} should be empty`);
  }

  const asOfStr = ' as of ';
  let dateStr = row[SchwabColumn.DATE] || '';

  if (dateStr.includes(asOfStr)) {
    const index = dateStr.indexOf(asOfStr);
    dateStr = dateStr.substring(0, index);
  }

  let date: Date;
  try {
    const parts = dateStr.split('/');
    const month = parseInt(parts[0]!, 10);
    const day = parseInt(parts[1]!, 10);
    const year = parseInt(parts[2]!, 10);
    date = new Date(Date.UTC(year, month - 1, day));
  } catch (err) {
    throw new ParsingError(fileName, `Invalid date format: ${dateStr}`);
  }

  const rawAction = row[SchwabColumn.ACTION] || '';
  const action = parseAction(rawAction, fileName);

  let symbol: string | null = row[SchwabColumn.SYMBOL] || null;
  if (symbol === '') {
    symbol = null;
  }
  if (symbol !== null) {
    symbol = getRenamedTicker(symbol);
  }

  const description = row[SchwabColumn.DESCRIPTION] || '';

  const priceStr = row[SchwabColumn.PRICE] || '';
  let price: Decimal | null = null;
  if (priceStr) {
    price = new Decimal(priceStr.replace(/[$,]/g, ''));
  }

  const quantityStr = row[SchwabColumn.QUANTITY] || '';
  let quantity: Decimal | null = null;
  if (quantityStr) {
    quantity = new Decimal(quantityStr.replace(/,/g, ''));
  }

  const feesStr = row[SchwabColumn.FEES_AND_COMM] || '';
  let fees: Decimal = ZERO;
  if (feesStr) {
    fees = new Decimal(feesStr.replace(/[$,]/g, ''));
  }

  const amountStr = row[SchwabColumn.AMOUNT] || '';
  let amount: Decimal | null = null;
  if (amountStr) {
    amount = new Decimal(amountStr.replace(/[$,]/g, ''));
  }

  [price, fees] = adjustCusipBondPrice(symbol, price, quantity, amount, fees);

  if (price === null && action === 'STOCK_ACTIVITY') {
    if (symbol === null) {
      throw new ParsingError(fileName, 'Stock Activity transaction missing symbol');
    }
    try {
      const [_vestDate, awardPrice] = awardsPrives.get(date, symbol);
      price = awardPrice;
    } catch (err) {
      // Return null to indicate this transaction should be skipped with a warning
      // Award prices are needed for Stock Plan Activity but may not be provided
      const dateStr = date.toISOString().split('T')[0];
      return {
        transaction: null,
        warning: `Skipped Stock Plan Activity for ${symbol} on ${dateStr} - award price not available. ` +
                 `This won't affect capital gains calculations unless you sold these shares.`,
      };
    }
  }

  const currency = 'USD';
  const broker = 'Charles Schwab';

  return {
    transaction: {
      date,
      action,
      symbol,
      description,
      quantity,
      price,
      fees,
      amount,
      currency,
      broker,
      rawAction,
    },
    warning: null,
  };
}

function combineCashMergerPair(
  cashMerger: SchwabTransactionData,
  cashMergerAdj: SchwabTransactionData,
  fileName: string
): SchwabTransactionData {
  try {
    if (cashMerger.description !== cashMergerAdj.description) {
      throw new Error('Descriptions do not match');
    }
    if (cashMerger.symbol !== cashMergerAdj.symbol) {
      throw new Error('Symbols do not match');
    }
    if (cashMerger.date.getTime() !== cashMergerAdj.date.getTime()) {
      throw new Error('Dates do not match');
    }

    if (cashMerger.amount === null) {
      throw new Error('Cash Merger must have Amount');
    }
    if (cashMerger.quantity !== null) {
      throw new Error('Cash Merger should not have Quantity');
    }
    if (cashMerger.price !== null) {
      throw new Error('Cash Merger should not have Price');
    }

    if (cashMergerAdj.quantity === null) {
      throw new Error('Cash Merger Adj must have Quantity');
    }
    if (cashMergerAdj.amount !== null) {
      throw new Error('Cash Merger Adj should not have Amount');
    }
  } catch (err) {
    throw new ParsingError(
      fileName,
      `Invalid Cash Merger format: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const unified = { ...cashMerger };
  unified.quantity = cashMergerAdj.quantity!.times(-1);
  if (unified.amount === null) {
    throw new ParsingError(fileName, 'Cash Merger transaction missing amount');
  }
  unified.price = unified.amount.div(unified.quantity!);
  unified.fees = unified.fees.plus(cashMergerAdj.fees);

  return unified;
}

function combineFullRedemptionPair(
  fullRedemptionAdj: SchwabTransactionData,
  fullRedemption: SchwabTransactionData,
  fileName: string
): SchwabTransactionData {
  try {
    if (fullRedemptionAdj.description !== fullRedemption.description) {
      throw new Error('Descriptions do not match');
    }
    if (fullRedemptionAdj.symbol !== fullRedemption.symbol) {
      throw new Error('Symbols do not match');
    }
    if (fullRedemptionAdj.date.getTime() !== fullRedemption.date.getTime()) {
      throw new Error('Dates do not match');
    }

    if (fullRedemptionAdj.amount === null) {
      throw new Error('Full Redemption Adj must have Amount');
    }
    if (fullRedemptionAdj.quantity !== null) {
      throw new Error('Full Redemption Adj should not have Quantity');
    }
    if (fullRedemptionAdj.price !== null) {
      throw new Error('Full Redemption Adj should not have Price');
    }

    if (fullRedemption.quantity === null) {
      throw new Error('Full Redemption must have Quantity');
    }
    if (fullRedemption.amount !== null) {
      throw new Error('Full Redemption should not have Amount');
    }
  } catch (err) {
    throw new ParsingError(
      fileName,
      `Invalid Full Redemption format: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const unified = { ...fullRedemptionAdj };
  unified.quantity = fullRedemption.quantity.times(-1);
  unified.price = unified.amount!.div(unified.quantity);
  unified.fees = unified.fees.plus(fullRedemption.fees);

  return unified;
}

function unifyPairedTransactions(
  transactions: SchwabTransactionData[],
  fileName: string
): SchwabTransactionData[] {
  const filtered: SchwabTransactionData[] = [];
  let i = 0;

  while (i < transactions.length) {
    const transaction = transactions[i]!;

    if (transaction.rawAction === 'Cash Merger Adj') {
      if (filtered.length === 0) {
        throw new ParsingError(
          fileName,
          'Cash Merger Adj must be preceded by a Cash Merger transaction'
        );
      }

      const mainTransaction = filtered[filtered.length - 1]!;

      if (mainTransaction.rawAction !== 'Cash Merger') {
        throw new ParsingError(fileName, 'Cash Merger Adj must follow Cash Merger');
      }

      const unified = combineCashMergerPair(mainTransaction, transaction, fileName);
      filtered[filtered.length - 1] = unified;

    } else if (transaction.rawAction === 'Full Redemption Adj') {
      if (i + 1 >= transactions.length) {
        throw new ParsingError(
          fileName,
          'Full Redemption Adj must be followed by a Full Redemption transaction'
        );
      }

      const mainTransaction = transactions[i + 1]!;

      if (mainTransaction.rawAction !== 'Full Redemption') {
        throw new ParsingError(
          fileName,
          'Full Redemption Adj must be followed by Full Redemption'
        );
      }

      const unified = combineFullRedemptionPair(transaction, mainTransaction, fileName);
      filtered.push(unified);
      i++;

    } else {
      filtered.push(transaction);
    }

    i++;
  }

  return filtered;
}

function filterCancelledBuyTransactions(
  transactions: SchwabTransactionData[]
): SchwabTransactionData[] {
  const indicesToRemove = new Set<number>();

  for (let cancelIdx = 0; cancelIdx < transactions.length; cancelIdx++) {
    const transaction = transactions[cancelIdx]!;

    if (transaction.rawAction !== 'Cancel Buy') {
      continue;
    }

    if (indicesToRemove.has(cancelIdx)) {
      continue;
    }

    for (let buyIdx = cancelIdx - 1; buyIdx >= 0; buyIdx--) {
      const buyTxn = transactions[buyIdx]!;

      const daysDiff = Math.abs(
        Math.floor((buyTxn.date.getTime() - transaction.date.getTime()) / (1000 * 60 * 60 * 24))
      );

      if (daysDiff > CANCEL_BUY_SEARCH_DAYS) {
        break;
      }

      if (indicesToRemove.has(buyIdx)) {
        continue;
      }

      if (
        buyTxn.action === 'BUY' &&
        buyTxn.symbol === transaction.symbol &&
        buyTxn.quantity?.equals(transaction.quantity || 0) &&
        buyTxn.price?.equals(transaction.price || 0)
      ) {
        indicesToRemove.add(cancelIdx);
        indicesToRemove.add(buyIdx);
        break;
      }
    }
  }

  return transactions.filter((_, i) => !indicesToRemove.has(i));
}

function readAwardPrices(csvContent: string | null, fileName: string): AwardPrices {
  if (csvContent === null) {
    return new AwardPrices({});
  }

  const parseResult = Papa.parse<string[]>(csvContent, {
    skipEmptyLines: true,
  });

  if (parseResult.errors.length > 0) {
    throw new ParsingError(fileName, `CSV parsing failed: ${parseResult.errors[0]!.message}`);
  }

  const lines = parseResult.data;

  if (lines.length === 0) {
    throw new ParsingError(fileName, 'Charles Schwab Award CSV file is empty');
  }

  const header = lines[0]!;
  const requiredHeaders = [
    AwardColumn.DATE,
    AwardColumn.SYMBOL,
    AwardColumn.FAIR_MARKET_VALUE_PRICE,
  ];

  for (const required of requiredHeaders) {
    if (!header.includes(required)) {
      throw new ParsingError(fileName, `Missing column in awards file: ${required}`);
    }
  }

  const dataLines = lines.slice(1);

  if (dataLines.length % 2 !== 0) {
    throw new ParsingError(
      fileName,
      `Expected even number of rows, got ${dataLines.length}`
    );
  }

  const prices: AwardPricesMap = {};

  for (let i = 0; i < dataLines.length; i += 2) {
    const upperRow = dataLines[i]!;
    const lowerRow = dataLines[i + 1]!;

    const row: string[] = [];
    for (let j = 0; j < upperRow.length; j++) {
      const upper = upperRow[j] || '';
      const lower = lowerRow[j] || '';

      if (upper !== '' && lower !== '') {
        throw new ParsingError(fileName, 'Both upper and lower row have values');
      }

      row.push(upper + lower);
    }

    if (row.length !== header.length) {
      throw new UnexpectedColumnCountError(fileName, header.length, row.length);
    }

    const rowDict: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      rowDict[header[j]!] = row[j]!;
    }

    const dateStr = rowDict[AwardColumn.DATE] || '';
    let date: Date;

    try {
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts[0]!.length === 4) {
          date = new Date(Date.UTC(parseInt(parts[0]!), parseInt(parts[1]!) - 1, parseInt(parts[2]!)));
        } else {
          date = new Date(Date.UTC(parseInt(parts[2]!), parseInt(parts[0]!) - 1, parseInt(parts[1]!)));
        }
      } else {
        throw new Error('Invalid date format');
      }
    } catch (err) {
      throw new ParsingError(fileName, `Invalid date format: ${dateStr}`);
    }

    const symbol = rowDict[AwardColumn.SYMBOL] || null;
    const priceStr = rowDict[AwardColumn.FAIR_MARKET_VALUE_PRICE] || '';

    let price: Decimal | null = null;
    if (priceStr) {
      price = new Decimal(priceStr.replace(/[$,]/g, ''));
    }

    if (symbol && price) {
      const renamedSymbol = getRenamedTicker(symbol);
      const dateKey = date.toISOString().split('T')[0]!;

      if (!prices[dateKey]) {
        prices[dateKey] = {};
      }

      prices[dateKey]![renamedSymbol] = price;
    }
  }

  return new AwardPrices(prices);
}

/**
 * Classify a Schwab CSV file by examining its headers
 * @param content - Raw CSV content
 * @returns File type or null if not a Schwab file
 */
export function classifySchwabFile(content: string): SchwabFileType | null {
  // Parse just the first line to get headers
  const parseResult = Papa.parse<string[]>(content, {
    preview: 1,
  });

  if (parseResult.data.length === 0 || !parseResult.data[0]) {
    return null;
  }

  const header = parseResult.data[0];

  // Check for Individual Transactions file
  // Has: Price, Fees & Comm (but NOT FairMarketValuePrice)
  const hasPrice = header.includes(SchwabColumn.PRICE);
  const hasFeesComm = header.includes(SchwabColumn.FEES_AND_COMM);
  const hasFMV = header.includes(AwardColumn.FAIR_MARKET_VALUE_PRICE);

  if (hasPrice && hasFeesComm && !hasFMV) {
    return SCHWAB_FILE_TYPES.INDIVIDUAL;
  }

  // Check for Equity Awards file
  // Has: FairMarketValuePrice, AwardDate
  const hasAwardDate = header.includes('AwardDate');
  if (hasFMV && hasAwardDate) {
    return SCHWAB_FILE_TYPES.AWARDS;
  }

  return null;
}

export class SchwabParser implements MultiFileBrokerParser {
  readonly brokerName = 'Charles Schwab';

  readonly fileTypes: BrokerFileType[] = [
    {
      type: SCHWAB_FILE_TYPES.INDIVIDUAL,
      required: true,
      label: 'Individual Transactions',
      instructions: 'Accounts → History → Transactions → Export',
    },
    {
      type: SCHWAB_FILE_TYPES.AWARDS,
      required: false,
      label: 'Equity Awards',
      instructions: 'Equity Award Center → Transactions → Export',
    },
  ];

  /**
   * Classify a file as belonging to this broker
   */
  classify(content: string, _fileName: string): string | null {
    return classifySchwabFile(content);
  }

  /**
   * Parse grouped files together (multi-file mode)
   */
  async parseMulti(group: BrokerFileGroup): Promise<MultiFileParserResult> {
    const individualFile = group.files.get(SCHWAB_FILE_TYPES.INDIVIDUAL);
    const awardsFile = group.files.get(SCHWAB_FILE_TYPES.AWARDS);

    if (!individualFile) {
      throw new ParsingError(
        group.files.values().next().value?.fileName ?? 'unknown',
        'Schwab Individual Transactions file is required'
      );
    }

    // Parse using the combined logic
    const result = await this.parse(
      individualFile.content,
      individualFile.fileName,
      awardsFile?.content ?? null
    );

    // Build file breakdown for UI
    const fileBreakdown: MultiFileParserResult['fileBreakdown'] = [
      {
        fileType: SCHWAB_FILE_TYPES.INDIVIDUAL,
        label: 'Individual Transactions',
        count: result.transactions.filter(t => t.action !== ActionType.STOCK_ACTIVITY).length,
        fileName: individualFile.fileName,
      },
    ];

    if (awardsFile) {
      const stockActivityCount = result.transactions.filter(
        t => t.action === ActionType.STOCK_ACTIVITY
      ).length;
      fileBreakdown.push({
        fileType: SCHWAB_FILE_TYPES.AWARDS,
        label: 'Equity Awards',
        count: stockActivityCount,
        fileName: awardsFile.fileName,
      });
    }

    return {
      ...result,
      fileBreakdown,
    };
  }

  /**
   * Parse a single file (standard mode, for backwards compatibility)
   */
  async parse(
    fileContent: string,
    fileName: string,
    awardFileContent: string | null = null
  ): Promise<ParserResult> {
    const warnings: string[] = [];

    const awardPrices = readAwardPrices(
      awardFileContent,
      awardFileContent ? 'awards.csv' : fileName
    );

    const parseResult = Papa.parse<string[]>(fileContent, {
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      throw new ParsingError(fileName, `CSV parsing failed: ${parseResult.errors[0]!.message}`);
    }

    const lines = parseResult.data;

    if (lines.length === 0) {
      throw new ParsingError(fileName, 'Charles Schwab transactions CSV file is empty');
    }

    const header = lines[0]!;
    const requiredHeaders = [
      SchwabColumn.DATE,
      SchwabColumn.ACTION,
      SchwabColumn.SYMBOL,
      SchwabColumn.DESCRIPTION,
      SchwabColumn.PRICE,
      SchwabColumn.QUANTITY,
      SchwabColumn.FEES_AND_COMM,
      SchwabColumn.AMOUNT,
    ];

    for (const required of requiredHeaders) {
      if (!header.includes(required)) {
        throw new ParsingError(
          fileName,
          `Missing column in Schwab transaction file: ${required}`
        );
      }
    }

    const dataRows = lines.slice(1);

    let transactions: SchwabTransactionData[] = [];

    for (const row of dataRows) {
      if (!row.some(cell => cell !== '')) {
        continue;
      }

      const rowDict: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) {
        rowDict[header[i]!] = row[i] || '';
      }

      const result = parseSchwabTransaction(rowDict, fileName, awardPrices);
      
      if (result.warning) {
        warnings.push(result.warning);
      }
      
      if (result.transaction) {
        transactions.push(result.transaction);
      }
    }

    transactions = unifyPairedTransactions(transactions, fileName);
    transactions = filterCancelledBuyTransactions(transactions);
    transactions.reverse();

    const baseTransactions: BrokerTransaction[] = transactions.map(t => ({
      date: t.date,
      action: t.action,
      symbol: t.symbol,
      description: t.description,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      amount: t.amount,
      currency: t.currency,
      broker: t.broker,
    }));

    return {
      transactions: baseTransactions,
      fileName,
      broker: this.brokerName,
      warnings,
    };
  }
}

export const schwabParser = new SchwabParser();
