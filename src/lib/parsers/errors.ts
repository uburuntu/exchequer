/**
 * Custom error classes for parsing
 * More idiomatic TypeScript error handling
 */

/**
 * Base parsing error
 */
export class ParsingError extends Error {
  constructor(
    public readonly fileName: string,
    message: string,
    public rowIndex?: number
  ) {
    super(
      rowIndex !== undefined
        ? `${fileName}:${rowIndex}: ${message}`
        : `${fileName}: ${message}`
    );
    this.name = 'ParsingError';
  }
}

/**
 * Error for unexpected column count
 */
export class UnexpectedColumnCountError extends ParsingError {
  constructor(
    fileName: string,
    public readonly expected: number,
    public readonly actual: number,
    rowIndex?: number
  ) {
    super(
      fileName,
      `Expected ${expected} columns, but found ${actual}`,
      rowIndex
    );
    this.name = 'UnexpectedColumnCountError';
  }
}

/**
 * Error for invalid action type
 */
export class InvalidActionError extends ParsingError {
  constructor(fileName: string, action: string, rowIndex?: number) {
    super(fileName, `Unknown action: ${action}`, rowIndex);
    this.name = 'InvalidActionError';
  }
}

/**
 * Error for invalid decimal value
 */
export class InvalidDecimalError extends ParsingError {
  constructor(
    fileName: string,
    column: string,
    value: string,
    rowIndex?: number
  ) {
    super(fileName, `Invalid decimal in column '${column}': "${value}"`, rowIndex);
    this.name = 'InvalidDecimalError';
  }
}

/**
 * Error for missing required value
 */
export class MissingValueError extends ParsingError {
  constructor(fileName: string, column: string, rowIndex?: number) {
    super(fileName, `Missing value in column '${column}'`, rowIndex);
    this.name = 'MissingValueError';
  }
}
