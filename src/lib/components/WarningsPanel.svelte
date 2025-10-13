<script lang="ts">
  import { appState } from "../stores.svelte";
  import { WarningSeverity, WarningCategory, type CalculationWarning } from "../calculator/types";

  let warnings = $derived(appState.report?.warnings || []);
  let hasWarnings = $derived(warnings.length > 0);

  // Group warnings by severity
  let errorWarnings = $derived(
    warnings.filter((w: CalculationWarning) => w.severity === WarningSeverity.ERROR)
  );
  let warnWarnings = $derived(
    warnings.filter((w: CalculationWarning) => w.severity === WarningSeverity.WARNING)
  );
  let infoWarnings = $derived(
    warnings.filter((w: CalculationWarning) => w.severity === WarningSeverity.INFO)
  );

  // Collapsible state
  let isExpanded = $state(true);

  function formatDate(date: Date | null): string {
    if (!date) return "";
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function getCategoryLabel(category: WarningCategory): string {
    switch (category) {
      case WarningCategory.MISSING_DATA:
        return "Missing Data";
      case WarningCategory.DATA_QUALITY:
        return "Data Quality";
      case WarningCategory.MATCHING:
        return "Matching Issue";
      case WarningCategory.POSITION:
        return "Position Issue";
      case WarningCategory.OPEN_POSITION:
        return "Open Position";
      default:
        return "Warning";
    }
  }

  function getSeverityIcon(severity: WarningSeverity): string {
    switch (severity) {
      case WarningSeverity.ERROR:
        return "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z";
      case WarningSeverity.WARNING:
        return "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z";
      case WarningSeverity.INFO:
        return "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
      default:
        return "";
    }
  }
</script>

{#if hasWarnings}
  <div class="warnings-panel" role="region" aria-label="Calculation warnings">
    <button
      class="panel-header"
      onclick={() => (isExpanded = !isExpanded)}
      aria-expanded={isExpanded}
    >
      <div class="header-content">
        <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path d={getSeverityIcon(errorWarnings.length > 0 ? WarningSeverity.ERROR : WarningSeverity.WARNING)} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="header-title">
          {warnings.length} Calculation {warnings.length === 1 ? "Warning" : "Warnings"}
        </span>
        {#if errorWarnings.length > 0}
          <span class="badge badge-error">{errorWarnings.length} Error{errorWarnings.length > 1 ? "s" : ""}</span>
        {/if}
        {#if warnWarnings.length > 0}
          <span class="badge badge-warn">{warnWarnings.length} Warning{warnWarnings.length > 1 ? "s" : ""}</span>
        {/if}
        {#if infoWarnings.length > 0}
          <span class="badge badge-info">{infoWarnings.length} Info</span>
        {/if}
      </div>
      <svg
        class="chevron"
        class:rotated={isExpanded}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path d="M19 9l-7 7-7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    {#if isExpanded}
      <div class="warnings-list">
        {#each warnings as warning}
          <div class="warning-item severity-{warning.severity.toLowerCase()}">
            <div class="warning-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d={getSeverityIcon(warning.severity)} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="warning-content">
              <div class="warning-header">
                <span class="category-badge">{getCategoryLabel(warning.category)}</span>
                {#if warning.symbol}
                  <span class="symbol-badge">{warning.symbol}</span>
                {/if}
                {#if warning.date}
                  <span class="date-badge">{formatDate(warning.date)}</span>
                {/if}
              </div>
              <p class="warning-message">{warning.message}</p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .warnings-panel {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    overflow: hidden;
    margin-bottom: var(--space-4);
    border-left: 4px solid var(--color-warning, #f59e0b);
  }

  .panel-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }

  .panel-header:hover {
    background: var(--color-gray-50);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .header-icon {
    width: 20px;
    height: 20px;
    color: var(--color-warning, #f59e0b);
    flex-shrink: 0;
  }

  .header-title {
    font-weight: var(--font-semibold);
    color: var(--color-navy);
    font-size: var(--text-sm);
  }

  .badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-weight: var(--font-medium);
  }

  .badge-error {
    background: var(--color-loss-bg);
    color: var(--color-loss);
  }

  .badge-warn {
    background: #fef3c7;
    color: #92400e;
  }

  .badge-info {
    background: #dbeafe;
    color: #1e40af;
  }

  .chevron {
    width: 20px;
    height: 20px;
    color: var(--color-gray-500);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .chevron.rotated {
    transform: rotate(180deg);
  }

  .warnings-list {
    border-top: 1px solid var(--color-gray-200);
    padding: var(--space-2);
  }

  .warning-item {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-1);
  }

  .warning-item:last-child {
    margin-bottom: 0;
  }

  .warning-item.severity-error {
    background: var(--color-loss-bg);
  }

  .warning-item.severity-warning {
    background: #fffbeb;
  }

  .warning-item.severity-info {
    background: #eff6ff;
  }

  .warning-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }

  .severity-error .warning-icon {
    color: var(--color-loss);
  }

  .severity-warning .warning-icon {
    color: #d97706;
  }

  .severity-info .warning-icon {
    color: #2563eb;
  }

  .warning-content {
    flex: 1;
    min-width: 0;
  }

  .warning-header {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    margin-bottom: 4px;
  }

  .category-badge,
  .symbol-badge,
  .date-badge {
    font-size: var(--text-xs);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-weight: var(--font-medium);
  }

  .category-badge {
    background: var(--color-gray-200);
    color: var(--color-gray-700);
  }

  .symbol-badge {
    background: var(--color-navy);
    color: var(--color-white);
    font-family: var(--font-mono);
  }

  .date-badge {
    background: var(--color-gray-100);
    color: var(--color-gray-600);
  }

  .warning-message {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-gray-700);
    line-height: 1.5;
  }
</style>
