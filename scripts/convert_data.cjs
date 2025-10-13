const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const OLD_DIR = path.join(__dirname, '../old/cgt_calc/resources');
const DATA_DIR = path.join(__dirname, '../src/lib/data');

// Ensure output dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 1. Initial Prices
try {
    const pricesCsv = fs.readFileSync(path.join(OLD_DIR, 'initial_prices.csv'), 'utf8');
    const pricesData = Papa.parse(pricesCsv, { header: true, skipEmptyLines: true }).data;
    const pricesTs = `/**
 * Initial/Historical Stock Prices
 * Auto-generated from initial_prices.csv
 */
export interface InitialPrice {
  date: string;
  symbol: string;
  price: number;
}

export const INITIAL_PRICES: InitialPrice[] = ${JSON.stringify(pricesData.map(r => ({
  date: r.date,
  symbol: r.symbol,
  price: parseFloat(r.price)
})), null, 2)};
`;
    fs.writeFileSync(path.join(DATA_DIR, 'initial-prices.ts'), pricesTs);
    console.log('Generated initial-prices.ts');
} catch (e) {
    console.error('Error generating initial-prices.ts:', e);
}

// 2. ISIN Map
try {
    const isinCsv = fs.readFileSync(path.join(OLD_DIR, 'initial_isin_translation.csv'), 'utf8');
    const isinData = Papa.parse(isinCsv, { header: false, skipEmptyLines: true }).data;
    // Skip header manually as it's variable length
    const isinMap = {};
    isinData.slice(1).forEach(row => {
        if (row.length < 2) return;
        const isin = row[0];
        const symbols = row.slice(1).filter(s => s && s.trim());
        isinMap[isin] = symbols;
    });

    const isinTs = `/**
 * ISIN to Symbol Mapping
 * Auto-generated from initial_isin_translation.csv
 */
export const ISIN_MAP: Record<string, string[]> = ${JSON.stringify(isinMap, null, 2)};
`;
    fs.writeFileSync(path.join(DATA_DIR, 'isin-map.ts'), isinTs);
    console.log('Generated isin-map.ts');
} catch (e) {
    console.error('Error generating isin-map.ts:', e);
}

// 3. ERI Data
try {
    const eriCsv = fs.readFileSync(path.join(OLD_DIR, 'eri/vanguard_eri.csv'), 'utf8');
    const eriData = Papa.parse(eriCsv, { header: true, skipEmptyLines: true }).data;
    const eriTs = `/**
 * Excess Reported Income (ERI) Data
 * Auto-generated from vanguard_eri.csv
 */
export interface EriEntry {
  isin: string;
  date: string;
  currency: string;
  amount: number;
}

export const ERI_DATA: EriEntry[] = ${JSON.stringify(eriData.map(r => ({
  isin: r.ISIN,
  date: r['Fund Reporting Period End Date'],
  currency: r.Currency,
  amount: parseFloat(r['Excess of reporting income over distribution'])
})), null, 2)};
`;
    fs.writeFileSync(path.join(DATA_DIR, 'eri-data.ts'), eriTs);
    console.log('Generated eri-data.ts');
} catch (e) {
    console.error('Error generating eri-data.ts:', e);
}

console.log('Data conversion complete.');

