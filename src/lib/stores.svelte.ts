import type { BrokerTransaction } from './types';
import { CapitalGainsCalculator, type CapitalGainsReport } from './calculator/calculator';
import { get, set, del } from 'idb-keyval';
import Decimal from 'decimal.js-light';
import { isinService } from './services/isin-service';
import { initialPriceService } from './services/initial-price-service';
import { ERI_DATA } from './data/eri-data';
import { parseDate } from './parsers/utils';
import { currencyConverter, FXSource } from './services/currency-converter';

// Storage key for IndexedDB
const STORAGE_KEY = 'cgc_transactions';

// Serialize transactions for storage (Decimal -> string, Date -> ISO string)
function serializeTransactions(transactions: BrokerTransaction[]): any[] {
    return transactions.map(txn => ({
        ...txn,
        date: txn.date.toISOString(),
        quantity: txn.quantity?.toString() ?? null,
        price: txn.price?.toString() ?? null,
        fees: txn.fees?.toString() ?? null,
        amount: txn.amount?.toString() ?? null,
    }));
}

// Deserialize transactions from storage (string -> Decimal, ISO string -> Date)
function deserializeTransactions(data: any[]): BrokerTransaction[] {
    return data.map(txn => ({
        ...txn,
        date: new Date(txn.date),
        quantity: txn.quantity ? new Decimal(txn.quantity) : null,
        price: txn.price ? new Decimal(txn.price) : null,
        fees: txn.fees ? new Decimal(txn.fees) : new Decimal(0),
        amount: txn.amount ? new Decimal(txn.amount) : null,
    }));
}

class AppState {
    transactions = $state<BrokerTransaction[]>([]);
    taxYear = $state<number>(2025); // Default to 2024/2025
    report = $state<CapitalGainsReport | null>(null);
    isProcessing = $state<boolean>(false);
    isInitialized = $state<boolean>(false);
    error = $state<string | null>(null);

    // Settings
    targetCurrency = $state<string>('GBP');
    fxSource = $state<FXSource>(FXSource.HMRC_MONTHLY);

    // Session resume state
    hasPendingSession = $state<boolean>(false);
    pendingSessionInfo = $state<{ count: number; lastDate: Date | null }>({ count: 0, lastDate: null });

    constructor() {
        // Check for saved data on initialization
        this.checkForSavedSession();
    }

    // Check if there's saved data without auto-restoring
    private async checkForSavedSession() {
        try {
            const savedData = await get(STORAGE_KEY);
            if (savedData && Array.isArray(savedData) && savedData.length > 0) {
                // Store info about the pending session
                const lastDate = savedData.reduce((latest: Date | null, txn: any) => {
                    const date = new Date(txn.date);
                    return !latest || date > latest ? date : latest;
                }, null);

                this.pendingSessionInfo = {
                    count: savedData.length,
                    lastDate
                };
                this.hasPendingSession = true;
            }
        } catch (err) {
            console.warn('Failed to check for saved session:', err);
        } finally {
            this.isInitialized = true;
        }
    }

    // User chose to restore their session
    async restoreSession() {
        try {
            const savedData = await get(STORAGE_KEY);
            if (savedData && Array.isArray(savedData) && savedData.length > 0) {
                const transactions = deserializeTransactions(savedData);
                this.transactions = transactions.sort(
                    (a, b) => a.date.getTime() - b.date.getTime()
                );
                // Populate ISIN service from restored transactions
                this.populateIsinMap();
                // Auto-detect tax year from restored transactions
                this.autoDetectTaxYear();
                // Recalculate after restore
                await this.process();
            }
        } catch (err) {
            console.warn('Failed to restore session:', err);
        } finally {
            this.hasPendingSession = false;
        }
    }

    // User chose to start fresh - clear saved data
    async dismissSession() {
        try {
            await del(STORAGE_KEY);
        } catch (err) {
            console.warn('Failed to clear saved session:', err);
        } finally {
            this.hasPendingSession = false;
            this.pendingSessionInfo = { count: 0, lastDate: null };
        }
    }

    // Save transactions to IndexedDB
    private async saveToStorage() {
        try {
            if (this.transactions.length > 0) {
                const serialized = serializeTransactions(this.transactions);
                await set(STORAGE_KEY, serialized);
            } else {
                // Clear storage when no transactions
                await del(STORAGE_KEY);
            }
        } catch (err) {
            // Silently handle storage errors - log for debugging
            console.warn('Failed to save transactions to storage:', err);
        }
    }

    addTransactions(newTransactions: BrokerTransaction[]) {
        console.log(`[CGC] Adding ${newTransactions.length} new transactions`);
        
        // Add new transactions
        this.transactions = [...this.transactions, ...newTransactions].sort(
            (a, b) => a.date.getTime() - b.date.getTime()
        );

        // Populate ISIN service with new transactions
        for (const txn of newTransactions) {
            if (txn.isin && txn.symbol) {
                isinService.addFromTransaction(txn.isin, txn.symbol);
            }
        }

        // Auto-detect tax year from transactions
        this.autoDetectTaxYear();
        console.log(`[CGC] Auto-detected tax year: ${this.taxYear}`);
        // Save to storage after adding
        this.saveToStorage();
        this.process();
    }

    private populateIsinMap() {
        for (const txn of this.transactions) {
            if (txn.isin && txn.symbol) {
                isinService.addFromTransaction(txn.isin, txn.symbol);
            }
        }
    }

    // Auto-detect the appropriate tax year from transactions
    // UK tax year runs April 6 to April 5 of the following year
    private autoDetectTaxYear() {
        if (this.transactions.length === 0) return;

        // Find the most recent transaction date
        const firstDate = this.transactions[0]!.date;
        const latestDate = this.transactions.reduce((latest, txn) => 
            txn.date > latest ? txn.date : latest, 
            firstDate
        );

        // Determine tax year: if date is before April 6, it's the previous calendar year's tax year
        const year = latestDate.getFullYear();
        const month = latestDate.getMonth(); // 0-indexed, so April = 3
        const day = latestDate.getDate();

        // UK tax year starts April 6
        // If before April 6, tax year is previous year
        // If April 6 or later, tax year is current year
        if (month < 3 || (month === 3 && day < 6)) {
            this.taxYear = year - 1;
        } else {
            this.taxYear = year;
        }
    }

    clearTransactions() {
        this.transactions = [];
        this.report = null;
        // Clear from storage
        this.saveToStorage();
    }

    async process() {
        if (this.transactions.length === 0) {
            this.report = null;
            this.error = null;
            return;
        }

        this.isProcessing = true;
        this.error = null;

        try {
            // Create fresh calculator
            const calculator = new CapitalGainsCalculator({ taxYear: this.taxYear });

            console.log(`[CGC] Processing ${this.transactions.length} transactions for tax year ${this.taxYear}`);

            // Gather all tracked symbols
            const trackedSymbols = new Set<string>();
            for (const txn of this.transactions) {
                if (txn.symbol) trackedSymbols.add(txn.symbol);
            }

            // Add transactions
            for (const txn of this.transactions) {
                // Fix missing prices for STOCK_ACTIVITY using initial prices
                if (txn.action === 'STOCK_ACTIVITY' && (!txn.price || txn.price.isZero())) {
                    if (txn.symbol) {
                        const initialPrice = initialPriceService.getPrice(txn.symbol, txn.date);
                        if (initialPrice !== null) {
                            txn.price = new Decimal(initialPrice);
                        }
                    }
                }

                if (txn.action === 'BUY' || txn.action === 'STOCK_ACTIVITY') {
                    await calculator.addAcquisition(txn);
                } else if (txn.action === 'SELL') {
                    await calculator.addDisposal(txn);
                } else if (txn.action === 'DIVIDEND') {
                    calculator.addDividend(txn);
                } else if (txn.action === 'INTEREST') {
                    calculator.addInterest(txn);
                } else if (txn.action === 'STOCK_SPLIT') {
                    // Split handling is internal to calculator via addAcquisition
                    await calculator.addAcquisition(txn);
                }
            }

            // Process ERI (Excess Reported Income)
            // Add ERI transactions for any symbols we track that have ERI data
            for (const eriEntry of ERI_DATA) {
                const potentialSymbols = isinService.getSymbols(eriEntry.isin);
                
                // Find which of these symbols we actually hold/track
                for (const symbol of potentialSymbols) {
                    if (!trackedSymbols.has(symbol)) continue;

                    // Parse date (using shared parser for consistency)
                    // The data file has format "DD/MM/YYYY" from original CSV, or "YYYY-MM-DD" depending on how parser handled it.
                    // The convert_csv_to_ts script used raw string from CSV.
                    // Vanguard ERI CSV format is likely DD/MM/YYYY.
                    // Let's handle both or ensure consistent format.
                    // The generated eri-data.ts likely has "30/06/2024" format.
                    
                    let date: Date;
                    try {
                        if (eriEntry.date.includes('/')) {
                            // DD/MM/YYYY
                            const [day, month, year] = eriEntry.date.split('/').map(Number);
                            date = new Date(Date.UTC(year!, month! - 1, day!));
                        } else {
                            // Assume ISO or other parsable format
                            date = new Date(eriEntry.date);
                        }
                    } catch {
                        continue;
                    }

                    const eriTxn: BrokerTransaction = {
                        date,
                        action: 'EXCESS_REPORTED_INCOME' as any, // Cast to match type if not in enum yet
                        symbol,
                        description: `ERI for ${symbol}`,
                        quantity: null,
                        price: null,
                        fees: new Decimal(0),
                        amount: new Decimal(eriEntry.amount),
                        currency: eriEntry.currency,
                        broker: 'Vanguard (ERI)',
                        isin: eriEntry.isin
                    };
                    
                    calculator.addEri(eriTxn);
                }
            }

            // Calculate
            console.log('[CGC] Calculating capital gain...');
            const report = await calculator.calculateCapitalGain();
            this.report = report;
            console.log('[CGC] Report generated successfully. Tax year:', report.taxYear, 
                'Capital gain:', report.capitalGain.toString(), 
                'Capital loss:', report.capitalLoss.toString());

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("[CGC] Calculation failed:", err);
            this.error = `Calculation failed: ${errorMessage}`;
            this.report = null;
        } finally {
            this.isProcessing = false;
        }
    }

    setTaxYear(year: number) {
        this.taxYear = year;
        this.process();
    }

    setFxSource(source: FXSource) {
        this.fxSource = source;
        currencyConverter.source = source;
        // Clear cache to force re-fetch with new source
        currencyConverter.clearCache();
        // Recalculate with new FX rates
        this.process();
    }
}

export const appState = new AppState();
