<script lang="ts">
  import { appState } from '../stores.svelte';
  import Decimal from 'decimal.js-light';

  // Map rule names to display labels and badge classes
  const ruleConfig: Record<string, { label: string; badge: string; description: string }> = {
    'SAME_DAY': {
      label: 'Same Day',
      badge: 'badge-same-day',
      description: 'Shares bought and sold on the same calendar day are matched first (TCGA 1992, s.105)'
    },
    'BED_AND_BREAKFAST': {
      label: 'Bed & Breakfast',
      badge: 'badge-bed-breakfast',
      description: 'Shares reacquired within 30 days of disposal are matched to prevent tax-loss harvesting (TCGA 1992, s.106A)'
    },
    'SECTION_104': {
      label: 'Section 104',
      badge: 'badge-section104',
      description: 'Matched to your Section 104 pool using weighted average cost basis'
    },
    'SHORT_COVER': {
      label: 'Short Cover',
      badge: 'badge-short',
      description: 'Acquisition covering a previous short position'
    },
    'DEFAULT': { label: 'Standard', badge: 'badge-neutral', description: '' }
  };

  function getRuleConfig(rule: string) {
    return ruleConfig[rule] || ruleConfig['DEFAULT'];
  }

  // Flatten the calculation log for display
  let timelineEntries = $derived(() => {
    if (!appState.report) return [];

    const entries: any[] = [];
    for (const [date, symbolMap] of appState.report.calculationLog.entries()) {
      for (const [symbol, calculationEntries] of symbolMap.entries()) {
        entries.push({
          date: new Date(date),
          symbol: symbol.split('$').pop(),
          entries: calculationEntries,
          totalGain: calculationEntries.reduce((sum, e) => sum.plus(e.gain || 0), new Decimal(0))
        });
      }
    }
    return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  });

  // Calculate chart data for gains/losses visualization
  let chartData = $derived(() => {
    const entries = timelineEntries();
    if (entries.length === 0) return { bars: [], maxValue: 0, totalGain: new Decimal(0), totalLoss: new Decimal(0) };

    let runningTotal = new Decimal(0);
    let maxAbsValue = new Decimal(0);
    let totalGain = new Decimal(0);
    let totalLoss = new Decimal(0);

    const bars = entries.map((entry, index) => {
      const gain = entry.totalGain;
      runningTotal = runningTotal.plus(gain);

      if (gain.isPositive()) {
        totalGain = totalGain.plus(gain);
      } else {
        totalLoss = totalLoss.plus(gain.abs());
      }

      if (gain.abs().greaterThan(maxAbsValue)) {
        maxAbsValue = gain.abs();
      }

      return {
        date: entry.date,
        symbol: entry.symbol,
        gain: gain,
        cumulative: runningTotal,
        index
      };
    });

    return {
      bars,
      maxValue: maxAbsValue.toNumber() || 1,
      totalGain,
      totalLoss
    };
  });

  function formatDate(date: Date): { day: string; month: string; year: string } {
    return {
      day: date.getDate().toString(),
      month: date.toLocaleString('en-GB', { month: 'short' }),
      year: date.getFullYear().toString()
    };
  }

  function formatCurrency(value: Decimal): string {
    const isNegative = value.isNegative();
    const absValue = value.abs().toFixed(2);
    const formatted = absValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return isNegative ? `-£${formatted}` : `£${formatted}`;
  }

  function formatShortDate(date: Date): string {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  // Track expanded entries
  let expandedEntries = $state<Set<string>>(new Set());
  let showChart = $state(true);

  function toggleEntry(id: string) {
    const newSet = new Set(expandedEntries);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    expandedEntries = newSet;
  }

  function isExpanded(id: string): boolean {
    return expandedEntries.has(id);
  }
</script>

<div class="timeline-card" role="region" aria-label="Calculation timeline">
  <header class="card-header">
    <h2>Calculation Timeline</h2>
    <div class="header-actions">
      {#if timelineEntries().length > 0}
        <button
          class="chart-toggle"
          class:active={showChart}
          onclick={() => showChart = !showChart}
          aria-pressed={showChart}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
          </svg>
          Chart
        </button>
        <span class="count-badge">{timelineEntries().length} disposals</span>
      {/if}
    </div>
  </header>

  {#if appState.isProcessing}
    <p class="empty-state">Processing transactions...</p>
  {:else if appState.error}
    <p class="empty-state error">Calculation error: {appState.error}</p>
  {:else if !appState.report}
    <p class="empty-state">Upload transactions to see the calculation timeline.</p>
  {:else if timelineEntries().length === 0}
    <p class="empty-state">No disposal transactions found in this tax year.</p>
  {:else}
    <!-- Gains/Losses Chart -->
    {#if showChart && chartData().bars.length > 0}
      <div class="chart-section">
        <div class="chart-summary">
          <div class="summary-item gain">
            <span class="summary-label">Total Gains</span>
            <span class="summary-value">+{formatCurrency(chartData().totalGain)}</span>
          </div>
          <div class="summary-item loss">
            <span class="summary-label">Total Losses</span>
            <span class="summary-value">-{formatCurrency(chartData().totalLoss)}</span>
          </div>
          <div class="summary-item net" class:positive={chartData().totalGain.minus(chartData().totalLoss).isPositive()}>
            <span class="summary-label">Net</span>
            <span class="summary-value">
              {chartData().totalGain.minus(chartData().totalLoss).isPositive() ? '+' : ''}{formatCurrency(chartData().totalGain.minus(chartData().totalLoss))}
            </span>
          </div>
        </div>

        <div class="chart-container" role="img" aria-label="Gains and losses bar chart">
          <div class="chart-zero-line"></div>
          <div class="chart-bars">
            {#each chartData().bars as bar}
              {@const heightPercent = Math.abs(bar.gain.toNumber() / chartData().maxValue) * 100}
              {@const isGain = bar.gain.isPositive()}
              <div class="chart-bar-wrapper" title="{bar.symbol}: {isGain ? '+' : ''}{formatCurrency(bar.gain)} on {formatShortDate(bar.date)}">
                <div
                  class="chart-bar"
                  class:gain={isGain}
                  class:loss={!isGain}
                  style="--height: {Math.max(heightPercent, 3)}%"
                >
                </div>
                <span class="chart-label">{bar.symbol}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <div class="timeline">
      {#each timelineEntries() as entry, index}
        {@const entryId = `${entry.date.toISOString()}-${entry.symbol}`}
        {@const dateFormatted = formatDate(entry.date)}
        {@const expanded = isExpanded(entryId)}
        
        <article 
          class="timeline-item" 
          class:expanded
        >
          <!-- Timeline connector -->
          <div class="timeline-track" aria-hidden="true">
            <div class="timeline-dot" class:gain={entry.totalGain.isPositive()} class:loss={entry.totalGain.isNegative()}></div>
            {#if index < timelineEntries().length - 1}
              <div class="timeline-line"></div>
            {/if}
          </div>

          <!-- Date column -->
          <div class="timeline-date">
            <span class="date-day">{dateFormatted.day}</span>
            <span class="date-month">{dateFormatted.month}</span>
            <span class="date-year">{dateFormatted.year}</span>
          </div>
          
          <!-- Content -->
          <div class="timeline-content">
            <button 
              class="entry-header"
              onclick={() => toggleEntry(entryId)}
              aria-label={expanded ? `Collapse details for ${entry.symbol}` : `Expand details for ${entry.symbol}`}
              type="button"
            >
              <div class="entry-title">
                <span class="entry-type">Disposal</span>
                <span class="entry-symbol">{entry.symbol}</span>
              </div>
              <div class="entry-summary">
                <span 
                  class="gain-total mono"
                  class:text-gain={entry.totalGain.isPositive()}
                  class:text-loss={entry.totalGain.isNegative()}
                >
                  {entry.totalGain.isPositive() ? '+' : ''}{formatCurrency(entry.totalGain)}
                </span>
                <span class="expand-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
                  </svg>
                </span>
              </div>
            </button>
            
            {#if expanded}
              <div class="calculation-steps">
                {#each entry.entries as step}
                  {@const rule = getRuleConfig(step.rule) ?? { label: 'Unknown', badge: 'badge-default' }}
                  <div class="step">
                    <div class="step-header">
                      <span class="badge {rule.badge}">{rule.label}</span>
                    </div>
                    <div class="step-details">
                      <div class="step-row">
                        <span class="step-label">Quantity</span>
                        <span class="step-value mono">{step.quantity.toString()}</span>
                      </div>
                      <div class="step-row">
                        <span class="step-label">Proceeds</span>
                        <span class="step-value mono">{formatCurrency(step.amount)}</span>
                      </div>
                      {#if step.costBasis}
                        <div class="step-row">
                          <span class="step-label">Cost Basis</span>
                          <span class="step-value mono">{formatCurrency(step.costBasis)}</span>
                        </div>
                      {/if}
                      {#if step.gain}
                        <div class="step-row highlight">
                          <span class="step-label">Gain/Loss</span>
                          <span 
                            class="step-value mono"
                            class:text-gain={step.gain.isPositive()}
                            class:text-loss={step.gain.isNegative()}
                          >
                            {step.gain.isPositive() ? '+' : ''}{formatCurrency(step.gain)}
                          </span>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .timeline-card {
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

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .chart-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: var(--color-gray-100);
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--color-gray-600);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .chart-toggle svg {
    width: 14px;
    height: 14px;
  }

  .chart-toggle:hover {
    background: var(--color-gray-200);
    color: var(--color-navy);
  }

  .chart-toggle.active {
    background: var(--color-burgundy);
    border-color: var(--color-burgundy);
    color: var(--color-white);
  }

  /* Chart Section */
  .chart-section {
    background: linear-gradient(135deg, var(--color-gray-50) 0%, var(--color-cream) 100%);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .chart-summary {
    display: flex;
    justify-content: center;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--color-white);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    min-width: 100px;
  }

  .summary-label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-gray-600);
    margin-bottom: 2px;
  }

  .summary-value {
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
  }

  .summary-item.gain .summary-value { color: var(--color-gain); }
  .summary-item.loss .summary-value { color: var(--color-loss); }
  .summary-item.net .summary-value { color: var(--color-navy); }
  .summary-item.net.positive .summary-value { color: var(--color-gain); }

  .chart-container {
    position: relative;
    height: 140px;
    display: flex;
    flex-direction: column;
    padding: 0 var(--space-2);
  }

  .chart-zero-line {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    background: var(--color-gray-300);
    z-index: 0;
  }

  .chart-bars {
    display: flex;
    align-items: stretch;
    justify-content: space-around;
    width: 100%;
    height: 100%;
    gap: 4px;
    position: relative;
    z-index: 1;
  }

  .chart-bar-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    max-width: 40px;
    height: 100%;
    cursor: pointer;
    position: relative;
  }

  .chart-bar {
    position: absolute;
    width: 100%;
    max-width: 20px;
    left: 50%;
    transform: translateX(-50%);
    border-radius: 3px;
    transition: opacity 0.15s ease;
  }

  .chart-bar.gain {
    background: linear-gradient(180deg, #43a047 0%, #66bb6a 100%);
    bottom: 50%;
    height: calc(var(--height) * 0.45);
  }

  .chart-bar.loss {
    background: linear-gradient(0deg, #e53935 0%, #ef5350 100%);
    top: 50%;
    height: calc(var(--height) * 0.45);
  }

  .chart-bar-wrapper:hover .chart-bar {
    opacity: 0.8;
  }

  .chart-label {
    position: absolute;
    bottom: 4px;
    font-size: 8px;
    font-weight: var(--font-medium);
    color: var(--color-gray-500);
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    max-width: 100%;
    text-align: center;
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

  .empty-state.error {
    color: var(--color-loss);
    background: var(--color-loss-bg);
  }

  /* Timeline layout */
  .timeline {
    display: flex;
    flex-direction: column;
  }

  .timeline-item {
    display: grid;
    grid-template-columns: 24px 60px 1fr;
    gap: var(--space-2);
    padding-bottom: var(--space-3);
  }

  .timeline-item:last-child {
    padding-bottom: 0;
  }

  /* Timeline track (dots and lines) */
  .timeline-track {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 6px;
  }

  .timeline-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-gray-300);
    border: 2px solid var(--color-white);
    box-shadow: 0 0 0 2px var(--color-gray-300);
    flex-shrink: 0;
  }

  .timeline-dot.gain {
    background: var(--color-gain);
    box-shadow: 0 0 0 2px var(--color-gain);
  }

  .timeline-dot.loss {
    background: var(--color-loss);
    box-shadow: 0 0 0 2px var(--color-loss);
  }

  .timeline-line {
    width: 2px;
    flex: 1;
    background: var(--color-gray-200);
    margin-top: var(--space-1);
  }

  /* Date column */
  .timeline-date {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 2px;
  }

  .date-day {
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
    color: var(--color-navy);
    line-height: 1;
  }

  .date-month {
    font-size: var(--text-xs);
    text-transform: uppercase;
    color: var(--color-gray-600);
    font-weight: var(--font-medium);
  }

  .date-year {
    font-size: var(--text-xs);
    color: var(--color-gray-500);
  }

  /* Content area */
  .timeline-content {
    background: var(--color-gray-50);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: box-shadow var(--transition-fast);
  }

  .timeline-item.expanded .timeline-content {
    box-shadow: var(--shadow-md);
  }

  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2);
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-body);
    transition: background-color var(--transition-fast);
  }

  .entry-header:hover {
    background: var(--color-cream);
  }

  .entry-header:focus-visible {
    outline: var(--focus-ring);
    outline-offset: -2px;
  }

  .entry-title {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .entry-type {
    font-size: var(--text-xs);
    text-transform: uppercase;
    color: var(--color-gray-600);
    font-weight: var(--font-medium);
  }

  .entry-symbol {
    font-weight: var(--font-semibold);
    color: var(--color-burgundy);
    font-size: var(--text-base);
  }

  .entry-summary {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .gain-total {
    font-weight: var(--font-bold);
    font-size: var(--text-base);
  }

  .expand-icon {
    width: 20px;
    height: 20px;
    color: var(--color-gray-500);
    transition: transform var(--transition-fast);
  }

  .timeline-item.expanded .expand-icon {
    transform: rotate(180deg);
  }

  /* Calculation steps */
  .calculation-steps {
    padding: 0 var(--space-2) var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .step {
    background: var(--color-white);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    border: 1px solid var(--color-gray-200);
  }

  .step-header {
    margin-bottom: var(--space-1);
  }

  .badge {
    display: inline-block;
    font-size: 10px;
    font-weight: var(--font-bold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 3px 8px;
    border-radius: var(--radius-full);
  }

  .badge-same-day {
    background: #e3f2fd;
    color: #1565c0;
  }

  .badge-bed-breakfast {
    background: #fff3e0;
    color: #e65100;
  }

  .badge-section104 {
    background: #f3e5f5;
    color: #7b1fa2;
  }

  .badge-neutral {
    background: var(--color-cream);
    color: var(--color-gray-700);
  }

  .step-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .step-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-sm);
  }

  .step-row.highlight {
    padding-top: var(--space-1);
    margin-top: var(--space-1);
    border-top: 1px dashed var(--color-gray-200);
  }

  .step-label {
    color: var(--color-gray-600);
  }

  .step-value {
    color: var(--color-navy);
    font-weight: var(--font-medium);
  }

  .mono {
    font-family: var(--font-mono);
  }

  .text-gain { color: var(--color-gain); }
  .text-loss { color: var(--color-loss); }
</style>
