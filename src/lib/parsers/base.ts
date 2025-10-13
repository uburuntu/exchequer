/**
 * Base parser interface and utilities
 * All broker parsers implement this interface
 */

import type { BrokerTransaction } from '../types';

/**
 * Parser result with transactions and metadata
 */
export interface ParserResult {
  transactions: BrokerTransaction[];
  fileName: string;
  broker: string;
  warnings: string[];
}

/**
 * Extended parser result for multi-file parsers
 * Includes breakdown by file type for UI display
 */
export interface MultiFileParserResult extends ParserResult {
  /** Breakdown of transactions by file type */
  fileBreakdown: {
    fileType: string;
    label: string;
    count: number;
    fileName: string;
  }[];
}

/**
 * Classification result for a single file
 */
export interface FileClassification {
  /** Broker ID (e.g., 'schwab', 'mssb') */
  broker: string;
  /** File type within the broker (e.g., 'individual', 'awards') */
  fileType: string;
  /** Whether this is the primary/main file or supplementary */
  isPrimary: boolean;
  /** Human-readable label for this file type */
  label: string;
  /** Original file name */
  fileName: string;
  /** Raw file content */
  content: string;
}

/**
 * Grouped files for a single broker
 */
export interface BrokerFileGroup {
  /** Broker ID */
  broker: string;
  /** Human-readable broker name */
  brokerName: string;
  /** Files grouped by type */
  files: Map<string, FileClassification>;
  /** Missing required file types (for validation) */
  missingRequired: string[];
}

/**
 * File type definition for multi-file brokers
 */
export interface BrokerFileType {
  /** File type identifier */
  type: string;
  /** Whether this file is required */
  required: boolean;
  /** Human-readable label */
  label: string;
  /** Instructions for how to obtain this file */
  instructions?: string;
}

/**
 * Base interface for all broker parsers
 */
export interface BrokerParser {
  /**
   * Parse CSV file content into broker transactions
   * @param fileContent - Raw CSV file content as string
   * @param fileName - Name of the file being parsed
   * @returns Parser result with transactions
   */
  parse(fileContent: string, fileName: string): Promise<ParserResult>;

  /**
   * Get the broker name this parser handles
   */
  readonly brokerName: string;
}

/**
 * Extended interface for brokers that require multiple files
 * (e.g., Schwab with Individual + Equity Awards files)
 */
export interface MultiFileBrokerParser extends BrokerParser {
  /**
   * File types this broker supports
   */
  readonly fileTypes: BrokerFileType[];

  /**
   * Classify a file as belonging to this broker
   * @param content - Raw CSV file content
   * @param fileName - Name of the file
   * @returns File type string if recognized, null otherwise
   */
  classify(content: string, fileName: string): string | null;

  /**
   * Parse grouped files together
   * @param group - Grouped files for this broker
   * @returns Parser result with all transactions
   */
  parseMulti(group: BrokerFileGroup): Promise<MultiFileParserResult>;
}

/**
 * Type guard to check if a parser supports multi-file operations
 */
export function isMultiFileParser(parser: BrokerParser): parser is MultiFileBrokerParser {
  return 'fileTypes' in parser && 'classify' in parser && 'parseMulti' in parser;
}

/**
 * Registry for all broker parsers
 */
export class ParserRegistry {
  private static parsers = new Map<string, BrokerParser>();

  /** Priority order for auto-detection (most common/reliable first) */
  static readonly BROKER_PRIORITY = [
    'schwab',
    'interactive-brokers',
    'coinbase',
    'revolut',
    'equateplus',
    'trading212',
    'freetrade',
    'vanguard',
    'mssb',
    'sharesight',
    'raw', // raw format last as fallback
  ];

  /**
   * Register a parser for a broker
   */
  static register(brokerId: string, parser: BrokerParser): void {
    this.parsers.set(brokerId.toLowerCase(), parser);
  }

  /**
   * Get a parser by broker ID
   */
  static get(brokerId: string): BrokerParser {
    const parser = this.parsers.get(brokerId.toLowerCase());
    if (!parser) {
      throw new Error(`No parser registered for broker: ${brokerId}`);
    }
    return parser;
  }

  /**
   * Get all registered broker IDs
   */
  static getBrokerIds(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Check if a broker is registered
   */
  static has(brokerId: string): boolean {
    return this.parsers.has(brokerId.toLowerCase());
  }

  /**
   * Get all registered parsers
   */
  static getAll(): Map<string, BrokerParser> {
    return this.parsers;
  }

  /**
   * Get all multi-file parsers
   */
  static getMultiFileParsers(): Map<string, MultiFileBrokerParser> {
    const result = new Map<string, MultiFileBrokerParser>();
    for (const [id, parser] of this.parsers) {
      if (isMultiFileParser(parser)) {
        result.set(id, parser);
      }
    }
    return result;
  }

  /**
   * Get a multi-file parser by broker ID, or null if not a multi-file parser
   */
  static getMultiFile(brokerId: string): MultiFileBrokerParser | null {
    const parser = this.parsers.get(brokerId.toLowerCase());
    if (parser && isMultiFileParser(parser)) {
      return parser;
    }
    return null;
  }

  /**
   * Classify a file using all registered multi-file parsers
   * Returns classification if recognized, null otherwise
   */
  static classifyFile(content: string, fileName: string): FileClassification | null {
    // Try multi-file parsers first (in priority order)
    for (const brokerId of this.BROKER_PRIORITY) {
      const parser = this.getMultiFile(brokerId);
      if (!parser) continue;

      const fileType = parser.classify(content, fileName);
      if (fileType) {
        const typeInfo = parser.fileTypes.find(t => t.type === fileType);
        return {
          broker: brokerId,
          fileType,
          isPrimary: typeInfo?.required ?? true,
          label: typeInfo?.label ?? fileType,
          fileName,
          content,
        };
      }
    }
    return null;
  }

  /**
   * Auto-detect broker format and parse the file
   * Tries each parser in priority order, returns first successful result
   * 
   * @param fileContent - Raw CSV file content
   * @param fileName - Name of the file being parsed
   * @returns Parser result with detected broker, or throws if no parser matches
   */
  static async autoDetect(
    fileContent: string,
    fileName: string
  ): Promise<ParserResult & { detectedBroker: string }> {
    const errors: string[] = [];

    for (const brokerId of this.BROKER_PRIORITY) {
      if (!this.has(brokerId)) continue;
      
      try {
        const parser = this.get(brokerId);
        const result = await parser.parse(fileContent, fileName);
        
        // Only accept if we got at least one transaction
        if (result.transactions.length > 0) {
          return {
            ...result,
            detectedBroker: brokerId,
          };
        }
      } catch (err) {
        // Store error for reporting if all parsers fail
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${brokerId}: ${message}`);
      }
    }

    // No parser succeeded
    throw new Error(
      `Could not detect broker format for "${fileName}". ` +
      `Tried: ${this.BROKER_PRIORITY.join(', ')}. ` +
      `Errors: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`
    );
  }
}
