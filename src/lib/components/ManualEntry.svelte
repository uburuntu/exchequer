<script lang="ts">
  import { appState } from "../stores.svelte";
  import type { BrokerTransaction } from "../types";
  import { ActionType } from "../types";
  import Decimal from "decimal.js-light";

  let date = $state(new Date().toISOString().split("T")[0]!);
  let symbol = $state("");
  let action = $state<ActionType>(ActionType.BUY);
  let quantity = $state("");
  let price = $state("");
  let fees = $state("");
  let currency = $state("USD");

  // Inline validation state
  let touched = $state({
    symbol: false,
    quantity: false,
    price: false
  });

  // Validation helpers
  function validateSymbol(value: string): string | null {
    if (!value.trim()) return "Symbol is required";
    if (!/^[A-Za-z0-9.]+$/.test(value)) return "Invalid symbol format";
    return null;
  }

  function validateNumber(value: string, fieldName: string, required: boolean = true): string | null {
    if (!value.trim()) {
      return required ? `${fieldName} is required` : null;
    }
    const num = parseFloat(value);
    if (isNaN(num)) return `${fieldName} must be a number`;
    if (num < 0) return `${fieldName} cannot be negative`;
    if (required && num === 0) return `${fieldName} must be greater than 0`;
    return null;
  }

  // Derived validation errors
  let symbolError = $derived(touched.symbol ? validateSymbol(symbol) : null);
  let quantityError = $derived(touched.quantity ? validateNumber(quantity, "Quantity") : null);
  let priceError = $derived(touched.price ? validateNumber(price, "Price") : null);
  let isValid = $derived(
    !validateSymbol(symbol) && 
    !validateNumber(quantity, "Quantity") && 
    !validateNumber(price, "Price")
  );

  function handleBlur(field: 'symbol' | 'quantity' | 'price') {
    touched[field] = true;
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    
    // Touch all fields to show validation
    touched = { symbol: true, quantity: true, price: true };
    
    if (!isValid) return;

    const feesValue = fees.trim() ? new Decimal(fees) : new Decimal(0);
    const quantityValue = new Decimal(quantity);
    const priceValue = new Decimal(price);

    const transaction: BrokerTransaction = {
      broker: "manual",
      symbol: symbol.toUpperCase().trim(),
      description: "",
      date: new Date(date),
      action: action,
      quantity: quantityValue,
      price: priceValue,
      fees: feesValue,
      currency: currency,
      amount: quantityValue.times(priceValue).plus(feesValue),
    };

    appState.addTransactions([transaction]);

    // Reset form
    symbol = "";
    quantity = "";
    price = "";
    fees = "";
    touched = { symbol: false, quantity: false, price: false };
  }
</script>

<div class="manual-entry-card">
  <h3>Manual Transaction Entry</h3>

  <form onsubmit={handleSubmit} novalidate>
    <div class="form-row">
      <div class="field">
        <label for="date">Date</label>
        <input type="date" id="date" bind:value={date} required />
      </div>
      <div class="field" class:has-error={symbolError}>
        <label for="symbol">Symbol</label>
        <input
          type="text"
          id="symbol"
          bind:value={symbol}
          onblur={() => handleBlur('symbol')}
          placeholder="e.g. AAPL"
          aria-describedby={symbolError ? "symbol-error" : undefined}
          aria-invalid={symbolError ? "true" : undefined}
          required
        />
        {#if symbolError}
          <span id="symbol-error" class="field-error" role="alert">{symbolError}</span>
        {/if}
      </div>
    </div>

    <div class="form-row">
      <div class="field">
        <label for="action">Action</label>
        <select id="action" bind:value={action}>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
          <option value="DIVIDEND">Dividend</option>
          <option value="INTEREST">Interest</option>
        </select>
      </div>
      <div class="field">
        <label for="currency">Currency</label>
        <select id="currency" bind:value={currency}>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
          <option value="EUR">EUR</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="field" class:has-error={quantityError}>
        <label for="quantity">Quantity</label>
        <input
          type="text"
          inputmode="decimal"
          id="quantity"
          bind:value={quantity}
          onblur={() => handleBlur('quantity')}
          placeholder="0"
          aria-describedby={quantityError ? "quantity-error" : undefined}
          aria-invalid={quantityError ? "true" : undefined}
          required
        />
        {#if quantityError}
          <span id="quantity-error" class="field-error" role="alert">{quantityError}</span>
        {/if}
      </div>
      <div class="field" class:has-error={priceError}>
        <label for="price">Price per share</label>
        <input
          type="text"
          inputmode="decimal"
          id="price"
          bind:value={price}
          onblur={() => handleBlur('price')}
          placeholder="0.00"
          aria-describedby={priceError ? "price-error" : undefined}
          aria-invalid={priceError ? "true" : undefined}
          required
        />
        {#if priceError}
          <span id="price-error" class="field-error" role="alert">{priceError}</span>
        {/if}
      </div>
      <div class="field">
        <label for="fees">Fees <span class="optional">(optional)</span></label>
        <input
          type="text"
          inputmode="decimal"
          id="fees"
          bind:value={fees}
          placeholder="0.00"
        />
      </div>
    </div>

    <button type="submit" class="submit-btn">
      Add Transaction
    </button>
  </form>
</div>

<style>
  .manual-entry-card {
    background: var(--color-white);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: 2px solid var(--color-cream-dark);
    box-shadow: var(--shadow-sm);
  }

  h3 {
    margin: 0 0 var(--space-3) 0;
    color: var(--color-navy);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .field {
    flex: 1;
    min-width: 120px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-size: var(--text-xs);
    color: var(--color-gray-700);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .optional {
    font-weight: var(--font-normal);
    text-transform: none;
    color: var(--color-gray-500);
  }

  input,
  select {
    padding: var(--space-1);
    border: 2px solid var(--color-gray-300);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--color-navy);
    background: var(--color-white);
    transition: border-color var(--transition-fast);
  }

  input:hover,
  select:hover {
    border-color: var(--color-gray-500);
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: var(--color-gold);
    box-shadow: 0 0 0 3px rgba(201, 169, 97, 0.2);
  }

  input:focus-visible,
  select:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }

  /* Error states */
  .field.has-error input {
    border-color: var(--color-loss);
  }

  .field.has-error input:focus {
    box-shadow: 0 0 0 3px rgba(198, 40, 40, 0.15);
  }

  .field-error {
    font-size: var(--text-xs);
    color: var(--color-loss);
    font-weight: var(--font-medium);
  }

  /* Number inputs - use mono font */
  input[inputmode="decimal"] {
    font-family: var(--font-mono);
  }

  .submit-btn {
    background: var(--color-navy);
    color: var(--color-cream);
    border: 2px solid var(--color-navy);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    cursor: pointer;
    margin-top: var(--space-1);
    transition: 
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .submit-btn:hover {
    background: var(--color-burgundy);
    border-color: var(--color-burgundy);
  }

  .submit-btn:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }

  .submit-btn:active {
    transform: translateY(1px);
  }
</style>
