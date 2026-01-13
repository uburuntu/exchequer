import { test, expect } from '@playwright/test';

/**
 * E2E Smoke Tests for Exchequer UK CGT Calculator
 *
 * These tests verify the basic functionality of the application
 * works correctly in a real browser environment.
 */

test.describe('App Smoke Tests', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Verify the page title
    await expect(page).toHaveTitle(/UK Capital Gains Tax Calculator/i);
  });

  test('should display the main heading', async ({ page }) => {
    await page.goto('/');

    // Check for main heading
    const heading = page.locator('h1');
    await expect(heading).toContainText('UK Capital Gains Tax Calculator');
  });

  test('should display the upload section', async ({ page }) => {
    await page.goto('/');

    // Check for upload section heading
    const uploadHeading = page.locator('h2').filter({ hasText: /Upload Your Transactions/i });
    await expect(uploadHeading).toBeVisible();
  });

  test('should display tax year selector', async ({ page }) => {
    await page.goto('/');

    // Check for tax year selector in header
    const header = page.locator('.header-right');
    await expect(header).toBeVisible();
  });

  test('should display navigation tabs after loading data', async ({ page }) => {
    await page.goto('/');

    // Dismiss session resume dialog if it appears
    const startFreshBtn = page.locator('button:has-text("Start Fresh")');
    if (await startFreshBtn.isVisible({ timeout: 1000 })) {
      await startFreshBtn.click();
      await page.waitForTimeout(500);
    }

    // Load example data first - tabs only show with transactions
    const exampleBtn = page.getByRole('button', { name: /try with sample trades/i });
    await expect(exampleBtn).toBeVisible({ timeout: 5000 });
    await exampleBtn.click();
    await page.waitForTimeout(1500);

    // Check for tab navigation
    const transactionsTab = page.locator('button[role="tab"]:has-text("Transactions")');
    const summaryTab = page.locator('button[role="tab"]:has-text("Summary")');
    const timelineTab = page.locator('button[role="tab"]:has-text("Timeline")');

    await expect(transactionsTab).toBeVisible({ timeout: 5000 });
    await expect(summaryTab).toBeVisible();
    await expect(timelineTab).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    await page.goto('/');

    // Dismiss session resume dialog if it appears
    const startFreshBtn = page.locator('button:has-text("Start Fresh")');
    if (await startFreshBtn.isVisible({ timeout: 1000 })) {
      await startFreshBtn.click();
      await page.waitForTimeout(500);
    }

    // Load example data first
    const exampleBtn = page.getByRole('button', { name: /try with sample trades/i });
    await expect(exampleBtn).toBeVisible({ timeout: 5000 });
    await exampleBtn.click();
    await page.waitForTimeout(1500);

    // Click on Summary tab
    await page.click('button[role="tab"]:has-text("Summary")');

    // Verify we're on summary tab (check for summary content)
    // The summary tab should show capital gains info
    const summarySection = page.locator('.capital-gains-summary, [class*="summary"]').first();
    await expect(summarySection).toBeVisible();

    // Click on Timeline tab
    await page.click('button[role="tab"]:has-text("Timeline")');

    // Click back to Transactions
    await page.click('button[role="tab"]:has-text("Transactions")');
  });

  test('should have skip-to-content link for accessibility', async ({ page }) => {
    await page.goto('/');

    // Check for skip link (accessibility)
    const skipLink = page.locator('.skip-link, a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
  });

  test('should display privacy message', async ({ page }) => {
    await page.goto('/');

    // Check for privacy-first messaging
    const privacyText = page.locator('text=Privacy-first');
    await expect(privacyText).toBeVisible();
  });
});

test.describe('File Upload', () => {
  test('should show file drop zone', async ({ page }) => {
    await page.goto('/');

    // Look for file upload area
    const uploadArea = page.locator('[class*="upload"], [class*="drop"], input[type="file"]').first();
    await expect(uploadArea).toBeAttached();
  });
});

test.describe('Responsive Design', () => {
  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Main heading should still be visible
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('should be responsive on tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // Main heading should still be visible
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });
});
