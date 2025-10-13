/**
 * Coinbase transaction parser
 *
 * Coinbase exports transactions in CSV format with metadata rows at the top.
 * The first 2 rows are metadata (Transactions header, User info).
 *
 * Expected columns:
 * - ID: Unique transaction ID
 * - Timestamp: Transaction timestamp (YYYY-MM-DD HH:MM:SS UTC)
 * - Transaction Type: Type of transaction (Buy, Sell, Send, Receive, Staking Income, etc.)
 * - Asset: Crypto symbol (BTC, ETH, XTZ, etc.)
 * - Quantity Transacted: Amount of crypto
 * - Price Currency: Currency code (GBP, USD, EUR)
 * - Price at Transaction: Price per unit with currency symbol
 * - Subtotal: Subtotal before fees
 * - Total (inclusive of fees and/or spread): Total including fees
 * - Fees and/or Spread: Fee amount
 * - Notes: Additional info
 */

import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction } from '../types';
import { ActionType } from '../types';
import { ZERO } from '../utils/decimal';
import { ParsingError } from './errors';

/**
 * Coinbase column names
 */
const COINBASE_COLUMNS = {
  ID: 'ID',
  TIMESTAMP: 'Timestamp',
  TRANSACTION_TYPE: 'Transaction Type',
  ASSET: 'Asset',
  QUANTITY_TRANSACTED: 'Quantity Transacted',
  PRICE_CURRENCY: 'Price Currency',
  PRICE_AT_TRANSACTION: 'Price at Transaction',
  SUBTOTAL: 'Subtotal',
  TOTAL: 'Total (inclusive of fees and/or spread)',
  FEES: 'Fees and/or Spread',
  NOTES: 'Notes',
} as const;

/**
 * Check if headers match Coinbase format
 */
function isCoinbaseFormat(headers: string[]): boolean {
  const requiredColumns = [
    COINBASE_COLUMNS.TIMESTAMP,
    COINBASE_COLUMNS.TRANSACTION_TYPE,
    COINBASE_COLUMNS.ASSET,
    COINBASE_COLUMNS.QUANTITY_TRANSACTED,
    COINBASE_COLUMNS.PRICE_CURRENCY,
  ];

  return requiredColumns.every(col => headers.includes(col));
}

/**
 * Map Coinbase transaction type to ActionType
 */
function mapTransactionType(transactionType: string): ActionType | null {
  const typeLower = transactionType.toLowerCase();

  // Buy transactions
  if (typeLower === 'buy' || typeLower === 'advanced trade buy') {
    return ActionType.BUY;
  }

  // Sell transactions
  if (typeLower === 'sell' || typeLower === 'advanced trade sell') {
    return ActionType.SELL;
  }

  // Staking and reward income - treat as INTEREST
  if (typeLower === 'staking income' || typeLower === 'reward income') {
    return ActionType.INTEREST;
  }

  // Dividend
  if (typeLower === 'dividend') {
    return ActionType.DIVIDEND;
  }

  // Transfers
  if (
    typeLower === 'send' ||
    typeLower === 'receive' ||
    typeLower === 'deposit' ||
    typeLower === 'withdrawal' ||
    typeLower === 'pro deposit' ||
    typeLower === 'pro withdrawal'
  ) {
    return ActionType.TRANSFER;
  }

  // Convert transactions - return null to signal special handling
  if (typeLower === 'convert') {
    return null;
  }

  // Staking transfers - internal movements
  if (
    typeLower === 'retail staking transfer' ||
    typeLower === 'retail unstaking transfer' ||
    typeLower === 'retail eth2 deprecation'
  ) {
    return ActionType.TRANSFER;
  }

  // Default to TRANSFER for unknown types
  return ActionType.TRANSFER;
}

/**
 * Parse Coinbase date format: "YYYY-MM-DD HH:MM:SS UTC" -> Date
 */
function parseCoinbaseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Extract date part "YYYY-MM-DD"
  const datePart = dateStr.split(' ')[0];
  if (!datePart) return null;

  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;

  return new Date(Date.UTC(
    parseInt(year!, 10),
    parseInt(month!, 10) - 1,
    parseInt(day!, 10)
  ));
}

/**
 * Parse currency value, handling £/$/€ symbols
 */
function parseCurrencyValue(value: string | undefined): Decimal | null {
  if (!value || value.trim() === '') return null;

  // Remove currency symbols and commas
  const cleaned = value.replace(/[£$€,]/g, '').trim();

  try {
    return new Decimal(cleaned);
  } catch {
    return null;
  }
}

/**
 * Parse quantity, handling negative values
 */
function parseQuantity(value: string | undefined): Decimal | null {
  if (!value || value.trim() === '') return null;

  try {
    return new Decimal(value.trim());
  } catch {
    return null;
  }
}

/**
 * Parse Convert transaction Notes field to extract acquired asset details
 * Expected format: "Converted X.XX ASSET1 to Y.YY ASSET2"
 */
function parseConvertNotes(
  notes: string | undefined
): { acquiredAsset: string; acquiredQuantity: Decimal } | null {
  if (!notes) return null;

  const match = notes.match(/Converted\s+[\d.]+\s+\w+\s+to\s+([\d.]+)\s+(\w+)/i);
  if (!match) return null;

  const [, quantity, asset] = match;
  if (!quantity || !asset) return null;

  try {
    return {
      acquiredAsset: asset,
      acquiredQuantity: new Decimal(quantity),
    };
  } catch {
    return null;
  }
}

/**
 * Coinbase parser
 */
export class CoinbaseParser implements BrokerParser {
  readonly brokerName = 'Coinbase';

  async parse(fileContent: string, fileName: string): Promise<ParserResult> {
    const warnings: string[] = [];

    // Parse CSV
    const parseResult = Papa.parse<string[]>(fileContent, {
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      throw new ParsingError(
        fileName,
        `CSV parsing failed: ${parseResult.errors[0]!.message}`
      );
    }

    const lines = parseResult.data;

    if (lines.length < 3) {
      throw new ParsingError(fileName, 'Coinbase CSV file is too short (needs header + data rows)');
    }

    // Find the header row (contains "Transaction Type")
    let headerIndex = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (lines[i]!.includes('Transaction Type')) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      throw new ParsingError(
        fileName,
        'Not a valid Coinbase format. Could not find header row with "Transaction Type"'
      );
    }

    const header = lines[headerIndex]!;

    // Validate format
    if (!isCoinbaseFormat(header)) {
      throw new ParsingError(
        fileName,
        'Not a valid Coinbase format. Expected columns: Timestamp, Transaction Type, Asset, Quantity Transacted, Price Currency'
      );
    }

    // Create column index map
    const colIndex: Record<string, number> = {};
    for (let i = 0; i < header.length; i++) {
      colIndex[header[i]!] = i;
    }

    const dataRows = lines.slice(headerIndex + 1);
    const transactions: BrokerTransaction[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]!;
      const rowIndex = headerIndex + i + 2; // Account for skipped rows and 1-indexing

      // Get timestamp
      const timestampStr = row[colIndex[COINBASE_COLUMNS.TIMESTAMP]!];
      const date = parseCoinbaseDate(timestampStr || '');
      if (!date) {
        warnings.push(`${fileName}:${rowIndex}: Invalid date format "${timestampStr}", skipping row`);
        continue;
      }

      // Get transaction type
      const transactionType = row[colIndex[COINBASE_COLUMNS.TRANSACTION_TYPE]!];
      if (!transactionType) {
        continue; // Skip rows without transaction type
      }

      // Skip header-like rows
      if (transactionType === 'Transaction Type') {
        continue;
      }

      // Get asset
      const asset = row[colIndex[COINBASE_COLUMNS.ASSET]!]?.trim();
      if (!asset) {
        continue; // Skip rows without asset
      }

      const action = mapTransactionType(transactionType);

      // Parse numeric values
      const quantity = parseQuantity(row[colIndex[COINBASE_COLUMNS.QUANTITY_TRANSACTED]!]);
      const price = parseCurrencyValue(row[colIndex[COINBASE_COLUMNS.PRICE_AT_TRANSACTION]!]);
      const subtotal = parseCurrencyValue(row[colIndex[COINBASE_COLUMNS.SUBTOTAL]!]);
      const total = parseCurrencyValue(row[colIndex[COINBASE_COLUMNS.TOTAL]!]);
      const fees = parseCurrencyValue(row[colIndex[COINBASE_COLUMNS.FEES]!]);
      const notes = row[colIndex[COINBASE_COLUMNS.NOTES]!];

      // Currency
      const currency = row[colIndex[COINBASE_COLUMNS.PRICE_CURRENCY]!]?.trim() || 'GBP';

      // Calculate final total (prefer Total column, fallback to Subtotal)
      const finalTotal = total !== null ? total.abs() :
        subtotal !== null ? subtotal.abs() : null;

      // Final quantity (always positive)
      const finalQuantity = quantity !== null ? quantity.abs() : null;

      // Skip transfers for CGT purposes
      if (action === ActionType.TRANSFER) {
        continue;
      }

      // Handle Convert transactions specially (crypto-to-crypto exchange)
      // Per HMRC CRYPTO22100: exchanging crypto for crypto is a disposal
      if (action === null && transactionType.toLowerCase() === 'convert') {
        // Create SELL transaction for the disposed asset
        const sellTransaction: BrokerTransaction = {
          date,
          action: ActionType.SELL,
          symbol: asset,
          description: `[Convert - Disposal] ${notes || ''}`.trim(),
          quantity: finalQuantity,
          price: price !== null ? price.abs() : null,
          fees: fees !== null ? fees.abs() : ZERO,
          amount: finalTotal,
          currency,
          broker: 'Coinbase',
          isin: null,
        };
        transactions.push(sellTransaction);

        // Create BUY transaction for the acquired asset (if we can parse Notes)
        const convertInfo = parseConvertNotes(notes);
        if (convertInfo) {
          const acquiredPrice = finalTotal !== null && !convertInfo.acquiredQuantity.isZero()
            ? finalTotal.div(convertInfo.acquiredQuantity)
            : null;

          const buyTransaction: BrokerTransaction = {
            date,
            action: ActionType.BUY,
            symbol: convertInfo.acquiredAsset,
            description: `[Convert - Acquisition] ${notes || ''}`.trim(),
            quantity: convertInfo.acquiredQuantity,
            price: acquiredPrice,
            fees: ZERO, // Fee already in SELL transaction
            amount: finalTotal,
            currency,
            broker: 'Coinbase',
            isin: null,
          };
          transactions.push(buyTransaction);
        } else {
          warnings.push(
            `${fileName}:${rowIndex}: Could not parse acquired asset from Convert Notes. Only SELL created.`
          );
        }

        continue;
      }

      if (action === null) {
        warnings.push(`${fileName}:${rowIndex}: Unknown transaction type "${transactionType}", skipping`);
        continue;
      }

      const transaction: BrokerTransaction = {
        date,
        action,
        symbol: asset,
        description: transactionType + (notes ? `: ${notes}` : ''),
        quantity: finalQuantity,
        price: price !== null ? price.abs() : null,
        fees: fees !== null ? fees.abs() : ZERO,
        amount: finalTotal,
        currency,
        broker: 'Coinbase',
        isin: null,
      };

      transactions.push(transaction);
    }

    if (transactions.length === 0) {
      warnings.push(`No valid crypto transactions found in file "${fileName}"`);
    }

    // Sort by date
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      transactions,
      fileName,
      broker: this.brokerName,
      warnings,
    };
  }
}

// Create singleton instance
export const coinbaseParser = new CoinbaseParser();
