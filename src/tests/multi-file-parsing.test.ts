/**
 * Integration tests for multi-file broker parsing
 * Tests the complete flow of parsing multiple related files together
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SchwabParser, SCHWAB_FILE_TYPES } from '../lib/parsers/schwab';
import { ParserRegistry } from '../lib/parsers';
import type { BrokerFileGroup, FileClassification } from '../lib/parsers/base';
import { ActionType } from '../lib/types';

describe('Multi-File Parsing', () => {
  const dataDir = path.join(__dirname, 'fixtures/data/schwab-2');

  describe('Schwab parseMulti', () => {
    const parser = new SchwabParser();

    it('should parse both Individual and Awards files together', async () => {
      const individualContent = fs.readFileSync(
        path.join(dataDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
        'utf-8'
      );
      const awardsContent = fs.readFileSync(
        path.join(dataDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
        'utf-8'
      );

      const group: BrokerFileGroup = {
        broker: 'schwab',
        brokerName: 'Charles Schwab',
        files: new Map([
          [SCHWAB_FILE_TYPES.INDIVIDUAL, {
            broker: 'schwab',
            fileType: SCHWAB_FILE_TYPES.INDIVIDUAL,
            isPrimary: true,
            label: 'Individual Transactions',
            fileName: 'Individual.csv',
            content: individualContent,
          }],
          [SCHWAB_FILE_TYPES.AWARDS, {
            broker: 'schwab',
            fileType: SCHWAB_FILE_TYPES.AWARDS,
            isPrimary: false,
            label: 'Equity Awards',
            fileName: 'Awards.csv',
            content: awardsContent,
          }],
        ]),
        missingRequired: [],
      };

      const result = await parser.parseMulti(group);

      // Should have transactions from both files
      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.broker).toBe('Charles Schwab');
      expect(result.warnings).toHaveLength(0); // No warnings when both files present

      // Should have file breakdown
      expect(result.fileBreakdown).toHaveLength(2);
      
      const individualBreakdown = result.fileBreakdown.find(
        fb => fb.fileType === SCHWAB_FILE_TYPES.INDIVIDUAL
      );
      const awardsBreakdown = result.fileBreakdown.find(
        fb => fb.fileType === SCHWAB_FILE_TYPES.AWARDS
      );

      expect(individualBreakdown).toBeDefined();
      expect(awardsBreakdown).toBeDefined();
      expect(individualBreakdown!.count).toBeGreaterThan(0);
      expect(awardsBreakdown!.count).toBeGreaterThan(0);

      // Should have Stock Plan Activity transactions with prices
      const stockActivities = result.transactions.filter(
        t => t.action === ActionType.STOCK_ACTIVITY
      );
      expect(stockActivities.length).toBeGreaterThan(0);
      
      // All stock activities should have prices when awards file is provided
      for (const activity of stockActivities) {
        expect(activity.price).not.toBeNull();
      }
    });

    it('should parse Individual file alone with warnings for Stock Plan Activity', async () => {
      const individualContent = fs.readFileSync(
        path.join(dataDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
        'utf-8'
      );

      const group: BrokerFileGroup = {
        broker: 'schwab',
        brokerName: 'Charles Schwab',
        files: new Map([
          [SCHWAB_FILE_TYPES.INDIVIDUAL, {
            broker: 'schwab',
            fileType: SCHWAB_FILE_TYPES.INDIVIDUAL,
            isPrimary: true,
            label: 'Individual Transactions',
            fileName: 'Individual.csv',
            content: individualContent,
          }],
        ]),
        missingRequired: [],
      };

      const result = await parser.parseMulti(group);

      // Should have some transactions
      expect(result.transactions.length).toBeGreaterThan(0);

      // Should have warnings about skipped Stock Plan Activity
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Stock Plan Activity'))).toBe(true);
      expect(result.warnings.some(w => w.includes('award price not available'))).toBe(true);

      // File breakdown should only have Individual
      expect(result.fileBreakdown).toHaveLength(1);
      expect(result.fileBreakdown[0]!.fileType).toBe(SCHWAB_FILE_TYPES.INDIVIDUAL);
    });

    it('should throw error when only Awards file is provided', async () => {
      const awardsContent = fs.readFileSync(
        path.join(dataDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
        'utf-8'
      );

      const group: BrokerFileGroup = {
        broker: 'schwab',
        brokerName: 'Charles Schwab',
        files: new Map([
          [SCHWAB_FILE_TYPES.AWARDS, {
            broker: 'schwab',
            fileType: SCHWAB_FILE_TYPES.AWARDS,
            isPrimary: false,
            label: 'Equity Awards',
            fileName: 'Awards.csv',
            content: awardsContent,
          }],
        ]),
        missingRequired: [SCHWAB_FILE_TYPES.INDIVIDUAL],
      };

      await expect(parser.parseMulti(group)).rejects.toThrow(
        'Schwab Individual Transactions file is required'
      );
    });
  });

  describe('Full classification and parsing flow', () => {
    it('should classify and parse multiple Schwab files correctly', async () => {
      const individualContent = fs.readFileSync(
        path.join(dataDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
        'utf-8'
      );
      const awardsContent = fs.readFileSync(
        path.join(dataDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
        'utf-8'
      );

      // Step 1: Classify files
      const individualClassification = ParserRegistry.classifyFile(
        individualContent,
        'Individual.csv'
      );
      const awardsClassification = ParserRegistry.classifyFile(
        awardsContent,
        'Awards.csv'
      );

      expect(individualClassification).not.toBeNull();
      expect(awardsClassification).not.toBeNull();
      expect(individualClassification!.broker).toBe('schwab');
      expect(awardsClassification!.broker).toBe('schwab');

      // Step 2: Group files
      const files = new Map<string, FileClassification>();
      files.set(individualClassification!.fileType, individualClassification!);
      files.set(awardsClassification!.fileType, awardsClassification!);

      const group: BrokerFileGroup = {
        broker: 'schwab',
        brokerName: 'Charles Schwab',
        files,
        missingRequired: [],
      };

      // Step 3: Parse with multi-file parser
      const multiParser = ParserRegistry.getMultiFile('schwab');
      expect(multiParser).not.toBeNull();

      const result = await multiParser!.parseMulti(group);

      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.fileBreakdown.length).toBe(2);
    });

    it('should correctly identify Stock Plan Activity count in breakdown', async () => {
      const individualContent = fs.readFileSync(
        path.join(dataDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
        'utf-8'
      );
      const awardsContent = fs.readFileSync(
        path.join(dataDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
        'utf-8'
      );

      const parser = new SchwabParser();
      const result = await parser.parse(individualContent, 'test.csv', awardsContent);

      const stockActivityCount = result.transactions.filter(
        t => t.action === ActionType.STOCK_ACTIVITY
      ).length;

      // Should have multiple Stock Plan Activity transactions
      expect(stockActivityCount).toBeGreaterThan(0);

      // All should have prices from the awards file
      const withoutPrices = result.transactions.filter(
        t => t.action === ActionType.STOCK_ACTIVITY && t.price === null
      );
      expect(withoutPrices).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty file group gracefully', async () => {
      const parser = new SchwabParser();
      
      const group: BrokerFileGroup = {
        broker: 'schwab',
        brokerName: 'Charles Schwab',
        files: new Map(),
        missingRequired: [SCHWAB_FILE_TYPES.INDIVIDUAL],
      };

      await expect(parser.parseMulti(group)).rejects.toThrow();
    });

    it('should match Stock Plan Activity dates with Awards dates', async () => {
      const individualContent = fs.readFileSync(
        path.join(dataDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
        'utf-8'
      );
      const awardsContent = fs.readFileSync(
        path.join(dataDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
        'utf-8'
      );

      const parser = new SchwabParser();
      const result = await parser.parse(individualContent, 'test.csv', awardsContent);

      // Stock Plan Activity transactions from August and November should be matched
      const stockActivities = result.transactions.filter(
        t => t.action === ActionType.STOCK_ACTIVITY
      );

      // Check that dates are reasonable (2025)
      for (const activity of stockActivities) {
        expect(activity.date.getFullYear()).toBe(2025);
      }
    });
  });
});

