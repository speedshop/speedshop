// @ts-check
const { test, expect } = require('@playwright/test');

const VISUALIZATIONS = ['dazzle', 'xerox', 'ttt'];

test.describe('Homepage visualization', () => {
  for (const name of VISUALIZATIONS) {
    test(`loads ${name} from the viz query parameter without boot errors`, async ({ page }) => {
      const errors = [];
      const vizRequests = [];

      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('request', (request) => {
        if (request.url().includes('/assets/js/viz/')) vizRequests.push(request.url());
      });

      await page.goto(`/?viz=${name}`);
      await page.waitForFunction(() => {
        const canvas = document.querySelector('#sslogocanvas');
        return canvas && canvas.dataset.viz === '1';
      });
      await page.waitForTimeout(1000);

      expect(vizRequests.some((url) => url.endsWith(`/assets/js/viz/${name}.js`))).toBe(true);
      await expect(page.locator('#sslogocanvas')).toBeVisible();
      expect(errors).toEqual([]);

      if (name === 'ttt') {
        await expect(page.locator('#sslogocanvas')).toHaveCSS('opacity', '1');
        const before = await page.locator('#sslogocanvas').evaluate((canvas) => canvas.toDataURL());
        await page.waitForTimeout(500);
        const after = await page.locator('#sslogocanvas').evaluate((canvas) => canvas.toDataURL());
        expect(after).not.toEqual(before);
      }
    });
  }
});
