# Contributing to Exchequer

Thank you for your interest in contributing! This guide will help you add new broker parsers or improve existing functionality.

## Adding a New Broker Parser

Adding support for a new broker is straightforward. Follow these steps:

### 1. Create the Parser File

Create a new file in `src/lib/parsers/` named after your broker (e.g., `mybroker.ts`):

```typescript
import Papa from 'papaparse';
import Decimal from 'decimal.js-light';
import type { BrokerParser, ParserResult } from './base';
import type { BrokerTransaction } from '../types';
import { parseDecimal, parseOptionalDecimal, parseDate } from './utils';
import { ParsingError } from './errors';
import { ZERO } from '../utils/decimal';

const BROKER_NAME = 'My Broker';

// Define column names as they appear in the CSV export
enum MyBrokerColumn {
  DATE = 'Date',
  ACTION = 'Action',
  SYMBOL = 'Symbol',
  QUANTITY = 'Quantity',
  PRICE = 'Price',
  FEES = 'Fees',
}

export class MyBrokerParser implements BrokerParser {
  readonly brokerName = BROKER_NAME;

  async parse(fileContent: string, fileName: string): Promise<ParserResult> {
    const warnings: string[] = [];

    // Parse CSV with PapaParse
    const parseResult = Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      throw new ParsingError(
        fileName,
        `CSV parsing failed: ${parseResult.errors[0]!.message}`
      );
    }

    const transactions: BrokerTransaction[] = [];

    for (const row of parseResult.data) {
      try {
        // Parse date using shared utility
        const date = parseDate(row[MyBrokerColumn.DATE]!, fileName);

        // Parse action
        const action = this.parseAction(row[MyBrokerColumn.ACTION]!);

        // Parse numeric fields
        const quantity = parseOptionalDecimal(row, MyBrokerColumn.QUANTITY);
        const price = parseOptionalDecimal(row, MyBrokerColumn.PRICE);
        const fees = parseDecimal(row, MyBrokerColumn.FEES, fileName);

        // Calculate amount
        const amount = quantity && price
          ? price.times(quantity).minus(fees)
          : null;

        transactions.push({
          date,
          action,
          symbol: row[MyBrokerColumn.SYMBOL] || null,
          description: '',
          quantity,
          price,
          fees,
          amount,
          currency: 'GBP',
          broker: BROKER_NAME,
        });
      } catch (err) {
        warnings.push(
          `Failed to parse row: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return {
      transactions,
      fileName,
      broker: this.brokerName,
      warnings,
    };
  }

  private parseAction(label: string): BrokerTransaction['action'] {
    // Map broker-specific action labels to standard actions
    const normalized = label.toUpperCase();

    if (normalized.includes('BUY')) return 'BUY';
    if (normalized.includes('SELL')) return 'SELL';
    if (normalized.includes('DIVIDEND')) return 'DIVIDEND';
    if (normalized.includes('INTEREST')) return 'INTEREST';

    return 'TRANSFER';
  }
}

// Export singleton instance
export const myBrokerParser = new MyBrokerParser();
```

### 2. Register the Parser

Add your parser to `src/lib/parsers/index.ts`:

```typescript
import { myBrokerParser } from './mybroker';

// ... existing registrations ...

ParserRegistry.register('mybroker', myBrokerParser);
```

### 3. Add to UI

Update `src/lib/components/FileUpload.svelte` to include your broker in the dropdown:

```typescript
const brokers = [
  // ... existing brokers ...
  { id: 'mybroker', name: 'My Broker' },
];
```

### 4. Write Tests

Create a test file `src/tests/parsers/mybroker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { myBrokerParser } from '../../lib/parsers/mybroker';

describe('MyBrokerParser', () => {
  it('parses a simple transaction', async () => {
    const csv = `Date,Action,Symbol,Quantity,Price,Fees
2023-01-15,BUY,AAPL,10,150.00,5.00`;

    const result = await myBrokerParser.parse(csv, 'test.csv');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].action).toBe('BUY');
    expect(result.transactions[0].symbol).toBe('AAPL');
    expect(result.transactions[0].quantity?.toString()).toBe('10');
  });

  // Add more test cases covering edge cases
});
```

### 5. Test with Real Data

1. Export a CSV file from your broker
2. Run the dev server: `pnpm dev`
3. Select your broker from the dropdown
4. Upload the CSV file
5. Verify the transactions are parsed correctly

## Parser Utilities

Use these shared utilities in `src/lib/parsers/utils.ts`:

### `parseDecimal(row, column, fileName, options?)`

Parse a decimal value from a CSV row. Throws an error if invalid.

```typescript
const price = parseDecimal(row, 'Price', fileName);
// With strict mode (throws on empty values):
const required = parseDecimal(row, 'Amount', fileName, { strict: true });
```

### `parseOptionalDecimal(row, column)`

Parse an optional decimal. Returns `null` for empty/missing values.

```typescript
const fees = parseOptionalDecimal(row, 'Fees') || ZERO;
```

### `parseDecimalFromString(value, context, fileName)`

Parse a decimal directly from a string value.

```typescript
const amount = parseDecimalFromString(row['Total'], 'Total', fileName);
```

### `parseDate(dateString, fileName)`

Parse a date string and normalize to UTC midnight.

```typescript
const date = parseDate('2023-01-15', fileName);
```

### `validateRow(row, expectedColumns, fileName)`

Validate that a row contains all required columns.

```typescript
validateRow(row, ['Date', 'Symbol', 'Quantity'], fileName);
```

## Common Patterns

### Handling Multiple CSV Formats

If your broker exports different report types:

```typescript
async parse(fileContent: string, fileName: string): Promise<ParserResult> {
  // Detect format from filename or first row
  if (fileName.includes('trades')) {
    return this.parseTradeReport(fileContent, fileName);
  } else if (fileName.includes('dividends')) {
    return this.parseDividendReport(fileContent, fileName);
  }

  throw new ParsingError(fileName, 'Unknown report type');
}
```

### Currency Conversion

For foreign currency transactions:

```typescript
let amount = price.times(quantity);
let currency = row['Currency'];

// Convert to GBP if needed
if (currency !== 'GBP') {
  const fxRate = parseDecimal(row, 'FX Rate', fileName);
  amount = amount.div(fxRate);
  currency = 'GBP';
}
```

### Handling Fees

Different brokers report fees differently:

```typescript
// Separate fee columns
const transactionFee = parseOptionalDecimal(row, 'Transaction Fee') || ZERO;
const stampDuty = parseOptionalDecimal(row, 'Stamp Duty') || ZERO;
const fees = transactionFee.plus(stampDuty);

// Or included in amount
const grossAmount = parseDecimal(row, 'Gross Amount', fileName);
const netAmount = parseDecimal(row, 'Net Amount', fileName);
const fees = grossAmount.minus(netAmount).abs();
```

## Code Style

- Use TypeScript strict mode (already configured)
- Prefer `const` over `let`
- Use descriptive variable names
- Add JSDoc comments for non-obvious logic only
- Use enums for column names (provides autocomplete and type safety)
- Handle errors gracefully - add warnings instead of throwing when possible

## Testing

Run tests frequently:

```bash
# Run all tests
pnpm test

# Run specific parser tests
pnpm test mybroker

# Run with watch mode during development
pnpm test:watch
```

Aim for:
- At least 10 test cases per parser
- Cover different transaction types (buy, sell, dividend, etc.)
- Test edge cases (empty fields, currency conversion, etc.)
- Use real CSV examples (anonymized if needed)

## Getting Help

- Check existing parsers in `src/lib/parsers/` for examples
- Read the [README](README.md) for project overview
- Look at test files in `src/tests/parsers/` for testing patterns

## Pull Request Checklist

Before submitting a PR:

- [ ] Parser implementation complete
- [ ] Parser registered in `index.ts`
- [ ] Broker added to UI dropdown
- [ ] Tests written (minimum 10 test cases)
- [ ] All tests passing (`pnpm test`)
- [ ] TypeScript compilation successful (`pnpm exec tsc --noEmit`)
- [ ] Build successful (`pnpm build`)
- [ ] Tested with real CSV file from broker
- [ ] No `console.log` or debug code left in

## License

By contributing, you agree that your contributions will be licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
