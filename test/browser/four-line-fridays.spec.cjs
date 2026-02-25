// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Four Line Fridays archive search', () => {
  test('filters results as you type', async ({ page }) => {
    await page.goto('/four-line-fridays.html');

    const input = page.locator('#four-line-search');
    const resultCount = page.locator('#four-line-result-count');
    const noResults = page.locator('#four-line-no-results');
    const results = page.locator('.four-line-result:not([hidden])');

    await expect(input).toBeVisible();
    await expect(resultCount).toContainText(/\d+ result/);

    const initialCount = await results.count();

    await input.fill('zzzz-not-in-archive-12345');
    await page.waitForTimeout(250);

    await expect(noResults).toBeVisible();
    await expect(results).toHaveCount(0);

    if (initialCount === 0) {
      return;
    }

    await input.fill('line');
    await page.waitForTimeout(250);

    const filteredCount = await results.count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    await expect(noResults).toBeHidden();
  });
});
