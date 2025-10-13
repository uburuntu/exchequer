<script lang="ts">
  let isOpen = $state(false);
  let activeSection = $state<string | null>(null);

  const helpSections = [
    {
      id: "same-day",
      title: "Same-Day Rule",
      summary: "Shares bought and sold on the same day are matched first.",
      content: `When you dispose of shares and acquire shares of the same class in the same company on the same day, the acquisition is matched with the disposal. This prevents creating artificial losses by selling and immediately repurchasing shares.`,
      example: `Buy 100 AAPL at £150 on 1 June\nSell 100 AAPL at £160 on 1 June\n→ Gain: £1,000 (matched same-day)`,
      hmrcRef: "CG51560",
      hmrcLink: "https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg51560"
    },
    {
      id: "bed-and-breakfast",
      title: "Bed & Breakfast Rule (30 Days)",
      summary: "Shares reacquired within 30 days are matched to the disposal.",
      content: `If you dispose of shares and acquire shares of the same class within the following 30 days, the acquisition is matched with the disposal. This "bed and breakfasting" rule prevents realising losses while maintaining your position.`,
      example: `Sell 100 AAPL at £160 on 1 June\nBuy 100 AAPL at £155 on 15 June\n→ Matched (within 30 days)\nGain calculated using £155 acquisition cost`,
      hmrcRef: "CG51560",
      hmrcLink: "https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg51560"
    },
    {
      id: "section-104",
      title: "Section 104 Pool",
      summary: "Shares held for more than 30 days are pooled together.",
      content: `After same-day and B&B matching, remaining shares are matched against your Section 104 holding. This is a pooled average cost basis for all shares of the same class acquired more than 30 days before disposal. Each acquisition adds to the pool, and each disposal reduces it proportionally.`,
      example: `Buy 100 AAPL at £100 = £10,000 pool\nBuy 50 AAPL at £120 = £16,000 pool (150 shares)\nAverage cost: £106.67 per share`,
      hmrcRef: "CG51620",
      hmrcLink: "https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg51620"
    },
    {
      id: "tax-year",
      title: "UK Tax Year",
      summary: "The tax year runs from 6 April to 5 April the following year.",
      content: `The UK tax year runs from 6 April to 5 April. For example, tax year 2024/25 covers 6 April 2024 to 5 April 2025. Capital gains are reported and taxed in the tax year when the disposal occurs.`,
      example: `Disposal on 4 April 2025 → Tax year 2024/25\nDisposal on 6 April 2025 → Tax year 2025/26`,
      hmrcRef: "CG10260",
      hmrcLink: "https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg10260"
    },
    {
      id: "annual-exempt",
      title: "Annual Exempt Amount",
      summary: "You can make gains up to the annual allowance tax-free.",
      content: `Each tax year you have an Annual Exempt Amount (AEA) for capital gains. Gains up to this amount are tax-free. For 2024/25, the AEA is £3,000 (reduced from £6,000 in 2023/24).`,
      example: `Total gains: £8,000\nAEA: £3,000\nTaxable gain: £5,000`,
      hmrcRef: "CG18100",
      hmrcLink: "https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg18100"
    },
    {
      id: "forex",
      title: "Foreign Exchange",
      summary: "Transactions in foreign currencies must be converted to GBP.",
      content: `For CGT purposes, all amounts must be converted to GBP at the exchange rate on the date of the transaction. This applies to both acquisitions and disposals. HMRC publishes monthly exchange rates, or you can use daily rates from reputable sources like the ECB.`,
      example: `Buy 100 shares at $150 when £1 = $1.25\nCost in GBP: $15,000 ÷ 1.25 = £12,000`,
      hmrcRef: "CG78300",
      hmrcLink: "https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg78300"
    },
    {
      id: "eri",
      title: "Excess Reported Income (ERI)",
      summary: "Offshore fund distributions reduce your acquisition cost.",
      content: `Excess Reported Income from offshore funds (common with Irish/Luxembourg ETFs like Vanguard) is taxed as dividend income but also reduces your acquisition cost for CGT purposes. This prevents double taxation when you eventually sell.`,
      example: `Original cost: £10,000\nERI reported: £200\nAdjusted cost: £9,800`,
      hmrcRef: "CG57230",
      hmrcLink: "https://www.gov.uk/hmrc-internal-manuals/capital-gains-manual/cg57230"
    }
  ];

  function toggleSection(id: string) {
    activeSection = activeSection === id ? null : id;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      isOpen = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="help-container">
  <button
    class="help-button"
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
    aria-label="Toggle help panel"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
    <span class="help-label">Help</span>
  </button>

  {#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="help-backdrop" onclick={() => isOpen = false}></div>

    <aside class="help-panel" role="complementary" aria-label="CGT Help">
      <header class="panel-header">
        <h2>UK Capital Gains Tax Rules</h2>
        <button
          class="close-button"
          onclick={() => isOpen = false}
          aria-label="Close help panel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <div class="panel-content">
        <p class="intro">
          This calculator follows HMRC's share identification rules for Capital Gains Tax.
          Click any section below to learn more.
        </p>

        <div class="accordion">
          {#each helpSections as section}
            <div class="accordion-item" class:active={activeSection === section.id}>
              <button
                class="accordion-trigger"
                onclick={() => toggleSection(section.id)}
                aria-expanded={activeSection === section.id}
                aria-controls={`content-${section.id}`}
              >
                <div class="trigger-content">
                  <span class="trigger-title">{section.title}</span>
                  <span class="trigger-summary">{section.summary}</span>
                </div>
                <span class="trigger-icon" class:open={activeSection === section.id}>
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
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </span>
              </button>

              {#if activeSection === section.id}
                <div id={`content-${section.id}`} class="accordion-content">
                  <p>{section.content}</p>

                  <div class="example-box">
                    <span class="example-label">Example</span>
                    <pre>{section.example}</pre>
                  </div>

                  <a
                    href={section.hmrcLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hmrc-link"
                  >
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
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    HMRC Manual {section.hmrcRef}
                  </a>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <footer class="panel-footer">
          <p>
            For complete guidance, see the
            <a
              href="https://www.gov.uk/capital-gains-tax"
              target="_blank"
              rel="noopener noreferrer"
            >
              official HMRC Capital Gains Tax guidance
            </a>.
          </p>
        </footer>
      </div>
    </aside>
  {/if}
</div>

<style>
  .help-container {
    position: relative;
  }

  .help-button {
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

  .help-button:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .help-button:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .help-label {
    display: none;
  }

  @media (min-width: 640px) {
    .help-label {
      display: inline;
    }
  }

  .help-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 40;
  }

  .help-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 420px;
    background: var(--color-white);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2);
    z-index: 50;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3);
    background: var(--color-navy);
    color: var(--color-cream);
  }

  .panel-header h2 {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .close-button {
    background: transparent;
    border: none;
    color: var(--color-cream);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    transition: background-color var(--transition-fast);
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3);
  }

  .intro {
    font-size: var(--text-sm);
    color: var(--color-gray-600);
    margin: 0 0 var(--space-3) 0;
    line-height: 1.5;
  }

  .accordion {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-gray-200);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .accordion-item {
    background: var(--color-white);
  }

  .accordion-item.active {
    background: var(--color-cream);
  }

  .accordion-trigger {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .accordion-trigger:hover {
    background: var(--color-cream);
  }

  .accordion-trigger:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: -2px;
  }

  .trigger-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .trigger-title {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: var(--color-navy);
  }

  .trigger-summary {
    font-size: var(--text-xs);
    color: var(--color-gray-500);
  }

  .trigger-icon {
    flex-shrink: 0;
    color: var(--color-gray-400);
    transition: transform var(--transition-fast);
  }

  .trigger-icon.open {
    transform: rotate(180deg);
  }

  .accordion-content {
    padding: 0 var(--space-2) var(--space-2) var(--space-2);
  }

  .accordion-content p {
    font-size: var(--text-sm);
    color: var(--color-gray-700);
    line-height: 1.6;
    margin: 0 0 var(--space-2) 0;
  }

  .example-box {
    background: var(--color-navy);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .example-label {
    display: block;
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-gold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-1);
  }

  .example-box pre {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-cream);
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  .hmrc-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--color-burgundy);
    text-decoration: none;
    font-weight: var(--font-medium);
  }

  .hmrc-link:hover {
    text-decoration: underline;
  }

  .hmrc-link:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .panel-footer {
    padding: var(--space-3);
    border-top: 1px solid var(--color-gray-200);
    background: var(--color-cream);
  }

  .panel-footer p {
    font-size: var(--text-xs);
    color: var(--color-gray-600);
    margin: 0;
  }

  .panel-footer a {
    color: var(--color-burgundy);
  }

  .panel-footer a:hover {
    text-decoration: underline;
  }
</style>
