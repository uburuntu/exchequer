<script lang="ts">
  import FileUpload from "./lib/components/FileUpload.svelte";
  import Portfolio from "./lib/components/Portfolio.svelte";
  import CapitalGainsSummary from "./lib/components/CapitalGainsSummary.svelte";
  import Timeline from "./lib/components/Timeline.svelte";
  import ManualEntry from "./lib/components/ManualEntry.svelte";
  import TaxYearSelector from "./lib/components/TaxYearSelector.svelte";
  import FXSourceSelector from "./lib/components/FXSourceSelector.svelte";
  import ExportButton from "./lib/components/ExportButton.svelte";
  import HelpPanel from "./lib/components/HelpPanel.svelte";
  import WarningsPanel from "./lib/components/WarningsPanel.svelte";
  import SessionResumeDialog from "./lib/components/SessionResumeDialog.svelte";
  import TabNav from "./lib/components/TabNav.svelte";
  import TransactionTable from "./lib/components/TransactionTable.svelte";
  import { appState } from "./lib/stores.svelte";

  // Tab state
  let activeTab = $state("transactions");

  // Tabs configuration
  let tabs = $derived([
    { id: "transactions", label: "Transactions", count: appState.transactions.length },
    { id: "summary", label: "Summary", count: undefined },
    { id: "timeline", label: "Timeline", count: appState.report?.calculationLog.size || 0 },
  ]);

  function handleTabChange(tabId: string) {
    activeTab = tabId;
  }

  // Upload panel collapse state
  let isUploadCollapsed = $state(false);
  let isManualEntryOpen = $state(false);

  // Auto-collapse upload after loading transactions
  $effect(() => {
    if (appState.transactions.length > 0 && !isUploadCollapsed) {
      // Small delay to let user see the success state
      setTimeout(() => {
        isUploadCollapsed = true;
      }, 500);
    }
  });
</script>

<a href="#main-content" class="skip-link">Skip to main content</a>

<SessionResumeDialog />

<div class="app-container">
  <!-- Header with Tax Year Selector -->
  <header class="site-header">
    <div class="header-content">
      <div class="header-left">
        <h1>UK Capital Gains Tax Calculator</h1>
        <p class="subtitle">
          Privacy-first tax calculations — entirely in your browser
        </p>
      </div>
      <div class="header-right">
        <HelpPanel />
        <FXSourceSelector />
        <TaxYearSelector />
        <ExportButton />
      </div>
    </div>
    <div class="header-accent" aria-hidden="true"></div>
  </header>

  <main id="main-content" class="main-content">
    <!-- Upload Panel (Collapsible) -->
    <section class="upload-section" class:collapsed={isUploadCollapsed && appState.transactions.length > 0}>
      <div class="upload-header">
        {#if appState.transactions.length > 0}
          <button 
            class="collapse-toggle"
            onclick={() => isUploadCollapsed = !isUploadCollapsed}
            aria-expanded={!isUploadCollapsed}
            aria-controls="upload-content"
          >
            <span class="collapse-icon" class:rotated={!isUploadCollapsed}>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </span>
            <span class="upload-summary">
              <strong class="mono">{appState.transactions.length}</strong> transactions loaded
              {#if appState.transactions.length > 0}
                <span class="summary-detail">
                  · {new Set(appState.transactions.map(t => t.broker)).size} broker(s)
                </span>
              {/if}
            </span>
          </button>
          <button 
            class="btn-clear"
            onclick={() => appState.clearTransactions()}
            type="button"
          >
            Clear All
          </button>
        {:else}
          <h2>Upload Your Transactions</h2>
        {/if}
      </div>
      
      {#if !isUploadCollapsed || appState.transactions.length === 0}
        <div id="upload-content" class="upload-content">
          <FileUpload />
          
          <!-- Manual Entry Accordion -->
          <div class="manual-entry-accordion">
            <button
              class="accordion-trigger"
              onclick={() => isManualEntryOpen = !isManualEntryOpen}
              aria-expanded={isManualEntryOpen}
              aria-controls="manual-entry-content"
            >
              <span class="accordion-icon" class:open={isManualEntryOpen}>+</span>
              Add transaction manually
            </button>
            {#if isManualEntryOpen}
              <div id="manual-entry-content" class="accordion-content">
                <ManualEntry />
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </section>

    <!-- Tab Navigation -->
    {#if appState.transactions.length > 0}
      <div class="tab-container">
        <TabNav {tabs} {activeTab} onTabChange={handleTabChange} />
      </div>
    {/if}

    <!-- Tab Content -->
    <section class="tab-content" aria-label="Results">
      {#if appState.isProcessing}
        <div class="processing-indicator" role="status" aria-live="polite">
          <span class="processing-dot" aria-hidden="true"></span>
          <span>Calculating tax liability...</span>
        </div>
      {/if}

      {#if appState.transactions.length === 0}
        <!-- Empty state: show summary card with instructions -->
        <CapitalGainsSummary />
      {:else if activeTab === "transactions"}
        <div role="tabpanel" id="panel-transactions" aria-labelledby="tab-transactions">
          <TransactionTable />
        </div>
      {:else if activeTab === "summary"}
        <div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary">
          <WarningsPanel />
          <CapitalGainsSummary />
          {#if appState.report}
            <Portfolio />
          {/if}
        </div>
      {:else if activeTab === "timeline"}
        <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline">
          <Timeline />
        </div>
      {/if}
    </section>
  </main>

  <footer class="site-footer">
    <p class="privacy-note">
      <strong>Privacy First:</strong> All calculations happen locally. Your data never leaves your device.
    </p>
    <p class="github-link">
      <a href="https://github.com/uburuntu/exchequer" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
        Open source on GitHub — contributions welcome!
      </a>
    </p>
  </footer>
</div>

<style>
  .app-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ============================================
     Header
     ============================================ */
  .site-header {
    background: linear-gradient(135deg, var(--color-navy) 0%, var(--color-navy-light) 100%);
    color: var(--color-cream);
    padding: var(--space-4) var(--content-padding);
    position: relative;
  }

  .site-header::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
      radial-gradient(circle at 20% 80%, rgba(201, 169, 97, 0.08) 0%, transparent 40%),
      radial-gradient(circle at 80% 20%, rgba(139, 46, 63, 0.1) 0%, transparent 40%);
    pointer-events: none;
  }

  .header-content {
    position: relative;
    z-index: 1;
    max-width: var(--max-width);
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .header-left {
    flex: 1;
    min-width: 280px;
  }

  .site-header h1 {
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: var(--font-bold);
    margin: 0;
    letter-spacing: -0.02em;
    color: var(--color-cream);
  }

  .subtitle {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    margin: var(--space-1) 0 0 0;
    opacity: 0.8;
    font-weight: var(--font-normal);
  }

  .header-right {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .header-accent {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--color-burgundy) 0%, var(--color-gold) 50%, var(--color-burgundy) 100%);
  }

  /* ============================================
     Main Content
     ============================================ */
  .main-content {
    flex: 1;
    padding: var(--space-4) var(--content-padding);
    max-width: var(--max-width);
    margin: 0 auto;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* ============================================
     Upload Section
     ============================================ */
  .upload-section {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    overflow: hidden;
    transition: all var(--transition-slow);
  }

  .upload-section.collapsed {
    box-shadow: var(--shadow-sm);
  }

  .upload-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3);
    background: var(--color-cream);
    border-bottom: 1px solid var(--color-gray-200);
  }

  .upload-section.collapsed .upload-header {
    border-bottom: none;
  }

  .upload-header h2 {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: var(--color-navy);
    margin: 0;
  }

  .collapse-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    background: transparent;
    border: none;
    padding: 0;
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: var(--color-navy);
    cursor: pointer;
    text-align: left;
  }

  .collapse-toggle:hover {
    color: var(--color-burgundy);
  }

  .collapse-toggle:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .collapse-icon {
    width: 20px;
    height: 20px;
    transition: transform var(--transition-fast);
    color: var(--color-gray-500);
  }

  .collapse-icon.rotated {
    transform: rotate(180deg);
  }

  .upload-summary {
    color: var(--color-gray-700);
  }

  .upload-summary strong {
    color: var(--color-burgundy);
  }

  .summary-detail {
    color: var(--color-gray-500);
  }

  .btn-clear {
    background: transparent;
    border: 1px solid var(--color-loss);
    color: var(--color-loss);
    padding: 6px 12px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-clear:hover {
    background: var(--color-loss);
    color: var(--color-white);
  }

  .btn-clear:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .upload-content {
    padding: var(--space-3);
  }

  /* ============================================
     Manual Entry Accordion
     ============================================ */
  .manual-entry-accordion {
    margin-top: var(--space-3);
    border-top: 1px solid var(--color-gray-200);
    padding-top: var(--space-3);
  }

  .accordion-trigger {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    background: transparent;
    border: none;
    padding: 0;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-gray-600);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .accordion-trigger:hover {
    color: var(--color-burgundy);
  }

  .accordion-trigger:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .accordion-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-full);
    background: var(--color-gray-200);
    font-size: 14px;
    font-weight: var(--font-bold);
    transition: transform var(--transition-fast);
  }

  .accordion-icon.open {
    transform: rotate(45deg);
  }

  .accordion-content {
    margin-top: var(--space-3);
  }

  /* ============================================
     Tab Navigation Container
     ============================================ */
  .tab-container {
    display: flex;
    justify-content: center;
  }

  /* ============================================
     Tab Content
     ============================================ */
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* ============================================
     Processing Indicator
     ============================================ */
  .processing-indicator {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: rgba(201, 169, 97, 0.1);
    border-radius: var(--radius-full);
    color: var(--color-navy);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    align-self: flex-start;
  }

  .processing-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-gold);
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.9); }
  }

  @media (prefers-reduced-motion: reduce) {
    .processing-dot {
      animation: none;
    }
  }

  /* ============================================
     Footer
     ============================================ */
  .site-footer {
    background: var(--color-white);
    padding: var(--space-3) var(--content-padding);
    text-align: center;
    border-top: 1px solid var(--color-gray-200);
  }

  .privacy-note {
    font-size: var(--text-sm);
    color: var(--color-gray-700);
    margin: 0;
  }

  .privacy-note strong {
    color: var(--color-burgundy);
    font-weight: var(--font-semibold);
  }

  .github-link {
    margin: var(--space-2) 0 0 0;
    font-size: var(--text-sm);
  }

  .github-link a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--color-gray-600);
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  .github-link a:hover {
    color: var(--color-navy);
  }

  .github-link svg {
    width: 16px;
    height: 16px;
  }

  /* ============================================
     Skip Link
     ============================================ */
  :global(.skip-link) {
    position: absolute;
    top: -100px;
    left: var(--space-2);
    background: var(--color-navy);
    color: var(--color-cream);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    z-index: 1000;
    font-weight: var(--font-semibold);
    text-decoration: none;
    transition: top var(--transition-fast);
  }

  :global(.skip-link:focus) {
    top: var(--space-2);
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  /* ============================================
     Utility
     ============================================ */
  .mono {
    font-family: var(--font-mono);
  }
</style>
