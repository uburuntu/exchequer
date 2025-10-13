<script lang="ts">
  import { appState } from "../stores.svelte";
  import { FXSource } from "../services/currency-converter";

  const sourceOptions = [
    { value: FXSource.HMRC_MONTHLY, label: "HMRC Monthly", description: "Official UK government rates" },
    { value: FXSource.ECB_DAILY, label: "ECB Daily", description: "European Central Bank via Frankfurter" },
  ];

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const source = target.value as FXSource;
    appState.setFxSource(source);
  }
</script>

<div class="fx-source-selector">
  <label for="fx-source" class="selector-label">FX Rates</label>
  <select
    id="fx-source"
    value={appState.fxSource}
    onchange={handleChange}
    aria-label="Select exchange rate source"
  >
    {#each sourceOptions as option}
      <option value={option.value} title={option.description}>
        {option.label}
      </option>
    {/each}
  </select>
</div>

<style>
  .fx-source-selector {
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
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
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
