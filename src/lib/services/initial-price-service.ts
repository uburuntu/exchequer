import { INITIAL_PRICES } from '../data/initial-prices';

export class InitialPriceService {
  private prices: Map<string, number> = new Map();

  constructor() {
    // Index prices by symbol and date
    // Key format: SYMBOL:YYYY-MM-DD
    for (const entry of INITIAL_PRICES) {
      // Parse date format "MMM DD, YYYY" (e.g. "Mar 25, 2021")
      // The parseDate utility handles ISO, but this is a specific format.
      // Let's rely on standard Date parsing which works for "Mar 25, 2021" in most environments,
      // but to be safe and consistent with the data generation, we can parse it manually or trust the browser.
      // Given the data is static and consistent, simple Date parsing is likely fine.
      const date = new Date(entry.date);
      const dateKey = date.toISOString().split('T')[0];
      const key = `${entry.symbol}:${dateKey}`;
      this.prices.set(key, entry.price);
    }
  }

  /**
   * Get price for a symbol on a specific date
   */
  getPrice(symbol: string, date: Date): number | null {
    const dateKey = date.toISOString().split('T')[0];
    const key = `${symbol}:${dateKey}`;
    return this.prices.get(key) ?? null;
  }
}

export const initialPriceService = new InitialPriceService();

