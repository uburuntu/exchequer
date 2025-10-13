# Exchequer - Agent Context

## Design Philosophy: British Heritage Editorial

**Target aesthetic**: Sophisticated and trustworthy, inspired by The Economist and Financial Times.

**Typography**:
- Display: Playfair Display (serif headers)
- Body: Source Sans 3 (readable)
- Data: IBM Plex Mono (financial precision)

**Colors**:
- Navy dark (#1a2332): Authority, primary text
- Burgundy (#8b2e3f): Accents, CTAs
- Cream (#f4f1e8): Background warmth
- Gold (#c9a961): Highlights, success
- Green/Red ink: Gains/losses

**Motion**: Refined transitions (300ms), respect `prefers-reduced-motion`.

**Accessibility**: WCAG 2.1 AA, full keyboard navigation, semantic HTML.

---

## Development Patterns

### Testing

**Decimal comparisons**: Use `.toString()` not `.toNumber()` for assertions to avoid precision issues.

**UK tax year**: April 6 - April 5 (e.g., 2024 tax year = Apr 6 2024 - Apr 5 2025).

**Transaction sorting**: SELL before BUY on same day to avoid negative balance errors.

**Empty file validation**: Check for empty content BEFORE calling Papa.parse:
```typescript
if (!fileContent || fileContent.trim() === '') {
  throw new ParsingError(fileName, 'CSV file is empty');
}
```

**Price calculation**: When both amount and quantity exist: `price = abs(amount) / quantity`

### Integration Testing

**CapitalGainsReport**: No `totalGain` or `totalDividend` properties. Calculate totals: `capitalGain + capitalLoss`.

**Async pattern**: Calculator methods are async: `await calculator.calculateCapitalGain()`

**Mock currency converter for tests**:
```typescript
const mockGetRate = vi.spyOn(CurrencyConverter.prototype, 'getRate');
mockGetRate.mockImplementation(async (currency: string) => {
  if (currency === 'GBP') return new Decimal(1);
  if (currency === 'USD') return new Decimal(7).div(6);
  throw new Error(`Unmocked currency: ${currency}`);
});
```

---

## UI Guidelines

### Principles

- **No registration required** — let users get value immediately
- **No loading states between screens** — prefetch and cache
- **Works offline** — local-first, all calculations client-side
- **Never lose user data** — autosave silently

### Controls

- Make controls always visible (not hover-reveal)
- Clear visual boundaries and affordance
- Keep controls outside scroll areas
- Full keyboard navigation

### Typography

- Center-align text in buttons
- Use absolute date formats ("Jan 15, 2025" not "2 days ago")
- Never truncate text without accessible alternatives

---

## CGT Calculation Rules - CRITICAL

### HMRC Matching Rule Precedence
Rules MUST be applied in this exact order (per TCGA 1992):
1. **Same-Day Rule** (s.105) - match disposals to same-day acquisitions first
2. **Bed & Breakfast Rule** (s.106A) - match to acquisitions within 30 days
3. **Section 104 Pool** (s.104) - average cost for remaining shares

### B&B 30-Day Window
- Window is **[D+1, D+30] inclusive** (forward-looking only)
- Day 30 IS within window, Day 31 is NOT
- Leap years: Feb 29 + 30 = Mar 30 (inside), Feb 29 + 31 = Mar 31 (outside)
- Year boundary: Dec 31 + 30 = Jan 30 (inside), Dec 31 + 31 = Jan 31 (outside)

### Decimal Precision
- ALL financial calculations MUST use `decimal.js-light` (never native JS numbers)
- Use `normalizeAmount()` for currency amounts (10 decimal places)
- Use `decimal()` helper to create Decimal instances
- See `src/lib/utils/decimal.ts` for utilities

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/calculator/calculator.ts` | Main orchestrator |
| `src/lib/calculator/same-day-rule.ts` | Same-day matching |
| `src/lib/calculator/bed-and-breakfast-rule.ts` | B&B matching |
| `src/lib/calculator/section-104-rule.ts` | Pool averaging |
| `src/lib/utils/decimal.ts` | Precision handling |
| `spec/CGT_Spec_2026.md` | Full specification |

### Test Commands
```bash
pnpm vitest run              # Run all tests (exits on completion)
pnpm vitest run src/tests/spec-compliance.test.ts  # Spec compliance only
```
Note: `pnpm test` runs in watch mode and won't exit.
