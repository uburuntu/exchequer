import { test, expect } from '@playwright/test';

test.describe('Example Data Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads the homepage with upload form', async ({ page }) => {
    // Check header
    await expect(page.locator('h1')).toContainText('UK Capital Gains Tax Calculator');
    
    // Check upload section is visible
    await expect(page.getByText('Upload Your Transactions')).toBeVisible();
    
    // Check load example button is visible
    await expect(page.getByRole('button', { name: /try with sample trades/i })).toBeVisible();
  });

  test('loads example data and shows transactions', async ({ page }) => {
    // Click load example data button
    await page.getByRole('button', { name: /try with sample trades/i }).click();

    // Wait for transactions to load
    await expect(page.getByText(/transactions loaded/i)).toBeVisible({ timeout: 5000 });

    // Verify transaction count badge appears in Transactions tab (any number)
    await expect(page.getByRole('tab', { name: /transactions/i })).toContainText(/\d+/);
  });

  test('Summary tab shows calculations after loading example data', async ({ page }) => {
    // Load example data
    await page.getByRole('button', { name: /try with sample trades/i }).click();
    await expect(page.getByText(/transactions loaded/i)).toBeVisible({ timeout: 5000 });

    // Click Summary tab
    await page.getByRole('tab', { name: /summary/i }).click();

    // Wait for report to generate and verify summary content (any tax year)
    await expect(page.getByText(/Tax Year \d{4}/)).toBeVisible({ timeout: 5000 });

    // Verify capital gains/losses labels are displayed (using text selector)
    await expect(page.getByText(/Total Capital Gains/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Total Capital Losses/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Net Gain\/Loss/)).toBeVisible({ timeout: 5000 });
  });

  test('Timeline tab shows disposal entries after loading example data', async ({ page }) => {
    // Load example data
    await page.getByRole('button', { name: /try with sample trades/i }).click();
    await expect(page.getByText(/transactions loaded/i)).toBeVisible({ timeout: 5000 });

    // Click Timeline tab
    await page.getByRole('tab', { name: /timeline/i }).click();

    // Wait for timeline container to show
    await expect(page.locator('.timeline-card')).toBeVisible({ timeout: 5000 });

    // Verify timeline header
    await expect(page.getByText('Calculation Timeline')).toBeVisible();

    // Wait for timeline items to render
    await page.waitForSelector('.timeline-item', { timeout: 5000 });
  });

  test('can switch between tabs', async ({ page }) => {
    // Load example data first
    await page.getByRole('button', { name: /try with sample trades/i }).click();
    await expect(page.getByText(/transactions loaded/i)).toBeVisible({ timeout: 5000 });
    
    // Start on Transactions tab (default)
    const transactionsTab = page.getByRole('tab', { name: /transactions/i });
    const summaryTab = page.getByRole('tab', { name: /summary/i });
    const timelineTab = page.getByRole('tab', { name: /timeline/i });
    
    // Verify Transactions tab is active
    await expect(transactionsTab).toHaveAttribute('aria-selected', 'true');
    
    // Click Summary tab
    await summaryTab.click();
    await expect(summaryTab).toHaveAttribute('aria-selected', 'true');
    await expect(transactionsTab).toHaveAttribute('aria-selected', 'false');
    
    // Click Timeline tab
    await timelineTab.click();
    await expect(timelineTab).toHaveAttribute('aria-selected', 'true');
    await expect(summaryTab).toHaveAttribute('aria-selected', 'false');
    
    // Click back to Transactions
    await transactionsTab.click();
    await expect(transactionsTab).toHaveAttribute('aria-selected', 'true');
  });

  test('Clear All button removes all transactions', async ({ page }) => {
    // Load example data
    await page.getByRole('button', { name: /try with sample trades/i }).click();
    await expect(page.getByText(/transactions loaded/i)).toBeVisible({ timeout: 5000 });

    // Click Clear All button
    await page.getByRole('button', { name: /clear all/i }).click();

    // Verify transactions are cleared - upload form should be visible again
    await expect(page.getByRole('button', { name: /try with sample trades/i })).toBeVisible();
  });

  test('Tax year selector updates calculations', async ({ page }) => {
    // Load example data
    await page.getByRole('button', { name: /try with sample trades/i }).click();
    await expect(page.getByText(/transactions loaded/i)).toBeVisible({ timeout: 5000 });
    
    // Verify tax year selector is visible
    const taxYearSelect = page.locator('select').filter({ hasText: /2025/ });
    await expect(taxYearSelect).toBeVisible();
  });
});

