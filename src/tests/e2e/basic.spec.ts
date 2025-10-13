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
        const exampleBtn = page.locator('button.link-btn', { hasText: 'Load example transaction data' });
        await expect(exampleBtn).toBeVisible();
        await exampleBtn.click();

        // Wait for calculating to finish
        await expect(page.locator('.processing-overlay')).not.toBeVisible();

        // Verify summary appears
        const summaryHeader = page.locator('h2', { hasText: /Tax Year/ });
        await expect(summaryHeader).toBeVisible();

        // Verify gain value (based on schwab example data)
        const gainValue = page.locator('.value.gain');
        await expect(gainValue).toBeVisible();
        // According to our golden test, gain should be present
        await expect(gainValue).not.toContainText('£0.00');

        // Check portfolio table
        const portfolioTable = page.locator('table.portfolio-table');
        await expect(portfolioTable).toBeVisible();
        await expect(portfolioTable.locator('td.symbol')).toContainText('VUAG');
    });

    test('should show timeline after loading data', async ({ page }) => {
        await page.locator('button.link-btn', { hasText: 'Load example transaction data' }).click();

        // Wait for calculating to finish
        await expect(page.locator('.processing-overlay')).not.toBeVisible();

        const timelineHeader = page.locator('h2', { hasText: 'Calculation Timeline' });
        await expect(timelineHeader).toBeVisible();

        const timelineItems = page.locator('.timeline-item');
        const count = await timelineItems.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });
});
