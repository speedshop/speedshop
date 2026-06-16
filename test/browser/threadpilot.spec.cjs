// @ts-check
const { test, expect } = require('@playwright/test');

const CHART_IDS = ['chart-threads', 'chart-latency', 'chart-throughput'];

test.describe('Threadpilot charts', () => {
  test('renders benchmark charts', async ({ page }) => {
    await page.goto('/threadpilot.html');

    for (const id of CHART_IDS) {
      const chart = page.locator(`#${id}`);
      await expect(chart).toBeVisible();

      const size = await chart.evaluate((canvas) => ({
        height: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
        width: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
      }));

      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });

  test('draws chart data onto each canvas', async ({ page }) => {
    await page.goto('/threadpilot.html');

    for (const id of CHART_IDS) {
      await expect(page.locator(`#${id}`)).toBeVisible();

      const hasPaintedPixels = await page.locator(`#${id}`).evaluate((canvas) => {
        if (!(canvas instanceof HTMLCanvasElement)) return false;

        const context = canvas.getContext('2d');
        if (!context || canvas.width === 0 || canvas.height === 0) return false;

        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels.some((channel) => channel !== 0);
      });

      expect(hasPaintedPixels).toBe(true);
    }
  });
});
