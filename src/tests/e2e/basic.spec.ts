import { test, expect } from '@playwright/test';

test.describe('Capital Gains Calculator E2E', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should load the page and show title', async ({ page }) => {
        await expect(page.locator('h1')).toContainText('UK Capital Gains Tax Calculator');
    });

    test('should load example data and show results', async ({ page }) => {
        // Click the example data button
        const exampleBtn = page.getByRole('button', { name: /try with sample trades/i });
        await expect(exampleBtn).toBeVisible();
        await exampleBtn.click();

        // Wait for transactions to load
        await expect(page.getByText(/transactions loaded/i)).toBeVisible({ timeout: 5000 });

        // Click Summary tab to see results
        await page.getByRole('tab', { name: /summary/i }).click();

        // Verify summary appears with Tax Year text (flexible pattern)
        await expect(page.getByText(/Tax Year \d{4}/)).toBeVisible({ timeout: 5000 });

        // Verify gain/loss values are displayed
        await expect(page.locator('.stat-value').first()).toBeVisible();
    });

    test('should show timeline after loading data', async ({ page }) => {
        await page.getByRole('button', { name: /try with sample trades/i }).click();

        // Wait for transactions to load
        await expect(page.getByText(/transactions loaded/i)).toBeVisible({ timeout: 5000 });

        // Click Timeline tab
        await page.getByRole('tab', { name: /timeline/i }).click();

        // Verify timeline header is visible
        await expect(page.getByText('Calculation Timeline')).toBeVisible({ timeout: 5000 });

        // Wait for timeline items to render
        await page.waitForSelector('.timeline-item', { timeout: 5000 });
    });
});
