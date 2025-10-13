<script lang="ts">
  import { appState } from "../stores.svelte";
  import { ParserRegistry } from "../parsers";
  import {
    type BrokerFileGroup,
    type FileClassification,
    type MultiFileParserResult,
    type ParserResult,
  } from "../parsers/base";
  import type { BrokerTransaction } from "../types";
  import { generateExampleData } from "../data/example_transactions";

  const brokers = [
    { id: "schwab", name: "Charles Schwab" },
    { id: "trading212", name: "Trading 212" },
    { id: "mssb", name: "Morgan Stanley" },
    { id: "sharesight", name: "Sharesight" },
    { id: "vanguard", name: "Vanguard" },
    { id: "freetrade", name: "Freetrade" },
    { id: "raw", name: "RAW Format" },
  ];

  /** Structured issue for contextual messaging */
  interface UploadIssue {
    type: "error" | "warning" | "info";
    title: string;
    message: string;
    hint?: string;
  }

  /** Success breakdown item */
  interface SuccessBreakdown {
    broker: string;
    count: number;
    files?: { label: string; count: number }[];
  }

  let manualBroker = $state<string | null>(null);
  let showManualOverride = $state(false);
  let files = $state<FileList | null>(null);
  let issues = $state<UploadIssue[]>([]);
  let isProcessing = $state(false);
  let isDragOver = $state(false);
  let lastUploadCount = $state(0);
  let successBreakdown = $state<SuccessBreakdown[]>([]);

  // Derived states for backwards compatibility
  let errors = $derived(issues.filter((i) => i.type === "error"));
  let warnings = $derived(
    issues.filter((i) => i.type === "warning" || i.type === "info"),
  );

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    if (event.dataTransfer?.files) {
      files = event.dataTransfer.files;
      processFiles();
    }
  }

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      files = target.files;
      processFiles();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      document.getElementById("fileInput")?.click();
    }
  }

  async function loadExampleData() {
    isProcessing = true;
    issues = [];
    successBreakdown = [];
    try {
      const parser = ParserRegistry.get("schwab")!;
      const exampleCsv = generateExampleData();
      const result = await parser.parse(exampleCsv, "schwab_example.csv");
      lastUploadCount = result.transactions.length;
      successBreakdown = [{ broker: "Charles Schwab", count: result.transactions.length }];
      appState.addTransactions(result.transactions);
      // Convert old-style warnings to issues
      for (const warning of result.warnings) {
        issues.push({ type: "warning", title: "Warning", message: warning });
      }
    } catch (err) {
      issues = [
        {
          type: "error",
          title: "Could not load example",
          message: err instanceof Error ? err.message : String(err),
        },
      ];
    } finally {
      isProcessing = false;
    }
  }

  /**
   * Phase 1: Read all files and classify them
   */
  async function classifyAllFiles(
    fileList: FileList,
  ): Promise<{ classified: FileClassification[]; unclassified: { fileName: string; content: string }[] }> {
    const classified: FileClassification[] = [];
    const unclassified: { fileName: string; content: string }[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file) continue;

      const content = await file.text();
      const classification = ParserRegistry.classifyFile(content, file.name);

      if (classification) {
        classified.push(classification);
      } else {
        unclassified.push({ fileName: file.name, content });
      }
    }

    return { classified, unclassified };
  }

  /**
   * Phase 2: Group classified files by broker
   */
  function groupByBroker(classified: FileClassification[]): Map<string, BrokerFileGroup> {
    const groups = new Map<string, BrokerFileGroup>();

    for (const file of classified) {
      let group = groups.get(file.broker);
      if (!group) {
        const parser = ParserRegistry.get(file.broker);
        group = {
          broker: file.broker,
          brokerName: parser.brokerName,
          files: new Map(),
          missingRequired: [],
        };
        groups.set(file.broker, group);
      }
      group.files.set(file.fileType, file);
    }

    return groups;
  }

  /**
   * Phase 3: Validate groups and identify missing required files
   */
  function validateGroups(groups: Map<string, BrokerFileGroup>): UploadIssue[] {
    const validationIssues: UploadIssue[] = [];

    for (const [brokerId, group] of groups) {
      const parser = ParserRegistry.getMultiFile(brokerId);
      if (!parser) continue;

      // Check for missing required files
      for (const fileType of parser.fileTypes) {
        if (fileType.required && !group.files.has(fileType.type)) {
          group.missingRequired.push(fileType.type);
        }
      }

      // Generate contextual error messages for missing files
      if (group.missingRequired.length > 0) {
        const presentFiles = Array.from(group.files.values());
        const presentLabels = presentFiles.map((f) => f.label).join(", ");
        
        for (const missingType of group.missingRequired) {
          const typeInfo = parser.fileTypes.find((t) => t.type === missingType);
          if (!typeInfo) continue;

          validationIssues.push({
            type: "error",
            title: "Missing Required File",
            message: `You uploaded a ${group.brokerName} ${presentLabels} file, but this needs to be combined with the ${typeInfo.label} file.`,
            hint: typeInfo.instructions
              ? `Export from: ${typeInfo.instructions}`
              : undefined,
          });
        }
      }
    }

    return validationIssues;
  }

  /**
   * Check if a group has only supplementary (non-primary) files
   */
  function hasOnlySupplementaryFiles(group: BrokerFileGroup, brokerId: string): boolean {
    const parser = ParserRegistry.getMultiFile(brokerId);
    if (!parser) return false;

    // Find the primary file type
    const primaryType = parser.fileTypes.find((t) => t.required);
    if (!primaryType) return false;

    // Check if we're missing the primary file
    return !group.files.has(primaryType.type);
  }

  async function processFiles() {
    if (!files || files.length === 0) return;

    isProcessing = true;
    issues = [];
    successBreakdown = [];
    const allTransactions: BrokerTransaction[] = [];
    const brokerResults: Map<string, SuccessBreakdown> = new Map();

    try {
      // Phase 1: Classify all files
      const { classified, unclassified } = await classifyAllFiles(files);

      // Phase 2: Group by broker
      const groups = groupByBroker(classified);

      // Phase 3: Validate groups
      const validationIssues = validateGroups(groups);
      issues.push(...validationIssues);

      // Phase 4: Parse valid multi-file groups
      for (const [brokerId, group] of groups) {
        // Skip groups with missing required files
        if (group.missingRequired.length > 0) {
          // Check if we only have supplementary files (e.g., only Awards file)
          if (hasOnlySupplementaryFiles(group, brokerId)) {
            continue; // Don't try to parse, error already added
          }
        }

        const multiParser = ParserRegistry.getMultiFile(brokerId);
        if (multiParser && group.files.size > 0) {
          try {
            const result: MultiFileParserResult = await multiParser.parseMulti(group);
            allTransactions.push(...result.transactions);

            // Build success breakdown
            const breakdown: SuccessBreakdown = {
              broker: result.broker,
              count: result.transactions.length,
              files: result.fileBreakdown.map((fb) => ({
                label: fb.label,
                count: fb.count,
              })),
            };
            brokerResults.set(brokerId, breakdown);

            // Convert warnings to issues
            for (const warning of result.warnings) {
              // Check if this is a Stock Plan Activity warning
              if (warning.includes("Stock Plan Activity") && warning.includes("award price not available")) {
                const parser = ParserRegistry.getMultiFile(brokerId);
                const awardsType = parser?.fileTypes.find((t) => !t.required);
                issues.push({
                  type: "info",
                  title: "Stock Plan Activity Skipped",
                  message: warning.split(" - ")[0] + " needs pricing data from the Equity Awards file.",
                  hint: awardsType?.instructions
                    ? `To include these, also upload: ${awardsType.instructions}`
                    : undefined,
                });
              } else {
                issues.push({ type: "warning", title: "Warning", message: warning });
              }
            }
          } catch (err) {
            issues.push({
              type: "error",
              title: `${group.brokerName} Parsing Error`,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Phase 5: Parse unclassified files with auto-detect (fallback)
      for (const { fileName, content } of unclassified) {
        try {
          let result: ParserResult & { detectedBroker?: string };

          if (manualBroker) {
            const parser = ParserRegistry.get(manualBroker);
            result = await parser.parse(content, fileName);
            result.detectedBroker = manualBroker;
          } else {
            result = await ParserRegistry.autoDetect(content, fileName);
          }

          allTransactions.push(...result.transactions);

          // Update or create broker breakdown
          const brokerId = result.detectedBroker || "unknown";
          const existing = brokerResults.get(brokerId);
          if (existing) {
            existing.count += result.transactions.length;
          } else {
            brokerResults.set(brokerId, {
              broker: result.broker,
              count: result.transactions.length,
            });
          }

          // Convert warnings to issues
          for (const warning of result.warnings) {
            issues.push({ type: "warning", title: "Warning", message: warning });
          }
        } catch (err) {
          issues.push({
            type: "error",
            title: `${fileName}`,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Consolidate results
      successBreakdown = Array.from(brokerResults.values());
      lastUploadCount = allTransactions.length;

      if (allTransactions.length > 0) {
        appState.addTransactions(allTransactions);
      }
    } catch (err) {
      issues.push({
        type: "error",
        title: "Fatal Error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      isProcessing = false;
      files = null;
      const fileInput = document.getElementById("fileInput") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    }
  }

  function toggleManualOverride() {
    showManualOverride = !showManualOverride;
    if (!showManualOverride) {
      manualBroker = null;
    }
  }
</script>

<div class="upload-container">
  <!-- Main Drop Zone -->
  <div
    class="dropzone"
    class:drag-over={isDragOver}
    class:processing={isProcessing}
    ondrop={handleDrop}
    ondragover={(e) => e.preventDefault()}
    ondragenter={handleDragEnter}
    ondragleave={handleDragLeave}
    onkeydown={handleKeyDown}
    role="button"
    tabindex="0"
    aria-label="Drop CSV files here or press Enter to browse"
  >
    <input
      type="file"
      id="fileInput"
      accept=".csv"
      multiple
      onchange={handleFileSelect}
    />

    <div class="dropzone-content">
      {#if isProcessing}
        <div class="spinner" aria-hidden="true"></div>
        <span class="dropzone-title">Processing...</span>
      {:else}
        <svg
          class="upload-icon"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            d="M24 32V16M24 16L16 24M24 16L32 24"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M8 32V38C8 40.2091 9.79086 42 12 42H36C38.2091 42 40 40.2091 40 38V32"
            stroke-width="2.5"
            stroke-linecap="round"
          />
        </svg>
        <label for="fileInput" class="dropzone-label">
          <span class="dropzone-title">Drop CSV files here</span>
          <span class="dropzone-subtitle">or click to browse</span>
        </label>
      {/if}
    </div>

    <div class="supported-brokers">
      Schwab · Trading 212 · Freetrade · Vanguard · Morgan Stanley · Sharesight
    </div>
  </div>

  <!-- Manual Override (Collapsed by default) -->
  <button
    type="button"
    class="override-toggle"
    onclick={toggleManualOverride}
    aria-expanded={showManualOverride}
  >
    <svg
      class="override-icon"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clip-rule="evenodd"
      />
    </svg>
    File not recognized? Select broker manually
  </button>

  {#if showManualOverride}
    <div class="override-panel">
      <select bind:value={manualBroker}>
        <option value={null}>Auto-detect (recommended)</option>
        {#each brokers as broker}
          <option value={broker.id}>{broker.name}</option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- Error Messages -->
  {#if errors.length > 0}
    <div class="message-list errors" role="alert">
      <h3>
        <svg
          class="message-icon"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clip-rule="evenodd"
          />
        </svg>
        {errors.length === 1 && errors[0] ? errors[0].title : "Parsing Errors"}
      </h3>
      <ul>
        {#each errors as error}
          <li>
            <span class="issue-message">{error.message}</span>
            {#if error.hint}
              <span class="issue-hint">{error.hint}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Warning/Info Messages -->
  {#if warnings.length > 0}
    <div class="message-list warnings" role="status">
      <h3>
        <svg
          class="message-icon"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clip-rule="evenodd"
          />
        </svg>
        {warnings.length === 1 && warnings[0] ? warnings[0].title : "Warnings"}
      </h3>
      <ul>
        {#each warnings as warning}
          <li>
            <span class="issue-message">{warning.message}</span>
            {#if warning.hint}
              <span class="issue-hint">{warning.hint}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Success Message with Breakdown -->
  {#if lastUploadCount > 0 && errors.length === 0}
    <div class="success-message" role="status">
      <svg
        class="success-icon"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clip-rule="evenodd"
        />
      </svg>
      <div class="success-content">
        <span class="success-summary">
          <strong class="mono">{lastUploadCount}</strong> transactions added
          {#if successBreakdown.length > 0}
            <span class="detected-broker">
              from {successBreakdown.map((b) => b.broker).join(", ")}
            </span>
          {/if}
        </span>
        {#if successBreakdown.some((b) => b.files && b.files.length > 1)}
          <ul class="success-breakdown">
            {#each successBreakdown as breakdown}
              {#if breakdown.files && breakdown.files.length > 1}
                {#each breakdown.files as file}
                  <li>
                    <svg class="check-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z" />
                    </svg>
                    {file.label} ({file.count})
                  </li>
                {/each}
              {/if}
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Example Data (subtle) -->
  {#if appState.transactions.length === 0}
    <div class="example-section">
      <span class="example-or">or</span>
      <button type="button" class="example-link" onclick={loadExampleData}>
        Try with sample trades
      </button>
      <span class="example-hint">to see how it works</span>
    </div>
  {/if}
</div>

<style>
  .upload-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Main Drop Zone */
  .dropzone {
    position: relative;
    border: 2px dashed var(--color-gray-300);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      180deg,
      var(--color-white) 0%,
      var(--color-gray-50) 100%
    );
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-fast);
    cursor: pointer;
    min-height: 180px;
  }

  .dropzone:hover,
  .dropzone:focus-visible {
    border-color: var(--color-burgundy);
    background: var(--color-white);
    box-shadow: 0 4px 12px rgba(139, 46, 63, 0.1);
  }

  .dropzone:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .dropzone.drag-over {
    border-color: var(--color-gold);
    border-style: solid;
    background: rgba(201, 169, 97, 0.08);
    box-shadow: 0 4px 20px rgba(201, 169, 97, 0.2);
  }

  .dropzone.processing {
    pointer-events: none;
    opacity: 0.8;
  }

  .dropzone input[type="file"] {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .dropzone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .upload-icon {
    width: 48px;
    height: 48px;
    color: var(--color-burgundy);
  }

  .dropzone-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    text-align: center;
  }

  .dropzone-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: var(--color-navy);
  }

  .dropzone-subtitle {
    font-size: var(--text-sm);
    color: var(--color-gray-500);
  }

  .supported-brokers {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-gray-500);
    text-align: center;
  }

  /* Spinner */
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-gray-200);
    border-top-color: var(--color-burgundy);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Manual Override Toggle */
  .override-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--color-gray-500);
    font-size: var(--text-sm);
    cursor: pointer;
    padding: var(--space-1) 0;
    transition: color var(--transition-fast);
  }

  .override-toggle:hover {
    color: var(--color-navy);
  }

  .override-toggle:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .override-icon {
    width: 16px;
    height: 16px;
    transition: transform var(--transition-fast);
  }

  .override-toggle[aria-expanded="true"] .override-icon {
    transform: rotate(180deg);
  }

  /* Override Panel */
  .override-panel {
    padding: var(--space-2);
    background: var(--color-gray-50);
    border-radius: var(--radius-md);
  }

  .override-panel select {
    width: 100%;
    padding: var(--space-2);
    border: 2px solid var(--color-gray-300);
    border-radius: var(--radius-md);
    background: var(--color-white);
    color: var(--color-navy);
    font-size: var(--text-base);
    font-family: var(--font-body);
    cursor: pointer;
  }

  .override-panel select:focus {
    outline: none;
    border-color: var(--color-gold);
  }

  /* Message lists */
  .message-list {
    padding: var(--space-2);
    border-radius: var(--radius-md);
  }

  .message-list.errors {
    background: var(--color-loss-bg);
    border-left: 3px solid var(--color-loss);
  }

  .message-list.warnings {
    background: #fffbf0;
    border-left: 3px solid var(--color-gold);
  }

  .message-list h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-1) 0;
    color: var(--color-navy);
  }

  .message-icon {
    width: 16px;
    height: 16px;
  }

  .message-list.errors .message-icon {
    color: var(--color-loss);
  }
  .message-list.warnings .message-icon {
    color: var(--color-gold);
  }

  .message-list ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .message-list li {
    font-size: var(--text-sm);
    color: var(--color-gray-700);
    padding: 4px 0;
  }

  .issue-message {
    display: block;
  }

  .issue-hint {
    display: block;
    margin-top: 4px;
    font-size: var(--text-xs);
    color: var(--color-gray-500);
    font-style: italic;
  }

  .message-list.errors .issue-hint {
    color: var(--color-gray-600);
  }

  /* Success message */
  .success-message {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-2);
    background: var(--color-gain-bg);
    border-radius: var(--radius-md);
    color: var(--color-gain);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .success-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .success-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .success-summary {
    display: block;
  }

  .success-breakdown {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .success-breakdown li {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    color: var(--color-gray-600);
    font-weight: var(--font-normal);
  }

  .check-icon {
    width: 12px;
    height: 12px;
    color: var(--color-gain);
  }

  .mono {
    font-family: var(--font-mono);
  }

  .detected-broker {
    color: var(--color-gray-600);
    font-weight: var(--font-normal);
  }

  /* Example section */
  .example-section {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-2) 0;
    font-size: var(--text-sm);
    color: var(--color-gray-500);
  }

  .example-or {
    color: var(--color-gray-400);
  }

  .example-link {
    background: transparent;
    border: none;
    color: var(--color-burgundy);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
  }

  .example-link:hover {
    color: var(--color-navy);
  }

  .example-link:focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
  }

  .example-hint {
    color: var(--color-gray-400);
  }
</style>
