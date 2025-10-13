<script lang="ts">
  /**
   * Educational Tooltip Component
   * Displays helpful information about HMRC tax rules and concepts
   */

  interface Props {
    title: string;
    children: import("svelte").Snippet;
    content?: import("svelte").Snippet;
  }

  let { title, children, content }: Props = $props();

  let isVisible = $state(false);
  let tooltipEl: HTMLElement | null = $state(null);

  function show() {
    isVisible = true;
  }

  function hide() {
    isVisible = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      hide();
    }
  }
</script>

<span
  class="tooltip-trigger"
  role="button"
  tabindex="0"
  aria-describedby="tooltip-content"
  onmouseenter={show}
  onmouseleave={hide}
  onfocus={show}
  onblur={hide}
  onkeydown={handleKeydown}
>
  {@render children()}
  <span class="info-icon" aria-hidden="true">
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.93 12.12H7.07V6.86h1.86v5.26zm-.93-6.86a1.07 1.07 0 110-2.14 1.07 1.07 0 010 2.14z"/>
    </svg>
  </span>

  {#if isVisible}
    <div
      class="tooltip-popup"
      id="tooltip-content"
      role="tooltip"
      bind:this={tooltipEl}
    >
      <div class="tooltip-header">
        <span class="tooltip-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
          </svg>
        </span>
        <span class="tooltip-title">{title}</span>
      </div>
      {#if content}
        <div class="tooltip-body">
          {@render content()}
        </div>
      {/if}
    </div>
  {/if}
</span>

<style>
  .tooltip-trigger {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: help;
    border-bottom: 1px dotted var(--color-gray-400);
  }

  .tooltip-trigger:focus {
    outline: none;
  }

  .tooltip-trigger:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
    border-radius: 2px;
  }

  .info-icon {
    display: inline-flex;
    width: 14px;
    height: 14px;
    color: var(--color-gray-400);
    transition: color 0.15s ease;
  }

  .tooltip-trigger:hover .info-icon,
  .tooltip-trigger:focus .info-icon {
    color: var(--color-burgundy);
  }

  .info-icon svg {
    width: 100%;
    height: 100%;
  }

  .tooltip-popup {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    width: 280px;
    max-width: 90vw;
    background: var(--color-navy);
    color: var(--color-cream);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: 0;
    animation: tooltipFadeIn 0.15s ease;
  }

  .tooltip-popup::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--color-navy);
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .tooltip-icon {
    display: flex;
    width: 16px;
    height: 16px;
    color: var(--color-gold);
  }

  .tooltip-icon svg {
    width: 100%;
    height: 100%;
  }

  .tooltip-title {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tooltip-body {
    padding: 10px 12px;
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .tooltip-body :global(p) {
    margin: 0 0 8px 0;
  }

  .tooltip-body :global(p:last-child) {
    margin-bottom: 0;
  }

  .tooltip-body :global(strong) {
    color: var(--color-gold);
    font-weight: var(--font-semibold);
  }

  .tooltip-body :global(code) {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .tooltip-body :global(.hmrc-ref) {
    display: block;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: var(--text-xs);
    color: rgba(255, 255, 255, 0.6);
  }

  @media (max-width: 600px) {
    .tooltip-popup {
      width: 250px;
      left: 0;
      transform: translateX(0);
    }

    .tooltip-popup::after {
      left: 20px;
      transform: none;
    }
  }
</style>
