/**
 * CSV Export functionality
 *
 * Exports transactions and CGT calculations to CSV format
 * for record-keeping and HMRC self-assessment
 */

import type Decimal from 'decimal.js-light';
import type { BrokerTransaction } from '../types/broker';
import type { SummarizedTaxReport, PortfolioEntry } from '../types/report';
import type { CalculationEntry } from '../calculator/types';

/**
 * Escape CSV field value
 * - Wrap in quotes if contains comma, newline, or quote
 * - Double any quotes inside the value
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format a Decimal value for CSV output
 */
function formatDecimal(value: Decimal | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return value.toFixed(4);
}

/**
 * Format a Date for CSV output (ISO format)
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/**
 * Trigger browser download of CSV content
 */
function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export transactions to CSV format
 *
 * @param transactions - Array of broker transactions to export
 * @param filename - Optional filename (defaults to transactions-export.csv)
 */
export function exportTransactionsToCSV(
  transactions: BrokerTransaction[],
  filename: string = 'transactions-export.csv'
): void {
  const headers = [
    'date',
    'action',
    'symbol',
    'description',
    'quantity',
    'price',
    'fees',
    'amount',
    'currency',
    'broker',
    'isin',
  ];

  // Sort transactions by date (oldest first)
  const sortedTransactions = [...transactions].sort((a, b) => {
    return a.date.getTime() - b.date.getTime();
  });

  const rows = sortedTransactions.map((tx) => [
    formatDate(tx.date),
    tx.action,
    tx.symbol ?? '',
    tx.description,
    formatDecimal(tx.quantity),
    formatDecimal(tx.price),
    formatDecimal(tx.fees),
    formatDecimal(tx.amount),
    tx.currency,
    tx.broker,
    tx.isin ?? '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCSVField).join(',')),
  ].join('\n');

  triggerDownload(csvContent, filename);
}

/**
 * Export CGT calculation report to CSV format
 *
 * @param report - The summarized tax report
 * @param filename - Optional filename (defaults to cgt-report-{taxYear}.csv)
 */
export function exportCGTReportToCSV(
  report: SummarizedTaxReport,
  filename?: string
): void {
  const taxYearStr = `${report.taxYear}/${(report.taxYear + 1) % 100}`;
  const defaultFilename = `cgt-report-${report.taxYear}.csv`;

  const lines: string[] = [];

  // Summary section
  lines.push('=== UK Capital Gains Tax Report ===');
  lines.push(`Tax Year,${taxYearStr}`);
  lines.push('');
  lines.push('=== Summary ===');
  lines.push(`Total Disposal Proceeds,${formatDecimal(report.disposalProceeds)}`);
  lines.push(`Total Allowable Costs,${formatDecimal(report.allowableCosts)}`);
  lines.push(`Capital Gains,${formatDecimal(report.capitalGain)}`);
  lines.push(`Capital Losses,${formatDecimal(report.capitalLoss)}`);
  lines.push(`Net Gain/Loss,${formatDecimal(report.capitalGain.plus(report.capitalLoss))}`);
  if (report.capitalGainAllowance) {
    lines.push(`Annual Exemption,${formatDecimal(report.capitalGainAllowance)}`);
  }
  lines.push(`Number of Disposals,${report.disposalCount}`);
  lines.push('');

  // Disposal details section
  lines.push('=== Disposal Details ===');
  lines.push('Date,Symbol,Rule,Quantity,Proceeds,Cost,Gain/Loss');

  // Flatten calculation log entries
  for (const [dateKey, symbolMap] of report.calculationLog.entries()) {
    for (const [symbol, entries] of symbolMap.entries()) {
      for (const entry of entries) {
        if (entry.type === 'disposal' && entry.gain !== undefined) {
          const proceeds = entry.amount;
          const cost = entry.allowableCost ?? entry.amount.minus(entry.gain);
          lines.push([
            dateKey,
            symbol,
            entry.rule,
            formatDecimal(entry.quantity),
            formatDecimal(proceeds),
            formatDecimal(cost),
            formatDecimal(entry.gain),
          ].map(escapeCSVField).join(','));
        }
      }
    }
  }
  lines.push('');

  // Portfolio section
  lines.push('=== Portfolio Holdings ===');
  lines.push('Symbol,Quantity,Cost Basis,Average Cost');
  for (const entry of report.portfolio) {
    const avgCost = entry.quantity.isZero()
      ? ''
      : formatDecimal(entry.amount.div(entry.quantity));
    lines.push([
      entry.symbol,
      formatDecimal(entry.quantity),
      formatDecimal(entry.amount),
      avgCost,
    ].map(escapeCSVField).join(','));
  }
  lines.push('');

  // Interest section (if applicable)
  if (!report.totalUkInterest.isZero() || !report.totalForeignInterest.isZero()) {
    lines.push('=== Interest Income ===');
    lines.push(`UK Interest,${formatDecimal(report.totalUkInterest)}`);
    lines.push(`Foreign Interest,${formatDecimal(report.totalForeignInterest)}`);
    lines.push('');
  }

  const csvContent = lines.join('\n');
  triggerDownload(csvContent, filename ?? defaultFilename);
}

/**
 * Export disposal records only to CSV format
 * This is useful for HMRC SA108 self-assessment
 *
 * @param report - The summarized tax report
 * @param filename - Optional filename
 */
export function exportDisposalsToCSV(
  report: SummarizedTaxReport,
  filename?: string
): void {
  const taxYearStr = `${report.taxYear}/${(report.taxYear + 1) % 100}`;
  const defaultFilename = `disposals-${report.taxYear}.csv`;

  const headers = [
    'Date',
    'Asset',
    'Matching Rule',
    'Quantity',
    'Disposal Proceeds (£)',
    'Allowable Cost (£)',
    'Gain/Loss (£)',
  ];

  const rows: string[][] = [];

  for (const [dateKey, symbolMap] of report.calculationLog.entries()) {
    for (const [symbol, entries] of symbolMap.entries()) {
      for (const entry of entries) {
        if (entry.type === 'disposal' && entry.gain !== undefined) {
          const proceeds = entry.amount;
          const cost = entry.allowableCost ?? entry.amount.minus(entry.gain);
          rows.push([
            dateKey,
            symbol,
            formatRuleName(entry.rule),
            formatDecimal(entry.quantity),
            formatDecimal(proceeds),
            formatDecimal(cost),
            formatDecimal(entry.gain),
          ]);
        }
      }
    }
  }

  const csvContent = [
    `UK Capital Gains Tax - Disposal Records - Tax Year ${taxYearStr}`,
    '',
    headers.join(','),
    ...rows.map((row) => row.map(escapeCSVField).join(',')),
    '',
    `Total Gains,,,,,${formatDecimal(report.capitalGain)}`,
    `Total Losses,,,,,${formatDecimal(report.capitalLoss)}`,
    `Net,,,,,${formatDecimal(report.capitalGain.plus(report.capitalLoss))}`,
  ].join('\n');

  triggerDownload(csvContent, filename ?? defaultFilename);
}

/**
 * Format HMRC matching rule name for display
 */
function formatRuleName(rule: string): string {
  switch (rule) {
    case 'SAME_DAY':
      return 'Same-Day Rule';
    case 'BED_AND_BREAKFAST':
      return 'Bed & Breakfast (30-day)';
    case 'SECTION_104':
      return 'Section 104 Pool';
    default:
      return rule;
  }
}
