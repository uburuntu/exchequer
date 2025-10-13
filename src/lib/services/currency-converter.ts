/**
 * Currency Converter Service
 *
 * Provides exchange rate lookup with multiple source options and four-tier fallback strategy:
 * 1. In-memory cache
 * 2. IndexedDB cache (persistent storage)
 * 3. Selected API source (HMRC or ECB)
 * 4. Bundled historical rates (fallback)
 */

import Decimal from 'decimal.js-light';
import { get as idbGet, set as idbSet } from 'idb-keyval';

import { BUNDLED_RATES } from '../data/exchange_rates';

/**
 * FX rate source options
 */
export enum FXSource {
  /** HMRC Monthly rates - official UK government rates, one rate per month */
  HMRC_MONTHLY = 'HMRC_MONTHLY',
  /** ECB Daily rates via Frankfurter API - European Central Bank rates */
  ECB_DAILY = 'ECB_DAILY',
}

// HMRC API endpoints
const OLD_HMRC_ENDPOINT = 'https://www.hmrc.gov.uk/softwaredevelopers/rates';
const NEW_HMRC_ENDPOINT = 'https://www.trade-tariff.service.gov.uk/uk/api/exchange_rates/files';
const NEW_ENDPOINT_FROM_YEAR = 2021;

// ECB API (via Frankfurter - free, no API key required)
const ECB_ENDPOINT = 'https://api.frankfurter.app';

// Cache key prefix for month rates (to avoid re-fetching)
const MONTH_CACHE_PREFIX = 'hmrc-month:';
const ECB_CACHE_PREFIX = 'ecb-date:';

export class ExchangeRateMissingError extends Error {
  constructor(
    public readonly currency: string,
    public readonly date: Date
  ) {
    super(`Exchange rate missing for ${currency} on ${date.toISOString().split('T')[0]}`);
    this.name = 'ExchangeRateMissingError';
  }
}

export class CurrencyConverter {
  private cache: Map<string, Decimal> = new Map();
  private manualRates: Map<string, Decimal> = new Map();
  private fetchedMonths: Set<string> = new Set(); // Track which months we've already fetched
  private fetchedDates: Set<string> = new Set(); // Track which dates we've already fetched (ECB)
  private _source: FXSource = FXSource.HMRC_MONTHLY; // Default source

  /**
   * Get the current FX rate source
   */
  get source(): FXSource {
    return this._source;
  }

  /**
   * Set the FX rate source
   * Note: Changing source does not clear the cache; rates from different sources
   * are cached with different keys
   */
  set source(value: FXSource) {
    this._source = value;
  }

  /**
   * Set the FX rate source and return this for chaining
   */
  setSource(source: FXSource): this {
    this._source = source;
    return this;
  }

  /**
   * Format date as YYYY-MM-DD for cache keys
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0]!;
  }

  /**
   * Get month key (YYYY-MM) for a date
   */
  private getMonthKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Generate cache key for currency and date
   */
  private getCacheKey(currency: string, date: Date): string {
    return `rate:${currency}:${this.formatDate(date)}`;
  }

  /**
   * Check if we're online
   */
  private isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /**
   * Build HMRC API URL for a given date
   */
  private buildHmrcUrl(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    if (year < NEW_ENDPOINT_FROM_YEAR) {
      // Old endpoint: exrates-monthly-MMYY.xml
      const monthStr = String(month).padStart(2, '0');
      const yearStr = String(year).slice(-2);
      return `${OLD_HMRC_ENDPOINT}/exrates-monthly-${monthStr}${yearStr}.xml`;
    } else {
      // New endpoint: monthly_xml_YYYY-MM.xml
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      return `${NEW_HMRC_ENDPOINT}/monthly_xml_${monthStr}.xml`;
    }
  }

  /**
   * Parse HMRC XML response into a map of currency -> rate
   */
  private parseHmrcXml(xmlText: string): Map<string, Decimal> {
    const rates = new Map<string, Decimal>();

    // Use DOMParser for browser, or regex fallback for SSR
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');

      const exchangeRates = doc.querySelectorAll('exchangeRate');
      for (const rate of exchangeRates) {
        const currencyCode = rate.querySelector('currencyCode')?.textContent?.toUpperCase();
        const rateNew = rate.querySelector('rateNew')?.textContent;

        if (currencyCode && rateNew) {
          try {
            rates.set(currencyCode, new Decimal(rateNew));
          } catch {
            // Skip invalid rates
          }
        }
      }
    } else {
      // Regex fallback for non-browser environments
      const regex = /<currencyCode>([A-Z]+)<\/currencyCode>\s*<rateNew>([\d.]+)<\/rateNew>/g;
      let match;
      while ((match = regex.exec(xmlText)) !== null) {
        const [, currency, rate] = match;
        if (currency && rate) {
          try {
            rates.set(currency, new Decimal(rate));
          } catch {
            // Skip invalid rates
          }
        }
      }
    }

    return rates;
  }

  /**
   * Fetch exchange rates from HMRC API for a given month
   * Returns a map of currency -> rate, or null if fetch fails
   */
  private async fetchHmrcRates(date: Date): Promise<Map<string, Decimal> | null> {
    // Skip if offline
    if (!this.isOnline()) {
      console.log('[CurrencyConverter] Offline, skipping HMRC API');
      return null;
    }

    const monthKey = this.getMonthKey(date);

    // Check if we've already fetched this month
    if (this.fetchedMonths.has(monthKey)) {
      return null; // Already fetched, rates should be in cache
    }

    // Check IndexedDB if we've previously fetched this month
    // Note: We only skip if we have rates cached with the NEW format (rate-month:)
    // This ensures backward compatibility when upgrading from old cache format
    try {
      const monthCacheKey = `${MONTH_CACHE_PREFIX}${monthKey}`;
      const cached = await idbGet<string>(monthCacheKey);
      if (cached === 'fetched') {
        // Verify we actually have rates in the new format by checking for USD
        const verifyKey = `rate-month:USD:${monthKey}`;
        const hasNewFormat = await idbGet<string>(verifyKey);
        if (hasNewFormat) {
          this.fetchedMonths.add(monthKey);
          return null; // Already fetched previously with new format
        }
        // Old format - need to re-fetch
        console.log(`[CurrencyConverter] Re-fetching ${monthKey} to migrate cache format`);
      }
    } catch {
      // Ignore IndexedDB errors
    }

    const url = this.buildHmrcUrl(date);
    console.log(`[CurrencyConverter] Fetching HMRC rates for ${monthKey} from ${url}`);

    try {
      const response = await fetch(url, { 
        mode: 'cors',
        cache: 'default',
      });

      if (!response.ok) {
        console.warn(`[CurrencyConverter] HMRC API returned ${response.status}`);
        return null;
      }

      const xmlText = await response.text();
      const rates = this.parseHmrcXml(xmlText);

      if (rates.size === 0) {
        console.warn('[CurrencyConverter] No rates found in HMRC response');
        return null;
      }

      console.log(`[CurrencyConverter] Fetched ${rates.size} rates from HMRC for ${monthKey}`);

      // Mark this month as fetched
      this.fetchedMonths.add(monthKey);

      // Cache all rates for this month
      await this.cacheMonthRates(date, rates);

      return rates;
    } catch (err) {
      console.warn('[CurrencyConverter] HMRC API fetch failed:', err);
      return null;
    }
  }

  /**
   * Cache all rates from a month fetch
   * HMRC rates apply to the entire month, so cache by month key
   */
  private async cacheMonthRates(date: Date, rates: Map<string, Decimal>): Promise<void> {
    const monthKey = this.getMonthKey(date);

    // Cache each rate by month (HMRC rates apply to entire month)
    for (const [currency, rate] of rates) {
      const key = `rate-month:${currency}:${monthKey}`;
      this.cache.set(key, rate);

      // Also persist to IndexedDB
      try {
        await idbSet(key, rate.toString());
      } catch {
        // Ignore IndexedDB errors
      }
    }

    // Mark month as fetched in IndexedDB
    try {
      await idbSet(`${MONTH_CACHE_PREFIX}${monthKey}`, 'fetched');
    } catch {
      // Ignore IndexedDB errors
    }
  }

  /**
   * Get cache key for ECB daily rates
   */
  private getEcbCacheKey(currency: string, date: Date): string {
    return `${ECB_CACHE_PREFIX}${currency}:${this.formatDate(date)}`;
  }

  /**
   * Fetch exchange rates from ECB API (via Frankfurter) for a given date
   * ECB rates are in EUR, so we need to convert to GBP
   * Returns a map of currency -> rate (1 GBP = X foreign currency)
   */
  private async fetchEcbRates(date: Date): Promise<Map<string, Decimal> | null> {
    // Skip if offline
    if (!this.isOnline()) {
      console.log('[CurrencyConverter] Offline, skipping ECB API');
      return null;
    }

    const dateStr = this.formatDate(date);

    // Check if we've already fetched this date
    if (this.fetchedDates.has(dateStr)) {
      return null;
    }

    // ECB doesn't have rates for weekends - use Friday's rate
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getUTCDay();
    let adjustedDate = dateStr;
    if (dayOfWeek === 0) {
      // Sunday - use Friday
      dateObj.setUTCDate(dateObj.getUTCDate() - 2);
      adjustedDate = this.formatDate(dateObj);
    } else if (dayOfWeek === 6) {
      // Saturday - use Friday
      dateObj.setUTCDate(dateObj.getUTCDate() - 1);
      adjustedDate = this.formatDate(dateObj);
    }

    const url = `${ECB_ENDPOINT}/${adjustedDate}?from=GBP`;
    console.log(`[CurrencyConverter] Fetching ECB rates for ${adjustedDate} from ${url}`);

    try {
      const response = await fetch(url, {
        mode: 'cors',
        cache: 'default',
      });

      if (!response.ok) {
        console.warn(`[CurrencyConverter] ECB API returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      const rates = new Map<string, Decimal>();

      // Frankfurter returns: { "rates": { "USD": 1.25, "EUR": 1.17, ... } }
      if (data.rates) {
        for (const [currency, rate] of Object.entries(data.rates)) {
          if (typeof rate === 'number') {
            rates.set(currency, new Decimal(rate));
          }
        }
      }

      if (rates.size === 0) {
        console.warn('[CurrencyConverter] No rates found in ECB response');
        return null;
      }

      console.log(`[CurrencyConverter] Fetched ${rates.size} rates from ECB for ${dateStr}`);

      // Mark this date as fetched
      this.fetchedDates.add(dateStr);

      // Cache all rates for this date
      await this.cacheEcbRates(date, rates);

      return rates;
    } catch (err) {
      console.warn('[CurrencyConverter] ECB API fetch failed:', err);
      return null;
    }
  }

  /**
   * Cache all rates from an ECB daily fetch
   */
  private async cacheEcbRates(date: Date, rates: Map<string, Decimal>): Promise<void> {
    const dateStr = this.formatDate(date);

    for (const [currency, rate] of rates) {
      const key = this.getEcbCacheKey(currency, date);
      this.cache.set(key, rate);

      // Also persist to IndexedDB
      try {
        await idbSet(key, rate.toString());
      } catch {
        // Ignore IndexedDB errors
      }
    }
  }

  /**
   * Get cache key for month-based rates
   */
  private getMonthCacheKey(currency: string, date: Date): string {
    return `rate-month:${currency}:${this.getMonthKey(date)}`;
  }

  /**
   * Get exchange rate from GBP to specified currency on a given date
   * Rate represents: 1 GBP = X foreign currency
   *
   * Lookup order depends on selected source:
   *
   * HMRC_MONTHLY:
   * 1. In-memory cache (month key)
   * 2. Manual rates (user-provided)
   * 3. IndexedDB cache (month)
   * 4. HMRC API (fetches entire month)
   * 5. Bundled rates (fallback)
   *
   * ECB_DAILY:
   * 1. In-memory cache (exact date)
   * 2. Manual rates (user-provided)
   * 3. IndexedDB cache (exact date)
   * 4. ECB API (fetches specific date)
   * 5. Bundled rates (fallback)
   *
   * @param currency Target currency code (e.g., 'USD', 'EUR')
   * @param date Date for which to get the rate
   * @returns Exchange rate as Decimal
   * @throws ExchangeRateMissingError if rate cannot be found
   */
  async getRate(currency: string, date: Date): Promise<Decimal> {
    // GBP to GBP is always 1
    if (currency === 'GBP') {
      return new Decimal(1);
    }

    const key = this.getCacheKey(currency, date);
    const monthKey = this.getMonthCacheKey(currency, date);
    const ecbKey = this.getEcbCacheKey(currency, date);

    // Check manual rates first (user-provided, highest priority)
    if (this.manualRates.has(key)) {
      const rate = this.manualRates.get(key)!;
      this.cache.set(key, rate);
      return rate;
    }

    // ECB_DAILY source - use daily rates
    if (this._source === FXSource.ECB_DAILY) {
      // 1. Check in-memory cache (ECB daily key)
      if (this.cache.has(ecbKey)) {
        return this.cache.get(ecbKey)!;
      }

      // 2. Check IndexedDB cache (ECB daily key)
      try {
        const cached = await idbGet<string>(ecbKey);
        if (cached) {
          const rate = new Decimal(cached);
          this.cache.set(ecbKey, rate);
          return rate;
        }
      } catch (err) {
        console.warn('IndexedDB get failed:', err);
      }

      // 3. Try ECB API
      const ecbRates = await this.fetchEcbRates(date);
      if (ecbRates && ecbRates.has(currency)) {
        return ecbRates.get(currency)!;
      }

      // Check ECB cache again after fetch
      if (this.cache.has(ecbKey)) {
        return this.cache.get(ecbKey)!;
      }

      // 4. Fall through to bundled data
    } else {
      // HMRC_MONTHLY source (default) - use monthly rates

      // 1. Check in-memory cache (month key)
      if (this.cache.has(monthKey)) {
        return this.cache.get(monthKey)!;
      }

      // 2. Check IndexedDB cache (month - new format)
      try {
        const cached = await idbGet<string>(monthKey);
        if (cached) {
          const rate = new Decimal(cached);
          this.cache.set(monthKey, rate);
          return rate;
        }
      } catch (err) {
        console.warn('IndexedDB get failed:', err);
      }

      // 2b. Check IndexedDB for any date in the same month (backward compatibility)
      // Old code cached rates with exact date keys, so we need to look for them
      try {
        const monthStr = this.getMonthKey(date);
        // Try common dates in the month (1st, 15th, last day)
        for (const day of ['01', '15', '28', '29', '30', '31']) {
          const oldKey = `rate:${currency}:${monthStr}-${day}`;
          const cached = await idbGet<string>(oldKey);
          if (cached) {
            const rate = new Decimal(cached);
            // Cache with both old and new keys for future lookups
            this.cache.set(key, rate);
            this.cache.set(monthKey, rate);
            return rate;
          }
        }
      } catch (err) {
        // Ignore errors in backward compatibility lookup
      }

      // 3. Try HMRC API (fetches entire month, caches all currencies by month)
      const hmrcRates = await this.fetchHmrcRates(date);
      if (hmrcRates && hmrcRates.has(currency)) {
        return hmrcRates.get(currency)!;
      }

      // Check month cache again after HMRC fetch
      if (this.cache.has(monthKey)) {
        return this.cache.get(monthKey)!;
      }

      // 4. Fall through to bundled data
    }

    // Bundled data fallback (works for both sources)
    const currencyRates = BUNDLED_RATES[currency];
    if (currencyRates) {
      const dateStr = this.formatDate(date);
      let rateStr = currencyRates[dateStr];

      // fallback to month-end if exact date not found
      if (!rateStr) {
        const monthStr = dateStr.substring(0, 7); // YYYY-MM
        const monthMatch = Object.keys(currencyRates).find(k => k.startsWith(monthStr));
        if (monthMatch) {
          rateStr = currencyRates[monthMatch];
        }
      }

      if (rateStr) {
        const rate = new Decimal(rateStr);

        // Save to caches
        this.cache.set(key, rate);
        try {
          await idbSet(key, rateStr);
        } catch (err) {
          console.warn('IndexedDB set failed:', err);
        }

        return rate;
      }
    }

    // Throw error - rate not found anywhere
    throw new ExchangeRateMissingError(currency, date);
  }

  /**
   * Convert amount from foreign currency to GBP
   *
   * @param amount Amount in foreign currency
   * @param currency Foreign currency code
   * @param date Date for exchange rate lookup
   * @returns Amount in GBP
   */
  async convertToGbp(
    amount: Decimal,
    currency: string,
    date: Date
  ): Promise<Decimal> {
    if (currency === 'GBP') {
      return amount;
    }

    const rate = await this.getRate(currency, date);
    return amount.div(rate);
  }

  /**
   * Convert amount from GBP to foreign currency
   *
   * @param amount Amount in GBP
   * @param currency Target currency code
   * @param date Date for exchange rate lookup
   * @returns Amount in foreign currency
   */
  async convertFromGbp(
    amount: Decimal,
    currency: string,
    date: Date
  ): Promise<Decimal> {
    if (currency === 'GBP') {
      return amount;
    }

    const rate = await this.getRate(currency, date);
    return amount.times(rate);
  }

  /**
   * Manually set an exchange rate (user input fallback)
   *
   * @param currency Currency code
   * @param date Date for the rate
   * @param rate Exchange rate (1 GBP = X foreign currency)
   */
  async setManualRate(
    currency: string,
    date: Date,
    rate: Decimal
  ): Promise<void> {
    const key = this.getCacheKey(currency, date);

    this.manualRates.set(key, rate);
    this.cache.set(key, rate);

    // Persist to IndexedDB
    try {
      await idbSet(key, rate.toString());
    } catch (err) {
      console.warn('IndexedDB set failed:', err);
    }
  }

  /**
   * Clear all cached rates (useful for testing or reset)
   */
  clearCache(): void {
    this.cache.clear();
    this.manualRates.clear();
    this.fetchedMonths.clear();
    this.fetchedDates.clear();
  }

  /**
   * Get all dates that need manual rates for a given currency
   *
   * @param currency Currency code
   * @param dates Array of dates to check
   * @returns Array of dates that need manual input
   */
  async getMissingRates(
    currency: string,
    dates: Date[]
  ): Promise<Date[]> {
    const missing: Date[] = [];

    for (const date of dates) {
      try {
        await this.getRate(currency, date);
      } catch (err) {
        if (err instanceof ExchangeRateMissingError) {
          missing.push(date);
        }
      }
    }

    return missing;
  }

  /**
   * Pre-fetch rates for a list of dates (useful for batch processing)
   * This triggers API calls based on the selected source:
   * - HMRC_MONTHLY: fetches unique months
   * - ECB_DAILY: fetches unique dates
   */
  async prefetchRates(dates: Date[]): Promise<void> {
    if (this._source === FXSource.ECB_DAILY) {
      // ECB: fetch each unique date
      const uniqueDates = new Set(dates.map(d => this.formatDate(d)));

      const fetchPromises = Array.from(uniqueDates).map(async (dateStr) => {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year!, month! - 1, day!);
        await this.fetchEcbRates(date);
      });

      await Promise.allSettled(fetchPromises);
    } else {
      // HMRC: fetch each unique month
      const months = new Set(dates.map(d => this.getMonthKey(d)));

      const fetchPromises = Array.from(months).map(async (monthKey) => {
        const [year, month] = monthKey.split('-').map(Number);
        const date = new Date(year!, month! - 1, 15); // Middle of month
        await this.fetchHmrcRates(date);
      });

      await Promise.allSettled(fetchPromises);
    }
  }
}

// Export singleton instance
export const currencyConverter = new CurrencyConverter();
