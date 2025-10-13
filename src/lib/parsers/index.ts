/**
 * Parsers module index
 * Exports all parsers and registers them
 */

export * from './errors';
export * from './base';
export * from './raw';

// Import parsers to trigger registration
import { ParserRegistry } from './base';
import { rawParser } from './raw';
import { trading212Parser } from './trading212';
import { schwabParser } from './schwab';
import { mssbParser } from './mssb';
import { sharesightParser } from './sharesight';
import { vanguardParser } from './vanguard';
import { freetradeParser } from './freetrade';
import { interactiveBrokersParser } from './interactive-brokers';
import { revolutParser } from './revolut';
import { coinbaseParser } from './coinbase';
import { equatePlusParser } from './equateplus';

// Register all parsers
ParserRegistry.register('raw', rawParser);
ParserRegistry.register('trading212', trading212Parser);
ParserRegistry.register('schwab', schwabParser);
ParserRegistry.register('mssb', mssbParser);
ParserRegistry.register('sharesight', sharesightParser);
ParserRegistry.register('vanguard', vanguardParser);
ParserRegistry.register('freetrade', freetradeParser);
ParserRegistry.register('interactive-brokers', interactiveBrokersParser);
ParserRegistry.register('revolut', revolutParser);
ParserRegistry.register('coinbase', coinbaseParser);
ParserRegistry.register('equateplus', equatePlusParser);

// Export registry for convenience
export { ParserRegistry };
