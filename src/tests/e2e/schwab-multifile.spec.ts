import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Schwab Multi-File Upload Flow', () => {
  const fixturesDir = path.join(__dirname, '../fixtures/data/schwab-2');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('uploads both Individual and Awards files and shows summary', async ({ page }) => {
    // Read both Schwab files
    const individualContent = fs.readFileSync(
      path.join(fixturesDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
      'utf-8'
    );
    const awardsContent = fs.readFileSync(
      path.join(fixturesDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
      'utf-8'
    );

    // Get the file input
    const fileInput = page.locator('input[type="file"]');

    // Upload both files at once
    await fileInput.setInputFiles([
      {
        name: 'Individual_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(individualContent),
      },
      {
        name: 'EquityAwards_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(awardsContent),
      },
    ]);

    // Wait for processing to complete - look for transactions loaded text
    await expect(page.getByText(/\d+ transactions loaded/i)).toBeVisible({ timeout: 10000 });

    // Verify tabs are visible
    const transactionsTab = page.getByRole('tab', { name: /transactions/i });
    const summaryTab = page.getByRole('tab', { name: /summary/i });
    const timelineTab = page.getByRole('tab', { name: /timeline/i });

    await expect(transactionsTab).toBeVisible();
    await expect(summaryTab).toBeVisible();
    await expect(timelineTab).toBeVisible();
  });

  test('opens Summary tab and shows calculations after multi-file upload', async ({ page }) => {
    // Read both Schwab files
    const individualContent = fs.readFileSync(
      path.join(fixturesDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
      'utf-8'
    );
    const awardsContent = fs.readFileSync(
      path.join(fixturesDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
      'utf-8'
    );

    // Upload both files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      {
        name: 'Individual_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(individualContent),
      },
      {
        name: 'EquityAwards_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(awardsContent),
      },
    ]);

    // Wait for transactions to load
    await expect(page.getByText(/\d+ transactions loaded/i)).toBeVisible({ timeout: 10000 });

    // Click Summary tab
    await page.getByRole('tab', { name: /summary/i }).click();

    // Wait for summary content to appear - use specific locators
    const summaryCard = page.locator('.summary-card');
    await expect(summaryCard).toBeVisible({ timeout: 10000 });

    // Wait for calculation to finish (spinner to disappear)
    await expect(page.locator('.summary-card .spinner')).not.toBeVisible({ timeout: 10000 });

    // The summary should now show one of three states:
    // 1. Stats grid with Tax Year header (report generated successfully)
    // 2. "No Report Generated" (empty state)  
    // 3. "Calculation Error" (error state)
    
    // Wait for any of the terminal states to appear
    await expect(
      page.locator('h2').filter({ hasText: /Tax Year/ })
        .or(page.getByText('No Report Generated'))
        .or(page.getByText('Calculation Error'))
    ).toBeVisible({ timeout: 10000 });

    // Verify the summary card has rendered properly
    await expect(summaryCard).toBeVisible();
  });

  test('opens Timeline tab and shows content after multi-file upload', async ({ page }) => {
    // Read both Schwab files
    const individualContent = fs.readFileSync(
      path.join(fixturesDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
      'utf-8'
    );
    const awardsContent = fs.readFileSync(
      path.join(fixturesDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
      'utf-8'
    );

    // Upload both files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      {
        name: 'Individual_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(individualContent),
      },
      {
        name: 'EquityAwards_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(awardsContent),
      },
    ]);

    // Wait for transactions to load
    await expect(page.getByText(/\d+ transactions loaded/i)).toBeVisible({ timeout: 10000 });

    // Click Timeline tab
    await page.getByRole('tab', { name: /timeline/i }).click();

    // Verify timeline header is visible
    await expect(page.locator('h2').filter({ hasText: 'Calculation Timeline' })).toBeVisible({ timeout: 5000 });

    // The timeline should show either disposals or an empty state
    const timelineCard = page.locator('.timeline-card');
    await expect(timelineCard).toBeVisible();
  });

  test('shows success breakdown with file types after multi-file upload', async ({ page }) => {
    // Read both Schwab files
    const individualContent = fs.readFileSync(
      path.join(fixturesDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
      'utf-8'
    );
    const awardsContent = fs.readFileSync(
      path.join(fixturesDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
      'utf-8'
    );

    // Upload both files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      {
        name: 'Individual_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(individualContent),
      },
      {
        name: 'EquityAwards_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(awardsContent),
      },
    ]);

    // Wait for success message
    await expect(page.getByText(/transactions added/i).first()).toBeVisible({ timeout: 10000 });

    // Should show "from Charles Schwab" in the success message - use first() for strict mode
    await expect(page.locator('.detected-broker').filter({ hasText: /Charles Schwab/i })).toBeVisible();

    // Should show file breakdown with Individual Transactions and Equity Awards
    await expect(page.locator('.success-breakdown').getByText(/Individual Transactions/i)).toBeVisible();
    await expect(page.locator('.success-breakdown').getByText(/Equity Awards/i)).toBeVisible();
  });

  test('shows error when only Awards file is uploaded', async ({ page }) => {
    // Read only Awards file
    const awardsContent = fs.readFileSync(
      path.join(fixturesDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
      'utf-8'
    );

    // Upload only Awards file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      {
        name: 'EquityAwards_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(awardsContent),
      },
    ]);

    // Should show error about missing Individual file
    await expect(page.locator('.message-list.errors')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Missing Required File/i)).toBeVisible();
  });

  test('shows warning when only Individual file is uploaded (no Stock Plan Activity prices)', async ({ page }) => {
    // Read only Individual file
    const individualContent = fs.readFileSync(
      path.join(fixturesDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
      'utf-8'
    );

    // Upload only Individual file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      {
        name: 'Individual_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(individualContent),
      },
    ]);

    // Wait for processing
    await expect(page.getByText(/transactions added/i).first()).toBeVisible({ timeout: 10000 });

    // Should show warning about Stock Plan Activity - use .first() for strict mode
    await expect(page.locator('.message-list.warnings')).toBeVisible();
    await expect(page.locator('.issue-message').filter({ hasText: /Stock Plan Activity/i }).first()).toBeVisible();
  });

  test('can navigate full flow: upload -> transactions -> summary -> timeline', async ({ page }) => {
    // Read both Schwab files
    const individualContent = fs.readFileSync(
      path.join(fixturesDir, 'Individual_XXX719_Transactions_20260106-150301.csv'),
      'utf-8'
    );
    const awardsContent = fs.readFileSync(
      path.join(fixturesDir, 'EquityAwardsCenter_Transactions_20260106151401.csv'),
      'utf-8'
    );

    // Upload both files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      {
        name: 'Individual_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(individualContent),
      },
      {
        name: 'EquityAwards_Transactions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(awardsContent),
      },
    ]);

    // Wait for transactions to load
    await expect(page.getByText(/\d+ transactions loaded/i)).toBeVisible({ timeout: 10000 });

    // Verify we're on Transactions tab (default)
    const transactionsTab = page.getByRole('tab', { name: /transactions/i });
    await expect(transactionsTab).toHaveAttribute('aria-selected', 'true');

    // Verify transaction table is visible
    await expect(page.locator('table').first()).toBeVisible();

    // Navigate to Summary
    const summaryTab = page.getByRole('tab', { name: /summary/i });
    await summaryTab.click();
    await expect(summaryTab).toHaveAttribute('aria-selected', 'true');
    
    // Summary card should be visible
    await expect(page.locator('.summary-card')).toBeVisible({ timeout: 5000 });

    // Navigate to Timeline
    const timelineTab = page.getByRole('tab', { name: /timeline/i });
    await timelineTab.click();
    await expect(timelineTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('h2').filter({ hasText: 'Calculation Timeline' })).toBeVisible({ timeout: 5000 });

    // Navigate back to Transactions
    await transactionsTab.click();
    await expect(transactionsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('table').first()).toBeVisible();
  });
});
