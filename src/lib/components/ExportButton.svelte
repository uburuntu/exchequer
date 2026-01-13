<script lang="ts">
  import { appState } from "../stores.svelte";
  import {
    exportCGTReportToCSV,
    exportDisposalsToCSV,
    exportCGTReportToPDF,
    exportDisposalsToPDF,
    toSummarizedReport
  } from "../export";

  let isOpen = $state(false);
  let exportType = $state<'full' | 'disposals'>('full');
  let exportFormat = $state<'csv' | 'pdf'>('pdf');

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function closeDropdown() {
    isOpen = false;
  }

  function handleExport() {
    const rawReport = appState.report;
    if (!rawReport) {
      console.error('No report available to export');
      return;
    }

    const report = toSummarizedReport(rawReport);

    if (exportFormat === 'csv') {
      if (exportType === 'full') {
        exportCGTReportToCSV(report);
      } else {
        exportDisposalsToCSV(report);
      }
    } else {
      if (exportType === 'full') {
        exportCGTReportToPDF(report);
      } else {
        exportDisposalsToPDF(report);
      }
    }

    closeDropdown();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeDropdown();
    }
  }

  // Check if report is available
  let hasReport = $derived(appState.report !== null);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="export-container">
  <button
    class="export-button"
    onclick={toggleDropdown}
    disabled={!hasReport}
    aria-haspopup="true"
    aria-expanded={isOpen}
    aria-label="Export report"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    Export
  </button>

  {#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="dropdown-backdrop" onclick={closeDropdown}></div>

    <div class="dropdown-menu" role="menu">
      <div class="dropdown-section">
        <span class="dropdown-label">Content</span>
        <label class="radio-option">
          <input
            type="radio"
            name="export-type"
            value="full"
            bind:group={exportType}
          />
          <span class="option-text">Full Report</span>
        </label>
        <label class="radio-option">
          <input
            type="radio"
            name="export-type"
            value="disposals"
            bind:group={exportType}
          />
          <span class="option-text">Disposals Only (SA108)</span>
        </label>
      </div>

      <div class="dropdown-divider"></div>

      <div class="dropdown-section">
        <span class="dropdown-label">Format</span>
        <label class="radio-option">
          <input
            type="radio"
            name="export-format"
            value="pdf"
            bind:group={exportFormat}
          />
          <span class="option-text">PDF</span>
        </label>
        <label class="radio-option">
          <input
            type="radio"
            name="export-format"
            value="csv"
            bind:group={exportFormat}
          />
          <span class="option-text">CSV</span>
        </label>
      </div>

      <div class="dropdown-divider"></div>

      <button class="download-button" onclick={handleExport}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download {exportFormat.toUpperCase()}
      </button>
    </div>
  {/if}
</div>

<style>
  .export-container {
    position: relative;
    display: inline-block;
  }

  .export-button {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-md);
    color: var(--color-cream);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    padding: 6px 12px;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .export-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .export-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .export-button:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: var(--space-1);
    background: var(--color-navy);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    min-width: 220px;
    z-index: 20;
    padding: var(--space-2);
  }

  .dropdown-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .dropdown-label {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: rgba(244, 241, 232, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    cursor: pointer;
    padding: 4px 0;
  }

  .radio-option input {
    accent-color: var(--color-gold);
    flex-shrink: 0;
    margin: 0;
    width: auto;  /* Override global input { width: 100% } */
  }

  .option-text {
    font-size: var(--text-sm);
    color: var(--color-cream);
  }

  .dropdown-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: var(--space-2) 0;
  }

  .download-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    width: 100%;
    background: var(--color-burgundy);
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-cream);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    padding: 8px 12px;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .download-button:hover {
    background: color-mix(in srgb, var(--color-burgundy) 85%, white);
  }

  .download-button:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }
</style>
