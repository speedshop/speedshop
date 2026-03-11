// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Threadpilot simulator', () => {
  test('renders three setups with live metrics', async ({ page }) => {
    await page.goto('/threadpilot.html');

    const simulator = page.locator('[data-threadpilot-simulator]');
    await expect(simulator).toBeVisible();
    await expect(page.locator('[data-threadpilot-card]')).toHaveCount(3);

    await expect(page.locator('[data-threadpilot-io-label]')).toHaveText('50%');
    await expect(page.locator('[data-threadpilot-cpu-label]')).toHaveText('50%');

    const fiveThreadCard = page.locator('[data-threadpilot-card="5"]');
    await expect(fiveThreadCard.locator('[data-threadpilot-queue]')).toHaveText(/ms/);
    await expect(fiveThreadCard.locator('[data-threadpilot-arrivals-track]')).toBeVisible();
    await expect(fiveThreadCard.locator('[data-threadpilot-completions-track]')).toBeVisible();
    await expect(fiveThreadCard.locator('[data-threadpilot-rss]')).toHaveText(/MB/);
    await expect(fiveThreadCard.locator('[data-threadpilot-throughput]')).toHaveText(/req\/s/);
    await expect(fiveThreadCard.locator('[data-threadpilot-p95]')).not.toHaveText('—');
    await expect(fiveThreadCard.locator('[data-threadpilot-max]')).not.toHaveText('—');

    const aggressiveCard = page.locator('[data-threadpilot-card="125"]');
    await expect(aggressiveCard.locator('[data-threadpilot-rss]')).toHaveClass(/threadpilot-sim__value--bad/);
  });

  test('auto-sweeps until the slider is touched', async ({ page }) => {
    await page.goto('/threadpilot.html');

    const slider = page.locator('[data-threadpilot-io-slider]');
    const autoplayStatus = page.locator('[data-threadpilot-autoplay-status]');

    const startingValue = parseFloat(await slider.inputValue());
    await page.waitForTimeout(1500);
    const sweptValue = parseFloat(await slider.inputValue());
    expect(sweptValue).not.toBe(startingValue);

    await slider.evaluate((element) => {
      element.value = '80';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect(autoplayStatus).toHaveText(/Autoplay paused/i);
    await expect(slider).toHaveValue('80');
    await page.waitForTimeout(1200);
    await expect(slider).toHaveValue('80');
    await expect(page.locator('[data-threadpilot-io-label]')).toHaveText('80%');
    await expect(page.locator('[data-threadpilot-cpu-label]')).toHaveText('20%');
  });

  test('overloaded setups die and restart', async ({ page }) => {
    await page.goto('/threadpilot.html');

    await page.locator('[data-threadpilot-io-slider]').evaluate((element) => {
      element.value = '0';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const aggressiveCard = page.locator('[data-threadpilot-card="125"]');

    await expect(aggressiveCard).toHaveClass(/threadpilot-sim__card--dead/, { timeout: 8000 });
    await expect(aggressiveCard).not.toHaveClass(/threadpilot-sim__card--dead/, { timeout: 4000 });
  });
});
