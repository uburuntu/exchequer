/**
 * PDF Export functionality
 *
 * Generates professional PDF reports for UK Capital Gains Tax
 * using jspdf and jspdf-autotable
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type Decimal from 'decimal.js-light';
import type { SummarizedTaxReport } from '../types/report';

/**
 * Format a Decimal value for display
 */
function formatDecimal(value: Decimal | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) {
    return '-';
  }
  return `£${value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Format a quantity value for display
 */
function formatQuantity(value: Decimal | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }
  return value.toFixed(4).replace(/\.?0+$/, '');
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

/**
 * Generate PDF report for UK Capital Gains Tax
 *
 * @param report - The summarized tax report
 * @param filename - Optional filename (defaults to cgt-report-{taxYear}.pdf)
 */
export function exportCGTReportToPDF(
  report: SummarizedTaxReport,
  filename?: string
): void {
  const taxYearStr = `${report.taxYear}/${(report.taxYear + 1) % 100}`;
  const defaultFilename = `cgt-report-${report.taxYear}.pdf`;

  const doc = new jsPDF();
  let yPos = 20;

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('UK Capital Gains Tax Report', 105, yPos, { align: 'center' });
  yPos += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tax Year ${taxYearStr}`, 105, yPos, { align: 'center' });
  yPos += 5;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 105, yPos, { align: 'center' });
  doc.setTextColor(0);
  yPos += 15;

  // Summary Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 14, yPos);
  yPos += 8;

  const summaryData = [
    ['Total Disposal Proceeds', formatDecimal(report.disposalProceeds)],
    ['Total Allowable Costs', formatDecimal(report.allowableCosts)],
    ['Capital Gains', formatDecimal(report.capitalGain)],
    ['Capital Losses', formatDecimal(report.capitalLoss)],
    ['Net Gain/Loss', formatDecimal(report.capitalGain.plus(report.capitalLoss))],
  ];

  if (report.capitalGainAllowance) {
    summaryData.push(['Annual Exemption', formatDecimal(report.capitalGainAllowance)]);
    const taxable = report.capitalGain.plus(report.capitalLoss).minus(report.capitalGainAllowance);
    summaryData.push(['Taxable Amount', formatDecimal(taxable.isNegative() ? taxable.times(0) : taxable)]);
  }

  summaryData.push(['Number of Disposals', report.disposalCount.toString()]);

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { halign: 'right', cellWidth: 40 },
    },
    margin: { left: 14 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Disposal Details Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Disposal Details', 14, yPos);
  yPos += 5;

  const disposalRows: string[][] = [];

  for (const [dateKey, symbolMap] of report.calculationLog.entries()) {
    for (const [symbol, entries] of symbolMap.entries()) {
      for (const entry of entries) {
        if (entry.type === 'disposal' && entry.gain !== undefined) {
          const proceeds = entry.amount;
          const cost = entry.allowableCost ?? entry.amount.minus(entry.gain);
          disposalRows.push([
            dateKey,
            symbol,
            formatRuleName(entry.rule),
            formatQuantity(entry.quantity),
            formatDecimal(proceeds),
            formatDecimal(cost),
            formatDecimal(entry.gain),
          ]);
        }
      }
    }
  }

  if (disposalRows.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Asset', 'Matching Rule', 'Qty', 'Proceeds', 'Cost', 'Gain/Loss']],
      body: disposalRows,
      theme: 'striped',
      headStyles: { fillColor: [26, 35, 50], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 20 },
        2: { cellWidth: 35 },
        3: { cellWidth: 18, halign: 'right' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 25, halign: 'right' },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  } else {
    yPos += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('No disposals in this tax year', 14, yPos);
    yPos += 15;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Portfolio Holdings Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Portfolio Holdings (End of Tax Year)', 14, yPos);
  yPos += 5;

  const portfolioRows = report.portfolio.map((entry) => {
    const avgCost = entry.quantity.isZero()
      ? '-'
      : formatDecimal(entry.amount.div(entry.quantity));
    return [
      entry.symbol,
      formatQuantity(entry.quantity),
      formatDecimal(entry.amount),
      avgCost,
    ];
  });

  if (portfolioRows.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Symbol', 'Quantity', 'Cost Basis', 'Avg Cost/Share']],
      body: portfolioRows,
      theme: 'striped',
      headStyles: { fillColor: [26, 35, 50], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 35, halign: 'right' },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  } else {
    yPos += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('No holdings at end of tax year', 14, yPos);
    yPos += 15;
  }

  // Interest Income Section (if applicable)
  if (!report.totalUkInterest.isZero() || !report.totalForeignInterest.isZero()) {
    if (yPos > 260) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Interest Income', 14, yPos);
    yPos += 8;

    const interestData = [
      ['UK Interest', formatDecimal(report.totalUkInterest)],
      ['Foreign Interest', formatDecimal(report.totalForeignInterest)],
      ['Total Interest', formatDecimal(report.totalUkInterest.plus(report.totalForeignInterest))],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: interestData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { halign: 'right', cellWidth: 40 },
      },
      margin: { left: 14 },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(
      `Page ${i} of ${pageCount}`,
      105,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
    doc.text(
      'Generated by Exchequer - UK Capital Gains Tax Calculator',
      105,
      doc.internal.pageSize.height - 5,
      { align: 'center' }
    );
  }

  // Save the PDF
  doc.save(filename ?? defaultFilename);
}

/**
 * Generate a simplified disposal-only PDF for HMRC SA108
 *
 * @param report - The summarized tax report
 * @param filename - Optional filename
 */
export function exportDisposalsToPDF(
  report: SummarizedTaxReport,
  filename?: string
): void {
  const taxYearStr = `${report.taxYear}/${(report.taxYear + 1) % 100}`;
  const defaultFilename = `disposals-${report.taxYear}.pdf`;

  const doc = new jsPDF();
  let yPos = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Capital Gains Tax - Disposal Records', 105, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tax Year ${taxYearStr}`, 105, yPos, { align: 'center' });
  yPos += 15;

  // Disposal table
  const disposalRows: string[][] = [];

  for (const [dateKey, symbolMap] of report.calculationLog.entries()) {
    for (const [symbol, entries] of symbolMap.entries()) {
      for (const entry of entries) {
        if (entry.type === 'disposal' && entry.gain !== undefined) {
          const proceeds = entry.amount;
          const cost = entry.allowableCost ?? entry.amount.minus(entry.gain);
          disposalRows.push([
            dateKey,
            symbol,
            formatRuleName(entry.rule),
            formatQuantity(entry.quantity),
            formatDecimal(proceeds),
            formatDecimal(cost),
            formatDecimal(entry.gain),
          ]);
        }
      }
    }
  }

  autoTable(doc, {
    startY: yPos,
    head: [['Date', 'Asset', 'Matching Rule', 'Quantity', 'Proceeds (£)', 'Cost (£)', 'Gain/Loss (£)']],
    body: disposalRows,
    theme: 'grid',
    headStyles: { fillColor: [26, 35, 50], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Totals
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Gains: ${formatDecimal(report.capitalGain)}`, 14, yPos);
  yPos += 6;
  doc.text(`Total Losses: ${formatDecimal(report.capitalLoss)}`, 14, yPos);
  yPos += 6;
  doc.text(`Net: ${formatDecimal(report.capitalGain.plus(report.capitalLoss))}`, 14, yPos);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    'Generated by Exchequer - UK Capital Gains Tax Calculator',
    105,
    doc.internal.pageSize.height - 10,
    { align: 'center' }
  );

  doc.save(filename ?? defaultFilename);
}
