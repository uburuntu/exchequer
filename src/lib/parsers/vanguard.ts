/**
 * Vanguard transaction parser
 *
 * Parses Vanguard UK transaction exports
 */

import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction } from '../types';
import { ActionType } from '../types';
import { ZERO } from '../utils/decimal';
import { ParsingError, UnexpectedColumnCountError } from './errors';
import { parseDecimalFromString } from './utils';

const BROKER_NAME = 'Vanguard';

enum VanguardColumn {
  DATE = 'Date',
  DETAILS = 'Details',
  AMOUNT = 'Amount',
  BALANCE = 'Balance',
}

const COLUMNS = Object.values(VanguardColumn);

const BOUGHT_RE = /^Bought (\d*[,]?\d*) .*\((.*)\)$/;
const SOLD_RE = /^Sold (\d*[,]?\d*) .*\((.*)\)$/;
const DIV_RE = /^DIV: ([^.]+)\.[^ ]+ @ ([A-Z]+) (\d*[,.]?\d*)/;
const TRANSFER_RE = /.*(Regular Deposit|Deposit via|Deposit for|Payment by|Account Fee).*/;

const INTEREST_STR = 'Cash Account Interest';
const REVERSAL_STR = 'Reversal of ';

interface VanguardTransactionData extends BrokerTransaction {
  isReversal: boolean;
}

function actionFromStr(label: string, fileName: string): ActionType {
  if (TRANSFER_RE.test(label)) {
    return ActionType.TRANSFER;
  }

  if (BOUGHT_RE.test(label)) {
    return ActionType.BUY;
  }

  if (SOLD_RE.test(label)) {
    return ActionType.SELL;
  }

  if (DIV_RE.test(label)) {
    return ActionType.DIVIDEND;
  }

  if (label === INTEREST_STR) {
    return ActionType.INTEREST;
  }

  throw new ParsingError(fileName, `Unknown action: ${label}`);
}

function parseVanguardTransaction(
  header: string[],
  rowRaw: string[],
  fileName: string
): VanguardTransactionData {
  const currency = 'GBP';
  const broker = BROKER_NAME;

  if (rowRaw.length !== COLUMNS.length) {
    throw new UnexpectedColumnCountError(fileName, COLUMNS.length, rowRaw.length);
  }

  const row: Record<string, string> = {};
  for (let i = 0; i < header.length; i++) {
    row[header[i]!] = rowRaw[i] || '';
  }

  const dateStr = row[VanguardColumn.DATE] || '';
  let date: Date;
  try {
    const parts = dateStr.split('/');
    const day = parseInt(parts[0]!, 10);
    const month = parseInt(parts[1]!, 10);
    const year = parseInt(parts[2]!, 10);
    date = new Date(Date.UTC(year, month - 1, day));
  } catch (err) {
    throw new ParsingError(fileName, `Invalid date format: ${dateStr}`);
  }

  let details = row[VanguardColumn.DETAILS] || '';
  let isReversal = false;
  if (details.startsWith(REVERSAL_STR)) {
    details = details.slice(REVERSAL_STR.length);
    isReversal = true;
  }

  const action = actionFromStr(details, fileName);

  const fees = ZERO;
  const amount = parseDecimalFromString(row[VanguardColumn.AMOUNT]!, VanguardColumn.AMOUNT, fileName);

  let quantity: Decimal | null = null;
  let price: Decimal | null = null;
  let symbol: string | null = null;
  let finalCurrency = currency;

  if (action === 'BUY') {
    const match = BOUGHT_RE.exec(details);
    if (!match) {
      throw new ParsingError(fileName, `Failed to parse BUY details: ${details}`);
    }

    quantity = parseDecimalFromString(match[1]!, 'Details quantity', fileName);
    symbol = match[2]!;
    price = amount.abs().div(quantity);
  } else if (action === 'SELL') {
    const match = SOLD_RE.exec(details);
    if (!match) {
      throw new ParsingError(fileName, `Failed to parse SELL details: ${details}`);
    }

    quantity = parseDecimalFromString(match[1]!, 'Details quantity', fileName);
    symbol = match[2]!;
    price = amount.div(quantity);
  } else if (action === 'DIVIDEND') {
    const match = DIV_RE.exec(details);
    if (!match) {
      throw new ParsingError(fileName, `Failed to parse DIVIDEND details: ${details}`);
    }

    symbol = match[1]!;
    finalCurrency = match[2]!;
    price = parseDecimalFromString(match[3]!, 'Details price', fileName);
    quantity = new Decimal(Math.round(amount.div(price).toNumber()));
  }

  return {
    date,
    action,
    symbol,
    description: '',
    quantity,
    price,
    fees,
    amount,
    currency: finalCurrency,
    broker,
    isReversal,
  };
}

function validateHeader(header: string[], fileName: string): void {
  if (header.length !== COLUMNS.length) {
    throw new UnexpectedColumnCountError(fileName, COLUMNS.length, header.length);
  }

  for (let i = 0; i < COLUMNS.length; i++) {
    if (COLUMNS[i] !== header[i]) {
      throw new ParsingError(
        fileName,
        `Expected column ${i + 1} to be '${COLUMNS[i]}' but found '${header[i]}'`
      );
    }
  }
}

function sortByDateAndAction(a: VanguardTransactionData, b: VanguardTransactionData): number {
  if (a.date.getTime() !== b.date.getTime()) {
    return a.date.getTime() - b.date.getTime();
  }

  const aIsBuy = a.action === 'BUY' ? 1 : 0;
  const bIsBuy = b.action === 'BUY' ? 1 : 0;
  if (aIsBuy !== bIsBuy) {
    return aIsBuy - bIsBuy;
  }

  const aIsReversal = a.isReversal ? 1 : 0;
  const bIsReversal = b.isReversal ? 1 : 0;
  return aIsReversal - bIsReversal;
}

export class VanguardParser implements BrokerParser {
  readonly brokerName = 'Vanguard';

  async parse(fileContent: string, fileName: string): Promise<ParserResult> {
    const warnings: string[] = [];

    // Check for empty file before parsing
    if (!fileContent || fileContent.trim() === '') {
      throw new ParsingError(fileName, 'Vanguard CSV file is empty');
    }

    const parseResult = Papa.parse<string[]>(fileContent, {
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      throw new ParsingError(fileName, `CSV parsing failed: ${parseResult.errors[0]!.message}`);
    }

    const lines = parseResult.data;

    if (lines.length === 0) {
      throw new ParsingError(fileName, 'Vanguard CSV file is empty');
    }

    const header = lines[0]!;
    validateHeader(header, fileName);

    const transactions: VanguardTransactionData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i]!;
      const rowIndex = i + 1;

      try {
        transactions.push(parseVanguardTransaction(header, row, fileName));
      } catch (err) {
        if (err instanceof ParsingError) {
          if (err.rowIndex === undefined) {
            err.rowIndex = rowIndex;
          }
        }
        throw err;
      }
    }

    if (transactions.length === 0) {
      warnings.push(`No transactions detected in file "${fileName}"`);
    }

    transactions.sort(sortByDateAndAction);

    const baseTransactions: BrokerTransaction[] = transactions.map((t) => ({
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

export const vanguardParser = new VanguardParser();
