const fs = require('fs');
const path = require('path');

const csvPath = path.resolve('src/tests/fixtures/exchange_rates.csv');
const outputPath = path.resolve('src/lib/data/exchange_rates.ts');

if (!fs.existsSync(csvPath)) {
    console.error('CSV not found at:', csvPath);
    process.exit(1);
}

const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.trim().split('\n').slice(1);
const rates = {};

for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const [date, currency, rate] = parts;
    if (!rates[currency]) rates[currency] = {};
    rates[currency][date.trim()] = rate.trim();
}

const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const tsContent = `/**
 * Bundled exchange rates data (GBP to Foreign Currency)
 * Source: src/tests/fixtures/exchange_rates.csv
 */
export const BUNDLED_RATES: Record<string, Record<string, string>> = ${JSON.stringify(rates, null, 2)};
`;

fs.writeFileSync(outputPath, tsContent);
console.log('Successfully generated:', outputPath);
