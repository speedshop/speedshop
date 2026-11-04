// @ts-check
const { test, expect } = require('@playwright/test');

// Exercise WebGL rendering even when headless Chromium has no hardware GPU.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

test.describe('Retainer hero', () => {
  test('renders the signal logo across the full band at one pixel per CSS pixel', async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1024, height: 768 },
    ]) {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });

      await page.setViewportSize(viewport);
      await page.goto('/retainer.html');

      const canvas = page.locator('.retainer-logo-viz canvas');
      await expect(page.locator('.retainer-logo-viz img')).toHaveAttribute('alt', 'Speedshop');
      await expect(canvas).toHaveCSS('opacity', '1');

      const sizes = await canvas.evaluate((element) => ({
        width: element.width,
        height: element.height,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        bandWidth: element.parentElement.clientWidth,
      }));

      expect(sizes.clientWidth).toBe(sizes.bandWidth);
      expect(sizes.width).toBe(sizes.clientWidth);
      expect(sizes.height).toBe(sizes.clientHeight);
      expect(errors).toEqual([]);
    }
  });
});
