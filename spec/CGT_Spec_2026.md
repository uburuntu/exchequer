# UK Capital Gains Tax Calculator - Comprehensive Specification Document

**Version:** 1.0  
**Date:** January 2026  
**Jurisdiction:** United Kingdom (HMRC)  
**Last Updated:** 13 January 2026  
**Regulatory Reference:** TCGA 1992, HMRC Capital Gains Manual, CG Manual sections 51550–51560

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Scope & Constraints](#scope--constraints)
3. [Core Tax Rules](#core-tax-rules)
4. [Supported Brokers & Data Formats](#supported-brokers--data-formats)
5. [Transaction Types](#transaction-types)
6. [Decimal Precision & Rounding](#decimal-precision--rounding)
7. [Matching Rules Algorithm](#matching-rules-algorithm)
8. [Section 104 Pooling](#section-104-pooling)
9. [Implementation Validation Checklist](#implementation-validation-checklist)
10. [Test Cases & Edge Cases](#test-cases--edge-cases)
11. [Compliance Audit Trail](#compliance-audit-trail)

---

## Executive Summary

This document specifies the **authoritative requirements** for a UK Capital Gains Tax calculator that must:

- **Comply with HMRC rules** as of January 2026 (TCGA 1992 as amended)
- **Handle 6 major brokers** + raw CSV import
- **Enforce matching rules** in strict legal order (Same-Day → Bed & Breakfast → Section 104)
- **Maintain decimal precision** to 4 decimal places (banker's rounding for final HMRC submission)
- **Track all corporate actions** (stock splits, dividends, spin-offs, RSU vesting)
- **Operate offline** with no external API dependencies
- **Produce auditable calculations** suitable for SA302 (Self-Assessment) submission

**Critical Principle:** The calculator must be **conservative and defensive**—when in doubt, side with HMRC's interpretation. Ambiguous tax treatments must default to the higher liability position.

---

## Scope & Constraints

### In Scope
✅ UK residents (for CGT purposes—non-resident rules excluded)  
✅ Chargeable assets: shares, ETFs, cryptocurrencies, bonds, unit trusts  
✅ Tax years: 2020/21 onwards (historical data support)  
✅ Sterling (£) and multi-currency transactions with FX spot rates  
✅ Personal (non-trading) gains classification  
✅ Annual exemption tracking (£3,000 for 2025/26 tax year)  
✅ Basic rate (20%) and higher rate (40%) CGT calculations  

### Out of Scope (Explicitly Excluded)
❌ Trading (as opposed to investment) classification  
❌ Entrepreneurs' Relief / Business Asset Disposal Relief (BADR)  
❌ Corporate taxpayers or partnership taxation  
❌ Non-resident taxpayers or temporary non-residents  
❌ Premium financed insurance policy gains  
❌ Deemed disposal rules (Section 24)  
❌ Losses brought forward from prior years  
❌ Carry-back of losses within settlement trusts  
❌ Indexation allowance (abolished 2008 for most taxpayers)  

---

## Core Tax Rules

### 1. Matching Rules Hierarchy (TCGA 1992, ss.105–106A)

HMRC requires disposals to be matched in **strict sequential order**. No discretion exists; all disposals must follow this order.

#### 1.1 Same-Day Rule (TCGA 1992, s.105)

**Condition:** Acquisition and disposal of **identical assets occur on the same calendar day** AND in the same capacity (e.g., both personal, not one personal + one trustee)

**Matching Logic:**
- Acquisitions and disposals on the same day are treated as **single transactions**
- Maximum quantity matched = `MIN(total_acquisitions_quantity, total_disposals_quantity)` on that day
- Matched quantity uses **FIFO chronological matching**: earliest acquisitions matched to earliest disposals within the same day
- **Excess acquisitions** (if qty acquired > qty disposed): remainder flows to Bed & Breakfast rule → then Section 104
- **Excess disposals** (if qty disposed > qty acquired): remainder flows to Bed & Breakfast rule → then Section 104

**Key Clarification:** "Same day" means the **calendar date**, not hour-by-hour. All trades on 15 May 2025 are considered simultaneous for matching purposes, regardless of intra-day timing.

**Gain/Loss Calculation (Same-Day Matched):**
```
PER_UNIT_GAIN = (disposal_price - acquisition_price)
TOTAL_GAIN = PER_UNIT_GAIN × matched_quantity
```
No averaging; use actual transaction prices.

**Example:**
```
15 May 2025:
  - Buy: 100 shares @ £10.00 = £1,000.00
  - Buy: 50 shares @ £11.00 = £550.00
  - Sell: 120 shares @ £12.00 = £1,440.00

Matched:
  First 100 shares: (£12.00 - £10.00) × 100 = £200.00 gain
  Next 20 shares:   (£12.00 - £11.00) × 20  = £20.00 gain
  Total Same-Day Gain: £220.00
  
Unmatched:
  30 shares @ £11.00 from May 15 acquire → flows to B&B/S104 check
```

---

#### 1.2 Bed & Breakfast Rule (TCGA 1992, s.106A) – The 30-Day Rule

**Condition:** 
- Disposal of an asset on **Day D**
- Acquisition of **identical asset** on any date in the range **[D+1, D+30]** (30 calendar days following disposal)
- Same capacity (personal vs trustee distinction)

**Key Detail:** The 30-day window is **strictly forward-looking only**. Sales 30 days BEFORE a purchase do not trigger B&B. Only acquisitions AFTER the disposal within 30 days apply.

**Matching Logic:**
- Unmatched disposals are matched against acquisitions on a **FIFO basis** (earliest disposal first)
- Acquisitions in the 30-day window are matched against disposals in order of:
  1. Earliest unmatched disposal first
  2. Continue until disposal exhausted or 30-day acquisitions exhausted
- If **multiple disposals** in the preceding 30 days, acquisitions match **earliest disposal first**
- Excess acquisitions (not matched to any disposal) fall into Section 104 pool
- Excess disposals (no matching acquisition) fall into Section 104 pool

**Gain/Loss Calculation (B&B Matched):**
```
DISPOSAL_PROCEEDS = actual_sale_price × quantity_matched
ACQUISITION_COST = actual_repurchase_price × quantity_matched
GAIN_LOSS = DISPOSAL_PROCEEDS - ACQUISITION_COST
```

**Real Example (from HMRC Guidance):**
```
Jan 1:  Buy 1 BTC @ £20,000 cost
Jan 5:  Sell 1 BTC @ £18,000 (triggering £2,000 loss under S104)
Jan 10: Buy 1 BTC @ £19,000

HMRC Treatment:
- Disposal on Jan 5 is matched to acquisition on Jan 10 (within 30 days)
- Gain/Loss = £18,000 (proceeds) - £19,000 (cost of Jan 10 purchase) = -£1,000 loss
- Original Jan 1 purchase (£20,000 cost) remains in Section 104 pool
- NOT the original £2,000 loss

This prevents tax-loss harvesting abuse.
```

**Critical Edge Cases:**
- If disposal occurs on **30 Dec** and repurchase on **31 Jan**, this is Day +2 of the new calendar year but still within 30 calendar days. **MATCHES** under B&B.
- Leap years: A disposal on 1 Feb (year with leap day) and repurchase on 2 Mar is 29 days away (inclusive of leap day). **MATCHES** B&B.
- Multiple disposals within 30-day window: Each is matched independently. **Example:** Sell 100 shares on Day 1 @ £10, Sell 50 shares on Day 10 @ £12, Buy 120 shares on Day 15 @ £11. Matching: First 100 shares matched to earliest disposal (Day 1 @ £10 cost); remaining 20 shares matched to Day 10 disposal (@ £12 cost). 30 remaining shares flow to S104.

---

#### 1.3 Section 104 Pooling (TCGA 1992, s.104(3)(ii) – "The Pool")

**Condition:** Any disposal not matched by Same-Day or B&B rules falls into the Section 104 pool for that asset.

**Pool Mechanics:**

The Section 104 pool operates as a **continuous running average cost reservoir**:

1. **Initial State:** Pool is empty (zero cost, zero quantity)
2. **On Each Acquisition:** 
   - Add quantity to pool
   - Add cost to pool's total allowable cost (TAC)
   - Recalculate pool's average cost per unit = `TAC / quantity`
3. **On Each Disposal (unmatched to Same-Day or B&B):**
   - Reduce pool quantity by disposal quantity
   - Reduce pool TAC by `disposal_quantity × average_cost_per_unit` (calculated at time of disposal)
   - Remaining pool recalculates its new average

**Pool Definition:**
```
POOL_STATE = {
  total_allowable_cost (TAC): decimal,
  quantity: integer (units),
  average_cost_per_unit: TAC / quantity
}
```

**Disposal from Pool:**
```
COST_OF_DISPOSAL = disposal_quantity × average_cost_per_unit (BEFORE adjustment)
GAIN_LOSS = disposal_proceeds - COST_OF_DISPOSAL

POST_DISPOSAL_POOL = {
  TAC: old_TAC - COST_OF_DISPOSAL,
  quantity: old_quantity - disposal_quantity,
  average_cost_per_unit: updated TAC / updated quantity (if quantity > 0)
}
```

**Real Example:**
```
Pool lifecycle for Asset "ABC":

Start:    { TAC: £0, qty: 0, avg: £0 }

1 Jan:    Buy 1,000 @ £5.00/unit = £5,000
          { TAC: £5,000, qty: 1,000, avg: £5.00 }

15 Jan:   Buy 500 @ £6.00/unit = £3,000
          { TAC: £8,000, qty: 1,500, avg: £5.3333... }

1 Feb:    Sell 600 units @ £7.00/unit = £4,200 (no same-day/B&B match)
          Cost basis: 600 × £5.3333 = £3,200
          Gain: £4,200 - £3,200 = £1,000
          { TAC: £4,800, qty: 900, avg: £5.3333... }
          
          ❌ WRONG: avg is still £5.3333 (same as before)
          ✅ CORRECT: avg = £4,800 / 900 = £5.3333... (rounded, happens to be same)

15 Feb:   Buy 100 @ £5.50 = £550
          { TAC: £5,350, qty: 1,000, avg: £5.35 }

1 Mar:    Sell 250 @ £8.00 = £2,000 (no match)
          Cost basis: 250 × £5.35 = £1,337.50
          Gain: £2,000 - £1,337.50 = £662.50
          { TAC: £4,012.50, qty: 750, avg: £5.35 }
```

---

### 2. Asset Identification Rules

**Critical Concept:** All acquisitions of the same **asset type** (e.g., "AAPL" or "Bitcoin") held in the same capacity (personal use) are pooled together under Section 104.

**Asset Identity Definition:**
- **ISIN Code** (if available) is the primary identifier for shares/ETFs
- **Ticker Symbol** (if ISIN unavailable) 
- **Cryptocurrency Symbol** (e.g., "BTC", "ETH") for digital assets
- **Bond CUSIP** for bonds
- Capacity indicator: Personal vs. Trustee vs. Joint

**Example of Asset Pooling:**
```
Single Pool contains:
- 100 AAPL shares bought on Vanguard
- 50 AAPL shares bought on Trading 212
- AAPL holdings on Interactive Brokers
→ All treated as SINGLE Section 104 pool for capital gains
→ Broker origin is irrelevant; only asset identity matters
```

---

### 3. Acquisition Cost Basis

**Allowable Cost** includes:

1. **Purchase price** (in £ or £ equivalent at spot FX rate on transaction date)
2. **Broker commissions/fees** directly attributable to acquisition (flat fees, per-share fees)
3. **Clearing charges** and settlement fees
4. **Stamp duty** (historically; now zero for most UK equities as of 2024)

**NOT Allowable (per HMRC CG Manual):**
- Investment advisory fees (separate from transaction fees)
- Account maintenance fees
- General banking charges
- Margin interest (treated as separate expense)
- Tax-loss harvesting fees

**Example:**
```
Gross trade: Buy 100 AAPL @ £150 = £15,000
Broker commission: £10
Clearing fee: £1
Allowable cost: £15,000 + £10 + £1 = £15,011
```

---

### 4. Disposal Proceeds

**Proceeds** includes:

1. **Sale price** (in £ or £ equivalent at spot FX rate on transaction date)
2. **Dividends received within 30 days of sale** (if defined as sale-related return)
3. **Less:** Broker commissions/fees on sale
4. **Less:** Clearing/settlement charges on sale

**Example:**
```
Gross sale: Sell 100 AAPL @ £160 = £16,000
Broker commission: £12
Clearing fee: £2
Proceeds: £16,000 - £12 - £2 = £15,986
```

---

### 5. Multi-Currency Transactions (Foreign Acquisitions)

**HMRC Rule:** All gains/losses must be calculated in **British Pounds (£)** using **spot exchange rates** on the transaction date.

**FX Spot Rate Determination:**
- HMRC accepts **rates from HM Treasury**, **Financial Times**, or major financial databases
- For practical purposes: **WMR (World Market Rate) at 4 PM London time** on the transaction date is the standard
- If transaction date is a weekend/holiday: Use the last trading day's close

**Example:**
```
15 Jan 2025: Buy 1 AAPL (USD stock) @ $150 USD
  GBP/USD rate on 15 Jan: 1.27 (i.e., £1 = $1.27)
  Allowable cost: $150 / 1.27 = £118.11

20 Feb 2025: Sell 1 AAPL @ $160 USD
  GBP/USD rate on 20 Feb: 1.29
  Proceeds: $160 / 1.29 = £124.03
  
Gain: £124.03 - £118.11 = £5.92
(Not measured in USD; entirely in GBP terms)
```

---

## Supported Brokers & Data Formats

### 1. Charles Schwab

**Data Source:** CSV export from "Account Statements" → "Transactions" tab

**Required Columns (Schwab CSV Format):**
```
Date,Type,"Quantity","Symbol",Price,"Commission/Fees",Amount
"01/15/2025","Buy","100","AAPL","150.00","-10.00","-15010.00"
"02/20/2025","Sell","100","AAPL","160.00","-12.00","15988.00"
"03/01/2025","Dividend","N/A","AAPL","1.25","0.00","125.00"
```

**Parsing Rules:**
- **Date:** MM/DD/YYYY format → convert to YYYY-MM-DD
- **Type:** "Buy" | "Sell" | "Dividend" | "Interest" | "Stock Split" | "Deposit" | "Withdrawal"
- **Quantity:** Integer or decimal (e.g., for fractional shares post-split)
- **Symbol:** Ticker symbol (ISIN preferred but not provided by Schwab CSV)
- **Price:** Per-unit price (for Buys/Sells)
- **Commission/Fees:** Negative value (Schwab's format; negate for allowable cost)
- **Amount:** Total transaction value (for validation only)

**Data Validation for Schwab:**
- Negate fee/commission values before calculation
- Convert Amount to GBP if not already (Schwab provides in account currency)
- Reject if Quantity is zero
- Reject if Transaction date is in the future

---

### 2. Trading 212

**Data Source:** "Invest" account export → CSV (available via Settings → History)

**Required Columns:**
```
"Execution Date","Action","Currency","Ticker","Quantity","Price per share","Total"
"2025-01-15","Buy","USD","AAPL","100","150.00","15000.00"
"2025-02-20","Sell","USD","AAPL","100","160.00","16000.00"
"2025-03-01","Dividend","GBP","AAPL","1","1.25","125.00"
```

**Parsing Rules:**
- **Execution Date:** YYYY-MM-DD format (T212 uses ISO-8601)
- **Action:** "Buy" | "Sell" | "Dividend" | "Interest"
- **Currency:** ISO code (USD, GBP, EUR, etc.)
- **Ticker:** Stock symbol
- **Quantity:** Decimal allowed
- **Price per share:** Per-unit price
- **Total:** Gross transaction total (including/excluding fees per T212 settings)

**Data Validation for Trading 212:**
- T212 does NOT include explicit broker fees in historical exports (fees already deducted from Total)
- This means **Allowable Cost = Total provided** (fees already netted)
- Currency conversion: If non-GBP, apply WMR GBP/XXX rate from Execution Date
- Validate: `Quantity × Price per share ≈ Total` (allowing for rounding)

---

### 3. Morgan Stanley (MSSB)

**Data Source:** Client portal → "Account Statements" → "Transaction History" → export CSV

**Required Columns:**
```
"Trade Date","Settlement Date","Quantity","Symbol","CUSIP","Security Type","Action","Price","Commission","Amount"
"01/15/2025","01/17/2025","100","AAPL","037833100","Equity","Buy","150.00","10.00","15010.00"
"02/20/2025","02/22/2025","100","AAPL","037833100","Equity","Sell","160.00","12.00","15988.00"
```

**Parsing Rules:**
- **Trade Date:** MM/DD/YYYY (use this, NOT Settlement Date)
- **CUSIP:** 9-character code (use CUSIP to identify asset, map to ISIN if possible)
- **Security Type:** "Equity" | "Fund" | "Bond" | "Option"
- **Action:** "Buy" | "Sell"
- **Commission:** Explicitly stated (add to acquisition cost, subtract from sale proceeds)

**Data Validation for MSSB:**
- If CUSIP provided, verify against asset database
- Commission is **already stated separately** (not netted into Amount)
- Allowable cost = Amount + Commission (for buys)
- Sale proceeds = Amount - Commission (for sells)

---

### 4. Sharesight

**Data Source:** "Portfolio Reports" → "Tax Report" → CSV export

**Required Columns:**
```
"Purchase Date","Sale Date","Quantity","Symbol","ISIN","Cost per Unit","Sale Price per Unit","Gain/Loss","Brokerage"
"15/01/2025","20/02/2025","100","AAPL","US0378331005","150.00","160.00","1000.00","10.00"
```

**Parsing Rules:**
- **Dates:** DD/MM/YYYY format
- **ISIN:** 12-character code (ISIN is provided; prioritize it over symbol)
- **Cost per Unit:** Already includes brokerage in Sharesight's calculation
- **Gain/Loss:** Provided by Sharesight (use for validation ONLY; recalculate independently)
- **Brokerage:** Flat fee field

**Data Validation for Sharesight:**
- ⚠️ **CRITICAL:** Sharesight may have already applied matching rules (S104 pooling); you must **override** and recalculate using your own rules
- Sharesight's "Gain/Loss" field should NOT be trusted as your source; recalculate independently
- If Sharesight has applied S104 averaging and you've applied Same-Day rule, results will differ (expected)
- ISIN validation: Verify 12-character format

---

### 5. Vanguard

**Data Source:** Portfolio → "Your Accounts" → "Transaction History" → download CSV

**Required Columns:**
```
"Date","Type","Quantity","Description","Price","Amount","Status"
"15/01/2025","Buy","100","VANGUARD FTSE ALL-SHARE INDEX FUND","150.00","-15000.00","Complete"
"20/02/2025","Sell","100","VANGUARD FTSE ALL-SHARE INDEX FUND","160.00","16000.00","Complete"
"01/03/2025","Dividend Income","N/A","VANGUARD FTSE ALL-SHARE INDEX FUND - DIVIDEND","1.25","125.00","Complete"
```

**Parsing Rules:**
- **Date:** DD/MM/YYYY
- **Type:** "Buy" | "Sell" | "Dividend Income" | "Interest Income"
- **Description:** Fund name; extract ticker/ISIN from here
- **Amount:** Negative for debits (buys), positive for credits (sells, dividends)
- **Status:** "Complete" | "Pending" (reject pending)

**Data Validation for Vanguard:**
- Vanguard does NOT list broker fees separately (included in Amount)
- Amount already nets fees: `Proceeds = Amount` (for sells)
- Convert Amount sign: Negate as needed for standardization

---

### 6. Freetrade

**Data Source:** Portfolio → "History" → "Download CSV"

**Required Columns:**
```
"Date","Type","Ticker","Company Name","Quantity","Price","Cost","Description"
"2025-01-15","BUY","AAPL","Apple Inc.","100","150.00","15000.00","Filled"
"2025-02-20","SELL","AAPL","Apple Inc.","100","160.00","16000.00","Filled"
```

**Parsing Rules:**
- **Date:** YYYY-MM-DD
- **Type:** "BUY" | "SELL"
- **Ticker:** Stock symbol (Freetrade provides ticker)
- **Cost:** Total transaction cost (Freetrade is commission-free, so Cost = Quantity × Price)

**Data Validation for Freetrade:**
- Freetrade is **zero-commission** on equities; no broker fees to add
- Allowable cost = Cost field (quantity × price, no deductions)
- No hidden fees in USD/EUR transactions (they apply automatic FX conversion)

---

### 7. Raw CSV Format (Custom Import)

For brokers not explicitly supported, users must provide a **standardized raw CSV** with these exact columns:

```
"Date","Asset","Ticker","ISIN","Type","Quantity","Price_GBP","Commission_GBP","Notes"
"2025-01-15","Apple Inc.","AAPL","US0378331005","Buy","100.00","150.00","10.00","Bought via IB"
"2025-02-20","Apple Inc.","AAPL","US0378331005","Sell","100.00","160.00","12.00","Sold via IB"
"2025-03-01","Apple Inc.","AAPL","US0378331005","Dividend","100.00","1.25","0.00","Q1 Dividend"
"2025-03-10","Apple Inc.","AAPL","US0378331005","Stock Split","100.00","1.00","0.00","4:1 split"
```

**Column Specifications:**

| Column | Format | Required | Notes |
|--------|--------|----------|-------|
| Date | YYYY-MM-DD | Yes | ISO-8601 format |
| Asset | String | Yes | Security name (for audit trail) |
| Ticker | String | Yes | Stock symbol or identifier |
| ISIN | String | No | 12-char code preferred (for asset matching) |
| Type | Enum | Yes | Buy, Sell, Dividend, Interest, Stock Split, Spin-off, Merger, RSU Vesting, ESPP |
| Quantity | Decimal | Yes | Number of units (can be fractional post-split) |
| Price_GBP | Decimal | Yes | Price per unit in GBP (user must convert FX) |
| Commission_GBP | Decimal | Yes | Fees in GBP (0 if none) |
| Notes | String | No | Audit trail / reference |

**Validation Rules for Raw CSV:**
- All required fields non-null
- Date is valid ISO-8601 and not in future
- Quantity > 0
- Price_GBP > 0
- Commission_GBP ≥ 0
- ISIN (if provided) is exactly 12 alphanumeric characters
- Type is one of the allowed enums

---

## Transaction Types

### 1. Buy (Acquisition)

**HMRC Classification:** Acquisition of an asset.

**Tax Treatment:**
- Adds quantity and cost to Section 104 pool (if not Same-Day or B&B matched)
- Allowable cost includes purchase price + commissions
- No immediate tax event (deferred until disposal)

**Input:** `{ Date, Ticker, ISIN, Quantity, Price_GBP, Commission_GBP }`

**Validation:**
- Quantity > 0
- Price_GBP > 0
- Commission_GBP ≥ 0

**Calculation:**
```
ALLOWABLE_COST = (Quantity × Price_GBP) + Commission_GBP
```

---

### 2. Sell (Disposal)

**HMRC Classification:** Disposal of an asset (chargeable gain/loss event).

**Tax Treatment:**
- Triggers capital gains tax calculation
- Must apply matching rules: Same-Day → B&B → S104
- Proceeds = (Quantity × Price_GBP) - Commission_GBP

**Input:** `{ Date, Ticker, ISIN, Quantity, Price_GBP, Commission_GBP }`

**Validation:**
- Quantity > 0 (must have shares to sell)
- Price_GBP > 0
- Commission_GBP ≥ 0
- Quantity ≤ total held (check against holdings record)

**Calculation:**
```
PROCEEDS = (Quantity × Price_GBP) - Commission_GBP
COST_BASIS = [determined by matching rules]
GAIN_LOSS = PROCEEDS - COST_BASIS
```

**Output Recorded:**
- Matched quantity and dates
- Acquisition cost used (from which rule: Same-Day/B&B/S104)
- Gain/loss amount
- Acquisition date(s) (for audit trail)

---

### 3. Stock Split / Reverse Split

**HMRC Classification:** Corporate action (adjustment event, not a taxable disposal).

**Tax Treatment:**
- **No tax charge** on the split itself (per TCGA 1992, s.126)
- Adjusts holdings and average cost in Section 104 pool
- Matches are NOT broken by splits

**Input:** `{ Date, Ticker, ISIN, Quantity_Before, Quantity_After, Ratio }`

**Example:**
```
Before: 100 shares @ £150.00 = £15,000 total cost
2:1 Split occurs
After: 200 shares @ £75.00 = £15,000 total cost (cost basis unchanged)
```

**Implementation:**
- If you hold 100 shares and a 2:1 split occurs, you now hold 200 shares
- Cost per share: £150 / 2 = £75 (halved)
- Section 104 pool TAC remains £15,000; quantity doubles
- Matching records must be updated: "100 shares bought 15 Jan" → "200 shares (post-split) from 15 Jan acquisition"

**Validation:**
- Ratio must be positive (e.g., 2, 0.5, 1.5)
- Quantity_After = Quantity_Before × Ratio
- If Ratio > 1: stock split (increase shares); if Ratio < 1: reverse split (decrease shares)
- Date must be realistic (splits are public announcements; verify against corporate calendar if possible)

---

### 4. Spin-off / Demerger

**HMRC Classification:** Corporate action (special case requiring careful tracking).

**Tax Treatment (per TCGA 1992, s.127(3)(c) and related):

- Parent company shares are retained (not disposed; cost basis unaffected)
- New company shares received are a separate asset with a **nil cost basis** (in most cases—this is the UK treatment)
- **Exception:** If spin-off is to a trust or has specific conditions, different rules may apply
- No tax event on the spin-off itself, but **new asset now tracked separately**

**Input:** `{ Date, Ticker_Parent, Ticker_NewCo, Quantity_Received_Per_Parent }`

**Example:**
```
Held: 1,000 Vodafone shares @ £2.00/share = £2,000 cost

15 Oct 2024: Vodafone spins off Vantage Towers (new company)
Ratio: 1 Vodafone → 5 Vantage Towers shares

Result:
- Vodafone: still 1,000 shares @ £2.00/share = £2,000 cost basis (unchanged)
- Vantage Towers: new position of 5,000 shares with £0 cost basis (nil cost)
```

**Implementation:**
- Create a new asset entry for the new company (ticker, ISIN)
- Existing parent shares: no cost adjustment
- New shares: recorded with Section 104 pool at zero cost
- When new shares are later sold: gain = proceeds (since cost was zero)

**Validation:**
- Both parent and new ticker must be traceable
- Quantity_Received_Per_Parent must be realistic (ratios typically 1:2 to 1:10)
- Date must be official spin-off date (not user-entered arbitrarily)

---

### 5. Dividend

**HMRC Classification:** Income tax event (not capital gains); separate reporting.

**Tax Treatment:**
- **Not a taxable capital gain** (treated as income in trading account)
- Dividend income is subject to income tax, not CGT
- However, **cash dividends may be applied to purchase shares** (DRIP—Dividend Reinvestment Plan), which creates a separate buy transaction

**Input (Simple Dividend):** `{ Date, Ticker, Quantity_Shares, Dividend_Per_Share_GBP }`

**Example:**
```
1 Mar 2025: Dividend on 100 AAPL shares @ £1.25 per share
Total dividend: 100 × £1.25 = £125.00

CGT Impact: NONE (income tax applies instead)
Cash Impact: +£125.00 to cash holdings
```

**Input (Dividend Reinvestment / DRIP):**
If dividend is automatically reinvested into new shares:
```
1 Mar 2025: Dividend on 100 AAPL shares @ £1.25/share = £125.00
Reinvestment: £125.00 / £160.00 (AAPL current price) = 0.78125 shares purchased
```

**This is recorded as TWO separate transactions:**
1. **Dividend income:** +£125.00 (income tax record)
2. **Buy transaction:** +0.78125 shares @ £160.00 (capital gains record)

**Validation:**
- Dividend_Per_Share must be realistic (typically £0.10–£5.00)
- Total dividend = Quantity_Shares × Dividend_Per_Share (validate consistency)
- Date must be after holding period (cannot pay dividend before acquisition)

---

### 6. Interest Income

**HMRC Classification:** Income tax event (similar to dividend).

**Tax Treatment:**
- Subject to income tax, **not CGT**
- Records for Self-Assessment but not for capital gains calculation
- No impact on holding cost or matching rules

**Input:** `{ Date, Type (e.g., "Fixed-Income Bond"), Amount_GBP }`

**Example:**
```
31 Jan 2025: Interest on corporate bond @ 4.5% annual = £450.00
```

**Implementation:**
- Record as income transaction (separate from capital gains)
- No matching rules apply
- Do not adjust Section 104 pool

---

### 7. RSU Vesting (Restricted Stock Unit)

**HMRC Classification:** Employment income → capital gain on later sale.

**Tax Treatment (UK Employee):**
- **Vesting date:** Income tax event. Fair market value (FMV) on vesting date becomes allowable cost basis (no gain/loss at vesting)
- **Sale date (later):** Capital gains tax event

**Two-step process:**
```
Step 1 (Vesting): 
  100 RSUs vest on 15 Feb 2025 @ FMV £150/share
  Income tax: £150 × 100 = £15,000 (employer withholding; not tracked by this calculator)
  Cost basis acquired: £15,000

Step 2 (Sale, later):
  Sell 100 shares on 20 May 2025 @ £160/share
  Proceeds: £16,000
  Cost: £15,000 (from vesting FMV)
  Gain: £1,000 (capital gains tax)
```

**Input:** `{ Date_Vest, Symbol, Quantity, FMV_GBP, Withholding_Shares_Qty }`

**Key Detail - Tax Withholding:**
Most companies withhold taxes on vesting by selling a portion of shares. Record this as:
1. **Vesting transaction:** 100 RSUs @ £150/share = £15,000 added to holdings
2. **Automatic sell:** 30 shares sold @ £150/share for tax withholding = £4,500 proceeds, £4,500 cost (no gain/loss, matched by same-day rule)
3. **Net result:** 70 RSUs held with £10,500 cost basis

**Validation:**
- FMV on vesting date must be public (HMRC accepts market closing price)
- Withholding tax typically 20–45% (validate Withholding_Shares_Qty ≤ Quantity)
- Vesting date cannot be in future

---

### 8. ESPP (Employee Stock Purchase Plan)

**HMRC Classification:** Employment benefit → capital gain on later sale.

**Tax Treatment (UK ESPP):**
- **Purchase date:** Income tax on the **discount** (if any). If ESPP offers shares at 90% of market, the 10% discount is taxed as income.
- **Sale date (later):** Capital gains tax

**Two-step process:**
```
Step 1 (ESPP Purchase):
  15 Mar 2025: 100 shares purchased @ £135/share (90% of market price £150)
  Discount: 100 × (£150 - £135) = £1,500 (income tax on discount; not CGT)
  Cost basis acquired: £135 × 100 = £13,500

Step 2 (Sale, later):
  20 Jun 2025: Sell 100 shares @ £160/share
  Proceeds: £16,000
  Cost: £13,500
  Gain: £2,500 (capital gains tax)
```

**Input:** `{ Date_Purchase, Symbol, Quantity, Price_GBP, Market_Price_GBP }`

**Validation:**
- Price_GBP < Market_Price_GBP (ESPP is always a discount)
- Discount % typically 10–15% (validate Price_GBP ≥ 0.85 × Market_Price_GBP)
- Date must be on official ESPP purchase date

---

## Decimal Precision & Rounding

### 1. Internal Calculation Precision

**Mandate:** All internal calculations must use **4 decimal places** (quarter-pence precision).

**Rationale:**
- Matches HMRC's permitted precision (CG Manual CG17274)
- Sufficient to avoid cumulative rounding errors across 100s of transactions
- Banker's rounding (round-to-nearest-even) applied at each step

**Example:**
```
Section 104 pool calculation:
TAC: £12,345.6789
Quantity: 2,345 units
Average: £12,345.6789 / 2,345 = £5.2625627... 
Stored as: £5.2626 (rounded to 4 decimal places, banker's rounding)
```

### 2. Banker's Rounding (Round-to-Nearest-Even)

**Definition:** When rounding to N decimal places, if the (N+1)th digit is exactly 5 (with no subsequent non-zero digits), round to the **nearest even number** at position N.

**Examples:**
```
£5.26245 → £5.2624 (5 is the 5th decimal; round down to even)
£5.26255 → £5.2626 (5 is the 5th decimal; round up to even)
£5.26265 → £5.2626 (5 is the 5th decimal; round down to even)
£5.26275 → £5.2628 (5 is the 5th decimal; round up to even)
```

**Implementation (Pseudocode):**
```javascript
function bankerRound(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
  // Note: JavaScript's Math.round uses "round-half-away-from-zero"
  // Correct implementation requires custom logic for true banker's rounding
}

// CORRECT implementation for banker's rounding:
function bankerRound(value, decimals) {
  const factor = Math.pow(10, decimals);
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const remainder = scaled - floor;
  
  if (remainder < 0.5) return floor / factor;
  if (remainder > 0.5) return (floor + 1) / factor;
  // remainder === 0.5: round to nearest even
  return ((floor % 2 === 0) ? floor : floor + 1) / factor;
}
```

### 3. Final HMRC Submission Rounding

**For Self-Assessment Return (SA302):**
- All figures rounded to **whole pence (2 decimal places)**
- HMRC allows rounding each item **independently** (not cumulative rounding)
- Final tax liability rounded to nearest pound (0 decimals)

**Example:**
```
Multiple gains (stored internally to 4 decimals):
Gain 1: £1,234.5678
Gain 2: £987.3456
Gain 3: -£123.4567

Rounded for submission:
Gain 1: £1,234.57
Gain 2: £987.35
Gain 3: -£123.46

Total: £1,234.57 + £987.35 - £123.46 = £2,098.46

Tax liability: 20% × (£2,098.46 - £3,000 exemption) = 20% × 0 = £0
(Below annual exemption; no tax due)
```

---

## Matching Rules Algorithm

### Pseudocode / Algorithmic Flow

This section provides the **authoritative sequence** for implementing matching rules. All implementations must follow this logic verbatim.

### Data Structures

```typescript
interface Transaction {
  date: Date;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'INTEREST' | 'RSU_VEST' | 'ESPP' | 'STOCK_SPLIT';
  ticker: string;
  isin: string; // nullable
  quantity: Decimal; // 4 decimal places
  priceGBP: Decimal;
  commissionGBP: Decimal;
  capacity: 'PERSONAL' | 'TRUSTEE' | 'JOINT'; // default: PERSONAL
}

interface Holding {
  ticker: string;
  isin: string; // nullable
  totalQuantity: Decimal;
  totalCost: Decimal; // Section 104 pool TAC
  acquisitionRecords: AcquisitionRecord[];
}

interface AcquisitionRecord {
  date: Date;
  quantity: Decimal;
  costPerUnit: Decimal;
  totalCost: Decimal;
  sourceType: 'DIRECT_BUY' | 'RSU_VEST' | 'ESPP' | 'STOCK_SPLIT_ADJUSTED';
}

interface DisposalRecord {
  disposalDate: Date;
  quantity: Decimal;
  proceedsPerUnit: Decimal;
  totalProceeds: Decimal;
  matchedAcquisitions: {
    acquisitionDate: Date;
    quantity: Decimal;
    costPerUnit: Decimal;
    matchRule: 'SAME_DAY' | 'BED_BREAKFAST' | 'SECTION_104';
  }[];
  gainLoss: Decimal;
}
```

---

### Main Matching Algorithm

```pseudo

FUNCTION process_disposal(disposal_transaction):

  // Step 1: Validate disposal is possible
  current_holding = GET_HOLDING(disposal_transaction.ticker, disposal_transaction.capacity)
  IF current_holding.totalQuantity < disposal_transaction.quantity:
    RAISE ERROR "Insufficient shares to sell"
  
  disposal_quantity_remaining = disposal_transaction.quantity
  disposal_proceeds_remaining = (disposal_transaction.quantity * disposal_transaction.priceGBP) 
                              - disposal_transaction.commissionGBP
  matched_acquisitions = []
  
  // Step 2: Apply Same-Day Rule (TCGA 1992 s.105)
  same_day_acquisitions = GET_ACQUISITIONS_ON_DATE(disposal_transaction.ticker, 
                                                     disposal_transaction.date)
  
  IF same_day_acquisitions exist AND disposal_quantity_remaining > 0:
    FOR EACH acquisition IN same_day_acquisitions (in chronological order):
      quantity_to_match = MIN(disposal_quantity_remaining, 
                              acquisition.quantity - acquisition.quantity_already_matched)
      IF quantity_to_match > 0:
        acquisition_cost = quantity_to_match * acquisition.costPerUnit
        APPEND to matched_acquisitions: {
          date: acquisition.date,
          quantity: quantity_to_match,
          costPerUnit: acquisition.costPerUnit,
          matchRule: 'SAME_DAY'
        }
        disposal_quantity_remaining -= quantity_to_match
        acquisition.quantity_already_matched += quantity_to_match
  
  // Step 3: Apply Bed & Breakfast Rule (TCGA 1992 s.106A)
  IF disposal_quantity_remaining > 0:
    // Look for acquisitions in the 30-day window AFTER disposal
    thirty_day_window_start = disposal_transaction.date + 1 day
    thirty_day_window_end = disposal_transaction.date + 30 days
    
    future_acquisitions = GET_ACQUISITIONS_IN_RANGE(disposal_transaction.ticker,
                                                     thirty_day_window_start,
                                                     thirty_day_window_end)
    
    FOR EACH acquisition IN future_acquisitions (in chronological order):
      quantity_to_match = MIN(disposal_quantity_remaining,
                              acquisition.quantity - acquisition.quantity_already_matched)
      IF quantity_to_match > 0:
        acquisition_cost = quantity_to_match * acquisition.costPerUnit
        APPEND to matched_acquisitions: {
          date: acquisition.date,
          quantity: quantity_to_match,
          costPerUnit: acquisition.costPerUnit,
          matchRule: 'BED_BREAKFAST'
        }
        disposal_quantity_remaining -= quantity_to_match
        acquisition.quantity_already_matched += quantity_to_match
  
  // Step 4: Apply Section 104 Pooling (TCGA 1992 s.104(3)(ii))
  IF disposal_quantity_remaining > 0:
    pool_cost_per_unit = current_holding.totalCost / current_holding.totalQuantity
    acquisition_cost = disposal_quantity_remaining * pool_cost_per_unit
    
    APPEND to matched_acquisitions: {
      date: 'POOL_AVERAGE',
      quantity: disposal_quantity_remaining,
      costPerUnit: pool_cost_per_unit,
      matchRule: 'SECTION_104'
    }
    
    // Update pool after disposal
    current_holding.totalCost -= acquisition_cost
    current_holding.totalQuantity -= disposal_quantity_remaining
  
  // Step 5: Calculate gain/loss
  total_cost = SUM(matched_acquisitions[i].quantity * matched_acquisitions[i].costPerUnit)
  gain_loss = disposal_proceeds_remaining - total_cost
  
  // Step 6: Record disposal
  disposal_record = {
    disposalDate: disposal_transaction.date,
    quantity: disposal_transaction.quantity,
    proceedsPerUnit: disposal_transaction.priceGBP,
    totalProceeds: disposal_proceeds_remaining,
    matchedAcquisitions: matched_acquisitions,
    gainLoss: gain_loss
  }
  
  RETURN disposal_record
```

---

## Section 104 Pooling

### Pool Initialization

On the first acquisition of an asset:
```
pool = {
  ticker: 'AAPL',
  isin: 'US0378331005',
  quantity: 0,
  totalAllowableCost: 0.0000,
  acquisitionRecords: []
}
```

### Pool State Updates

#### On Acquisition (Buy):
```
FUNCTION update_pool_on_buy(pool, buy_transaction):
  allowable_cost = (buy_transaction.quantity * buy_transaction.priceGBP) 
                 + buy_transaction.commissionGBP
  
  // Round to 4 decimal places (banker's rounding)
  allowable_cost = BANKER_ROUND(allowable_cost, 4)
  
  pool.quantity += buy_transaction.quantity
  pool.totalAllowableCost += allowable_cost
  
  APPEND to pool.acquisitionRecords: {
    date: buy_transaction.date,
    quantity: buy_transaction.quantity,
    costPerUnit: BANKER_ROUND(allowable_cost / buy_transaction.quantity, 4),
    totalCost: allowable_cost,
    sourceType: 'DIRECT_BUY'
  }
  
  pool.averageCostPerUnit = BANKER_ROUND(pool.totalAllowableCost / pool.quantity, 4)
  
  RETURN pool
```

#### On Disposal (Sell - Section 104 Portion):
```
FUNCTION update_pool_on_s104_disposal(pool, disposal_quantity):
  average_cost_per_unit = pool.totalAllowableCost / pool.quantity
  cost_of_disposal = BANKER_ROUND(disposal_quantity * average_cost_per_unit, 4)
  
  pool.quantity -= disposal_quantity
  pool.totalAllowableCost -= cost_of_disposal
  
  IF pool.quantity > 0:
    pool.averageCostPerUnit = BANKER_ROUND(pool.totalAllowableCost / pool.quantity, 4)
  ELSE:
    pool.averageCostPerUnit = 0
  
  RETURN cost_of_disposal (used to calculate gain/loss)
```

#### On Stock Split:
```
FUNCTION apply_stock_split_to_pool(pool, split_ratio):
  // Example: 2:1 split (ratio = 2) doubles shares, halves cost per share
  pool.quantity *= split_ratio
  pool.averageCostPerUnit = BANKER_ROUND(pool.averageCostPerUnit / split_ratio, 4)
  // Total cost (TAC) remains unchanged
  RETURN pool
```

### Pool Reconciliation (Audit Trail)

At any point, the following invariant must hold:
```
pool.totalAllowableCost == SUM(pool.acquisitionRecords[i].totalCost)
```

Verify this after every transaction. If not true, there is a bug in implementation.

---

## Implementation Validation Checklist

Use this checklist to validate your implementation against this specification.

### Data Ingestion Layer

- [ ] **Broker CSV Parsing**
  - [ ] Charles Schwab: Fee negation implemented
  - [ ] Trading 212: T-212 commission model (already netted) implemented
  - [ ] Morgan Stanley: Commission separation implemented
  - [ ] Sharesight: Override of pre-calculated gains implemented
  - [ ] Vanguard: Dividend vs. transaction type differentiation implemented
  - [ ] Freetrade: Zero-commission model implemented
  - [ ] Raw CSV: All 9 required columns parsed

- [ ] **Data Validation**
  - [ ] All dates are in valid format and not in future
  - [ ] All quantities are positive
  - [ ] All prices and commissions are non-negative
  - [ ] ISINs are 12 alphanumeric characters (if provided)
  - [ ] Ticker symbols are non-empty strings
  - [ ] Transaction types are from allowed enum

- [ ] **FX Conversion**
  - [ ] Non-GBP transactions are converted using transaction-date spot rates
  - [ ] FX rates are applied consistently (WMR or equivalent)
  - [ ] Converted amounts are stored to 4 decimal places

### Matching Algorithm

- [ ] **Same-Day Rule**
  - [ ] Acquisitions and disposals on same date are identified
  - [ ] FIFO chronological matching applied (earliest first)
  - [ ] Excess acquisitions flow to B&B/S104
  - [ ] Excess disposals flow to B&B/S104
  - [ ] Matched transactions record "SAME_DAY" source

- [ ] **Bed & Breakfast Rule**
  - [ ] Disposals are matched against acquisitions in [D+1, D+30] window
  - [ ] 30-day window is **forward-looking only** (not backward)
  - [ ] FIFO chronological matching applied
  - [ ] Window correctly handles month/year boundaries
  - [ ] Window correctly handles leap years
  - [ ] Matched transactions record "BED_BREAKFAST" source
  - [ ] Excess flows to S104

- [ ] **Section 104 Pooling**
  - [ ] Pool maintains TAC (total allowable cost) and quantity
  - [ ] Average cost recalculated after each transaction
  - [ ] Pool cost is rounded to 4 decimal places
  - [ ] Disposals reduce both pool quantity and TAC
  - [ ] Invariant: pool.TAC == sum(acquisitionRecords.totalCost) always holds
  - [ ] Empty pool (quantity = 0) is handled gracefully

- [ ] **Matching Rule Precedence**
  - [ ] Same-Day rule applied first (before B&B)
  - [ ] B&B rule applied second (before S104)
  - [ ] S104 applied as fallback
  - [ ] No transaction is "double-matched" (counted twice in different rules)
  - [ ] Audit trail records which rule was used for each disposal

### Corporate Actions

- [ ] **Stock Splits**
  - [ ] Split ratio applied correctly to holdings
  - [ ] Cost per share adjusted by inverse of split ratio
  - [ ] Total cost (TAC) remains unchanged
  - [ ] No tax event recorded
  - [ ] Matching records updated to reflect new quantity

- [ ] **Spin-offs**
  - [ ] Parent shares: cost basis unchanged
  - [ ] New company shares: recorded with zero cost basis
  - [ ] New asset created in portfolio
  - [ ] Quantity received per parent correctly applied
  - [ ] No tax event on spin-off date

- [ ] **Dividends**
  - [ ] Recorded separately from capital gains
  - [ ] If DRIP: recorded as income + separate buy transaction
  - [ ] No impact on Section 104 pool cost basis
  - [ ] Marked as income tax item (not CGT)

- [ ] **RSU Vesting**
  - [ ] Vesting date FMV used as allowable cost
  - [ ] Income tax on vesting recorded separately (informational)
  - [ ] Tax withholding shares recorded as same-day matched sell (zero gain/loss)
  - [ ] Net shares added to holdings with correct cost basis

- [ ] **ESPP**
  - [ ] Purchase price (with discount) used as allowable cost
  - [ ] Discount amount recorded as income tax item
  - [ ] Sale proceeds and cost basis calculated correctly

### Decimal Precision & Rounding

- [ ] **Internal Calculations**
  - [ ] All calculations use minimum 4 decimal places
  - [ ] Banker's rounding (round-to-nearest-even) applied at each step
  - [ ] No premature rounding to pence (£X.XX)
  - [ ] Rounding errors do not accumulate across transactions

- [ ] **HMRC Submission Output**
  - [ ] Final gains/losses rounded to 2 decimal places (pence)
  - [ ] Each line item rounded independently
  - [ ] Total tax liability rounded to nearest pound
  - [ ] Rounding direction never biases in taxpayer's favor on final submission

### Gain/Loss Calculation

- [ ] **Formula Correctness**
  - [ ] Gain/Loss = Disposal Proceeds - Allowable Cost Basis
  - [ ] Disposal proceeds = (quantity × price) - commission
  - [ ] Allowable cost determined by matching rule
  - [ ] All amounts in GBP
  - [ ] Decimal precision maintained throughout

- [ ] **Negative Gains (Losses)**
  - [ ] Losses are correctly identified and flagged
  - [ ] Losses can offset gains (within same tax year)
  - [ ] Losses can be carried forward (flagged for future years)
  - [ ] Loss values stored with correct sign (negative)

### Output & Reporting

- [ ] **Disposal Records**
  - [ ] Each disposal record includes:
    - Disposal date, quantity, proceeds, cost basis
    - Matched acquisition date(s) and quantity(ies)
    - Matching rule used (Same-Day/B&B/S104)
    - Calculated gain/loss
  - [ ] Disposal records are sortable by date
  - [ ] Disposal records can be filtered by holding

- [ ] **Portfolio Summary**
  - [ ] Total holdings by asset (ticker, quantity, current value)
  - [ ] Average cost per unit for each asset
  - [ ] Unrealized gains/losses (if price data available)
  - [ ] Total cost basis of portfolio

- [ ] **Tax Summary**
  - [ ] Total gains (before exemption)
  - [ ] Total losses
  - [ ] Net gain/loss
  - [ ] Annual exemption (£3,000 default; configurable)
  - [ ] Net taxable gain (after exemption)
  - [ ] Estimated tax at 20% basic rate
  - [ ] Estimated tax at 40% higher rate (if applicable)

- [ ] **Audit Trail**
  - [ ] All transactions listed chronologically
  - [ ] Matching decisions recorded
  - [ ] Source of each calculation (which rule applied)
  - [ ] Transaction-level notes (from input CSV)
  - [ ] Recalculation possible from raw data

### Edge Cases & Error Handling

- [ ] **Insufficient Shares**
  - [ ] Cannot sell more than held
  - [ ] Error raised with clear message
  - [ ] Transaction rejected; portfolio state unchanged

- [ ] **Invalid Dates**
  - [ ] Transactions with future dates rejected
  - [ ] Date format validation (ISO-8601)
  - [ ] Boundary conditions (last day of month, leap day, etc.)

- [ ] **Zero/Negative Values**
  - [ ] Zero quantity purchases rejected
  - [ ] Negative prices rejected
  - [ ] Negative commission (rebate) handled correctly if applicable

- [ ] **Empty Portfolio**
  - [ ] Sale of asset not in portfolio rejected
  - [ ] Selling from empty S104 pool prevented
  - [ ] Graceful error message

- [ ] **Matching Edge Cases**
  - [ ] Same-day buy/sell within 30 days of another sell: Same-Day matched first, excess flows to B&B
  - [ ] Multiple same-day transactions: all treated as simultaneous
  - [ ] Bed & Breakfast with fractional shares: decimal quantities handled correctly
  - [ ] Exact 30-day boundary (sell on Day D, buy on Day D+30): correctly matched
  - [ ] Month boundaries (e.g., Jan 31 → Feb 28/29): correctly calculated

- [ ] **Fractional Shares**
  - [ ] Post-split fractional shares stored with full precision (4 decimals)
  - [ ] Fractional share matching works correctly
  - [ ] Fractional RSU vesting handled
  - [ ] Rounding does not affect fractional quantity tracking

---

## Test Cases & Edge Cases

### Test Suite 1: Same-Day Rule

#### Test 1.1: Simple Same-Day Match
```
Input:
15 Jan 2025: Buy 100 AAPL @ £150.00, commission £10
15 Jan 2025: Sell 100 AAPL @ £160.00, commission £12

Expected Output:
- Matched: 100 shares
- Matching rule: SAME_DAY
- Disposal proceeds: (100 × £160.00) - £12 = £15,988.00
- Allowable cost: (100 × £150.00) + £10 = £15,010.00
- Gain: £978.00
- Section 104 pool: empty (all matched)
```

#### Test 1.2: Same-Day with Excess Disposals
```
Input:
15 Jan 2025: Buy 100 AAPL @ £150.00
15 Jan 2025: Sell 150 AAPL @ £160.00

Expected Output:
- Matched (same-day): 100 shares @ £150.00 cost, £160.00 proceeds → £1,000 gain
- Unmatched (to pool): 50 shares to dispose from pool
- Error: insufficient holdings (cannot sell 150 if only 100 bought same day)
```

#### Test 1.3: Multiple Acquisitions Same Day
```
Input:
15 Jan 2025: Buy 100 AAPL @ £150.00, commission £10
15 Jan 2025: Buy 50 AAPL @ £152.00, commission £5
15 Jan 2025: Sell 120 AAPL @ £160.00, commission £12

Expected Output:
- Matched (same-day):
  - First 100 @ £150.00: gain = (100 × £160.00) - (100 × £150.00 + £10 prorated)
  - Next 20 @ £152.00: gain = (20 × £160.00) - (20 × £152.00 + £5 prorated)
- Unmatched: 30 shares @ £152.00 to S104 pool
- FIFO applied (earliest buy matched first)
```

---

### Test Suite 2: Bed & Breakfast Rule

#### Test 2.1: Classic B&B (Disposal then Acquisition)
```
Input:
5 Jan 2025: Buy 1,000 AAPL @ £150.00 = £150,000 (added to S104)
10 Jan 2025: Sell 100 AAPL @ £140.00 = £14,000 (apparent £1,000 loss if using S104 cost)
15 Jan 2025: Buy 100 AAPL @ £145.00 = £14,500

Expected Output:
- Disposal on 10 Jan is matched to acquisition on 15 Jan (within 30 days)
- Not matched to S104 pool cost of £150.00
- Gain/Loss = £14,000 (proceeds) - £14,500 (matched cost) = -£500 loss (not -£1,000)
- S104 pool after:
  - Acquired 1,000 @ £150: TAC = £150,000, qty = 1,000
  - Acquired 100 @ £145: TAC = £14,500, qty = 100
  - Not reduced by 10 Jan sale (matched via B&B)
  - Total S104: TAC = £164,500, qty = 1,100
```

#### Test 2.2: B&B Exact 30-Day Boundary
```
Input:
5 Jan 2025: Sell 100 AAPL @ £150.00
4 Feb 2025: Buy 100 AAPL @ £145.00 (exactly 30 days later)

Expected Output:
- 30-day window: [6 Jan, 4 Feb]
- 4 Feb is within window (inclusive)
- Matched via B&B rule
```

#### Test 2.3: B&B Beyond 30-Day Window
```
Input:
5 Jan 2025: Sell 100 AAPL @ £150.00 (to S104)
6 Feb 2025: Buy 100 AAPL @ £145.00 (32 days later, beyond window)

Expected Output:
- 30-day window: [6 Jan, 4 Feb]
- 6 Feb is AFTER window
- Acquisition flows to S104 pool (not matched)
- Disposal uses S104 average cost
```

#### Test 2.4: Multiple Disposals, One Acquisition in B&B Window
```
Input:
5 Jan 2025: Buy 1,000 AAPL @ £150.00
10 Jan 2025: Sell 100 AAPL @ £140.00
12 Jan 2025: Sell 50 AAPL @ £145.00
20 Jan 2025: Buy 120 AAPL @ £148.00

Expected Output:
- B&B window for 10 Jan disposal: [11 Jan, 9 Feb] → includes 20 Jan buy
- B&B window for 12 Jan disposal: [13 Jan, 11 Feb] → includes 20 Jan buy
- 120 shares purchased on 20 Jan matched via FIFO:
  - First 100 shares matched to earliest disposal (10 Jan) @ £140 proceeds cost
  - Remaining 20 shares matched to next disposal (12 Jan) @ £145 proceeds cost
- S104 pool: 1,000 - 100 - 50 = 850 shares with adjusted TAC
```

---

### Test Suite 3: Section 104 Pooling

#### Test 3.1: Simple Pool Accumulation
```
Input:
1 Jan 2025: Buy 100 AAPL @ £150.00 = £15,000
15 Jan 2025: Buy 50 AAPL @ £155.00 = £7,750
1 Feb 2025: Sell 75 AAPL @ £160.00

Expected Output:
- Pool before sale: TAC = £22,750, qty = 150, avg = £151.6667
- Sale proceeds: (75 × £160.00) - commission = £12,000 (assuming no commission for this test)
- Cost basis: 75 × £151.6667 = £11,375.00
- Gain: £625.00
- Pool after: TAC = £11,375, qty = 75, avg = £151.6667 (same average)
```

#### Test 3.2: Pool Cost Basis Rounding
```
Input:
1 Jan: Buy 3 shares @ £10.00 = £30.00
15 Jan: Sell 1 share @ £12.00

Expected Output:
- Pool average: £30.00 / 3 = £10.0000 (exactly)
- Cost of 1 share: £10.0000
- Gain: £12.00 - £10.00 = £2.00
- Remaining pool: TAC = £20.00, qty = 2, avg = £10.0000
```

#### Test 3.3: Pool with Fractional Shares
```
Input:
1 Jan: Buy 100 shares @ £10.00 = £1,000.00
1 Feb: 2:1 stock split → 200 shares, cost per share = £5.00
15 Feb: Sell 150 shares @ £6.00

Expected Output:
- Pool before sale: qty = 200, TAC = £1,000.00, avg = £5.0000
- Sale proceeds: 150 × £6.00 = £900.00
- Cost basis: 150 × £5.00 = £750.00
- Gain: £150.00
- Remaining pool: qty = 50, TAC = £250.00, avg = £5.0000
```

---

### Test Suite 4: Corporate Actions

#### Test 4.1: Stock Split (2:1)
```
Input:
1 Jan 2025: Buy 100 AAPL @ £150.00 = £15,000
15 Mar 2025: 2:1 stock split
1 Apr 2025: Sell 150 AAPL @ £75.00

Expected Output:
- Post-split holdings: 200 AAPL
- Cost per share post-split: £75.00
- Total cost still: £15,000
- Cost basis for 150 shares sold: 150 × £75.00 = £11,250.00
- Proceeds: 150 × £75.00 = £11,250.00
- Gain: £0.00 (no change in value)
```

#### Test 4.2: Reverse Split (1:2)
```
Input:
1 Jan 2025: Buy 100 AAPL @ £150.00 = £15,000
15 Mar 2025: 1:2 reverse split (consolidate 2 shares into 1)
1 Apr 2025: Sell 40 AAPL @ £300.00

Expected Output:
- Post-split holdings: 50 AAPL
- Cost per share post-split: £300.00
- Total cost still: £15,000
- Cost basis for 40 shares: 40 × £300.00 = £12,000.00
- Proceeds: 40 × £300.00 = £12,000.00
- Gain: £0.00
```

#### Test 4.3: Dividend / DRIP
```
Input:
1 Jan 2025: Buy 100 AAPL @ £150.00 = £15,000
1 Mar 2025: Dividend of £1.25 per share × 100 = £125.00 (DRIP at price £160.00)

Expected Output:
- Holdings remain: 100 AAPL @ cost £15,000
- Dividend income recorded: £125.00 (not CGT)
- Reinvestment: £125.00 / £160.00 = 0.78125 shares purchased
- New holding: 100.78125 AAPL
- New cost: £15,000 + £125.00 = £15,125.00
- Recorded as two transactions:
  1. Dividend income: £125.00
  2. Buy: 0.78125 @ £160.00
```

#### Test 4.4: Spin-off (Parent + New Asset)
```
Input:
1 Jan 2025: Buy 1,000 Vodafone @ £2.00 = £2,000
15 Oct 2024: Vodafone spins off Vantage Towers (1 VDF → 5 VT)

Expected Output:
- Vodafone holdings: still 1,000 @ £2.00 cost = £2,000
- Vantage Towers holdings: new asset, 5,000 shares @ £0.00 cost
- When VT sold later: entire proceeds are gain (nil cost basis)
```

---

### Test Suite 5: Edge Cases - Complex Scenarios

#### Test 5.1: Leap Year Date (29 Feb) + B&B Boundary
```
Input:
29 Feb 2024: Sell 100 AAPL @ £150.00
30 Mar 2024: Buy 100 AAPL @ £145.00 (30 days later)

Expected Output:
- Leap year: 2024 has 29 Feb
- Days between 29 Feb and 30 Mar:
  - Feb: 29 (1 day remaining) 
  - Mar: 1-30 (30 days)
  - Total: 31 calendar days
- 30 Mar is Day +31, beyond 30-day B&B window
- Purchase flows to S104, not matched to 29 Feb disposal
```

#### Test 5.2: Year Boundary (31 Dec → 31 Jan)
```
Input:
31 Dec 2024: Sell 100 AAPL @ £150.00
31 Jan 2025: Buy 100 AAPL @ £145.00 (exactly 31 days later)

Expected Output:
- B&B window: [1 Jan 2025, 30 Jan 2025]
- 31 Jan is Day +32, beyond window
- Not matched via B&B
- Purchase to S104
```

#### Test 5.3: Fractional Share Acquisition + B&B Matching
```
Input:
1 Jan: Buy 100.5 AAPL @ £150.00 = £15,075.00
10 Jan: Sell 100.5 AAPL @ £155.00
15 Jan: Buy 50.75 AAPL @ £152.00

Expected Output:
- Disposal on 10 Jan matched to acquisition on 15 Jan via B&B
- Matched quantity: 50.75 shares
- Matched cost: 50.75 × £152.00 = £7,714.00
- Matched proceeds: 50.75 × £155.00 = £7,866.25
- Matched gain: £152.25
- Remaining disposed quantity: 49.75 shares unmatched (would error: insufficient holdings post-sale)
```

#### Test 5.4: Multiple Same-Day Rules + B&B Precedence
```
Input:
10 Jan: Buy 100 AAPL @ £150.00
10 Jan: Sell 100 AAPL @ £160.00
10 Jan: Buy 50 AAPL @ £145.00 (same day, chronologically after sale)
15 Jan: Sell 50 AAPL @ £155.00

First disposal (10 Jan):
- Matches to 100 AAPL acquired on 10 Jan (same-day, earliest first)
- Gain: 100 × (£160.00 - £150.00) = £1,000.00

Second acquisition (10 Jan):
- Recorded as buy (same-day after sale chronologically, but treated as simultaneous)

Second disposal (15 Jan):
- No same-day match (no 15 Jan acquisition)
- No B&B match (no acquisition in 30-day future window for 15 Jan... wait)

Actually, the 10 Jan buy of 50 is available:
- Disposal 10 Jan, Acquisition 10 Jan → same-day, already handled
- Disposal 15 Jan, no prior/same-day acquisition → B&B check [16 Jan, 14 Feb]
- No B&B match; flows to S104
- S104 pool: 50 AAPL @ £145.00 = £7,250.00
- Cost basis: 50 × £145.00 = £7,250.00
- Proceeds: 50 × £155.00 = £7,750.00
- Gain: £500.00
```

#### Test 5.5: Highly Complex: All Three Rules in One Scenario
```
Input:
1 Jan: Buy 200 AAPL @ £100 = £20,000 (S104 pool)
5 Jan: Buy 100 AAPL @ £105 = £10,500 (S104 pool)
10 Jan: Buy 50 AAPL @ £110 = £5,500
10 Jan: Sell 75 AAPL @ £115 = £8,625
15 Jan: Buy 60 AAPL @ £112 = £6,720
25 Jan: Buy 80 AAPL @ £111 = £8,880
31 Jan: Sell 120 AAPL @ £118 = £14,160

Portfolio state before 10 Jan sale:
S104 pool: 300 AAPL (200+100), TAC £30,500

10 Jan sale (Sell 75):
- Same-day buy: 50 AAPL @ £110
  - Matched: 50 AAPL @ £110 cost, £115 proceeds → Gain: 50 × £5 = £250
  - Unmatched: 25 shares
- Unmatched (25) flows to B&B check [11 Jan, 9 Feb]:
  - No B&B within this window yet
- Falls to S104:
  - S104 cost: 25 × (£30,500 / 300) = 25 × £101.6667 = £2,541.67
  - Proceeds: 25 × £115 = £2,875
  - Gain: £333.33
- Total 10 Jan disposal gain: £250 + £333.33 = £583.33
- S104 after 10 Jan: TAC = £30,500 - £2,541.67 = £27,958.33, qty = 275

15 Jan buy (Buy 60 @ £112):
- Adds to S104: TAC = £27,958.33 + £6,720 = £34,678.33, qty = 335

25 Jan buy (Buy 80 @ £111):
- Adds to S104: TAC = £34,678.33 + £8,880 = £43,558.33, qty = 415

31 Jan sale (Sell 120):
- Same-day: no acquisitions on 31 Jan
- B&B: 30-day window [1 Feb, 2 Mar] (future; no acquisitions yet)
- Falls to S104:
  - Average: £43,558.33 / 415 = £104.9606
  - Cost: 120 × £104.9606 = £12,595.27
  - Proceeds: 120 × £118 = £14,160
  - Gain: £1,564.73
- S104 after: TAC = £43,558.33 - £12,595.27 = £30,963.06, qty = 295

Total gains from all disposals:
- 10 Jan: £583.33
- 31 Jan: £1,564.73
- Total: £2,148.06
```

---

## Compliance Audit Trail

### Required Documentation for HMRC Compliance

Your calculator MUST generate an **auditable report** suitable for submission with Self-Assessment or if HMRC requests supporting documentation. This report must include:

#### 1. Transaction Register

**Format:** Chronological list of all transactions

```
Date,Transaction_ID,Type,Asset,Ticker,Quantity,Price_GBP,Commission_GBP,Total_GBP,Notes
2025-01-15,TXN001,BUY,Apple Inc.,AAPL,100.0000,150.0000,10.00,15010.00,Bought via Vanguard
2025-01-15,TXN002,BUY,Apple Inc.,AAPL,50.0000,152.0000,5.00,7605.00,Bought via Vanguard
2025-02-20,TXN003,SELL,Apple Inc.,AAPL,120.0000,160.0000,12.00,19188.00,Sold via Vanguard
2025-03-01,TXN004,DIVIDEND,Apple Inc.,AAPL,100.0000,1.2500,0.00,125.00,Q1 Dividend (DRIP)
2025-03-01,TXN005,BUY,Apple Inc.,AAPL,0.7812,160.0000,0.00,125.00,Dividend Reinvestment
```

#### 2. Disposal Report

**Format:** All disposal transactions with matching details and gain/loss calculations

```
Disposal_Date,Transaction_ID,Asset,Ticker,Quantity,Proceeds,Matched_Acquisitions,Matching_Rule,Acquisition_Date,Cost_Basis,Gain_Loss
2025-02-20,TXN003,Apple Inc.,AAPL,100.00,19188.00,"TXN001: 100@£150+commission allocation","SAME_DAY+S104",2025-01-15 [80] + Pool [20],15010.00 × (100/120) = 12507.50 + (20/120) × (£7605 + £5)/50 × 20 = 1950.83,1379.67
```

Actually, let me simplify this:

```
Disposal_Date,Qty,Proceeds,Allocation_Rule,Matched_to_Date,Matched_Cost,Gain_Loss
2025-02-20,100,19188.00,SAME_DAY → S104,2025-01-15 [80 qty] + POOL [20 qty],15010.00 × 0.80 + Pool_Avg × 0.20,calculated
```

#### 3. Section 104 Pool Status Report

**Format:** Pool state at key points

```
Report_Date,Asset,Ticker,Pool_Quantity,Pool_TAC,Average_Cost_Per_Unit,Cumulative_Acquisitions,Cumulative_Disposals
2025-01-15 EOD,Apple Inc.,AAPL,100.0000,15000.00,150.0000,100 qty,0 qty
2025-01-15 (after 2nd buy),Apple Inc.,AAPL,150.0000,22605.00,150.7000,150 qty,0 qty
2025-02-20 EOD,Apple Inc.,AAPL,30.0000,4520.00,150.6667,150 qty,120 qty
```

#### 4. Annual Tax Summary (SA Tax Year)

**Format:** Summary of all gains/losses for the tax year

```
Tax Year: 2025/26 (6 Apr 2025 - 5 Apr 2026)

Total Disposals: 5 transactions
Total Quantity Disposed: 350 shares
Total Proceeds: £55,443.20
Total Allowable Costs: £53,218.15
Total Chargeable Gains: £2,225.05
Total Allowable Losses: £0.00

Net Gain: £2,225.05
Less: Annual Exemption (£3,000): £3,000.00
Taxable Gain: £0.00

Estimated Tax Liability: £0.00

Note: No tax due (gain below exemption). Exemption carried forward: £774.95
```

#### 5. Validation Checksum

Include a checksum of all transactions for integrity verification:

```
Total Transaction Count: 42
Total Buy Quantity: 5,234.87 shares
Total Sell Quantity: 5,108.21 shares
Total Dividends: £1,247.50
Total Interest: £0.00
Total Commissions: £234.50

Calculated Portfolio Value (at latest known prices): £45,123.45
Portfolio Quantity: 126.66 shares
```

---

## Summary: Authoritative Rules for LLM Validator

### Absolute Non-Negotiables

1. **Matching rules MUST be applied in strict order:** Same-Day → B&B → S104. No exceptions.
2. **B&B window is 30 days forward ONLY:** Sales before purchases do not trigger B&B.
3. **Section 104 uses average cost:** Pool TAC / pool quantity. Recalculate after every transaction.
4. **All calculations in GBP:** Convert FX at spot rate on transaction date (WMR standard).
5. **Decimal precision: 4 places internally, 2 places on final output** (banker's rounding).
6. **Broker fees included in cost basis (acquisitions), subtracted from proceeds (sales).**
7. **Corporate actions (splits, dividends, spin-offs) have NO tax event** unless explicitly a disposal.
8. **RSU vesting and ESPP:** Vesting-date FMV is the cost basis for future capital gains.
9. **Losses can be carried forward** to future tax years (implementation depends on user's multi-year support).
10. **Conservative default:** When HMRC treatment is ambiguous, default to the higher tax liability position.

---

## End of Document

**Version:** 1.0 (January 2026)
**Next Review:** January 2027 (or when HMRC guidance updates)
**Compliance:** TCGA 1992, HMRC Capital Gains Manual sections 51550–51560, CG Manual CG17274