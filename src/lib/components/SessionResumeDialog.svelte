<script lang="ts">
  import { appState } from "../stores.svelte";

  let isVisible = $derived(appState.hasPendingSession && appState.isInitialized);
  let count = $derived(appState.pendingSessionInfo.count);
  let lastDate = $derived(appState.pendingSessionInfo.lastDate);

  function formatDate(date: Date | null): string {
    if (!date) return "";
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function handleRestore() {
    appState.restoreSession();
  }

  function handleDismiss() {
    appState.dismissSession();
  }
</script>

{#if isVisible}
  <div class="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="session-dialog-title">
    <div class="dialog">
      <div class="dialog-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <h2 id="session-dialog-title">Resume Previous Session?</h2>

      <p class="dialog-message">
        You have a previous session with
        <strong class="mono">{count}</strong>
        transaction{count !== 1 ? "s" : ""}
        {#if lastDate}
          <span class="date-info">(last from {formatDate(lastDate)})</span>
        {/if}
      </p>

      <div class="dialog-actions">
        <button class="btn-secondary" onclick={handleDismiss}>
          Start Fresh
        </button>
        <button class="btn-primary" onclick={handleRestore}>
          Resume Session
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(26, 32, 44, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .dialog {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-5);
    max-width: 420px;
    width: 90%;
    text-align: center;
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dialog-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-3);
    color: var(--color-burgundy);
  }

  .dialog-icon svg {
    width: 100%;
    height: 100%;
  }

  .dialog h2 {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: var(--color-navy);
    margin: 0 0 var(--space-2) 0;
  }

  .dialog-message {
    font-size: var(--text-sm);
    color: var(--color-gray-700);
    margin: 0 0 var(--space-4) 0;
    line-height: 1.5;
  }

  .dialog-message strong {
    color: var(--color-burgundy);
  }

  .date-info {
    color: var(--color-gray-500);
  }

  .dialog-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
  }

  .btn-primary,
  .btn-secondary {
    padding: 10px 20px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-width: 120px;
  }

  .btn-primary {
    background: var(--color-burgundy);
    color: var(--color-white);
    border: none;
  }

  .btn-primary:hover {
    background: var(--color-burgundy-dark, #6b1d2c);
  }

  .btn-primary:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .btn-secondary {
    background: transparent;
    color: var(--color-gray-700);
    border: 1px solid var(--color-gray-300);
  }

  .btn-secondary:hover {
    background: var(--color-gray-100);
    border-color: var(--color-gray-400);
  }

  .btn-secondary:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .mono {
    font-family: var(--font-mono);
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog-overlay,
    .dialog {
      animation: none;
    }
  }
</style>
