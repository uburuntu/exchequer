<script lang="ts">
  import { appState } from '../stores.svelte';

  // Computed property for portfolio entries
  let portfolioEntries = $derived(
    appState.report?.portfolio 
      ? Array.from(appState.report.portfolio.entries())
          .filter(([_, position]) => !position.quantity.isZero())
          .sort((a, b) => a[0].localeCompare(b[0]))
      : []
  );

  function formatCurrency(value: any): string {
    const num = value.toFixed(2);
    return `£${num.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }

  function formatQuantity(value: any): string {
    const num = parseFloat(value.toString());
    // Show more decimals for fractional shares
    if (num % 1 !== 0) {
      return value.toFixed(4);
    }
    return value.toFixed(0);
  }
</script>

<div class="portfolio-card" role="region" aria-label="Current portfolio holdings">
  <header class="card-header">
    <h2>Current Portfolio Holdings</h2>
    {#if portfolioEntries.length > 0}
      <span class="count-badge">{portfolioEntries.length} positions</span>
    {/if}
  </header>
  
  {#if !appState.report}
    <p class="empty-state">No calculation data available. Upload transactions to view portfolio.</p>
  {:else if portfolioEntries.length === 0}
    <p class="empty-state">All positions have been closed.</p>
  {:else}
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col" class="text-right">Quantity</th>
            <th scope="col" class="text-right">Cost Basis</th>
            <th scope="col" class="text-right">Avg Cost</th>
          </tr>
        </thead>
        <tbody>
          {#each portfolioEntries as [symbol, position]}
            <tr>
              <td class="symbol-cell">
                <span class="symbol">{symbol}</span>
              </td>
              <td class="numeric mono">{formatQuantity(position.quantity)}</td>
              <td class="numeric mono">{formatCurrency(position.amount)}</td>
              <td class="numeric mono">
                {#if !position.quantity.isZero()}
                  {formatCurrency(position.amount.div(position.quantity))}
                {:else}
                  —
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .portfolio-card {
    background: var(--color-white);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }

  h2 {
    font-family: var(--font-display);
    color: var(--color-navy);
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .count-badge {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-gray-600);
    background: var(--color-cream);
    padding: 4px 10px;
    border-radius: var(--radius-full);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .table-wrapper {
    overflow-x: auto;
    margin: 0 calc(-1 * var(--space-3));
    padding: 0 var(--space-3);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    min-width: 400px;
  }

  th {
    text-align: left;
    padding: var(--space-1) var(--space-2);
    background: var(--color-cream);
    color: var(--color-gray-700);
    font-weight: var(--font-semibold);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }

  th:first-child {
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  }

  th:last-child {
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  td {
    padding: var(--space-2);
    border-bottom: 1px solid var(--color-gray-200);
    color: var(--color-navy);
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover td {
    background: var(--color-gray-50);
  }

  .symbol-cell {
    font-weight: var(--font-semibold);
  }

  .symbol {
    color: var(--color-burgundy);
  }

  .numeric {
    text-align: right;
    white-space: nowrap;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .text-right {
    text-align: right;
  }

  .empty-state {
    color: var(--color-gray-600);
    font-size: var(--text-sm);
    text-align: center;
    padding: var(--space-4);
    background: var(--color-gray-50);
    border-radius: var(--radius-md);
    margin: 0;
  }
</style>
