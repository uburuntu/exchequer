<script lang="ts">
  import { appState } from "../stores.svelte";
  import Tooltip from "./Tooltip.svelte";
  import Decimal from "decimal.js-light";

  let taxYearRange = $derived(
    `${appState.report?.taxYear}/${appState.report ? appState.report.taxYear + 1 : ""}`,
  );
  let gains = $derived(appState.report?.capitalGain || new Decimal(0));
  let losses = $derived(appState.report?.capitalLoss || new Decimal(0));
  let netGain = $derived(
    appState.report
      ? appState.report.capitalGain.plus(appState.report.capitalLoss)
      : null,
  );
  let allowance = $derived(appState.report?.allowance || new Decimal(0));

  let taxableAmount = $derived.by(() => {
    if (!netGain || !appState.report) return null;
    const diff = netGain.minus(appState.report.allowance);
    return diff.isPositive() ? diff : new Decimal(0);
  });

  function formatCurrency(value: Decimal | null): string {
    if (!value) return "£0.00";
    return `£${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
</script>

<div class="summary-card" role="region" aria-label="Capital gains tax summary">
  {#if appState.isProcessing}
    <div class="empty-state">
      <div class="spinner" aria-hidden="true"></div>
      <h3>Calculating...</h3>
      <p>Processing your transactions and applying HMRC rules.</p>
    </div>
  {:else if appState.error}
    <div class="empty-state error-state" role="alert">
      <svg class="empty-icon error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h3>Calculation Error</h3>
      <p class="error-message">{appState.error}</p>
    </div>
  {:else if !appState.report}
    <div class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h3>No Report Generated</h3>
      <p>Upload your transaction files to see your tax summary.</p>
    </div>
  {:else}
    <header class="card-header">
      <div>
        <span class="badge badge-neutral">UK HMRC Rules</span>
        <h2>Tax Year {taxYearRange}</h2>
      </div>
    </header>

    <div class="stats-grid" role="list" aria-label="Tax calculations">
      <div class="stat-item" role="listitem">
        <span class="stat-label">
          <Tooltip title="Capital Gains">
            {#snippet children()}Total Capital Gains{/snippet}
            {#snippet content()}
              <p>The sum of all <strong>profits</strong> from disposing of assets where the sale price exceeded your cost basis.</p>
              <p>Calculated after applying HMRC matching rules (Same-Day, Bed & Breakfast, Section 104).</p>
            {/snippet}
          </Tooltip>
        </span>
        <span class="stat-value text-gain mono">{formatCurrency(gains)}</span>
      </div>
      <div class="stat-item" role="listitem">
        <span class="stat-label">
          <Tooltip title="Capital Losses">
            {#snippet children()}Total Capital Losses{/snippet}
            {#snippet content()}
              <p>The sum of all <strong>losses</strong> from disposing of assets where the sale price was below your cost basis.</p>
              <p>Losses can offset gains in the same tax year, reducing your tax liability.</p>
            {/snippet}
          </Tooltip>
        </span>
        <span class="stat-value text-loss mono">{formatCurrency(losses)}</span>
      </div>
      <div class="stat-item highlight" role="listitem">
        <span class="stat-label">
          <Tooltip title="Net Gain/Loss">
            {#snippet children()}Net Gain/Loss{/snippet}
            {#snippet content()}
              <p>Your total gains minus total losses.</p>
              <p>This is the amount compared against your annual allowance to determine if tax is due.</p>
            {/snippet}
          </Tooltip>
        </span>
        <span
          class="stat-value mono"
          class:text-gain={netGain?.isPositive()}
          class:text-loss={netGain?.isNegative()}
        >
          {formatCurrency(netGain)}
        </span>
      </div>
      <div class="stat-item" role="listitem">
        <span class="stat-label">
          <Tooltip title="Annual Exempt Amount">
            {#snippet children()}Annual Allowance{/snippet}
            {#snippet content()}
              <p>The <strong>tax-free threshold</strong> for capital gains each tax year.</p>
              <p>For 2024/25 onwards, this is <strong>£3,000</strong> (reduced from £6,000 in 2023/24).</p>
              <p>You only pay CGT on gains above this amount.</p>
              <span class="hmrc-ref">HMRC: Capital Gains Tax rates and allowances</span>
            {/snippet}
          </Tooltip>
        </span>
        <span class="stat-value mono">{formatCurrency(allowance)}</span>
      </div>
    </div>

    {#if taxableAmount && !taxableAmount.isZero()}
      <div class="tax-alert tax-due" role="alert">
        <div class="alert-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div class="alert-content">
          <strong>Tax may be due</strong>
          <p>
            Estimated taxable gain: <span class="mono">{formatCurrency(taxableAmount)}</span>
            <br />
            <span class="alert-note">This amount exceeds your annual allowance.</span>
          </p>
        </div>
      </div>
    {:else if netGain}
      <div class="tax-alert tax-clear" role="status">
        <div class="alert-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div class="alert-content">
          <strong>Within allowance</strong>
          <p>Your net gains are within the annual allowance. No tax liability estimated.</p>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .summary-card {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-lg);
    border-top: 6px solid var(--color-burgundy);
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: var(--space-4);
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

  /* Spinner */
  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto var(--space-2);
    border: 3px solid var(--color-gray-200);
    border-top-color: var(--color-burgundy);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Error State */
  .error-state {
    color: var(--color-loss);
  }

  .error-icon {
    color: var(--color-loss);
  }

  .error-message {
    color: var(--color-gray-700);
    word-break: break-word;
  }

  /* Header */
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-4);
  }

  .badge {
    display: inline-block;
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    margin-bottom: var(--space-1);
  }

  .badge-neutral {
    background: var(--color-cream);
    color: var(--color-gray-700);
  }

  h2 {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    margin: 0;
    color: var(--color-navy);
    font-weight: var(--font-semibold);
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: var(--color-gray-50);
  }

  .stat-item.highlight {
    background: rgba(201, 169, 97, 0.08);
    border: 2px dashed var(--color-gold);
  }

  .stat-label {
    font-size: var(--text-xs);
    color: var(--color-gray-600);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-weight: var(--font-medium);
  }

  .stat-value {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    color: var(--color-navy);
  }

  .mono {
    font-family: var(--font-mono);
  }

  .text-gain { color: var(--color-gain); }
  .text-loss { color: var(--color-loss); }

  /* Tax Alerts */
  .tax-alert {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-md);
  }

  .tax-alert.tax-due {
    background: var(--color-loss-bg);
  }

  .tax-alert.tax-clear {
    background: var(--color-gain-bg);
  }

  .alert-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
  }

  .tax-due .alert-icon { color: var(--color-loss); }
  .tax-clear .alert-icon { color: var(--color-gain); }

  .alert-content {
    font-size: var(--text-sm);
  }

  .alert-content strong {
    display: block;
    color: var(--color-navy);
    margin-bottom: 4px;
  }

  .alert-content p {
    margin: 0;
    color: var(--color-gray-700);
    line-height: 1.5;
  }

  .alert-note {
    font-size: var(--text-xs);
    color: var(--color-gray-600);
  }
</style>
