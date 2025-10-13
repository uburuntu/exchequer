import { ISIN_MAP } from '../data/isin-map';

export class IsinService {
  private map: Map<string, Set<string>> = new Map();

  constructor() {
    // Initialize with bundled data
    for (const [isin, symbols] of Object.entries(ISIN_MAP)) {
      this.map.set(isin, new Set(symbols));
    }
  }

  /**
   * Get symbols for an ISIN
   */
  getSymbols(isin: string): string[] {
    const symbols = this.map.get(isin);
    return symbols ? Array.from(symbols) : [];
  }

  /**
   * Add a mapping from a transaction
   */
  addFromTransaction(isin: string, symbol: string): void {
    if (!isin || !symbol) return;

    if (!this.map.has(isin)) {
      this.map.set(isin, new Set());
    }
    this.map.get(isin)!.add(symbol);
  }
}

export const isinService = new IsinService();

