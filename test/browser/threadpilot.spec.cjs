// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Threadpilot coming soon page', () => {
  test('describes the product and offers the newsletter signup', async ({ page }) => {
    await page.goto('/threadpilot.html');

    await expect(page).toHaveTitle(/Threadpilot/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Stop guessing');
    await expect(page.getByRole('heading', { name: 'Coming soon' })).toBeVisible();
    await expect(page.getByText(/automatically tunes Puma and Sidekiq thread pools/)).toBeVisible();

    const form = page.locator('form.mailchimp');
    await expect(form).toBeVisible();
    await expect(form.locator('input[type="email"]')).toHaveAttribute('name', 'EMAIL');
    await expect(form.locator('input[type="submit"]')).toHaveValue('SUBSCRIBE!');
  });

  test('is not linked from the homepage', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('a[href*="threadpilot"]')).toHaveCount(0);
  });
});
