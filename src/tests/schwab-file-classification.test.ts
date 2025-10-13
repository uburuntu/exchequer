/**
 * Tests for Schwab file classification logic
 * Ensures the parser correctly identifies Individual vs Awards CSV files
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { classifySchwabFile, SCHWAB_FILE_TYPES, SchwabParser } from '../lib/parsers/schwab';
import { ParserRegistry } from '../lib/parsers';
import { isMultiFileParser } from '../lib/parsers/base';

describe('Schwab File Classification', () => {
  const dataDir = path.join(__dirname, 'fixtures/data/schwab-2');

  describe('classifySchwabFile', () => {
    it('should classify Individual Transactions file correctly', () => {
      const content = fs.readFileSync(
        path.join(dataDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
        'utf-8'
      );
      const result = classifySchwabFile(content);
      expect(result).toBe(SCHWAB_FILE_TYPES.INDIVIDUAL);
    });

    it('should classify Equity Awards file correctly', () => {
      const content = fs.readFileSync(
        path.join(dataDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
        'utf-8'
      );
      const result = classifySchwabFile(content);
      expect(result).toBe(SCHWAB_FILE_TYPES.AWARDS);
    });

    it('should return null for non-Schwab CSV', () => {
      const content = `Date,Action,Symbol,Quantity,Price,Currency
2024-01-15,BUY,AAPL,10,150.00,USD`;
      const result = classifySchwabFile(content);
      expect(result).toBeNull();
    });

    it('should return null for empty content', () => {
      const result = classifySchwabFile('');
      expect(result).toBeNull();
    });

    it('should identify Individual by Price + Fees & Comm columns', () => {
      const content = `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"01/15/2025","Buy","AAPL","APPLE INC","10","$150.00","$0","-$1500.00"`;
      const result = classifySchwabFile(content);
      expect(result).toBe(SCHWAB_FILE_TYPES.INDIVIDUAL);
    });

    it('should identify Awards by FairMarketValuePrice + AwardDate columns', () => {
      const content = `"Date","Action","Symbol","Description","Quantity","FeesAndCommissions","DisbursementElection","Amount","AwardDate","AwardId","FairMarketValuePrice","SalePrice","SharesSoldWithheldForTaxes","NetSharesDeposited","Taxes"
"11/15/2025","Lapse","ACME","Restricted Stock Lapse","28","","","","","","","","","",""`;
      const result = classifySchwabFile(content);
      expect(result).toBe(SCHWAB_FILE_TYPES.AWARDS);
    });
  });

  describe('SchwabParser.classify', () => {
    const parser = new SchwabParser();

    it('should classify Individual file via parser method', () => {
      const content = fs.readFileSync(
        path.join(dataDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
        'utf-8'
      );
      const result = parser.classify(content, 'test.csv');
      expect(result).toBe(SCHWAB_FILE_TYPES.INDIVIDUAL);
    });

    it('should classify Awards file via parser method', () => {
      const content = fs.readFileSync(
        path.join(dataDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
        'utf-8'
      );
      const result = parser.classify(content, 'test.csv');
      expect(result).toBe(SCHWAB_FILE_TYPES.AWARDS);
    });
  });

  describe('SchwabParser.fileTypes', () => {
    const parser = new SchwabParser();

    it('should have Individual as required file type', () => {
      const individualType = parser.fileTypes.find(t => t.type === SCHWAB_FILE_TYPES.INDIVIDUAL);
      expect(individualType).toBeDefined();
      expect(individualType?.required).toBe(true);
      expect(individualType?.label).toBe('Individual Transactions');
    });

    it('should have Awards as optional file type', () => {
      const awardsType = parser.fileTypes.find(t => t.type === SCHWAB_FILE_TYPES.AWARDS);
      expect(awardsType).toBeDefined();
      expect(awardsType?.required).toBe(false);
      expect(awardsType?.label).toBe('Equity Awards');
    });

    it('should have instructions for each file type', () => {
      for (const fileType of parser.fileTypes) {
        expect(fileType.instructions).toBeDefined();
        expect(fileType.instructions!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('ParserRegistry integration', () => {
    it('should recognize SchwabParser as multi-file parser', () => {
      const parser = ParserRegistry.get('schwab');
      expect(isMultiFileParser(parser)).toBe(true);
    });

    it('should return SchwabParser via getMultiFile', () => {
      const parser = ParserRegistry.getMultiFile('schwab');
      expect(parser).not.toBeNull();
      expect(parser?.brokerName).toBe('Charles Schwab');
    });

    it('should classify Individual file via registry', () => {
      const content = fs.readFileSync(
        path.join(dataDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
        'utf-8'
      );
      const classification = ParserRegistry.classifyFile(content, 'test.csv');
      expect(classification).not.toBeNull();
      expect(classification?.broker).toBe('schwab');
      expect(classification?.fileType).toBe(SCHWAB_FILE_TYPES.INDIVIDUAL);
      expect(classification?.isPrimary).toBe(true);
    });

    it('should classify Awards file via registry', () => {
      const content = fs.readFileSync(
        path.join(dataDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
        'utf-8'
      );
      const classification = ParserRegistry.classifyFile(content, 'test.csv');
      expect(classification).not.toBeNull();
      expect(classification?.broker).toBe('schwab');
      expect(classification?.fileType).toBe(SCHWAB_FILE_TYPES.AWARDS);
      expect(classification?.isPrimary).toBe(false); // Awards is not required
    });

    it('should return null for non-Schwab file via registry', () => {
      const content = `random,csv,data
1,2,3`;
      const classification = ParserRegistry.classifyFile(content, 'test.csv');
      expect(classification).toBeNull();
    });
  });
});

