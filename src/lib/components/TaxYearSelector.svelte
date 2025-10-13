<script lang="ts">
  import { appState } from "../stores.svelte";

  // Derive available tax years from transactions
  let availableTaxYears = $derived(() => {
    if (appState.transactions.length === 0) return [];
    
    const years = new Set<number>();
    
    for (const txn of appState.transactions) {
      const date = txn.date;
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-indexed
      const day = date.getDate();
      
      // UK tax year: April 6 to April 5
      // If before April 6, transaction is in previous tax year
      if (month < 3 || (month === 3 && day < 6)) {
        years.add(year - 1);
      } else {
        years.add(year);
      }
    }
    
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  });

  function formatTaxYear(year: number): string {
    return `${year}/${(year + 1).toString().slice(-2)}`;
  }

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const year = parseInt(target.value, 10);
    appState.setTaxYear(year);
  }
</script>

{#if availableTaxYears().length > 0}
  <div class="tax-year-selector">
    <label for="tax-year" class="selector-label">Tax Year</label>
    <select 
      id="tax-year" 
      value={appState.taxYear}
      onchange={handleChange}
      aria-label="Select tax year for calculations"
    >
      {#each availableTaxYears() as year}
        <option value={year}>{formatTaxYear(year)}</option>
      {/each}
    </select>
  </div>
{/if}

<style>
  .tax-year-selector {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .selector-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: rgba(244, 241, 232, 0.8);
    text-transform: none;
    letter-spacing: normal;
    margin: 0;
  }

  select {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-md);
    color: var(--color-cream);
    font-family: var(--font-mono);
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    padding: 6px 12px;
    padding-right: 32px;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%23f4f1e8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    transition: 
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  select:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
  }

  select:focus {
    outline: none;
    border-color: var(--color-gold);
    box-shadow: 0 0 0 2px rgba(201, 169, 97, 0.3);
  }

  select:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  select option {
    background: var(--color-navy);
    color: var(--color-cream);
  }
</style>

