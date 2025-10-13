/**
 * Example transaction data for demonstrating the calculator.
 *
 * These scenarios showcase various HMRC CGT rules:
 * - Same-day rule (TSLA: buy and sell same day)
 * - Bed & Breakfast rule (NVDA: sell then rebuy within 30 days)
 * - Section 104 pooling (VUAG: multiple buys averaged)
 * - Dividend handling (AAPL, MSFT dividends)
 */

// Seeded random for reproducible "variation"
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff);
  };
}

/**
 * Generate example CSV data with slight price variations.
 * Each call with the same date produces the same "random" values.
 */
export function generateExampleData(): string {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const rand = seededRandom(seed);

  // Small variation helper: ±2%
  const vary = (base: number): string => {
    const variation = 0.96 + rand() * 0.08; // 0.96 to 1.04
    return (base * variation).toFixed(2);
  };

  // Build a compelling trading story over ~6 months
  const rows = [
    // Header
    'Date,Action,Symbol,Description,Price,Quantity,Fees & Comm,Amount',

    // January: Start building positions
    `01/08/2025,Buy,VUAG,VANGUARD FTSE ALL-WORLD UCITS ETF,$${vary(118)},30,$4.99,-$${(30 * 118 + 4.99).toFixed(2)}`,
    `01/15/2025,Buy,AAPL,APPLE INC,$${vary(185)},15,$0,-$${(15 * 185).toFixed(2)}`,
    `01/22/2025,Credit Interest,,BANK INT PAYMENT,,,,$2.45`,

    // February: Add more diversification
    `02/05/2025,Buy,MSFT,MICROSOFT CORP,$${vary(415)},5,$0,-$${(5 * 415).toFixed(2)}`,
    `02/14/2025,Buy,NVDA,NVIDIA CORP,$${vary(720)},3,$0,-$${(3 * 720).toFixed(2)}`,
    `02/20/2025,Buy,VUAG,VANGUARD FTSE ALL-WORLD UCITS ETF,$${vary(122)},25,$4.99,-$${(25 * 122 + 4.99).toFixed(2)}`,

    // March: Same-day trading (TSLA) - demonstrates Same-Day Rule
    `03/10/2025,Buy,TSLA,TESLA INC,$${vary(245)},10,$0,-$${(10 * 245).toFixed(2)}`,
    `03/10/2025,Sell,TSLA,TESLA INC,$${vary(252)},10,$0,$${(10 * 252).toFixed(2)}`,

    // March: Take some NVDA profits
    `03/18/2025,Sell,NVDA,NVIDIA CORP,$${vary(785)},3,$0,$${(3 * 785).toFixed(2)}`,

    // April: Rebuy NVDA within 30 days - triggers Bed & Breakfast Rule!
    `04/08/2025,Buy,NVDA,NVIDIA CORP,$${vary(768)},4,$0,-$${(4 * 768).toFixed(2)}`,
    `04/12/2025,Qualified Dividend,AAPL,APPLE INC Q1 DIVIDEND,,,,$18.75`,

    // May: Continue building ETF position
    `05/01/2025,Buy,VUAG,VANGUARD FTSE ALL-WORLD UCITS ETF,$${vary(126)},20,$4.99,-$${(20 * 126 + 4.99).toFixed(2)}`,
    `05/15/2025,Sell,AAPL,APPLE INC,$${vary(195)},8,$0,$${(8 * 195).toFixed(2)}`,

    // June: Portfolio rebalancing
    `06/03/2025,Sell,VUAG,VANGUARD FTSE ALL-WORLD UCITS ETF,$${vary(130)},40,$4.99,$${(40 * 130 - 4.99).toFixed(2)}`,
    `06/10/2025,Buy,AMZN,AMAZON.COM INC,$${vary(188)},8,$0,-$${(8 * 188).toFixed(2)}`,
    `06/18/2025,Qualified Dividend,MSFT,MICROSOFT CORP Q2 DIVIDEND,,,,$11.25`,

    // July: Summer trades
    `07/02/2025,Sell,MSFT,MICROSOFT CORP,$${vary(435)},3,$0,$${(3 * 435).toFixed(2)}`,
    `07/15/2025,Buy,GOOGL,ALPHABET INC CL A,$${vary(178)},10,$0,-$${(10 * 178).toFixed(2)}`,
    `07/22/2025,Sell,NVDA,NVIDIA CORP,$${vary(820)},2,$0,$${(2 * 820).toFixed(2)}`,
  ];

  return rows.join('\n');
}

// Static fallback (used if dynamic generation fails)
export const EXAMPLES = {
  schwab: generateExampleData(),
};
