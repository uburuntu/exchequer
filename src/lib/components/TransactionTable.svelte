<script lang="ts">
  import { appState } from "../stores.svelte";

  // Pagination state
  let currentPage = $state(1);
  let pageSize = $state(25);

  // Sorting state - default to date ascending (oldest first)
  let sortColumn = $state<string>("date");
  let sortDirection = $state<"asc" | "desc">("asc");

  // Sorted and paginated transactions
  let sortedTransactions = $derived(() => {
    const txns = [...appState.transactions];
    
    txns.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case "date":
          comparison = a.date.getTime() - b.date.getTime();
          break;
        case "broker":
          comparison = (a.broker || "").localeCompare(b.broker || "");
          break;
        case "symbol":
          comparison = (a.symbol || "").localeCompare(b.symbol || "");
          break;
        case "action":
          comparison = a.action.localeCompare(b.action);
          break;
        case "quantity":
          const aQty = a.quantity?.toNumber() ?? 0;
          const bQty = b.quantity?.toNumber() ?? 0;
          comparison = aQty - bQty;
          break;
        case "amount":
          const aAmount = a.amount?.toNumber() ?? 0;
          const bAmount = b.amount?.toNumber() ?? 0;
          comparison = aAmount - bAmount;
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });
    
    return txns;
  });

  let totalPages = $derived(Math.ceil(sortedTransactions().length / pageSize));
  
  let paginatedTransactions = $derived(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTransactions().slice(start, start + pageSize);
  });

  // Reset to page 1 when transactions change
  $effect(() => {
    if (appState.transactions.length) {
      currentPage = 1;
    }
  });

  function handleSort(column: string) {
    if (sortColumn === column) {
      // Toggle direction
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      // New column - default to ascending
      sortColumn = column;
      sortDirection = "asc";
    }
    currentPage = 1;
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function formatNumber(value: any): string {
    if (!value) return "—";
    const num = parseFloat(value.toString());
    if (isNaN(num)) return "—";
    
    // Format with commas
    if (num % 1 !== 0) {
      return num.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    return num.toLocaleString("en-GB");
  }

  function formatCurrency(value: any, currency: string): string {
    if (!value) return "—";
    const num = parseFloat(value.toString());
    if (isNaN(num)) return "—";
    
    const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
    const absValue = Math.abs(num).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return num < 0 ? `-${symbol}${absValue}` : `${symbol}${absValue}`;
  }

  function getActionBadgeClass(action: string): string {
    switch (action) {
      case "BUY":
      case "STOCK_ACTIVITY":
        return "badge-buy";
      case "SELL":
        return "badge-sell";
      case "DIVIDEND":
        return "badge-dividend";
      case "INTEREST":
        return "badge-interest";
      default:
        return "badge-neutral";
    }
  }

  function goToPage(page: number) {
    currentPage = Math.max(1, Math.min(page, totalPages));
  }

  // Generate page numbers for pagination
  let pageNumbers = $derived(() => {
    const pages: (number | string)[] = [];
    const total = totalPages;
    const current = currentPage;
    
    if (total <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      // Always show first page
      pages.push(1);
      
      if (current > 3) pages.push("...");
      
      // Show pages around current
      for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
        pages.push(i);
      }
      
      if (current < total - 2) pages.push("...");
      
      // Always show last page
      pages.push(total);
    }
    
    return pages;
  });
</script>

<div class="transaction-table-container">
  {#if appState.transactions.length === 0}
    <div class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h3>No Transactions</h3>
      <p>Upload your broker CSV files to see transactions here.</p>
    </div>
  {:else}
    <!-- Table controls -->
    <div class="table-controls">
      <div class="results-count">
        Showing <span class="mono">{(currentPage - 1) * pageSize + 1}</span>–<span class="mono">{Math.min(currentPage * pageSize, sortedTransactions().length)}</span> of <span class="mono">{sortedTransactions().length}</span> transactions
      </div>
      <div class="page-size-selector">
        <label for="page-size">Per page:</label>
        <select id="page-size" bind:value={pageSize} onchange={() => currentPage = 1}>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
    </div>

    <!-- Table wrapper for horizontal scroll -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>
              <button type="button" class="sort-header" class:active={sortColumn === "date"} onclick={() => handleSort("date")}>
                Date
                <span class="sort-icon" aria-hidden="true">
                  {#if sortColumn === "date"}
                    {sortDirection === "asc" ? "↑" : "↓"}
                  {/if}
                </span>
              </button>
            </th>
            <th>
              <button type="button" class="sort-header" class:active={sortColumn === "broker"} onclick={() => handleSort("broker")}>
                Broker
                <span class="sort-icon" aria-hidden="true">
                  {#if sortColumn === "broker"}
                    {sortDirection === "asc" ? "↑" : "↓"}
                  {/if}
                </span>
              </button>
            </th>
            <th>
              <button type="button" class="sort-header" class:active={sortColumn === "symbol"} onclick={() => handleSort("symbol")}>
                Symbol
                <span class="sort-icon" aria-hidden="true">
                  {#if sortColumn === "symbol"}
                    {sortDirection === "asc" ? "↑" : "↓"}
                  {/if}
                </span>
              </button>
            </th>
            <th>
              <button type="button" class="sort-header" class:active={sortColumn === "action"} onclick={() => handleSort("action")}>
                Action
                <span class="sort-icon" aria-hidden="true">
                  {#if sortColumn === "action"}
                    {sortDirection === "asc" ? "↑" : "↓"}
                  {/if}
                </span>
              </button>
            </th>
            <th class="text-right">
              <button type="button" class="sort-header" class:active={sortColumn === "quantity"} onclick={() => handleSort("quantity")}>
                Quantity
                <span class="sort-icon" aria-hidden="true">
                  {#if sortColumn === "quantity"}
                    {sortDirection === "asc" ? "↑" : "↓"}
                  {/if}
                </span>
              </button>
            </th>
            <th class="text-right">Price</th>
            <th class="text-right">
              <button type="button" class="sort-header" class:active={sortColumn === "amount"} onclick={() => handleSort("amount")}>
                Amount
                <span class="sort-icon" aria-hidden="true">
                  {#if sortColumn === "amount"}
                    {sortDirection === "asc" ? "↑" : "↓"}
                  {/if}
                </span>
              </button>
            </th>
            <th>Currency</th>
          </tr>
        </thead>
        <tbody>
          {#each paginatedTransactions() as txn}
            <tr>
              <td class="date-cell">{formatDate(txn.date)}</td>
              <td class="broker-cell">{txn.broker || "—"}</td>
              <td class="symbol-cell">{txn.symbol || "—"}</td>
              <td>
                <span class="action-badge {getActionBadgeClass(txn.action)}">
                  {txn.action.replace("_", " ")}
                </span>
              </td>
              <td class="numeric mono">{formatNumber(txn.quantity)}</td>
              <td class="numeric mono">{formatCurrency(txn.price, txn.currency)}</td>
              <td class="numeric mono">{formatCurrency(txn.amount, txn.currency)}</td>
              <td class="currency-cell">{txn.currency}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <nav class="pagination" aria-label="Transaction pages">
        <button 
          class="page-btn" 
          disabled={currentPage === 1}
          onclick={() => goToPage(currentPage - 1)}
          aria-label="Previous page"
        >
          ←
        </button>
        
        {#each pageNumbers() as page}
          {#if page === "..."}
            <span class="page-ellipsis">…</span>
          {:else}
            <button 
              class="page-btn" 
              class:active={currentPage === page}
              onclick={() => goToPage(page as number)}
              aria-label="Page {page}"
              aria-current={currentPage === page ? "page" : undefined}
            >
              {page}
            </button>
          {/if}
        {/each}
        
        <button 
          class="page-btn" 
          disabled={currentPage === totalPages}
          onclick={() => goToPage(currentPage + 1)}
          aria-label="Next page"
        >
          →
        </button>
      </nav>
    {/if}
  {/if}
</div>

<style>
  .transaction-table-container {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    overflow: hidden;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-gray-600);
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-2);
    color: var(--color-gray-400);
  }

  .empty-state h3 {
    font-family: var(--font-body);
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: var(--color-navy);
    margin: 0 0 var(--space-1) 0;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--text-sm);
  }

  /* Table controls */
  .table-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--color-cream);
    border-bottom: 1px solid var(--color-gray-200);
  }

  .results-count {
    font-size: var(--text-sm);
    color: var(--color-gray-700);
  }

  .mono {
    font-family: var(--font-mono);
    font-weight: var(--font-medium);
  }

  .page-size-selector {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .page-size-selector label {
    font-size: var(--text-sm);
    color: var(--color-gray-600);
    margin: 0;
    text-transform: none;
    letter-spacing: normal;
  }

  .page-size-selector select {
    padding: 4px 8px;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    background: var(--color-white);
  }

  /* Table */
  .table-wrapper {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    min-width: 700px;
  }

  th {
    text-align: left;
    padding: 0;
    background: var(--color-gray-50);
    border-bottom: 2px solid var(--color-gray-200);
  }

  .sort-header {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: var(--space-2);
    background: transparent;
    border: none;
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-gray-600);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .sort-header:hover {
    color: var(--color-navy);
  }

  .sort-header.active {
    color: var(--color-burgundy);
  }

  .sort-header:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: -2px;
  }

  .sort-icon {
    font-size: 10px;
    opacity: 0.7;
  }

  th.text-right .sort-header {
    justify-content: flex-end;
  }

  td {
    padding: var(--space-2) var(--space-2);
    border-bottom: 1px solid var(--color-gray-100);
    color: var(--color-navy);
    vertical-align: middle;
  }

  /* Alternating row colors for visual rhythm */
  tbody tr:nth-child(even) td {
    background: rgba(250, 248, 244, 0.5);
  }

  tr:hover td {
    background: var(--color-gray-100);
  }

  .date-cell {
    white-space: nowrap;
  }

  .broker-cell {
    text-transform: capitalize;
    color: var(--color-gray-700);
  }

  .symbol-cell {
    font-weight: var(--font-semibold);
    color: var(--color-burgundy);
  }

  .numeric {
    text-align: right;
    white-space: nowrap;
  }

  .currency-cell {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-gray-500);
  }

  /* Action badges - filled style with icons */
  .action-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.02em;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  .badge-buy {
    background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
    color: #2e7d32;
  }

  .badge-sell {
    background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
    color: #c62828;
  }

  .badge-dividend {
    background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
    color: #f57f17;
  }

  .badge-interest {
    background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
    color: #1565c0;
  }

  .badge-neutral {
    background: linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%);
    color: var(--color-gray-700);
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4px;
    padding: var(--space-3);
    border-top: 1px solid var(--color-gray-200);
  }

  .page-btn {
    min-width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--space-1);
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-md);
    background: var(--color-white);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-gray-700);
    cursor: pointer;
    transition: 
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }

  .page-btn:hover:not(:disabled) {
    background: var(--color-gray-50);
    border-color: var(--color-gray-400);
  }

  .page-btn.active {
    background: var(--color-burgundy);
    border-color: var(--color-burgundy);
    color: var(--color-cream);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-btn:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .page-ellipsis {
    padding: 0 var(--space-1);
    color: var(--color-gray-500);
  }
</style>

