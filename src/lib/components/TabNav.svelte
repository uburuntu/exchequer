<script lang="ts">
  type Tab = {
    id: string;
    label: string;
    count?: number;
  };

  let { tabs, activeTab, onTabChange }: {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
  } = $props();

  function handleKeyDown(event: KeyboardEvent, tabId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onTabChange(tabId);
    }
    
    // Arrow key navigation
    const currentIndex = tabs.findIndex(t => t.id === activeTab);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % tabs.length;
      onTabChange(tabs[nextIndex]!.id);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      onTabChange(tabs[prevIndex]!.id);
    }
  }
</script>

<div class="tab-nav" role="tablist" aria-label="Main navigation">
  {#each tabs as tab}
    <button
      role="tab"
      id="tab-{tab.id}"
      aria-selected={activeTab === tab.id}
      aria-controls="panel-{tab.id}"
      tabindex={activeTab === tab.id ? 0 : -1}
      class="tab-button"
      class:active={activeTab === tab.id}
      onclick={() => onTabChange(tab.id)}
      onkeydown={(e) => handleKeyDown(e, tab.id)}
    >
      <span class="tab-label">{tab.label}</span>
      {#if tab.count !== undefined && tab.count > 0}
        <span class="tab-count">{tab.count}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .tab-nav {
    display: flex;
    gap: 2px;
    background: var(--color-gray-200);
    padding: 4px;
    border-radius: var(--radius-lg);
    width: fit-content;
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-gray-600);
    cursor: pointer;
    transition: 
      background-color var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .tab-button:hover {
    color: var(--color-navy);
    background: var(--color-gray-100);
  }

  .tab-button.active {
    background: var(--color-white);
    color: var(--color-navy);
    box-shadow: var(--shadow-sm);
  }

  .tab-button:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .tab-label {
    white-space: nowrap;
  }

  .tab-count {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    background: var(--color-cream);
    color: var(--color-gray-700);
    padding: 2px 6px;
    border-radius: var(--radius-full);
    min-width: 20px;
    text-align: center;
  }

  .tab-button.active .tab-count {
    background: var(--color-burgundy);
    color: var(--color-cream);
  }
</style>

